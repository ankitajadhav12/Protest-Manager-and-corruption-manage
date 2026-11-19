from flask import Blueprint, jsonify, request, session
from app.models.db import execute_query, fetch_all, fetch_one
from app.routes.auth import role_required
from app.services.audit_service import create_notification, log_audit
from app.services.geocode_service import generalize_coordinate
from app.sockets.map_events import broadcast_map_event

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/overview")
@role_required("admin")
def overview():
    return jsonify(
        {
            "events": fetch_all("SELECT * FROM protest_events ORDER BY created_at DESC"),
            "complaints": fetch_all("SELECT * FROM complaints ORDER BY created_at DESC"),
            "corruption_reports": fetch_all(
                "SELECT id, tracking_id, department_id, category, title, general_location, status, moderation_status, is_public_hotspot, is_confidential, created_at FROM corruption_reports ORDER BY created_at DESC"
            ),
            "departments": fetch_all("SELECT * FROM departments ORDER BY name ASC"),
            "audit_logs": fetch_all("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100"),
        }
    )


@admin_bp.patch("/events/<int:event_id>")
@role_required("admin")
def moderate_event(event_id: int):
    data = request.get_json(silent=True) or {}
    ev = fetch_one("SELECT * FROM protest_events WHERE id = %s", (event_id,))
    if not ev:
        return jsonify({"error": "Event not found."}), 404

    next_status = data.get("status", ev["status"])
    is_public = 1 if data.get("is_public") else 0
    label = "Verified Public Event (Moderator Approved)" if is_public else next_status

    execute_query(
        "UPDATE protest_events SET status = %s, is_public = %s, verification_label = %s, moderation_notes = %s WHERE id = %s",
        (next_status, is_public, label, data.get("moderation_notes"), event_id),
    )
    execute_query(
        "INSERT INTO event_status_history (event_id, previous_status, new_status, changed_by, note) VALUES (%s, %s, %s, %s, %s)",
        (event_id, ev["status"], next_status, session["user_id"], data.get("moderation_notes")),
    )
    log_audit(session["user_id"], "admin", "MODERATE_PROTEST_EVENT", "protest_event", ev["event_code"])
    create_notification(
        ev["organizer_id"],
        "event_approval",
        f"Event {ev['event_code']}: {next_status}",
        f"Your event '{ev['title']}' has been updated to {next_status}.",
        "/protests",
    )

    if is_public == 1:
        updated = fetch_one("SELECT * FROM protest_events WHERE id = %s", (event_id,))
        broadcast_map_event("map:event_published", updated or {})

    return jsonify({"ok": True})


@admin_bp.patch("/corruption-reports/<int:report_id>")
@role_required("admin")
def moderate_report(report_id: int):
    data = request.get_json(silent=True) or {}
    rep = fetch_one("SELECT * FROM corruption_reports WHERE id = %s", (report_id,))
    if not rep:
        return jsonify({"error": "Report not found."}), 404

    next_status = data.get("status", rep["status"])
    next_mod = data.get("moderation_status", rep["moderation_status"])
    is_conf = 1 if data.get("is_confidential", rep["is_confidential"]) else 0
    is_pub = 0 if is_conf else (1 if data.get("is_public_hotspot") else 0)

    execute_query(
        "UPDATE corruption_reports SET status = %s, moderation_status = %s, is_confidential = %s, is_public_hotspot = %s, admin_notes = %s WHERE id = %s",
        (next_status, next_mod, is_conf, is_pub, data.get("admin_notes"), report_id),
    )
    log_audit(session["user_id"], "admin", "MODERATE_CORRUPTION_REPORT", "corruption_report", rep["tracking_id"])

    if is_pub == 1 and rep.get("latitude") and rep.get("longitude"):
        rep["latitude"] = generalize_coordinate(rep["latitude"])
        rep["longitude"] = generalize_coordinate(rep["longitude"])
        broadcast_map_event("map:report_published", rep)

    return jsonify({"ok": True})
