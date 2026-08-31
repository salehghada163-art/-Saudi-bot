"""إعدادات التطبيق المركزية."""

import os
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


class AppConfig:
    OPENAI_API_KEY = os.getenv(
        "OPENAI_API_KEY",
        "",
    ).strip()

    OPENAI_REALTIME_MODEL = os.getenv(
        "OPENAI_REALTIME_MODEL",
        "gpt-realtime-2.1",
    ).strip()

    OPENAI_REALTIME_REASONING_EFFORT = os.getenv(
        "OPENAI_REALTIME_REASONING_EFFORT",
        "low",
    ).strip()

    OPENAI_TRANSCRIBE_MODEL = os.getenv(
        "OPENAI_TRANSCRIBE_MODEL",
        "gpt-transcribe",
    ).strip()

    OPENAI_TTS_MODEL = os.getenv(
        "OPENAI_TTS_MODEL",
        "gpt-4o-mini-tts",
    ).strip()

    OPENAI_TIMEOUT_SECONDS = 60

    WELCOME_AUDIO_DIR = (
        PROJECT_ROOT
        / "assets"
        / "audio"
    )

    AUDIO_CACHE_DIR = (
        PROJECT_ROOT
        / "instance"
        / "audio_cache"
    )

    REALTIME_VAD_EAGERNESS = os.getenv(
        "REALTIME_VAD_EAGERNESS",
        "high",
    ).strip()