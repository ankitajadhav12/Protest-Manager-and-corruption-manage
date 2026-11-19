import os
from datetime import timedelta


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", os.urandom(32).hex())
    DEBUG = os.getenv("FLASK_ENV", "production") == "development"

    MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
    MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
    MYSQL_USER = os.getenv("MYSQL_USER", "pcm_user")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "pcm_db")

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.getenv("FLASK_ENV", "production") != "development"
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)

    UPLOAD_FOLDER = os.path.abspath(os.getenv("UPLOAD_FOLDER", "uploads"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(5 * 1024 * 1024)))
    ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp", "txt"}

    NOMINATIM_USER_AGENT = os.getenv("NOMINATIM_USER_AGENT", "PCM-CivicTechPlatform/1.0")
