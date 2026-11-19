import hashlib
import os
import secrets
from werkzeug.utils import secure_filename
from flask import current_app


def save_private_evidence(file_storage) -> dict | None:
    if not file_storage or not file_storage.filename:
        return None

    original = secure_filename(file_storage.filename)
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in current_app.config["ALLOWED_EXTENSIONS"]:
        raise ValueError("Unsupported file type.")

    stored_name = f"ev_{secrets.token_hex(12)}.{ext}"
    dest = os.path.join(current_app.config["UPLOAD_FOLDER"], stored_name)
    file_storage.save(dest)

    with open(dest, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()

    return {
        "original_filename": original,
        "stored_filename": stored_name,
        "mime_type": file_storage.mimetype or "application/octet-stream",
        "file_size": os.path.getsize(dest),
        "sha256_hash": digest,
    }
