from pathlib import Path

from flask import (
    Blueprint,
    current_app,
    jsonify,
    request,
    send_file,
)

from ..domain.dialects import (
    DIALECTS,
    GENDERS,
    MODES,
    VOICE_BY_GENDER,
    WELCOME_TEXT,
)
from ..domain.prompts import (
    build_challenge_instructions,
    build_chat_instructions,
)
from ..services.openai_audio import (
    AudioServiceError,
    create_realtime_client_secret,
    get_or_create_challenge_audio,
)


audio_api = Blueprint(
    "audio_api",
    __name__,
    url_prefix="/api",
)


@audio_api.errorhandler(AudioServiceError)
def handle_audio_error(error):
    return jsonify(
        error=str(error)
    ), error.status_code


@audio_api.get("/realtime/session")
def realtime_session():
    mode = request.args.get(
        "mode",
        "chat",
    )

    dialect = request.args.get(
        "dialect",
        "",
    )

    gender = request.args.get(
        "gender",
        "",
    )

    if (
        mode not in MODES
        or gender not in GENDERS
    ):
        return jsonify(
            error="وضع التجربة أو الشخصية غير صحيح."
        ), 400

    if (
        mode == "chat"
        and dialect not in DIALECTS
    ):
        return jsonify(
            error="اختيار اللهجة أو الشخصية غير صحيح."
        ), 400

    session_config = build_session_config(
        mode,
        dialect,
        gender,
    )

    secret = create_realtime_client_secret(
        session_config
    )

    return jsonify(secret)


@audio_api.post("/challenge/speech")
def challenge_speech():
    data = request.get_json(
        silent=True
    ) or {}

    text = str(
        data.get("text", "")
    ).strip()

    dialect = str(
        data.get("dialect", "")
    ).strip()

    gender = str(
        data.get("gender", "")
    ).strip()

    kind = str(
        data.get("kind", "question")
    ).strip()

    if (
        dialect not in DIALECTS
        or gender not in GENDERS
        or kind not in {
            "question",
            "feedback",
        }
    ):
        return jsonify(
            error="بيانات صوت التحدي غير صحيحة."
        ), 400

    if (
        not text
        or len(text) > 350
    ):
        return jsonify(
            error="نص التحدي غير صالح."
        ), 400

    audio_path = get_or_create_challenge_audio(
        text,
        dialect,
        gender,
        kind,
    )

    return send_file(
        audio_path,
        mimetype="audio/mpeg",
        conditional=True,
        max_age=86400,
    )


@audio_api.get(
    "/welcome/<dialect>/<gender>"
)
def welcome_audio(
    dialect,
    gender,
):
    if (
        dialect not in DIALECTS
        or gender not in GENDERS
    ):
        return jsonify(
            error="ملف الترحيب المطلوب غير صحيح."
        ), 404

    filename = (
        f"{dialect}_{gender}_welcome.mp3"
    )

    audio_path = (
        Path(
            current_app.config[
                "WELCOME_AUDIO_DIR"
            ]
        )
        / filename
    )

    if not audio_path.is_file():
        welcome_text = (
            WELCOME_TEXT[gender][dialect]
        )

        audio_path = (
            get_or_create_challenge_audio(
                welcome_text,
                dialect,
                gender,
                "welcome",
            )
        )

    return send_file(
        audio_path,
        mimetype="audio/mpeg",
        conditional=True,
        max_age=3600,
    )


def build_session_config(
    mode,
    dialect,
    gender,
):
    if mode == "chat":
        instructions = (
            build_chat_instructions(
                dialect,
                gender,
            )
        )

        audio_config = {
            "input": {
                "noise_reduction": {
                    "type": "far_field",
                },

                "transcription": {
                    "model": (
                        current_app.config[
                            "OPENAI_TRANSCRIBE_MODEL"
                        ]
                    ),
                    "language": "ar",
                    "prompt": (
                        "محادثة عربية بلهجات "
                        "سعودية: القصيمية، "
                        "الجداوية، الجنوبية "
                        "والشرقية. اكتب الكلام "
                        "العربي كما نُطق."
                    ),
                },

                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 300,
                    "create_response": True,
                    "interrupt_response": False,
                },
            },

            "output": {
                "voice": (
                    VOICE_BY_GENDER[gender]
                ),
                "speed": 1.0,
            },
        }

        max_output_tokens = "inf"

    else:
        instructions = (
            build_challenge_instructions(
                dialect=dialect,
                gender=gender,
                kind="question",
            )
        )

        audio_config = {
            "output": {
                "voice": (
                    VOICE_BY_GENDER[gender]
                ),
                "speed": 1.0,
            },
        }

        max_output_tokens = 600

    session_config = {
        "type": "realtime",

        "model": (
            current_app.config[
                "OPENAI_REALTIME_MODEL"
            ]
        ),

        "output_modalities": [
            "audio"
        ],

        "max_output_tokens":
            max_output_tokens,

        "audio": audio_config,

        "instructions":
            instructions,
    }

    if mode == "chat":
        session_config["reasoning"] = {
            "effort": (
                current_app.config[
                    "OPENAI_REALTIME_REASONING_EFFORT"
                ]
            ),
        }

    return session_config