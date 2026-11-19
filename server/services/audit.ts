import { db } from '../db.ts';
import { emitToUser } from '../socket.ts';

export function logAudit(params: {
  actorId?: number | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: string;
  ipAddress?: string;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.actorId ?? null,
    params.actorRole ?? 'anonymous',
    params.action,
    params.entityType,
    params.entityId !== undefined && params.entityId !== null ? String(params.entityId) : null,
    params.details ?? null,
    params.ipAddress ?? null
  );
}

export function notifyUser(params: {
  userId: number;
  type:
    | 'complaint_update'
    | 'corruption_update'
    | 'event_approval'
    | 'event_announcement'
    | 'volunteer_update'
    | 'system_notice';
  title: string;
  message: string;
  linkPath?: string;
}): void {
  const result = db
    .prepare(
      `INSERT INTO notifications (user_id, type, title, message, link_path)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(params.userId, params.type, params.title, params.message, params.linkPath ?? null);

  const created = db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .get(result.lastInsertRowid);

  emitToUser(params.userId, 'notification:new', created);
}

export function notifyAdmins(params: {
  type:
    | 'complaint_update'
    | 'corruption_update'
    | 'event_approval'
    | 'event_announcement'
    | 'volunteer_update'
    | 'system_notice';
  title: string;
  message: string;
  linkPath?: string;
}): void {
  const admins = db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")
    .all() as Array<{ id: number }>;

  for (const admin of admins) {
    notifyUser({
      userId: admin.id,
      type: params.type,
      title: params.title,
      message: params.message,
      linkPath: params.linkPath,
    });
  }
}
