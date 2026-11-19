from flask import Blueprint, jsonify, session
from app.models.db import execute_query, fetch_all, fetch_one
from app.routes.auth import login_required

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.get("/notifications")
@login_required
def list_notifications():
    items = fetch_all(
        "SELECT id, type, title, message, link_path, is_read, created_at FROM notifications WHERE user_id = %s ORDER BY id DESC LIMIT 50",
        (session["user_id"],),
    )
    unread = fetch_one(
        "SELECT COUNT(*) AS c FROM notifications WHERE user_id = %s AND is_read = 0",
        (session["user_id"],),
    )
    return jsonify({"notifications": items, "unread_count": unread["c"] if unread else 0})


@notifications_bp.patch("/notifications/<int:notif_id>/read")
@login_required
def mark_read(notif_id: int):
    execute_query("UPDATE notifications SET is_read = 1 WHERE id = %s AND user_id = %s", (notif_id, session["user_id"]))
    return jsonify({"ok": True})
