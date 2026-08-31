"""مسارات صفحات الواجهة."""

from flask import Blueprint, abort, render_template
from ..domain.dialects import GENDERS

pages = Blueprint("pages", __name__)
@pages.get("/")
def index():
    return render_template("index.html")


@pages.get("/chat")
def chat():
    return render_template("chat.html")


@pages.get("/about")
def about():
    return render_template("about.html")


@pages.get("/challenge")
def challenge():
    return render_template("challenge.html", room_gender="")


@pages.get("/challenge/<gender>")
def gender_challenge(gender: str):
    if gender not in GENDERS:
        abort(404)
    return render_template("challenge.html", room_gender=gender)
