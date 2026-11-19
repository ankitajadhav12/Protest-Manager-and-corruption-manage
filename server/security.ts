import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(process.cwd() + '_pcm_dev_secret_key').digest('hex');

export interface AuthUser {
  id: number;
  full_name: string;
  email: string;
  role: 'citizen' | 'organizer' | 'admin';
  city: string;
  organization_name: string | null;
  is_active: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser | null;
      csrfToken?: string;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, original);
}

export function signSessionToken(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid: userId,
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { uid: number } | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || !data.exp || Date.now() > data.exp) return null;
    return { uid: Number(data.uid) };
  } catch {
    return null;
  }
}

export function generateCsrfToken(sessionHint: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`csrf:${sessionHint}`).digest('hex').slice(0, 32);
}

export function attachAuthContext(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.pcm_session;
  req.user = null;
  if (token) {
    const verified = verifySessionToken(token);
    if (verified) {
      const user = db
        .prepare(
          'SELECT id, full_name, email, role, city, organization_name, is_active FROM users WHERE id = ?'
        )
        .get(verified.uid) as AuthUser | undefined;
      if (user && user.is_active === 1) {
        req.user = user;
      }
    }
  }

  let csrfCookie = req.cookies?.pcm_csrf_nonce;
  if (!csrfCookie) {
    csrfCookie = crypto.randomBytes(16).toString('hex');
    res.cookie('pcm_csrf_nonce', csrfCookie, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  }
  req.csrfToken = generateCsrfToken(csrfCookie);
  next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  const headerToken = req.get('X-CSRF-Token');
  const csrfNonce = req.cookies?.pcm_csrf_nonce;
  if (!csrfNonce || !headerToken) {
    res.status(403).json({ error: 'Missing CSRF verification token.' });
    return;
  }
  const expected = generateCsrfToken(csrfNonce);
  const a = Buffer.from(headerToken);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(403).json({ error: 'Invalid CSRF verification token.' });
    return;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  next();
}

export function requireRole(...roles: Array<'citizen' | 'organizer' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient role permissions for this operation.' });
      return;
    }
    next();
  };
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'unknown'}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const entry = rateBuckets.get(key);
    if (!entry || now > entry.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait briefly before retrying.',
      });
      return;
    }
    entry.count += 1;
    next();
  };
}

export function validateCoordinates(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return null;
  }
  // Strict bounds check (India bounding box + general valid geographic safety)
  if (latNum < 6.0 || latNum > 38.0 || lngNum < 67.0 || lngNum > 98.0) {
    return null;
  }
  return { lat: Number(latNum.toFixed(6)), lng: Number(lngNum.toFixed(6)) };
}

/**
 * Generalizes coordinates to ~1.1km grid for sensitive corruption allegations
 * so individual buildings or complainant residences are never exposed on maps.
 */
export function generalizeCoordinate(val: number): number {
  return Number(val.toFixed(2));
}
