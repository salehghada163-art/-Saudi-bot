import { DIALECT_NAMES } from "../core/session.js";

const screens = {
  home: document.querySelector("#homeScreen"),
  gender: document.querySelector("#genderScreen"),
  dialect: document.querySelector("#dialectScreen"),
  mode: document.querySelector("#modeScreen"),
};

const genderNext = document.querySelector("#genderNext");
const dialectNext = document.querySelector("#dialectNext");
const dialectTitle = document.querySelector("#dialectTitle");
const summary = document.querySelector("#selectionSummary");
const menuToggle = document.querySelector("#menuToggle");
const mobileMenu = document.querySelector("#mobileMenu");

let gender = sessionStorage.getItem("saudiVoiceGender") || "";
let dialect = sessionStorage.getItem("saudiVoiceDialect") || "";

function closeMenu() {
  menuToggle.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "فتح القائمة");
  mobileMenu.hidden = true;
}

function updateSelection() {
  document.querySelectorAll(".gender-option").forEach((card) => {
    card.classList.toggle("selected", card.dataset.gender === gender);
  });
  document.querySelectorAll(".dialect-option").forEach((card) => {
    card.classList.toggle("selected", card.dataset.dialect === dialect);
  });
  genderNext.disabled = !gender;
  dialectNext.disabled = !dialect;
  dialectTitle.textContent = gender === "female" ? "اختاري اللهجة" : "اختر اللهجة";
  dialectNext.textContent = gender === "female" ? "تابعي" : "تابع";
  if (gender && dialect) {
    summary.textContent = `${gender === "female" ? "صوت نسائي" : "صوت رجالي"} · اللهجة ${DIALECT_NAMES[dialect]}`;
  }
}

function showScreen(requestedName, push = true) {
  let name = requestedName;
  if (name === "dialect" && !gender) name = "gender";
  if (name === "mode" && (!gender || !dialect)) name = gender ? "dialect" : "gender";
  Object.entries(screens).forEach(([key, screen]) => {
    screen.hidden = key !== name;
    screen.classList.toggle("is-active", key === name);
  });
  if (push) history.replaceState({}, "", name === "home" ? "/" : `/?step=${name}`);
  closeMenu();
  updateSelection();
}

document.querySelector("#startExperience").addEventListener("click", () => showScreen("gender"));
document.querySelectorAll("[data-show]").forEach((item) => item.addEventListener("click", () => showScreen(item.dataset.show)));
document.querySelectorAll("[data-back]").forEach((item) => item.addEventListener("click", () => showScreen(item.dataset.back)));
document.querySelectorAll(".gender-option").forEach((card) => card.addEventListener("click", () => {
  gender = card.dataset.gender;
  dialect = "";
  sessionStorage.setItem("saudiVoiceGender", gender);
  sessionStorage.removeItem("saudiVoiceDialect");
  updateSelection();
}));
document.querySelectorAll(".dialect-option").forEach((card) => card.addEventListener("click", () => {
  dialect = card.dataset.dialect;
  sessionStorage.setItem("saudiVoiceDialect", dialect);
  updateSelection();
}));
genderNext.addEventListener("click", () => showScreen("dialect"));
dialectNext.addEventListener("click", () => showScreen("mode"));
document.querySelectorAll("[data-mode]").forEach((card) => card.addEventListener("click", () => {
  if (!gender || !dialect) return;
  location.href = card.dataset.mode === "chat" ? "/chat" : `/challenge/${gender}`;
}));
menuToggle.addEventListener("click", () => {
  const opening = mobileMenu.hidden;
  mobileMenu.hidden = !opening;
  menuToggle.classList.toggle("open", opening);
  menuToggle.setAttribute("aria-expanded", String(opening));
  menuToggle.setAttribute("aria-label", opening ? "إغلاق القائمة" : "فتح القائمة");
});
document.addEventListener("click", (event) => {
  if (!mobileMenu.hidden && !mobileMenu.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
});

const requested = new URLSearchParams(location.search).get("step") || "home";
showScreen(Object.hasOwn(screens, requested) ? requested : "home", false);
