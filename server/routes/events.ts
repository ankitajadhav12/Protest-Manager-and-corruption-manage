import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth, requireCsrf, requireRole, validateCoordinates } from '../security.ts';
import { logAudit, notifyAdmins, notifyUser } from '../services/audit.ts';
import { emitMapUpdate } from '../socket.ts';

export const eventsRouter = Router();

const VALID_EVENT_CATEGORIES = new Set([
  'Civic Accountability',
  'Environmental Protection',
  'Infrastructure & Safety',
  'Public Budget & Transparency',
  'Labor & Community Rights',
  'Peaceful Vigil',
]);

eventsRouter.get('/events', (req, res) => {
  const category = req.query.category ? String(req.query.category) : null;
  const status = req.query.status ? String(req.query.status) : null;

  let query = `
    SELECT
      pe.*,
      u.full_name AS organizer_name,
      u.organization_name AS organizer_org,
      (SELECT COUNT(*) FROM volunteers v WHERE v.event_id = pe.id AND v.status != 'Cancelled') AS volunteer_count
    FROM protest_events pe
    JOIN users u ON u.id = pe.organizer_id
    WHERE (pe.is_public = 1 ${req.user ? 'OR pe.organizer_id = ?' : ''})
  `;
  const params: unknown[] = [];
  if (req.user) params.push(req.user.id);

  if (category && category !== 'all') {
    query += ' AND pe.category = ?';
    params.push(category);
  }
  if (status && status !== 'all') {
    query += ' AND pe.status = ?';
    params.push(status);
  }
  query += ' ORDER BY pe.start_time ASC';

  const events = db.prepare(query).all(...params) as Array<{ id: number; [key: string]: unknown }>;

  // Attach announcements and user's volunteer status
  const enriched = events.map((ev) => {
    const announcements = db
      .prepare(
        `SELECT a.id, a.title, a.content, a.is_pinned, a.created_at, u.full_name AS author_name
         FROM announcements a
         JOIN users u ON u.id = a.author_id
         WHERE a.event_id = ?
         ORDER BY a.is_pinned DESC, a.created_at DESC`
      )
      .all(ev.id);

    let myVolunteerStatus: string | null = null;
    if (req.user) {
      const vol = db
        .prepare('SELECT status FROM volunteers WHERE event_id = ? AND user_id = ?')
        .get(ev.id, req.user.id) as { status: string } | undefined;
      myVolunteerStatus = vol?.status ?? null;
    }

    return {
      ...ev,
      announcements,
      my_volunteer_status: myVolunteerStatus,
    };
  });

  res.json({ events: enriched });
});

eventsRouter.get('/events/:id', (req, res) => {
  const eventId = Number(req.params.id);
  const event = db
    .prepare(
      `SELECT
        pe.*,
        u.full_name AS organizer_name,
        u.organization_name AS organizer_org,
        (SELECT COUNT(*) FROM volunteers v WHERE v.event_id = pe.id AND v.status != 'Cancelled') AS volunteer_count
       FROM protest_events pe
       JOIN users u ON u.id = pe.organizer_id
       WHERE pe.id = ?`
    )
    .get(eventId) as { id: number; is_public: number; organizer_id: number; [key: string]: unknown } | undefined;

  if (!event) {
    res.status(404).json({ error: 'Public event not found.' });
    return;
  }

  const canView =
    event.is_public === 1 ||
    (req.user && (req.user.role === 'admin' || req.user.id === event.organizer_id));

  if (!canView) {
    res.status(403).json({ error: 'This event is awaiting moderation and not yet public.' });
    return;
  }

  const announcements = db
    .prepare(
      `SELECT a.id, a.title, a.content, a.is_pinned, a.created_at, u.full_name AS author_name
       FROM announcements a
       JOIN users u ON u.id = a.author_id
       WHERE a.event_id = ?
       ORDER BY a.is_pinned DESC, a.created_at DESC`
    )
    .all(eventId);

  const history = db
    .prepare(
      `SELECT previous_status, new_status, note, created_at
       FROM event_status_history
       WHERE event_id = ?
       ORDER BY id ASC`
    )
    .all(eventId);

  let myVolunteer: unknown = null;
  if (req.user) {
    myVolunteer = db
      .prepare('SELECT id, role_preference, availability_notes, status, created_at FROM volunteers WHERE event_id = ? AND user_id = ?')
      .get(eventId, req.user.id);
  }

  res.json({ event, announcements, history, my_volunteer: myVolunteer });
});

eventsRouter.post('/events', requireRole('organizer', 'admin'), requireCsrf, (req, res) => {
  const {
    title,
    category,
    description,
    public_location,
    city,
    state,
    latitude,
    longitude,
    start_time,
    end_time,
    expected_participants,
  } = req.body || {};

  if (!title || String(title).trim().length < 6 || !VALID_EVENT_CATEGORIES.has(String(category))) {
    res.status(400).json({ error: 'Valid title (6+ chars) and event category are required.' });
    return;
  }
  if (!description || String(description).trim().length < 20 || !public_location) {
    res.status(400).json({ error: 'Detailed peaceful event description and public venue are required.' });
    return;
  }
  if (!start_time || !end_time) {
    res.status(400).json({ error: 'Start and end date/time are required.' });
    return;
  }

  const coords = validateCoordinates(latitude ?? 18.5204, longitude ?? 73.8567);
  if (!coords) {
    res.status(400).json({ error: 'Valid geographic coordinates are required.' });
    return;
  }

  const eventCode = `PCM-EV-2026-${crypto.randomInt(310, 999)}`;
  const isAdminAutoApprove = req.user!.role === 'admin';
  const initialStatus = isAdminAutoApprove ? 'Scheduled' : 'Pending Moderation';
  const isPublic = isAdminAutoApprove ? 1 : 0;
  const verifLabel = isAdminAutoApprove
    ? 'Verified Public Event (Admin Published)'
    : 'Pending Moderator Review';

  const result = db
    .prepare(
      `INSERT INTO protest_events (
        event_code, organizer_id, title, category, description, public_location,
        city, state, latitude, longitude, start_time, end_time,
        expected_participants, status, verification_label, source_attribution, is_public
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Organizer Public Submission', ?)`
    )
    .run(
      eventCode,
      req.user!.id,
      String(title).trim(),
      String(category),
      String(description).trim(),
      String(public_location).trim(),
      String(city || 'Pune').trim(),
      String(state || 'Maharashtra').trim(),
      coords.lat,
      coords.lng,
      String(start_time),
      String(end_time),
      Number(expected_participants || 50),
      initialStatus,
      verifLabel,
      isPublic
    );

  const eventId = Number(result.lastInsertRowid);

  db.prepare(
    `INSERT INTO event_status_history (event_id, previous_status, new_status, changed_by, note)
     VALUES (?, NULL, ?, ?, ?)`
  ).run(
    eventId,
    initialStatus,
    req.user!.id,
    isAdminAutoApprove ? 'Published directly by administrator.' : 'Submitted for peaceful assembly moderation.'
  );

  logAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'EVENT_CREATED',
    entityType: 'protest_event',
    entityId: eventCode,
    details: `${title} (${initialStatus})`,
    ipAddress: req.ip,
  });

  if (!isAdminAutoApprove) {
    notifyAdmins({
      type: 'event_approval',
      title: `Event Moderation Needed: ${eventCode}`,
      message: `"${String(title).trim()}" submitted by ${req.user!.full_name} awaits verification.`,
      linkPath: 'admin',
    });
  } else {
    const publishedEvent = db.prepare('SELECT * FROM protest_events WHERE id = ?').get(eventId);
    emitMapUpdate('map:event_published', publishedEvent);
  }

  res.status(201).json({
    id: eventId,
    event_code: eventCode,
    status: initialStatus,
    is_public: Boolean(isPublic),
  });
});

eventsRouter.patch('/events/:id/status', requireRole('organizer', 'admin'), requireCsrf, (req, res) => {
  const eventId = Number(req.params.id);
  const { status, note } = req.body || {};
  const allowedOrganizerStatuses = new Set(['Scheduled', 'Active', 'Completed', 'Cancelled']);

  if (!allowedOrganizerStatuses.has(String(status))) {
    res.status(400).json({ error: 'Invalid status update.' });
    return;
  }

  const event = db.prepare('SELECT * FROM protest_events WHERE id = ?').get(eventId) as
    | { id: number; organizer_id: number; status: string; is_public: number; event_code: string; title: string }
    | undefined;

  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }
  if (req.user!.role !== 'admin' && event.organizer_id !== req.user!.id) {
    res.status(403).json({ error: 'You may only update events you created.' });
    return;
  }
  if (event.is_public !== 1 && req.user!.role !== 'admin') {
    res.status(400).json({ error: 'Moderators must approve the event before status transitions.' });
    return;
  }

  db.prepare("UPDATE protest_events SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    String(status),
    eventId
  );

  db.prepare(
    `INSERT INTO event_status_history (event_id, previous_status, new_status, changed_by, note)
     VALUES (?, ?, ?, ?, ?)`
  ).run(eventId, event.status, String(status), req.user!.id, note ? String(note) : 'Status updated by organizer.');

  logAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'EVENT_STATUS_UPDATED',
    entityType: 'protest_event',
    entityId: event.event_code,
    details: `${event.status} -> ${status}`,
    ipAddress: req.ip,
  });

  const updated = db.prepare('SELECT * FROM protest_events WHERE id = ?').get(eventId);
  if (event.is_public === 1) {
    emitMapUpdate('map:event_published', updated);
  }

  res.json({ event: updated });
});

eventsRouter.post('/events/:id/announcements', requireRole('organizer', 'admin'), requireCsrf, (req, res) => {
  const eventId = Number(req.params.id);
  const { title, content, is_pinned } = req.body || {};
  if (!title || String(title).trim().length < 3 || !content || String(content).trim().length < 10) {
    res.status(400).json({ error: 'Announcement title and content are required.' });
    return;
  }

  const event = db.prepare('SELECT id, organizer_id, title FROM protest_events WHERE id = ?').get(eventId) as
    | { id: number; organizer_id: number; title: string }
    | undefined;

  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }
  if (req.user!.role !== 'admin' && event.organizer_id !== req.user!.id) {
    res.status(403).json({ error: 'Only the event organizer or an admin can publish announcements.' });
    return;
  }

  const insertRes = db
    .prepare(
      `INSERT INTO announcements (event_id, author_id, title, content, is_pinned)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(eventId, req.user!.id, String(title).trim(), String(content).trim(), is_pinned ? 1 : 0);

  // Notify registered volunteers
  const vols = db
    .prepare("SELECT user_id FROM volunteers WHERE event_id = ? AND status != 'Cancelled'")
    .all(eventId) as Array<{ user_id: number }>;

  for (const vol of vols) {
    notifyUser({
      userId: vol.user_id,
      type: 'event_announcement',
      title: `Update: ${event.title}`,
      message: String(title).trim(),
      linkPath: 'protests',
    });
  }

  const created = db
    .prepare(
      `SELECT a.*, u.full_name AS author_name
       FROM announcements a JOIN users u ON u.id = a.author_id
       WHERE a.id = ?`
    )
    .get(insertRes.lastInsertRowid);

  res.status(201).json({ announcement: created });
});

eventsRouter.post('/events/:id/volunteer', requireAuth, requireCsrf, (req, res) => {
  const eventId = Number(req.params.id);
  const { role_preference, availability_notes } = req.body || {};

  const event = db.prepare('SELECT id, title, is_public, organizer_id FROM protest_events WHERE id = ?').get(eventId) as
    | { id: number; title: string; is_public: number; organizer_id: number }
    | undefined;

  if (!event || event.is_public !== 1) {
    res.status(404).json({ error: 'Verified public event not found.' });
    return;
  }

  db.prepare(
    `INSERT INTO volunteers (event_id, user_id, role_preference, availability_notes, status)
     VALUES (?, ?, ?, ?, 'Registered')
     ON CONFLICT(event_id, user_id)
     DO UPDATE SET role_preference = excluded.role_preference,
                   availability_notes = excluded.availability_notes,
                   status = 'Registered',
                   updated_at = datetime('now')`
  ).run(
    eventId,
    req.user!.id,
    String(role_preference || 'General Support').trim(),
    availability_notes ? String(availability_notes).trim() : null
  );

  notifyUser({
    userId: event.organizer_id,
    type: 'volunteer_update',
    title: `New Volunteer for ${event.title}`,
    message: `${req.user!.full_name} registered (${String(role_preference || 'General Support')}).`,
    linkPath: 'protests',
  });

  logAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'VOLUNTEER_REGISTERED',
    entityType: 'protest_event',
    entityId: eventId,
    ipAddress: req.ip,
  });

  res.status(201).json({ status: 'Registered' });
});

eventsRouter.delete('/events/:id/volunteer', requireAuth, requireCsrf, (req, res) => {
  const eventId = Number(req.params.id);
  const existing = db
    .prepare('SELECT id FROM volunteers WHERE event_id = ? AND user_id = ?')
    .get(eventId, req.user!.id) as { id: number } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Volunteer registration not found.' });
    return;
  }

  db.prepare(
    "UPDATE volunteers SET status = 'Cancelled', updated_at = datetime('now') WHERE id = ?"
  ).run(existing.id);

  logAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'VOLUNTEER_CANCELLED',
    entityType: 'protest_event',
    entityId: eventId,
    ipAddress: req.ip,
  });

  res.json({ status: 'Cancelled' });
});

eventsRouter.get('/volunteers/mine', requireAuth, (req, res) => {
  const registrations = db
    .prepare(
      `SELECT v.*, pe.event_code, pe.title AS event_title, pe.public_location, pe.start_time, pe.status AS event_status
       FROM volunteers v
       JOIN protest_events pe ON pe.id = v.event_id
       WHERE v.user_id = ?
       ORDER BY v.updated_at DESC`
    )
    .all(req.user!.id);
  res.json({ registrations });
});
