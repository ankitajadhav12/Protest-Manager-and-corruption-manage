import secrets
from flask import Blueprint, jsonify, request, session
from app.models.db import execute_query, fetch_all, fetch_one
from app.services.audit_service import log_audit
from app.services.duplicate_service import find_duplicate_reports
from app.services.geocode_service import generalize_coordinate, validate_coordinates
from app.services.upload_service import save_private_evidence

corruption_bp = Blueprint("corruption", __name__)


@corruption_bp.get("/corruption-reports")
def list_public_hotspots():
    rows = fetch_all(
        """
        SELECT cr.id, cr.tracking_id, d.name AS department_name, cr.category, cr.title,
               cr.description, cr.general_location, cr.city, cr.state,
               cr.latitude, cr.longitude, cr.is_anonymous, cr.status,
               cr.moderation_status, cr.verification_label, cr.source_attribution,
               cr.created_at, cr.updated_at
        FROM corruption_reports cr
        JOIN departments d ON d.id = cr.department_id
        WHERE cr.is_public_hotspot = 1 AND cr.is_confidential = 0
        ORDER BY cr.updated_at DESC
        """
    )
    return jsonify({"reports": rows})


@corruption_bp.post("/corruption-reports")
def create_report():
    data = request.form if request.form else (request.get_json(silent=True) or {})
    dept_id = int(data.get("department_id") or 0)
    category = (data.get("category") or "").strip()
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    general_location = (data.get("general_location") or "").strip()
    is_anonymous = str(data.get("is_anonymous", "true")).lower() == "true"
    is_confidential = str(data.get("is_confidential", "true")).lower() != "false"

    if not dept_id or len(title) < 6 or len(description) < 20 or not general_location:
        return jsonify({"error": "Department, title, description, and general location are required."}), 400

    coords = validate_coordinates(data.get("latitude", 18.5204), data.get("longitude", 73.8567))
    safe_lat = generalize_coordinate(coords[0]) if coords else None
    safe_lng = generalize_coordinate(coords[1]) if coords else None

    duplicates = find_duplicate_reports(title, description, category, general_location)
    dup_ref = duplicates[0]["reference_code"] if duplicates else None
    tracking_id = f"PCM-CR-2026-{secrets.randbelow(8999) + 1000}"

    linked_uid = None if is_anonymous else session.get("user_id")
    mod_status = "Confidential - Restricted" if is_confidential else "Pending Moderation"

    report_id = execute_query(
        """
        INSERT INTO corruption_reports (
            tracking_id, user_id, department_id, category, title, description,
            general_location, city, state, latitude, longitude,
            is_anonymous, is_confidential, status, moderation_status,
            verification_label, source_attribution, potential_duplicate_of, is_public_hotspot
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Submitted', %s, %s, %s, %s, 0)
        """,
        (
            tracking_id,
            linked_uid,
            dept_id,
            category,
            title,
            description,
            general_location,
            data.get("city", "Pune"),
            data.get("state", "Maharashtra"),
            safe_lat,
            safe_lng,
            1 if is_anonymous else 0,
            1 if is_confidential else 0,
            mod_status,
            "Unverified Allegation - Under Review",
            "Anonymous Citizen Allegation" if is_anonymous else "Citizen Allegation Report",
            dup_ref,
        ),
    )

    if "evidence_file" in request.files:
        saved = save_private_evidence(request.files["evidence_file"])
        if saved:
            execute_query(
                """
                INSERT INTO evidence (entity_type, entity_id, uploaded_by, original_filename, stored_filename, mime_type, file_size, sha256_hash, is_private)
                VALUES ('corruption_report', %s, %s, %s, %s, %s, %s, %s, 1)
                """,
                (
                    report_id,
                    linked_uid,
                    saved["original_filename"],
                    saved["stored_filename"],
                    saved["mime_type"],
                    saved["file_size"],
                    saved["sha256_hash"],
                ),
            )

    log_audit(
        linked_uid,
        "anonymous" if is_anonymous else (session.get("role") or "citizen"),
        "CORRUPTION_REPORT_SUBMITTED",
        "corruption_report",
        tracking_id,
        ip="redacted" if is_anonymous else (request.remote_addr or ""),
    )

    return jsonify({"tracking_id": tracking_id, "status": "Submitted", "potential_duplicates": duplicates}), 201


@corruption_bp.get("/corruption-reports/track/<tracking_id>")
def track_report(tracking_id: str):
    report = fetch_one(
        """
        SELECT cr.id, cr.tracking_id, cr.user_id, d.name AS department_name,
               cr.category, cr.title, cr.description, cr.general_location,
               cr.is_confidential, cr.status, cr.moderation_status,
               cr.verification_label, cr.created_at, cr.updated_at
        FROM corruption_reports cr
        JOIN departments d ON d.id = cr.department_id
        WHERE cr.tracking_id = %s
        """,
        (tracking_id.strip().upper(),),
    )
    if not report:
        return jsonify({"error": "Tracking ID not found."}), 404

    is_authorized = session.get("role") == "admin" or (
        report["user_id"] and report["user_id"] == session.get("user_id")
    )
    if report["is_confidential"] and not is_authorized:
        report["title"] = "Confidential Oversight Filing (Restricted)"
        report["description"] = "Restricted to authorized oversight personnel."
    report.pop("user_id", None)
    return jsonify({"report": report})
