from functools import wraps
from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from app.models.db import execute_query, fetch_one
from app.services.audit_service import log_audit

auth_bp = Blueprint("auth", __name__)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Authentication required."}), 401
        return fn(*args, **kwargs)

    return wrapper


def role_required(*roles: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not session.get("user_id"):
                return jsonify({"error": "Authentication required."}), 401
            if session.get("role") not in roles:
                return jsonify({"error": "Insufficient role permissions."}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


@auth_bp.get("/me")
def me():
    uid = session.get("user_id")
    if not uid:
        return jsonify({"user": None})
    user = fetch_one(
        "SELECT id, full_name, email, role, city, organization_name, is_active FROM users WHERE id = %s",
        (uid,),
    )
    return jsonify({"user": user})


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = "organizer" if data.get("role") == "organizer" else "citizen"
    city = (data.get("city") or "Pune").strip()

    if len(full_name) < 2 or "@" not in email or len(password) < 8:
        return jsonify({"error": "Valid name, email, and 8+ character password required."}), 400

    if fetch_one("SELECT id FROM users WHERE email = %s", (email,)):
        return jsonify({"error": "Email already registered."}), 409

    pw_hash = generate_password_hash(password)
    uid = execute_query(
        """
        INSERT INTO users (full_name, email, password_hash, role, city, organization_name)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (full_name, email, pw_hash, role, city, data.get("organization_name")),
    )
    session.permanent = True
    session["user_id"] = uid
    session["role"] = role
    log_audit(uid, role, "USER_REGISTERED", "user", str(uid), ip=request.remote_addr or "")
    return jsonify({"user": {"id": uid, "full_name": full_name, "email": email, "role": role, "city": city}}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    row = fetch_one("SELECT * FROM users WHERE email = %s", (email,))
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid email or password."}), 401
    if row["is_active"] != 1:
        return jsonify({"error": "Account deactivated."}), 403

    session.permanent = True
    session["user_id"] = row["id"]
    session["role"] = row["role"]
    log_audit(row["id"], row["role"], "USER_LOGIN", "user", str(row["id"]), ip=request.remote_addr or "")
    return jsonify(
        {
            "user": {
                "id": row["id"],
                "full_name": row["full_name"],
                "email": row["email"],
                "role": row["role"],
                "city": row["city"],
            }
        }
    )


@auth_bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})
