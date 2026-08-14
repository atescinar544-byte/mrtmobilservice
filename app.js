"use strict";

const DB_KEY = "mrt-mobil-service-db-v1";
const SESSION_KEY = "mrt-mobil-service-session-v1";
const state = { user: null, authMode: "login", pendingReview: false };
const $ = (selector) => document.querySelector(selector);
const accountButton = $("#accountButton");
const accountDialog = $("#accountDialog");
const reviewDialog = $("#reviewDialog");
const guestView = $("#accountGuestView");
const userView = $("#accountUserView");
const accountName = $("#accountName");
const accountLabel = $(".account-label");
const loginTab = $("#loginTab");
const registerTab = $("#registerTab");
const authForm = $("#authForm");
const authName = $("#authName");
const authPassword = $("#authPassword");
const authSubmit = $("#authSubmit");
const authMessage = $("#authMessage");
const passwordHelp = $("#passwordHelp");
const reviewForm = $("#reviewForm");
const reviewMessage = $("#reviewMessage");
const reviewList = $("#reviewList");
const reviewSummary = $("#reviewSummary");
const reviewEmpty = $("#reviewEmpty");

function readDb() {
  try {
    const value = JSON.parse(localStorage.getItem(DB_KEY));
    return value && Array.isArray(value.users) && Array.isArray(value.reviews) ? value : { users: [], reviews: [] };
  } catch { return { users: [], reviews: [] }; }
}
function writeDb(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function makeSalt() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
  return [...bytes].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password, salt) {
  const text = `${salt}:${password}`;
  if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  let a = 2166136261, b = 2246822519;
  for (let round = 0; round < 2500; round += 1) for (let i = 0; i < text.length; i += 1) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ (text.charCodeAt(i) + round), 3266489917);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
function setMessage(el, message = "", success = false) {
  el.textContent = message;
  el.classList.toggle("success", success);
}
function openDialog(dialog) { dialog.showModal ? dialog.showModal() : dialog.setAttribute("open", ""); }
function closeDialog(dialog) { dialog.close ? dialog.close() : dialog.removeAttribute("open"); }
function setAuthMode(mode) {
  state.authMode = mode;
  const login = mode === "login";
  loginTab.classList.toggle("active", login);
  registerTab.classList.toggle("active", !login);
  loginTab.setAttribute("aria-selected", login);
  registerTab.setAttribute("aria-selected", !login);
  authSubmit.textContent = login ? "Anmelden" : "Konto erstellen";
  passwordHelp.textContent = login ? "Geben Sie Ihr Passwort ein." : "Mindestens 8 Zeichen.";
  authPassword.autocomplete = login ? "current-password" : "new-password";
  setMessage(authMessage);
}
function updateAccountView() {
  const signedIn = Boolean(state.user);
  guestView.hidden = signedIn;
  userView.hidden = !signedIn;
  accountName.textContent = state.user?.name || "";
  accountLabel.textContent = state.user?.name || "Konto";
  accountButton.setAttribute("aria-label", signedIn ? `Konto von ${state.user.name} öffnen` : "Konto öffnen");
}
function loadSession() {
  const userId = localStorage.getItem(SESSION_KEY);
  state.user = readDb().users.find((user) => user.id === userId) || null;
  if (!state.user) localStorage.removeItem(SESSION_KEY);
  updateAccountView();
}
function escapeHtml(value) {
  const el = document.createElement("div");
  el.textContent = value;
  return el.innerHTML;
}
function renderReviews() {
  const db = readDb();
  const items = db.reviews.map((review) => ({ ...review, name: db.users.find((user) => user.id === review.userId)?.name || "Kunde" }))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  reviewList.innerHTML = items.map((review) => {
    const stars = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
    const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(review.updatedAt || review.createdAt));
    return `<article class="review-card"><div class="review-card-head"><strong>${escapeHtml(review.name)}</strong><span class="review-stars" aria-label="${review.rating} von 5 Sternen">${stars}</span></div><p>${escapeHtml(review.comment)}</p><time datetime="${review.updatedAt || review.createdAt}">${date}</time></article>`;
  }).join("");
  reviewEmpty.hidden = items.length > 0;
  if (!items.length) { reviewSummary.textContent = ""; return; }
  const average = items.reduce((sum, item) => sum + item.rating, 0) / items.length;
  reviewSummary.textContent = `${average.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} von 5 Sternen · ${items.length} ${items.length === 1 ? "Bewertung" : "Bewertungen"}`;
}
function openReviewFlow() {
  if (!state.user) {
    state.pendingReview = true;
    setAuthMode("login");
    setMessage(authMessage, "Bitte melden Sie sich zuerst an, um den Service zu bewerten.");
    openDialog(accountDialog);
    return;
  }
  const current = readDb().reviews.find((review) => review.userId === state.user.id);
  reviewForm.reset();
  if (current) {
    const rating = reviewForm.querySelector(`input[name="rating"][value="${current.rating}"]`);
    if (rating) rating.checked = true;
    $("#reviewComment").value = current.comment;
  }
  setMessage(reviewMessage);
  closeDialog(accountDialog);
  openDialog(reviewDialog);
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = authName.value.trim().replace(/\s+/g, " ");
  const password = authPassword.value;
  if (name.length < 2 || password.length < 8) return setMessage(authMessage, "Bitte geben Sie einen Namen und ein Passwort mit mindestens 8 Zeichen ein.");
  authSubmit.disabled = true;
  try {
    const db = readDb();
    const nameKey = name.toLocaleLowerCase("de-DE");
    let user = db.users.find((item) => item.nameKey === nameKey);
    if (state.authMode === "register") {
      if (user) throw new Error("Dieser Name ist bereits registriert.");
      const salt = makeSalt();
      user = { id: makeId(), name, nameKey, salt, passwordHash: await hashPassword(password, salt), createdAt: new Date().toISOString() };
      db.users.push(user);
      writeDb(db);
    } else if (!user || user.passwordHash !== await hashPassword(password, user.salt)) throw new Error("Name oder Passwort ist nicht korrekt.");
    localStorage.setItem(SESSION_KEY, user.id);
    state.user = user;
    updateAccountView();
    authForm.reset();
    setMessage(authMessage, state.authMode === "register" ? "Ihr Konto wurde erstellt." : "Sie sind angemeldet.", true);
    if (state.pendingReview) { state.pendingReview = false; setTimeout(openReviewFlow, 250); }
  } catch (error) { setMessage(authMessage, error.message || "Die Aktion konnte nicht abgeschlossen werden."); }
  finally { authSubmit.disabled = false; }
});

reviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const rating = Number(new FormData(reviewForm).get("rating"));
  const comment = $("#reviewComment").value.trim();
  if (!state.user || rating < 1 || rating > 5 || comment.length < 10) return setMessage(reviewMessage, "Bitte wählen Sie Sterne und schreiben Sie mindestens 10 Zeichen.");
  const db = readDb();
  const existing = db.reviews.find((review) => review.userId === state.user.id);
  if (existing) Object.assign(existing, { rating, comment, updatedAt: new Date().toISOString() });
  else db.reviews.push({ id: makeId(), userId: state.user.id, rating, comment, createdAt: new Date().toISOString() });
  writeDb(db);
  renderReviews();
  setMessage(reviewMessage, "Vielen Dank! Ihre Bewertung wurde gespeichert.", true);
  setTimeout(() => closeDialog(reviewDialog), 550);
});

accountButton.addEventListener("click", () => { updateAccountView(); openDialog(accountDialog); });
loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));
$("#logoutButton").addEventListener("click", () => { localStorage.removeItem(SESSION_KEY); state.user = null; updateAccountView(); closeDialog(accountDialog); });
$("#rateServiceButton").addEventListener("click", openReviewFlow);
$("#accountRateButton").addEventListener("click", openReviewFlow);
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(dialog); }));

const menuToggle = $("#menuToggle");
const menuClose = $("#menuClose");
const siteMenu = $("#siteMenu");
const menuBackdrop = $("#menuBackdrop");
const topbar = $("#siteTopbar");
const pageNames = ["home", "services", "reviews"];

function openMenu() {
  menuBackdrop.hidden = false;
  document.body.classList.add("menu-open");
  menuToggle.setAttribute("aria-expanded", "true");
  siteMenu.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    menuBackdrop.classList.add("visible");
    siteMenu.classList.add("open");
  });
  setTimeout(() => menuClose.focus(), 250);
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  menuToggle.setAttribute("aria-expanded", "false");
  siteMenu.setAttribute("aria-hidden", "true");
  menuBackdrop.classList.remove("visible");
  siteMenu.classList.remove("open");
  setTimeout(() => { menuBackdrop.hidden = true; }, 620);
}

function revealCards() {
  const cards = document.querySelectorAll("[data-page].page-active .service-card, [data-page].page-active .review-card");
  cards.forEach((card, index) => {
    card.classList.add("reveal-ready");
    card.classList.remove("revealed");
    card.style.transitionDelay = `${Math.min(index * 90, 360)}ms`;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => cards.forEach((card) => card.classList.add("revealed"))));
}

function applyPage(page) {
  const selected = pageNames.includes(page) ? page : "home";
  document.body.dataset.activePage = selected;
  document.querySelectorAll("[data-page]").forEach((element) => element.classList.toggle("page-active", element.dataset.page === selected));
  document.querySelectorAll(".drawer-link").forEach((link) => link.classList.toggle("active", link.dataset.pageLink === selected));
  history.replaceState(null, "", selected === "home" ? "#startseite" : selected === "services" ? "#leistungen" : "#bewertungen");
  window.scrollTo({ top: 0, behavior: "instant" });
  revealCards();
}

function switchPage(page) {
  closeMenu();
  if (document.body.dataset.activePage === page) return;
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(() => applyPage(page));
  } else applyPage(page);
}

menuToggle.addEventListener("click", openMenu);
menuClose.addEventListener("click", closeMenu);
menuBackdrop.addEventListener("click", closeMenu);
document.querySelectorAll("[data-page-link]").forEach((link) => link.addEventListener("click", () => switchPage(link.dataset.pageLink)));
document.querySelectorAll('a[href="#leistungen"]').forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); switchPage("services"); }));
document.querySelectorAll('a[href="#bewertungen"]').forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); switchPage("reviews"); }));
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && siteMenu.classList.contains("open")) closeMenu(); });
window.addEventListener("scroll", () => topbar.classList.toggle("scrolled", window.scrollY > 24), { passive: true });

const slides = [...document.querySelectorAll(".slide")];
const dots = [...document.querySelectorAll(".slider-dot")];
const slider = $("#serviceSlider");
let currentSlide = 0, sliderTimer;
function showSlide(index) {
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => { slide.classList.toggle("active", i === currentSlide); slide.setAttribute("aria-hidden", i !== currentSlide); });
  dots.forEach((dot, i) => { dot.classList.toggle("active", i === currentSlide); dot.setAttribute("aria-current", i === currentSlide); });
}
function startSlider() {
  clearInterval(sliderTimer);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) sliderTimer = setInterval(() => showSlide(currentSlide + 1), 6000);
}
$(".slider-prev").addEventListener("click", () => { showSlide(currentSlide - 1); startSlider(); });
$(".slider-next").addEventListener("click", () => { showSlide(currentSlide + 1); startSlider(); });
dots.forEach((dot) => dot.addEventListener("click", () => { showSlide(Number(dot.dataset.slideTo)); startSlider(); }));
slider.addEventListener("mouseenter", () => clearInterval(sliderTimer));
slider.addEventListener("mouseleave", startSlider);
slider.addEventListener("focusin", () => clearInterval(sliderTimer));
slider.addEventListener("focusout", startSlider);

setAuthMode("login");
loadSession();
renderReviews();
showSlide(0);
startSlider();
const initialPage = location.hash === "#leistungen" ? "services" : location.hash === "#bewertungen" ? "reviews" : "home";
applyPage(initialPage);
