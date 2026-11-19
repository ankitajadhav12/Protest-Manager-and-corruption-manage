import secrets
from flask import Blueprint, jsonify, request, session
from app.models.db import execute_query, fetch_all, fetch_one
from app.services.audit_service import log_audit
from app.services.duplicate_service import find_duplicate_complaints
from app.services.geocode_service import validate_coordinates

complaints_bp = Blueprint("complaints", __name__)


@complaints_bp.get("/complaints")
def list_complaints():
    rows = fetch_all(
        """
        SELECT c.*, d.name AS department_name
        FROM complaints c
        LEFT JOIN departments d ON d.id = c.department_id
        WHERE c.moderation_status = 'Approved Public'
        ORDER BY c.updated_at DESC
        """
    )
    return jsonify({"complaints": rows})


@complaints_bp.post("/complaints")
def create_complaint():
    data = request.get_json(silent=True) or {}
    category = (data.get("category") or "").strip()
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    location_text = (data.get("location_text") or "").strip()

    if len(title) < 5 or len(description) < 15 or not location_text:
        return jsonify({"error": "Title, description, and location are required."}), 400

    coords = validate_coordinates(data.get("latitude", 18.5204), data.get("longitude", 73.8567))
    if not coords:
        return jsonify({"error": "Invalid coordinates."}), 400

    dups = find_duplicate_complaints(title, description, category, location_text)
    code = f"PCM-CC-2026-{secrets.randbelow(7999) + 2000}"

    cid = execute_query(
        """
        INSERT INTO complaints (
            complaint_code, user_id, department_id, category, title, description,
            location_text, city, state, latitude, longitude,
            status, moderation_status, verification_label, potential_duplicate_of
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Submitted', 'Pending Moderation', 'Pending Verification', %s)
        """,
        (
            code,
            session.get("user_id"),
            data.get("department_id"),
            category,
            title,
            description,
            location_text,
            data.get("city", "Pune"),
            data.get("state", "Maharashtra"),
            coords[0],
            coords[1],
            dups[0]["reference_code"] if dups else None,
        ),
    )

    execute_query(
        """
        INSERT INTO complaint_status_history (complaint_id, previous_status, new_status, changed_by, note)
        VALUES (%s, NULL, 'Submitted', %s, 'Civic complaint logged.')
        """,
        (cid, session.get("user_id")),
    )

    log_audit(session.get("user_id"), session.get("role") or "citizen", "COMPLAINT_SUBMITTED", "complaint", code)
    return jsonify({"complaint_code": code, "status": "Submitted", "potential_duplicates": dups}), 201
