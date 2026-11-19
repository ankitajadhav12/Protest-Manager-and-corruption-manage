import os
from dotenv import load_dotenv
from flask import Flask
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO
from flask_wtf.csrf import CSRFProtect

from .config import Config

load_dotenv()

socketio = SocketIO(cors_allowed_origins="*", async_mode="eventlet")
csrf = CSRFProtect()
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per minute"])


def create_app(config_class=Config) -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(config_class)

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    csrf.init_app(app)
    limiter.init_app(app)
    socketio.init_app(app)

    from .routes.main import main_bp
    from .routes.auth import auth_bp
    from .routes.corruption import corruption_bp
    from .routes.complaints import complaints_bp
    from .routes.events import events_bp
    from .routes.map_api import map_bp
    from .routes.analytics import analytics_bp
    from .routes.admin import admin_bp
    from .routes.notifications import notifications_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(corruption_bp, url_prefix="/api")
    app.register_blueprint(complaints_bp, url_prefix="/api")
    app.register_blueprint(events_bp, url_prefix="/api")
    app.register_blueprint(map_bp, url_prefix="/api/map")
    app.register_blueprint(analytics_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(notifications_bp, url_prefix="/api")

    from .sockets import map_events  # noqa: F401

    return app
