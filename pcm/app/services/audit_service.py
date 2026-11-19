from app.models.db import execute_query
from app import socketio


def log_audit(actor_id, actor_role: str, action: str, entity_type: str, entity_id: str, details: str = "", ip: str = ""):
    execute_query(
        """
        INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, details, ip_address)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (actor_id, actor_role, action, entity_type, str(entity_id), details, ip),
    )


def create_notification(user_id: int, ntype: str, title: str, message: str, link_path: str = ""):
    notif_id = execute_query(
        """
        INSERT INTO notifications (user_id, type, title, message, link_path)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (user_id, ntype, title, message, link_path),
    )
    socketio.emit(
        "notification:new",
        {"id": notif_id, "type": ntype, "title": title, "message": message},
        room=f"user:{user_id}",
    )
