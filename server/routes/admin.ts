import { Router } from 'express';
import { db } from '../db.ts';
import { generalizeCoordinate, requireCsrf, requireRole } from '../security.ts';
import { logAudit, notifyUser } from '../services/audit.ts';
import { emitMapUpdate } from '../socket.ts';

export const adminRouter = Router();

adminRouter.use('/admin', requireRole('admin'));

adminRouter.get('/admin/overview', (_req, res) => {
  const users = db
    .prepare(
      `SELECT id, full_name, email, role, city, organization_name, is_active, created_at
       FROM users
       ORDER BY created_at DESC`
    )
    .all();

  const departments = db.prepare('SELECT * FROM departments ORDER BY name ASC').all();

  // Note: Anonymous reports have user_id = NULL so identity is never revealed even to admins
  const corruptionReports = db
    .prepare(
      `SELECT
        cr.id, cr.tracking_id, cr.user_id, cr.department_id, d.name AS department_name,
        cr.category, cr.title, cr.description, cr.general_location, cr.city, cr.state,
        cr.latitude, cr.longitude, cr.is_anonymous, cr.is_confidential,
        cr.status, cr.moderation_status, cr.verification_label, cr.potential_duplicate_of,
        cr.admin_notes, cr.is_public_hotspot, cr.created_at, cr.updated_at,
        CASE WHEN cr.is_anonymous = 1 THEN 'Anonymous Protected' ELSE COALESCE(u.full_name, 'Unauthenticated') END AS reporter_display
       FROM corruption_reports cr
       JOIN departments d ON d.id = cr.department_id
       LEFT JOIN users u ON u.id = cr.user_id AND cr.is_anonymous = 0
       ORDER BY cr.created_at DESC`
    )
    .all();

  const complaints = db
    .prepare(
      `SELECT
        c.*, d.name AS department_name,
        COALESCE(u.full_name, 'Citizen') AS reporter_name
       FROM complaints c
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN users u ON u.id = c.user_id
       ORDER BY c.created_at DESC`
    )
    .all();

  const events = db
    .prepare(
      `SELECT
        pe.*, u.full_name AS organizer_name, u.organization_name AS organizer_org,
        (SELECT COUNT(*) FROM volunteers v WHERE v.event_id = pe.id AND v.status != 'Cancelled') AS volunteer_count
       FROM protest_events pe
       JOIN users u ON u.id = pe.organizer_id
       ORDER BY pe.created_at DESC`
    )
    .all();

  const volunteers = db
    .prepare(
      `SELECT v.*, u.full_name, u.email, pe.title AS event_title, pe.event_code
       FROM volunteers v
       JOIN users u ON u.id = v.user_id
       JOIN protest_events pe ON pe.id = v.event_id
       ORDER BY v.created_at DESC`
    )
    .all();

  const auditLogs = db
    .prepare(
      `SELECT al.*, u.full_name AS actor_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ORDER BY al.id DESC
       LIMIT 100`
    )
    .all();

  const externalSources = db.prepare('SELECT * FROM external_event_sources ORDER BY id ASC').all();

  res.json({
    users,
    departments,
    corruption_reports: corruptionReports,
    complaints,
    events,
    volunteers,
    audit_logs: auditLogs,
    external_sources: externalSources,
  });
});

adminRouter.patch('/admin/corruption-reports/:id', requireCsrf, (req, res) => {
  const reportId = Number(req.params.id);
  const { status, moderation_status, verification_label, is_public_hotspot, is_confidential, admin_notes } =
    req.body || {};

  const existing = db.prepare('SELECT * FROM corruption_reports WHERE id = ?').get(reportId) as
    | {
        id: number;
        tracking_id: string;
        user_id: number | null;
        is_anonymous: number;
        status: string;
        moderation_status: string;
        is_confidential: number;
        is_public_hotspot: number;
        latitude: number | null;
        longitude: number | null;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Corruption report not found.' });
    return;
  }

  const nextStatus = status || existing.status;
  const nextMod = moderation_status || existing.moderation_status;
  const nextConf = is_confidential !== undefined ? (is_confidential ? 1 : 0) : existing.is_confidential;
  const nextPublic =
    nextConf === 1
      ? 0
      : is_public_hotspot !== undefined
        ? is_public_hotspot
          ? 1
          : 0
        : nextMod === 'Approved for Public Hotspot'
          ? 1
          : existing.is_public_hotspot;

  const nextLabel =
    verification_label ||
    (nextPublic === 1
      ? 'Verified Report Details (Allegation Under Authority Review)'
      : nextConf === 1
        ? 'Restricted Confidential Filing'
        : 'Under Moderator Review');

  db.prepare(
    `UPDATE corruption_reports
     SET status = ?, moderation_status = ?, verification_label = ?,
         is_public_hotspot = ?, is_confidential = ?, admin_notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, nextMod, nextLabel, nextPublic, nextConf, admin_notes ?? null, reportId);

  if (nextStatus !== existing.status || admin_notes) {
    db.prepare(
      `INSERT INTO corruption_status_history (report_id, previous_status, new_status, changed_by, note)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      reportId,
      existing.status,
      nextStatus,
      req.user!.id,
      admin_notes ? String(admin_notes) : `Moderation updated to ${nextMod}`
    );
  }

  logAudit({
    actorId: req.user!.id,
    actorRole: 'admin',
    action: 'MODERATE_CORRUPTION_REPORT',
    entityType: 'corruption_report',
    entityId: existing.tracking_id,
    details: `Status: ${nextStatus}, Mod: ${nextMod}, PublicHotspot: ${Boolean(nextPublic)}`,
    ipAddress: req.ip,
  });

  if (existing.user_id && existing.is_anonymous === 0) {
    notifyUser({
      userId: existing.user_id,
      type: 'corruption_update',
      title: `Report ${existing.tracking_id} Updated`,
      message: `Status is now "${nextStatus}".`,
      linkPath: 'corruption',
    });
  }

  if (nextPublic === 1 && nextConf === 0 && existing.latitude && existing.longitude) {
    const hotspot = db
      .prepare(
        `SELECT cr.id, cr.tracking_id AS code, cr.title, cr.category, cr.description,
                cr.general_location AS location, cr.city, cr.state, cr.latitude, cr.longitude,
                cr.created_at AS reported_date, cr.status, cr.verification_label,
                cr.source_attribution, cr.updated_at, d.name AS department_name
         FROM corruption_reports cr
         JOIN departments d ON d.id = cr.department_id
         WHERE cr.id = ?`
      )
      .get(reportId) as { latitude: number; longitude: number; [k: string]: unknown };

    emitMapUpdate('map:report_published', {
      ...hotspot,
      latitude: generalizeCoordinate(hotspot.latitude),
      longitude: generalizeCoordinate(hotspot.longitude),
    });
  }

  res.json({ ok: true });
});

adminRouter.patch('/admin/complaints/:id', requireCsrf, (req, res) => {
  const complaintId = Number(req.params.id);
  const { status, moderation_status, department_id, verification_label, resolution_notes } = req.body || {};

  const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId) as
    | { id: number; complaint_code: string; user_id: number | null; status: string; moderation_status: string }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Complaint not found.' });
    return;
  }

  const nextStatus = status || existing.status;
  const nextMod = moderation_status || existing.moderation_status;
  const nextLabel =
    verification_label ||
    (nextMod === 'Approved Public'
      ? nextStatus === 'Resolved'
        ? 'Resolved & Verified'
        : 'Verified Civic Complaint'
      : nextMod);

  db.prepare(
    `UPDATE complaints
     SET status = ?, moderation_status = ?, department_id = COALESCE(?, department_id),
         verification_label = ?, resolution_notes = COALESCE(?, resolution_notes),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, nextMod, department_id ? Number(department_id) : null, nextLabel, resolution_notes ?? null, complaintId);

  db.prepare(
    `INSERT INTO complaint_status_history (complaint_id, previous_status, new_status, changed_by, note)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    complaintId,
    existing.status,
    nextStatus,
    req.user!.id,
    resolution_notes ? String(resolution_notes) : `Moderation: ${nextMod}`
  );

  logAudit({
    actorId: req.user!.id,
    actorRole: 'admin',
    action: 'MODERATE_COMPLAINT',
    entityType: 'complaint',
    entityId: existing.complaint_code,
    details: `Status: ${nextStatus}, Moderation: ${nextMod}`,
    ipAddress: req.ip,
  });

  if (existing.user_id) {
    notifyUser({
      userId: existing.user_id,
      type: 'complaint_update',
      title: `Complaint ${existing.complaint_code} Updated`,
      message: `Status changed to ${nextStatus} (${nextMod}).`,
      linkPath: 'complaints',
    });
  }

  if (nextMod === 'Approved Public') {
    const publicComplaint = db
      .prepare(
        `SELECT c.id, c.complaint_code AS code, c.title, c.category, c.description,
                c.location_text AS location, c.city, c.state, c.latitude, c.longitude,
                c.created_at AS reported_date, c.status, c.verification_label,
                c.source_attribution, c.updated_at, d.name AS department_name
         FROM complaints c
         LEFT JOIN departments d ON d.id = c.department_id
         WHERE c.id = ?`
      )
      .get(complaintId);
    emitMapUpdate('map:complaint_published', publicComplaint);
  }

  res.json({ ok: true });
});

adminRouter.patch('/admin/events/:id', requireCsrf, (req, res) => {
  const eventId = Number(req.params.id);
  const { status, is_public, verification_label, moderation_notes } = req.body || {};

  const existing = db.prepare('SELECT * FROM protest_events WHERE id = ?').get(eventId) as
    | { id: number; event_code: string; organizer_id: number; title: string; status: string; is_public: number }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }

  const nextStatus = status || existing.status;
  const nextPublic =
    is_public !== undefined
      ? is_public
        ? 1
        : 0
      : ['Scheduled', 'Active', 'Completed'].includes(nextStatus)
        ? 1
        : 0;
  const nextLabel =
    verification_label ||
    (nextPublic === 1 ? 'Verified Public Event (Moderator Approved)' : nextStatus);

  db.prepare(
    `UPDATE protest_events
     SET status = ?, is_public = ?, verification_label = ?, moderation_notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, nextPublic, nextLabel, moderation_notes ?? null, eventId);

  db.prepare(
    `INSERT INTO event_status_history (event_id, previous_status, new_status, changed_by, note)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    eventId,
    existing.status,
    nextStatus,
    req.user!.id,
    moderation_notes ? String(moderation_notes) : `Moderator set status to ${nextStatus}`
  );

  logAudit({
    actorId: req.user!.id,
    actorRole: 'admin',
    action: nextPublic === 1 ? 'APPROVE_PROTEST_EVENT' : 'MODERATE_PROTEST_EVENT',
    entityType: 'protest_event',
    entityId: existing.event_code,
    details: `Status: ${nextStatus}, Public: ${Boolean(nextPublic)}`,
    ipAddress: req.ip,
  });

  notifyUser({
    userId: existing.organizer_id,
    type: 'event_approval',
    title: `Event ${existing.event_code}: ${nextStatus}`,
    message:
      nextPublic === 1
        ? `"${existing.title}" has been approved and published on the Real-Time Civic Map.`
        : `"${existing.title}" updated to ${nextStatus}. ${moderation_notes || ''}`,
    linkPath: 'protests',
  });

  if (nextPublic === 1) {
    const publicEvent = db
      .prepare(
        `SELECT pe.id, pe.event_code AS code, pe.title, pe.category, pe.description,
                pe.public_location AS location, pe.city, pe.state, pe.latitude, pe.longitude,
                pe.start_time AS event_date, pe.end_time, pe.status, pe.verification_label,
                pe.source_attribution, pe.updated_at,
                (SELECT COUNT(*) FROM volunteers v WHERE v.event_id = pe.id AND v.status != 'Cancelled') AS volunteer_count
         FROM protest_events pe
         WHERE pe.id = ?`
      )
      .get(eventId);
    emitMapUpdate('map:event_published', publicEvent);
  }

  res.json({ ok: true });
});

adminRouter.patch('/admin/users/:id', requireCsrf, (req, res) => {
  const userId = Number(req.params.id);
  const { role, is_active } = req.body || {};

  if (userId === req.user!.id && is_active === false) {
    res.status(400).json({ error: 'You cannot deactivate your own active admin account.' });
    return;
  }

  const existing = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(userId) as
    | { id: number; role: string; is_active: number }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const nextRole = ['citizen', 'organizer', 'admin'].includes(role) ? role : existing.role;
  const nextActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

  db.prepare("UPDATE users SET role = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?").run(
    nextRole,
    nextActive,
    userId
  );

  if (nextRole === 'admin') {
    db.prepare(
      `INSERT OR IGNORE INTO admins (user_id, admin_level, department_scope)
       VALUES (?, 'moderator', 'General Oversight')`
    ).run(userId);
  }

  logAudit({
    actorId: req.user!.id,
    actorRole: 'admin',
    action: 'USER_ROLE_UPDATED',
    entityType: 'user',
    entityId: userId,
    details: `Role: ${nextRole}, Active: ${Boolean(nextActive)}`,
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

adminRouter.post('/admin/departments', requireCsrf, (req, res) => {
  const { name, code, jurisdiction, contact_email, description } = req.body || {};
  if (!name || !code) {
    res.status(400).json({ error: 'Department name and code are required.' });
    return;
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO departments (name, code, jurisdiction, contact_email, description)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        String(name).trim(),
        String(code).trim().toUpperCase(),
        String(jurisdiction || 'Pune Municipal Corporation').trim(),
        contact_email ? String(contact_email).trim() : null,
        description ? String(description).trim() : null
      );

    logAudit({
      actorId: req.user!.id,
      actorRole: 'admin',
      action: 'DEPARTMENT_CREATED',
      entityType: 'department',
      entityId: result.lastInsertRowid as number,
      details: String(name),
      ipAddress: req.ip,
    });

    res.status(201).json({ id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'Department with that name or code already exists.' });
  }
});

adminRouter.patch('/admin/departments/:id', requireCsrf, (req, res) => {
  const deptId = Number(req.params.id);
  const { is_active, contact_email, description } = req.body || {};

  db.prepare(
    `UPDATE departments
     SET is_active = COALESCE(?, is_active),
         contact_email = COALESCE(?, contact_email),
         description = COALESCE(?, description),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    contact_email ?? null,
    description ?? null,
    deptId
  );

  res.json({ ok: true });
});

adminRouter.patch('/admin/volunteers/:id', requireCsrf, (req, res) => {
  const volId = Number(req.params.id);
  const { status } = req.body || {};
  if (!['Registered', 'Confirmed', 'Cancelled'].includes(String(status))) {
    res.status(400).json({ error: 'Invalid volunteer status.' });
    return;
  }

  const vol = db.prepare('SELECT user_id, event_id FROM volunteers WHERE id = ?').get(volId) as
    | { user_id: number; event_id: number }
    | undefined;

  if (!vol) {
    res.status(404).json({ error: 'Volunteer registration not found.' });
    return;
  }

  db.prepare("UPDATE volunteers SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    String(status),
    volId
  );

  notifyUser({
    userId: vol.user_id,
    type: 'volunteer_update',
    title: 'Volunteer Registration Updated',
    message: `Your volunteer status has been updated to "${status}".`,
    linkPath: 'protests',
  });

  res.json({ ok: true });
});
