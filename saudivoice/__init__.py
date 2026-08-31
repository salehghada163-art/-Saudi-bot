"""مصنع تطبيق SaudiVoice."""

from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify

from .config import AppConfig
from .routes.audio_api import audio_api
from .routes.pages import pages


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def create_app(test_config: dict | None = None) -> Flask:
    """ينشئ تطبيق Flask ويسجل الوحدات المستقلة."""
    load_dotenv(PROJECT_ROOT / ".env")
    app = Flask(__name__, instance_path=str(PROJECT_ROOT / "instance"), instance_relative_config=True)
    app.config.from_object(AppConfig)
    if test_config:
        app.config.update(test_config)
    Path(app.config["WELCOME_AUDIO_DIR"]).mkdir(parents=True, exist_ok=True)
    Path(app.config["AUDIO_CACHE_DIR"]).mkdir(parents=True, exist_ok=True)
    app.register_blueprint(pages)
    app.register_blueprint(audio_api)

    @app.get("/health")
    def health():
        return jsonify(status="ok", version="8.0")

    return app
