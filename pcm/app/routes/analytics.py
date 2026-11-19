from flask import Blueprint, jsonify
from app.services.analytics_service import compute_analytics_payload

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.get("/analytics")
def get_analytics():
    return jsonify(compute_analytics_payload())
