// ===================
//  Daily English Immersion - V1 (PWA)
//  - Roleplay EN (TTS) + réponse micro (STT)
//  - Carnet d’erreurs localStorage
//  - Streak + minutes parlées (estimation simple)
// ===================

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "dei_v1";
const todayISO = () => new Date().toISOString().slice(0,10);

const defaultState = {
  streak: 0,
  lastDone: null,
  minutesSpoken: 0,
  mistakes: [], // { id, text, createdAt, due: [dates], nextIndex }
};

const state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultState, ...JSON.parse(raw) } : { ...defaultState };
  } catch {
    return { ...defaultState };
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderStats();
}

function renderStats(){
  $("streak").textContent = String(state.streak);
  $("minutes").textContent = String(state.minutesSpoken);
}

// ----- Daily goal rotation (14 jours)
const dayPlans = [
  { goal: "Commander au café + small talk (Jour 1)", prompts: [
    "Hi! What can I get for you today?",
    "Would you like that for here or to go?",
    "Anything else?"
  ]},
  { goal: "Te présenter en 60 secondes (Jour 2)", prompts: [
    "So, tell me a bit about yourself.",
    "What do you do for work?",
    "What do you like doing in your free time?"
  ]},
  { goal: "Demander son chemin (Jour 3)", prompts: [
    "Excuse me, do you need help?",
    "Where are you trying to go?",
    "Do you prefer walking or taking the metro?"
  ]},
  { goal: "Call pro : fixer un rendez-vous (Jour 4)", prompts: [
    "Hi, are you available for a quick call this week?",
    "How about Thursday at 3 pm?",
    "Great—could you confirm by email?"
  ]},
  { goal: "Restaurant : commander + préférences (Jour 5)", prompts: [
    "Are you ready to order?",
    "Do you have any allergies?",
    "Would you like anything to drink?"
  ]},
  { goal: "Au travail : expliquer un problème (Jour 6)", prompts: [
    "What seems to be the issue?",
    "When did it start happening?",
    "What have you tried so far?"
  ]},
  { goal: "Raconter ta semaine (Jour 7)", prompts: [
    "How was your week?",
    "What was the best part?",
    "Anything stressful?"
  ]},
];

function getPlanForToday(){
  const d = new Date();
  const idx = (d.getFullYear()*372 + (d.getMonth()+1)*31 + d.getDate()) % dayPlans.length;
  return dayPlans[idx];
}

const plan = getPlanForToday();
$("goal").textContent = plan.goal;

// ----- TTS
function speak(text){
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; // tu pourras ajouter un toggle UK/US plus tard
    u.rate = 1.0;
    u.onend = resolve;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

// ----- STT (SpeechRecognition)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

function ensureRecognition(){
  if (!SpeechRecognition) {
    alert("Reconnaissance vocale non supportée ici. Utilise Chrome sur Android.");
    return null;
  }
  const r = new SpeechRecognition();
  r.lang = "en-US";
  r.interimResults = false;
  r.maxAlternatives = 1;
  return r;
}

let promptIndex = 0;
let lastPrompt = "—";

$("speakPrompt").addEventListener("click", async () => {
  lastPrompt = plan.prompts[promptIndex % plan.prompts.length];
  promptIndex++;
  $("promptText").textContent = lastPrompt;

  await speak(lastPrompt);
});

$("listen").addEventListener("click", () => {
  if (listening) return;
  recognition = ensureRecognition();
  if (!recognition) return;

  listening = true;
  $("userText").textContent = "🎤 Listening...";
  const started = Date.now();

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    $("userText").textContent = text;
    $("toCorrect").value = text;

    // Estimation minutes parlées (très simple) : 2.5 mots/sec ~ 150 wpm
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(0.25, words / 150); // min 0.25
    state.minutesSpoken = Math.round((state.minutesSpoken + minutes) * 10) / 10;
    saveState();
  };

  recognition.onerror = () => {
    $("userText").textContent = "Erreur micro. Réessaie.";
  };

  recognition.onend = () => {
    listening = false;
    const elapsed = (Date.now() - started) / 1000;
    // rien de plus ici, on a déjà crédité via words
  };

  recognition.start();
});

$("stop").addEventListener("click", () => {
  try{
    if (recognition) recognition.stop();
    speechSynthesis.cancel();
  } catch {}
  listening = false;
});

// ----- Correction V1 (local, sans IA) : simple nettoyage + suggestions
function basicCorrect(text){
  const t = (text || "").trim();
  if (!t) return "Écris ou dicte une phrase.";
  // mini heuristiques : capitalisation, ponctuation, politesse
  let corrected = t;
  corrected = corrected.replace(/\bi want\b/ig, "I'd like");
  corrected = corrected.replace(/\bcan i have\b/ig, "Can I get");
  corrected = corrected.replace(/\bplease\b/ig, "please");
  if (!/[.?!]$/.test(corrected)) corrected += ".";
  corrected = corrected[0].toUpperCase() + corrected.slice(1);

  const natural = corrected
    .replace(/\bI would like\b/ig, "I'd like")
    .replace(/\bI am\b/ig, "I'm");

  return [
    `✅ Correct: ${corrected}`,
    `⭐ Natural: ${natural}`,
    `🧠 Tip: Keep it short and polite. Use "I'd like..." / "Can I get...".`,
    `🔁 Example: "Can I get a cappuccino, please?"`,
    `🔁 Example: "I'd like a medium coffee to go, please."`
  ].join("\n");
}

$("correct").addEventListener("click", () => {
  $("correction").textContent = basicCorrect($("toCorrect").value);
});

$("saveMistake").addEventListener("click", () => {
  const text = $("toCorrect").value.trim();
  if (!text) return;

  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const created = todayISO();
  const schedule = [1,3,7,14].map(d => addDaysISO(created, d));
  state.mistakes.unshift({ id, text, createdAt: created, due: schedule, nextIndex: 0 });
  saveState();
  alert("Ajouté au carnet d’erreurs ✅");
});

function addDaysISO(iso, days){
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

// ----- Review
$("review").addEventListener("click", async () => {
  const box = $("reviewBox");
  box.innerHTML = "";

  const today = todayISO();
  const due = state.mistakes.filter(m => m.due[m.nextIndex] && m.due[m.nextIndex] <= today);
  const items = due.slice(0, 5);

  if (items.length === 0){
    box.innerHTML = `<div class="small">Rien à réviser aujourd’hui 🎉</div>`;
    return;
  }

  for (const m of items){
    const div = document.createElement("div");
    div.className = "card mono";
    div.style.background = "#f9fbfb";
    div.textContent = `Say this out loud:\n"${m.text}"`;
    box.appendChild(div);

    // TTS en anglais
    await speak(m.text);

    // Boutons OK / KO
    const row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "8px";

    const ok = document.createElement("button");
    ok.className = "primary";
    ok.textContent = "OK";
    ok.onclick = () => {
      m.nextIndex = Math.min(m.nextIndex + 1, m.due.length); // avance
      saveState();
      row.innerHTML = `<span class="small">✅ Validé</span>`;
    };

    const ko = document.createElement("button");
    ko.className = "danger";
    ko.textContent = "À revoir";
    ko.onclick = () => {
      // Replanifier plus tôt : tomorrow
      m.due[m.nextIndex] = addDaysISO(today, 1);
      saveState();
      row.innerHTML = `<span class="small">🔁 Reprogrammé pour demain</span>`;
    };

    row.appendChild(ok);
    row.appendChild(ko);
    box.appendChild(row);
  }
});

$("clear").addEventListener("click", () => {
  state.mistakes = [];
  saveState();
  $("reviewBox").innerHTML = `<div class="small">Carnet vidé.</div>`;
});

// ----- Streak
$("markDone").addEventListener("click", () => {
  const today = todayISO();
  if (state.lastDone === today){
    alert("Déjà validé aujourd’hui ✅");
    return;
  }

  // si hier fait => streak +1 sinon reset à 1
  const yesterday = addDaysISO(today, -1);
  if (state.lastDone === yesterday) state.streak += 1;
  else state.streak = 1;

  state.lastDone = today;
  saveState();
  alert("Session validée ✅");
});

$("startSession").addEventListener("click", async () => {
  // Simple guide V1 : enchaîner 3 prompts
  alert("On démarre. Clique 'Lancer l’interlocuteur', réponds au micro, puis 'Corriger'.");
  $("speakPrompt").click();
});

// Register service worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

renderStats();
