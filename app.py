"""نقطة تشغيل المشروع فقط."""
from saudivoice import create_app

app = create_app()


if __name__ == "__main__":
    print("\nSaudiVoice is running: http://127.0.0.1:5000\n")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
