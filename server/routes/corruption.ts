import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { db } from '../db.ts';
import {
  createRateLimiter,
  generalizeCoordinate,
  requireAuth,
  requireCsrf,
  validateCoordinates,
} from '../security.ts';
import { logAudit, notifyAdmins } from '../services/audit.ts';
import { findPotentialDuplicateReports } from '../services/duplicates.ts';

export const corruptionRouter = Router();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
const allowedMimes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      cb(null, `ev_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimes.has(file.mimetype)) {
      cb(new Error('Unsupported file format. Allowed: PDF, JPG, PNG, WEBP, TXT.'));
      return;
    }
    cb(null, true);
  },
});

const submitLimiter = createRateLimiter(15, 60 * 1000);

const VALID_CATEGORIES = new Set([
  'Bribery',
  'Misuse of public funds',
  'Administrative corruption',
  'Fraud',
  'Abuse of authority',
  'Other suspected corruption',
]);

corruptionRouter.get('/departments', (_req, res) => {
  const departments = db
    .prepare('SELECT id, name, code, jurisdiction, description FROM departments WHERE is_active = 1 ORDER BY name')
    .all();
  res.json({ departments });
});

corruptionRouter.get('/corruption-reports', (req, res) => {
  // Public endpoint returns ONLY moderated, non-confidential public hotspots
  // Reporter identity is NEVER exposed publicly.
  const category = req.query.category ? String(req.query.category) : null;
  const status = req.query.status ? String(req.query.status) : null;

  let query = `
    SELECT
      cr.id,
      cr.tracking_id,
      cr.department_id,
      d.name AS department_name,
      cr.category,
      cr.title,
      cr.description,
      cr.general_location,
      cr.city,
      cr.state,
      cr.latitude,
      cr.longitude,
      cr.is_anonymous,
      cr.status,
      cr.moderation_status,
      cr.verification_label,
      cr.source_attribution,
      cr.potential_duplicate_of,
      cr.created_at,
      cr.updated_at
    FROM corruption_reports cr
    JOIN departments d ON d.id = cr.department_id
    WHERE cr.is_public_hotspot = 1 AND cr.is_confidential = 0
  `;
  const params: unknown[] = [];

  if (category && category !== 'all') {
    query += ' AND cr.category = ?';
    params.push(category);
  }
  if (status && status !== 'all') {
    query += ' AND cr.status = ?';
    params.push(status);
  }
  query += ' ORDER BY cr.updated_at DESC';

  const reports = db.prepare(query).all(...params);
  res.json({ reports });
});

corruptionRouter.get('/corruption-reports/mine', requireAuth, (req, res) => {
  const reports = db
    .prepare(
      `SELECT
        cr.id, cr.tracking_id, cr.department_id, d.name AS department_name,
        cr.category, cr.title, cr.description, cr.general_location, cr.city, cr.state,
        cr.is_anonymous, cr.is_confidential, cr.status, cr.moderation_status,
        cr.verification_label, cr.potential_duplicate_of, cr.created_at, cr.updated_at
       FROM corruption_reports cr
       JOIN departments d ON d.id = cr.department_id
       WHERE cr.user_id = ?
       ORDER BY cr.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ reports });
});

corruptionRouter.get('/corruption-reports/track/:trackingId', (req, res) => {
  const trackingId = String(req.params.trackingId || '').trim().toUpperCase();
  const report = db
    .prepare(
      `SELECT
        cr.id, cr.tracking_id, cr.user_id, cr.department_id, d.name AS department_name,
        cr.category, cr.title, cr.description, cr.general_location, cr.city, cr.state,
        cr.is_anonymous, cr.is_confidential, cr.status, cr.moderation_status,
        cr.verification_label, cr.source_attribution, cr.potential_duplicate_of,
        cr.created_at, cr.updated_at
       FROM corruption_reports cr
       JOIN departments d ON d.id = cr.department_id
       WHERE cr.tracking_id = ?`
    )
    .get(trackingId) as
    | {
        id: number;
        tracking_id: string;
        user_id: number | null;
        is_confidential: number;
        is_anonymous: number;
        description: string;
        [key: string]: unknown;
      }
    | undefined;

  if (!report) {
    res.status(404).json({ error: 'No corruption report found with that tracking ID.' });
    return;
  }

  const isOwnerOrAdmin =
    req.user && (req.user.role === 'admin' || (report.user_id && report.user_id === req.user.id));

  // Protect confidential descriptions from unauthorized public lookups
  const safeReport = {
    tracking_id: report.tracking_id,
    department_name: report.department_name,
    category: report.category,
    title: report.is_confidential && !isOwnerOrAdmin ? 'Confidential Oversight Filing (Restricted)' : report.title,
    description:
      report.is_confidential && !isOwnerOrAdmin
        ? 'Details of this confidential submission are restricted to authorized oversight personnel. Status updates remain trackable below.'
        : report.description,
    general_location: report.general_location,
    city: report.city,
    state: report.state,
    is_anonymous: Boolean(report.is_anonymous),
    is_confidential: Boolean(report.is_confidential),
    status: report.status,
    moderation_status: report.moderation_status,
    verification_label: report.verification_label,
    source_attribution: report.source_attribution,
    potential_duplicate_of: report.potential_duplicate_of,
    created_at: report.created_at,
    updated_at: report.updated_at,
    ethical_notice:
      'A corruption report represents an allegation under verification, not proof of wrongdoing.',
  };

  const history = db
    .prepare(
      `SELECT previous_status, new_status, note, created_at
       FROM corruption_status_history
       WHERE report_id = ?
       ORDER BY id ASC`
    )
    .all(report.id);

  let evidenceFiles: unknown[] = [];
  if (isOwnerOrAdmin) {
    evidenceFiles = db
      .prepare('SELECT id, original_filename, mime_type, file_size, created_at FROM evidence WHERE entity_type = ? AND entity_id = ?')
      .all('corruption_report', report.id);
  }

  res.json({ report: safeReport, history, evidence: evidenceFiles });
});

corruptionRouter.post('/corruption-reports/check-duplicates', requireCsrf, (req, res) => {
  const { title, description, category, department_id, general_location } = req.body || {};
  if (!title || !description) {
    res.json({ duplicates: [] });
    return;
  }
  const duplicates = findPotentialDuplicateReports({
    title: String(title),
    description: String(description),
    category: String(category || ''),
    departmentId: Number(department_id || 0),
    generalLocation: String(general_location || ''),
  });
  res.json({ duplicates });
});

corruptionRouter.post(
  '/corruption-reports',
  submitLimiter,
  requireCsrf,
  upload.single('evidence_file'),
  (req, res) => {
    const body = req.body || {};
    const departmentId = Number(body.department_id);
    const category = String(body.category || '');
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const generalLocation = String(body.general_location || '').trim();
    const city = String(body.city || 'Pune').trim();
    const state = String(body.state || 'Maharashtra').trim();
    const isAnonymous = body.is_anonymous === 'true' || body.is_anonymous === true ? 1 : 0;
    const isConfidential =
      body.is_confidential === 'false' || body.is_confidential === false ? 0 : 1;

    if (!departmentId || !VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: 'Valid department and corruption category are required.' });
      return;
    }
    if (title.length < 6 || description.length < 20 || generalLocation.length < 3) {
      res.status(400).json({
        error: 'Please provide a descriptive title (6+ chars), detailed summary (20+ chars), and general location.',
      });
      return;
    }

    const dept = db.prepare('SELECT id FROM departments WHERE id = ?').get(departmentId);
    if (!dept) {
      res.status(400).json({ error: 'Selected department does not exist.' });
      return;
    }

    let safeLat: number | null = null;
    let safeLng: number | null = null;
    if (body.latitude !== undefined && body.longitude !== undefined && body.latitude !== '' && body.longitude !== '') {
      const coords = validateCoordinates(body.latitude, body.longitude);
      if (!coords) {
        res.status(400).json({ error: 'Coordinates must fall within valid geographic bounds.' });
        return;
      }
      // Ethical requirement: generalize sensitive corruption hotspot coordinates (~1.1 km)
      safeLat = generalizeCoordinate(coords.lat);
      safeLng = generalizeCoordinate(coords.lng);
    }

    const duplicates = findPotentialDuplicateReports({
      title,
      description,
      category,
      departmentId,
      generalLocation,
    });
    const potentialDupRef = duplicates.length > 0 ? duplicates[0].reference_code : null;

    const trackingId = `PCM-CR-2026-${crypto.randomInt(1050, 9999)}`;
    // Critical privacy rule: NEVER store user_id when anonymous reporting is selected
    const linkedUserId = isAnonymous === 1 ? null : req.user?.id ?? null;

    const insertRes = db
      .prepare(
        `INSERT INTO corruption_reports (
          tracking_id, user_id, department_id, category, title, description,
          general_location, city, state, latitude, longitude,
          is_anonymous, is_confidential, status, moderation_status,
          verification_label, source_attribution, potential_duplicate_of, is_public_hotspot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, ?, ?, 0)`
      )
      .run(
        trackingId,
        linkedUserId,
        departmentId,
        category,
        title,
        description,
        generalLocation,
        city,
        state,
        safeLat,
        safeLng,
        isAnonymous,
        isConfidential,
        isConfidential ? 'Confidential - Restricted' : 'Pending Moderation',
        'Unverified Allegation - Under Review',
        isAnonymous ? 'Anonymous Citizen Allegation' : 'Citizen Allegation Report',
        potentialDupRef
      );

    const reportId = Number(insertRes.lastInsertRowid);

    db.prepare(
      `INSERT INTO corruption_status_history (report_id, previous_status, new_status, changed_by, note)
       VALUES (?, NULL, 'Submitted', ?, ?)`
    ).run(
      reportId,
      linkedUserId,
      isAnonymous
        ? 'Submitted anonymously. Identity unlinked by privacy safeguard.'
        : 'Report submitted and queued for moderator review.'
    );

    if (req.file) {
      const fileBuffer = fs.readFileSync(req.file.path);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      db.prepare(
        `INSERT INTO evidence (entity_type, entity_id, uploaded_by, original_filename, stored_filename, mime_type, file_size, sha256_hash, is_private)
         VALUES ('corruption_report', ?, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        reportId,
        linkedUserId,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        sha256
      );
    }

    logAudit({
      actorId: linkedUserId,
      actorRole: isAnonymous ? 'anonymous' : req.user?.role ?? 'citizen',
      action: 'CORRUPTION_REPORT_SUBMITTED',
      entityType: 'corruption_report',
      entityId: trackingId,
      details: `Category: ${category}, Confidential: ${Boolean(isConfidential)}, Anonymous: ${Boolean(isAnonymous)}`,
      ipAddress: isAnonymous ? 'redacted' : req.ip,
    });

    notifyAdmins({
      type: 'corruption_update',
      title: `New Corruption Allegation ${trackingId}`,
      message: `${category} report submitted in ${city}. Pending moderator verification.`,
      linkPath: 'admin',
    });

    res.status(201).json({
      tracking_id: trackingId,
      status: 'Submitted',
      potential_duplicates: duplicates,
      ethical_notice:
        'Your allegation has been recorded. Save your Tracking ID to follow verification updates.',
    });
  }
);

corruptionRouter.get('/evidence/:id', requireAuth, (req, res) => {
  const evidenceId = Number(req.params.id);
  const item = db
    .prepare('SELECT * FROM evidence WHERE id = ?')
    .get(evidenceId) as
    | {
        id: number;
        uploaded_by: number | null;
        original_filename: string;
        stored_filename: string;
        mime_type: string;
      }
    | undefined;

  if (!item) {
    res.status(404).json({ error: 'Evidence record not found.' });
    return;
  }

  const authorized = req.user!.role === 'admin' || (item.uploaded_by && item.uploaded_by === req.user!.id);
  if (!authorized) {
    res.status(403).json({ error: 'Access to private evidence is restricted.' });
    return;
  }

  const filePath = path.join(uploadsDir, item.stored_filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Evidence file missing from secure vault.' });
    return;
  }

  res.setHeader('Content-Type', item.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${item.original_filename.replace(/"/g, '')}"`);
  fs.createReadStream(filePath).pipe(res);
});
