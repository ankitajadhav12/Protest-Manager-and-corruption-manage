from flask import Blueprint, jsonify, request
from app.models.db import fetch_all
from app.services.geocode_service import generalize_coordinate, geocode_india

map_bp = Blueprint("map_api", __name__)


@map_bp.get("/events")
def map_events():
    rows = fetch_all(
        """
        SELECT id, event_code AS code, title, category, description,
               public_location AS location, city, state, latitude, longitude,
               start_time AS event_date, status, verification_label,
               source_attribution, updated_at
        FROM protest_events
        WHERE is_public = 1
        ORDER BY start_time ASC
        """
    )
    return jsonify({"events": rows})


@map_bp.get("/complaints")
def map_complaints():
    rows = fetch_all(
        """
        SELECT c.id, c.complaint_code AS code, c.title, c.category, c.description,
               c.location_text AS location, c.city, c.state, c.latitude, c.longitude,
               c.created_at AS reported_date, c.status, c.verification_label,
               c.source_attribution, c.updated_at, d.name AS department_name
        FROM complaints c
        LEFT JOIN departments d ON d.id = c.department_id
        WHERE c.moderation_status = 'Approved Public'
        ORDER BY c.updated_at DESC
        """
    )
    return jsonify({"complaints": rows})


@map_bp.get("/hotspots")
def map_hotspots():
    rows = fetch_all(
        """
        SELECT cr.id, cr.tracking_id AS code, cr.title, cr.category, cr.description,
               cr.general_location AS location, cr.city, cr.state, cr.latitude, cr.longitude,
               cr.created_at AS reported_date, cr.status, cr.verification_label,
               cr.source_attribution, cr.updated_at, d.name AS department_name
        FROM corruption_reports cr
        JOIN departments d ON d.id = cr.department_id
        WHERE cr.is_public_hotspot = 1 AND cr.is_confidential = 0
              AND cr.latitude IS NOT NULL AND cr.longitude IS NOT NULL
        """
    )
    for r in rows:
        r["latitude"] = generalize_coordinate(r["latitude"])
        r["longitude"] = generalize_coordinate(r["longitude"])
    return jsonify({"hotspots": rows})


@map_bp.get("/geocode")
def geocode():
    q = (request.args.get("q") or "").strip()
    if len(q) < 3:
        return jsonify({"error": "Query must be at least 3 characters."}), 400
    try:
        return jsonify({"results": geocode_india(q)})
    except Exception:
        return jsonify({"results": [], "error": "Geocoding temporarily unavailable"}), 503
