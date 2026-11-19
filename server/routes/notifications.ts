import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth, requireCsrf } from '../security.ts';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', requireAuth, (req, res) => {
  const notifications = db
    .prepare(
      `SELECT id, type, title, message, link_path, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 50`
    )
    .all(req.user!.id);

  const unreadCount = (
    db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(req.user!.id) as { c: number }
  ).c;

  res.json({ notifications, unread_count: unreadCount });
});

notificationsRouter.patch('/notifications/:id/read', requireAuth, requireCsrf, (req, res) => {
  const notifId = Number(req.params.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
    notifId,
    req.user!.id
  );
  res.json({ ok: true });
});

notificationsRouter.post('/notifications/read-all', requireAuth, requireCsrf, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});
