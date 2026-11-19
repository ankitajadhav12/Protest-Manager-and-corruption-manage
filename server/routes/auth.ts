import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db.ts';
import {
  createRateLimiter,
  hashPassword,
  requireAuth,
  requireCsrf,
  signSessionToken,
  verifyPassword,
} from '../security.ts';
import { logAudit } from '../services/audit.ts';

export const authRouter = Router();

const authLimiter = createRateLimiter(25, 60 * 1000);

authRouter.get('/me', (req, res) => {
  res.json({
    user: req.user || null,
    csrfToken: req.csrfToken,
  });
});

authRouter.post('/register', authLimiter, requireCsrf, (req, res) => {
  const { full_name, email, password, role, phone, city, organization_name } = req.body || {};

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  // Self-registration only permits citizen or organizer; admins are provisioned internally
  const safeRole = role === 'organizer' ? 'organizer' : 'citizen';
  const normalizedEmail = email.trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = hashPassword(password);
  const result = db
    .prepare(
      `INSERT INTO users (full_name, email, password_hash, role, phone, city, organization_name, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      full_name.trim(),
      normalizedEmail,
      passwordHash,
      safeRole,
      phone ? String(phone).trim() : null,
      city ? String(city).trim() : 'Pune',
      organization_name ? String(organization_name).trim() : null
    );

  const userId = Number(result.lastInsertRowid);
  const user = db
    .prepare('SELECT id, full_name, email, role, city, organization_name, is_active FROM users WHERE id = ?')
    .get(userId);

  const token = signSessionToken(userId);
  res.cookie('pcm_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  logAudit({
    actorId: userId,
    actorRole: safeRole,
    action: 'USER_REGISTERED',
    entityType: 'user',
    entityId: userId,
    details: `Registered ${safeRole} account`,
    ipAddress: req.ip,
  });

  res.status(201).json({ user, csrfToken: req.csrfToken });
});

authRouter.post('/login', authLimiter, requireCsrf, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const row = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(normalizedEmail) as
    | {
        id: number;
        full_name: string;
        email: string;
        password_hash: string;
        role: 'citizen' | 'organizer' | 'admin';
        city: string;
        organization_name: string | null;
        is_active: number;
      }
    | undefined;

  if (!row || !verifyPassword(String(password), row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (row.is_active !== 1) {
    res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
    return;
  }

  const token = signSessionToken(row.id);
  res.cookie('pcm_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  logAudit({
    actorId: row.id,
    actorRole: row.role,
    action: 'USER_LOGIN',
    entityType: 'user',
    entityId: row.id,
    ipAddress: req.ip,
  });

  res.json({
    user: {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      role: row.role,
      city: row.city,
      organization_name: row.organization_name,
      is_active: row.is_active,
    },
    csrfToken: req.csrfToken,
  });
});

authRouter.post('/logout', requireCsrf, (req, res) => {
  if (req.user) {
    logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'USER_LOGOUT',
      entityType: 'user',
      entityId: req.user.id,
      ipAddress: req.ip,
    });
  }
  res.clearCookie('pcm_session');
  res.json({ ok: true });
});

authRouter.patch('/profile', requireAuth, requireCsrf, (req, res) => {
  const { full_name, phone, city, organization_name } = req.body || {};
  if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }

  db.prepare(
    `UPDATE users
     SET full_name = ?, phone = ?, city = ?, organization_name = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    full_name.trim(),
    phone ? String(phone).trim() : null,
    city ? String(city).trim() : 'Pune',
    organization_name ? String(organization_name).trim() : null,
    req.user!.id
  );

  const updated = db
    .prepare('SELECT id, full_name, email, role, city, organization_name, is_active FROM users WHERE id = ?')
    .get(req.user!.id);

  logAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'PROFILE_UPDATED',
    entityType: 'user',
    entityId: req.user!.id,
    ipAddress: req.ip,
  });

  res.json({ user: updated });
});

authRouter.post('/password-reset/request', authLimiter, requireCsrf, (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(normalizedEmail) as
    | { id: number; email: string }
    | undefined;

  if (!user) {
    // Generic response to avoid account enumeration
    res.json({
      message: 'If an account matches that email, a reset token has been generated.',
    });
    return;
  }

  const rawToken = crypto.randomBytes(20).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  db.prepare(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, datetime('now', '+30 minutes'))`
  ).run(user.id, tokenHash);

  logAudit({
    actorId: user.id,
    actorRole: 'user',
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'user',
    entityId: user.id,
    ipAddress: req.ip,
  });

  res.json({
    message: 'Password reset token generated (valid for 30 minutes).',
    reset_token_preview: process.env.NODE_ENV === 'production' ? undefined : rawToken,
  });
});

authRouter.post('/password-reset/confirm', authLimiter, requireCsrf, (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password || String(new_password).length < 8) {
    res.status(400).json({ error: 'Valid token and password (minimum 8 characters) are required.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
  const record = db
    .prepare(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')`
    )
    .get(tokenHash) as { id: number; user_id: number } | undefined;

  if (!record) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
    return;
  }

  const newHash = hashPassword(String(new_password));
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
    newHash,
    record.user_id
  );
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(record.id);

  logAudit({
    actorId: record.user_id,
    actorRole: 'user',
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'user',
    entityId: record.user_id,
    ipAddress: req.ip,
  });

  res.json({ ok: true, message: 'Password updated successfully. You may now sign in.' });
});
