import secrets
from flask import Blueprint, jsonify, request, session
from app.models.db import execute_query, fetch_all, fetch_one
from app.routes.auth import login_required, role_required
from app.services.audit_service import log_audit
from app.services.geocode_service import validate_coordinates

events_bp = Blueprint("events", __name__)


@events_bp.get("/events")
def list_events():
    events = fetch_all(
        """
        SELECT pe.*, u.full_name AS organizer_name, u.organization_name AS organizer_org,
               (SELECT COUNT(*) FROM volunteers v WHERE v.event_id = pe.id AND v.status != 'Cancelled') AS volunteer_count
        FROM protest_events pe
        JOIN users u ON u.id = pe.organizer_id
        WHERE pe.is_public = 1
        ORDER BY pe.start_time ASC
        """
    )
    return jsonify({"events": events})


@events_bp.post("/events")
@role_required("organizer", "admin")
def create_event():
    data = request.get_json(silent=True) or {}
    coords = validate_coordinates(data.get("latitude", 18.5204), data.get("longitude", 73.8567))
    if not coords:
        return jsonify({"error": "Invalid coordinates."}), 400

    event_code = f"PCM-EV-2026-{secrets.randbelow(690) + 310}"
    eid = execute_query(
        """
        INSERT INTO protest_events (
            event_code, organizer_id, title, category, description, public_location,
            city, state, latitude, longitude, start_time, end_time,
            expected_participants, status, verification_label, is_public
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Pending Moderation', 'Pending Moderator Review', 0)
        """,
        (
            event_code,
            session["user_id"],
            data.get("title"),
            data.get("category"),
            data.get("description"),
            data.get("public_location"),
            data.get("city", "Pune"),
            data.get("state", "Maharashtra"),
            coords[0],
            coords[1],
            data.get("start_time"),
            data.get("end_time"),
            int(data.get("expected_participants", 50)),
        ),
    )

    execute_query(
        """
        INSERT INTO event_status_history (event_id, previous_status, new_status, changed_by, note)
        VALUES (%s, NULL, 'Pending Moderation', %s, 'Submitted for review.')
        """,
        (eid, session["user_id"]),
    )
    log_audit(session["user_id"], session["role"], "EVENT_CREATED", "protest_event", event_code)
    return jsonify({"id": eid, "event_code": event_code, "status": "Pending Moderation"}), 201


@events_bp.post("/events/<int:event_id>/volunteer")
@login_required
def register_volunteer(event_id: int):
    ev = fetch_one("SELECT id, is_public FROM protest_events WHERE id = %s", (event_id,))
    if not ev or ev["is_public"] != 1:
        return jsonify({"error": "Verified event not found."}), 404

    data = request.get_json(silent=True) or {}
    execute_query(
        """
        INSERT INTO volunteers (event_id, user_id, role_preference, availability_notes, status)
        VALUES (%s, %s, %s, %s, 'Registered')
        ON DUPLICATE KEY UPDATE
          role_preference = VALUES(role_preference),
          availability_notes = VALUES(availability_notes),
          status = 'Registered'
        """,
        (event_id, session["user_id"], data.get("role_preference", "General Support"), data.get("availability_notes")),
    )
    return jsonify({"status": "Registered"}), 201


@events_bp.delete("/events/<int:event_id>/volunteer")
@login_required
def cancel_volunteer(event_id: int):
    execute_query(
        "UPDATE volunteers SET status = 'Cancelled' WHERE event_id = %s AND user_id = %s",
        (event_id, session["user_id"]),
    )
    return jsonify({"status": "Cancelled"})
