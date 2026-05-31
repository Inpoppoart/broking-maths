const FRACTIONS = [0, 1, 2, 3, 4, 5, 6, 7]; // eighths
const fracText = {
  0: "",
  1: "1/8",
  2: "1/4",
  3: "3/8",
  4: "1/2",
  5: "5/8",
  6: "3/4",
  7: "7/8"
};

const state = {
  mode: "normal",
  min: 70,
  max: 350,
  rounds: 20,
  allowNeg: false,
  current: null,
  score: 0,
  streak: 0,
  asked: 0,
  startedAt: null,
  timerId: null,
  history: []
};

const el = id => document.getElementById(id);
const qEl = el("question");
const feedback = el("feedback");
const input = el("answerInput");

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeValue() {
  const whole = randInt(state.min, state.max);
  const eighth = FRACTIONS[randInt(0, FRACTIONS.length - 1)];
  return whole * 8 + eighth;
}

function valueToText(eighths) {
  const sign = eighths < 0 ? "-" : "";
  eighths = Math.abs(eighths);
  const whole = Math.floor(eighths / 8);
  const frac = eighths % 8;
  return sign + whole + (frac ? " " + fracText[frac] : "");
}

function parseAnswer(raw) {
  raw = raw.trim()
    .replace("⅛", " 1/8")
    .replace("¼", " 1/4")
    .replace("⅜", " 3/8")
    .replace("½", " 1/2")
    .replace("⅝", " 5/8")
    .replace("¾", " 3/4")
    .replace("⅞", " 7/8");

  if (!raw) return null;

  // Decimal input: 331.625
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Math.round(Number(raw) * 8);
  }

  // Mixed fraction: 331 5/8
  const mixed = raw.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (!den) return null;
    const sign = whole < 0 ? -1 : 1;
    return whole * 8 + sign * Math.round((num / den) * 8);
  }

  // Pure fraction: 5/8
  const pure = raw.match(/^(-?\d+)\/(\d+)$/);
  if (pure) {
    const num = Number(pure[1]);
    const den = Number(pure[2]);
    if (!den) return null;
    return Math.round((num / den) * 8);
  }

  return null;
}

function generateQuestion() {
  let a, b, op, ans;
  const hard = state.mode === "hard";
  const speed = state.mode === "speed";
  let attempts = 0;

  do {
    a = makeValue();
    b = makeValue();
    op = Math.random() < (hard ? 0.62 : 0.5) ? "-" : "+";
    ans = op === "+" ? a + b : a - b;
    attempts++;
  } while (!state.allowNeg && ans < 0 && attempts < 100);

  if (speed && Math.random() < 0.35) {
    // Make cleaner, board-like values in speed mode.
    a = randInt(state.min, state.max) * 8 + [0,2,4,6][randInt(0,3)];
    b = randInt(state.min, state.max) * 8 + [0,2,4,6][randInt(0,3)];
    op = Math.random() < 0.5 ? "+" : "-";
    if (!state.allowNeg && op === "-" && a < b) [a, b] = [b, a];
    ans = op === "+" ? a + b : a - b;
  }

  state.current = { a, b, op, ans };
  state.asked++;
  qEl.textContent = `${valueToText(a)} ${op} ${valueToText(b)}`;
  feedback.className = "feedback";
  feedback.textContent = `Round ${state.asked}/${state.rounds}`;
  input.value = "";
  input.focus();
}

function checkAnswer() {
  if (!state.current) return;
  const userAns = parseAnswer(input.value);
  if (userAns === null) {
    feedback.className = "feedback bad";
    feedback.textContent = "Use format like 331 5/8 or 331.625";
    return;
  }

  const correct = state.current.ans;
  const item = `${qEl.textContent} = ${valueToText(correct)}`;
  if (userAns === correct) {
    state.score++;
    state.streak++;
    feedback.className = "feedback good";
    feedback.textContent = "Correct. Hit enter for next.";
    addHistory("✓ " + item);
    updateStats();
    setTimeout(nextOrEnd, 350);
  } else {
    state.streak = 0;
    feedback.className = "feedback bad";
    feedback.textContent = `Wrong. Correct: ${valueToText(correct)}`;
    addHistory("✕ " + item);
    updateStats();
  }
}

function addHistory(text) {
  state.history.unshift(text);
  state.history = state.history.slice(0, 8);
  const list = el("history");
  list.innerHTML = "";
  for (const h of state.history) {
    const li = document.createElement("li");
    li.textContent = h;
    list.appendChild(li);
  }
}

function nextOrEnd() {
  if (state.asked >= state.rounds) {
    endDrill();
  } else {
    generateQuestion();
  }
}

function skip() {
  if (!state.current) return;
  state.streak = 0;
  addHistory(`↷ ${qEl.textContent} = ${valueToText(state.current.ans)}`);
  updateStats();
  nextOrEnd();
}

function startDrill() {
  state.score = 0;
  state.streak = 0;
  state.asked = 0;
  state.startedAt = Date.now();
  state.history = [];
  el("history").innerHTML = "";
  updateStats();
  clearInterval(state.timerId);
  state.timerId = setInterval(updateTimer, 250);
  generateQuestion();
}

function endDrill() {
  clearInterval(state.timerId);
  state.current = null;
  qEl.textContent = "Done";
  feedback.className = "feedback good";
  feedback.textContent = `Final score: ${state.score}/${state.rounds}. Restart to drill again.`;
}

function updateTimer() {
  if (!state.startedAt) return;
  const sec = Math.floor((Date.now() - state.startedAt) / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  el("timer").textContent = `${m}:${s}`;
}

function updateStats() {
  el("score").textContent = state.score;
  el("streak").textContent = state.streak;
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

function saveSettings() {
  const min = Number(el("minVal").value);
  const max = Number(el("maxVal").value);
  const rounds = Number(el("roundsVal").value);
  if (min >= max) {
    feedback.className = "feedback bad";
    feedback.textContent = "Min must be below max.";
    return;
  }
  state.min = min;
  state.max = max;
  state.rounds = rounds;
  state.allowNeg = el("allowNeg").checked;
  el("settingsPanel").classList.add("hidden");
  feedback.className = "feedback";
  feedback.textContent = `Saved: ${min}-${max}, ${rounds} rounds.`;
}

document.querySelectorAll(".mode").forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

document.querySelectorAll(".fraction-buttons button").forEach(btn => {
  btn.addEventListener("click", () => {
    const frac = btn.dataset.frac;
    input.value = input.value.trim();
    input.value += (input.value ? " " : "") + frac;
    input.focus();
  });
});

el("startBtn").addEventListener("click", startDrill);
el("checkBtn").addEventListener("click", checkAnswer);
el("skipBtn").addEventListener("click", skip);
el("settingsBtn").addEventListener("click", () => el("settingsPanel").classList.toggle("hidden"));
el("saveSettings").addEventListener("click", saveSettings);

input.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    if (state.current) checkAnswer();
    else startDrill();
  }
});

// Register service worker for iPhone home-screen install/offline use.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
