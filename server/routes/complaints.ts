import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { db } from '../db.ts';
import { createRateLimiter, requireAuth, requireCsrf, validateCoordinates } from '../security.ts';
import { logAudit, notifyAdmins } from '../services/audit.ts';
import { findPotentialDuplicateComplaints } from '../services/duplicates.ts';

export const complaintsRouter = Router();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
const allowedImageMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      cb(null, `cc_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedImageMimes.has(file.mimetype)) {
      cb(new Error('Only JPG, PNG, or WEBP photos are permitted for civic complaints.'));
      return;
    }
    cb(null, true);
  },
});

const submitLimiter = createRateLimiter(20, 60 * 1000);

const VALID_COMPLAINT_CATEGORIES = new Set([
  'Road damage',
  'Water supply problems',
  'Garbage management',
  'Electricity problems',
  'Public infrastructure issues',
  'Sanitation',
  'Other civic issues',
]);

complaintsRouter.get('/complaints', (req, res) => {
  const category = req.query.category ? String(req.query.category) : null;
  const status = req.query.status ? String(req.query.status) : null;

  let query = `
    SELECT
      c.id, c.complaint_code, c.department_id, d.name AS department_name,
      c.category, c.title, c.description, c.location_text, c.city, c.state,
      c.latitude, c.longitude, c.status, c.moderation_status,
      c.verification_label, c.source_attribution, c.potential_duplicate_of,
      c.resolution_notes, c.created_at, c.updated_at
    FROM complaints c
    LEFT JOIN departments d ON d.id = c.department_id
    WHERE (c.moderation_status = 'Approved Public' ${req.user ? 'OR c.user_id = ?' : ''})
  `;
  const params: unknown[] = [];
  if (req.user) {
    params.push(req.user.id);
  }
  if (category && category !== 'all') {
    query += ' AND c.category = ?';
    params.push(category);
  }
  if (status && status !== 'all') {
    query += ' AND c.status = ?';
    params.push(status);
  }
  query += ' ORDER BY c.updated_at DESC';

  const complaints = db.prepare(query).all(...params);
  res.json({ complaints });
});

complaintsRouter.get('/complaints/mine', requireAuth, (req, res) => {
  const complaints = db
    .prepare(
      `SELECT
        c.id, c.complaint_code, c.department_id, d.name AS department_name,
        c.category, c.title, c.description, c.location_text, c.city, c.state,
        c.latitude, c.longitude, c.status, c.moderation_status,
        c.verification_label, c.potential_duplicate_of, c.resolution_notes,
        c.created_at, c.updated_at
       FROM complaints c
       LEFT JOIN departments d ON d.id = c.department_id
       WHERE c.user_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ complaints });
});

complaintsRouter.get('/complaints/track/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const complaint = db
    .prepare(
      `SELECT
        c.id, c.complaint_code, c.department_id, d.name AS department_name,
        c.category, c.title, c.description, c.location_text, c.city, c.state,
        c.latitude, c.longitude, c.status, c.moderation_status,
        c.verification_label, c.source_attribution, c.potential_duplicate_of,
        c.resolution_notes, c.created_at, c.updated_at
       FROM complaints c
       LEFT JOIN departments d ON d.id = c.department_id
       WHERE c.complaint_code = ?`
    )
    .get(code) as { id: number; [key: string]: unknown } | undefined;

  if (!complaint) {
    res.status(404).json({ error: 'Complaint code not found.' });
    return;
  }

  const history = db
    .prepare(
      `SELECT previous_status, new_status, note, created_at
       FROM complaint_status_history
       WHERE complaint_id = ?
       ORDER BY id ASC`
    )
    .all(complaint.id);

  res.json({ complaint, history });
});

complaintsRouter.post('/complaints/check-duplicates', requireCsrf, (req, res) => {
  const { title, description, category, location_text } = req.body || {};
  if (!title || !description) {
    res.json({ duplicates: [] });
    return;
  }
  const duplicates = findPotentialDuplicateComplaints({
    title: String(title),
    description: String(description),
    category: String(category || ''),
    locationText: String(location_text || ''),
  });
  res.json({ duplicates });
});

complaintsRouter.post(
  '/complaints',
  submitLimiter,
  requireCsrf,
  upload.single('photo'),
  (req, res) => {
    const body = req.body || {};
    const category = String(body.category || '');
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const locationText = String(body.location_text || '').trim();
    const city = String(body.city || 'Pune').trim();
    const state = String(body.state || 'Maharashtra').trim();
    const departmentId = body.department_id ? Number(body.department_id) : null;

    if (!VALID_COMPLAINT_CATEGORIES.has(category)) {
      res.status(400).json({ error: 'Please select a valid civic issue category.' });
      return;
    }
    if (title.length < 5 || description.length < 15 || locationText.length < 3) {
      res.status(400).json({ error: 'Title, detailed description, and location are required.' });
      return;
    }

    const coords = validateCoordinates(body.latitude ?? 18.5204, body.longitude ?? 73.8567);
    if (!coords) {
      res.status(400).json({ error: 'Valid geographic coordinates are required.' });
      return;
    }

    const duplicates = findPotentialDuplicateComplaints({
      title,
      description,
      category,
      locationText,
    });
    const potentialDupRef = duplicates.length > 0 ? duplicates[0].reference_code : null;
    const complaintCode = `PCM-CC-2026-${crypto.randomInt(2010, 9999)}`;

    const result = db
      .prepare(
        `INSERT INTO complaints (
          complaint_code, user_id, department_id, category, title, description,
          location_text, city, state, latitude, longitude,
          status, moderation_status, verification_label, source_attribution, potential_duplicate_of
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', 'Pending Moderation', 'Pending Verification', 'Citizen Civic Complaint', ?)`
      )
      .run(
        complaintCode,
        req.user?.id ?? null,
        departmentId,
        category,
        title,
        description,
        locationText,
        city,
        state,
        coords.lat,
        coords.lng,
        potentialDupRef
      );

    const complaintId = Number(result.lastInsertRowid);

    db.prepare(
      `INSERT INTO complaint_status_history (complaint_id, previous_status, new_status, changed_by, note)
       VALUES (?, NULL, 'Submitted', ?, 'Civic complaint logged and queued for verification.')`
    ).run(complaintId, req.user?.id ?? null);

    if (req.file) {
      const fileBuffer = fs.readFileSync(req.file.path);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      db.prepare(
        `INSERT INTO evidence (entity_type, entity_id, uploaded_by, original_filename, stored_filename, mime_type, file_size, sha256_hash, is_private)
         VALUES ('complaint', ?, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        complaintId,
        req.user?.id ?? null,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        sha256
      );
    }

    logAudit({
      actorId: req.user?.id ?? null,
      actorRole: req.user?.role ?? 'citizen',
      action: 'COMPLAINT_SUBMITTED',
      entityType: 'complaint',
      entityId: complaintCode,
      details: `${category} in ${city}`,
      ipAddress: req.ip,
    });

    notifyAdmins({
      type: 'complaint_update',
      title: `New Civic Complaint ${complaintCode}`,
      message: `${category} reported in ${locationText}. Awaiting moderation & assignment.`,
      linkPath: 'admin',
    });

    res.status(201).json({
      complaint_code: complaintCode,
      status: 'Submitted',
      potential_duplicates: duplicates,
    });
  }
);
