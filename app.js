// Broking Maths v3
// Plain add/subtract only. No curve labels. Internal unit = eighths.

const LEVEL_NUMBERS = [
  // low 70–100
  74.875, 83.625, 92.500,
  // 100–160
  108.375, 116.875, 124.500, 133.250, 142.625, 155.875,
  // 160–220
  164.500, 173.250, 182.125, 191.500, 207.375, 216.875,
  // 220–280
  225.500, 234.125, 243.625, 258.875, 267.500, 276.375,
  // 280–350
  285.125, 304.875, 321.500, 338.125
];

const SPREAD_NUMBERS = [
  5.500, 8.875, 11.250, 13.625,
  17.500, 21.875, 25.250, 28.625,
  33.500, 37.875, 42.250, 46.625,
  52.500, 57.875, 63.250,
  69.125, 74.500, 79.875
];

let activeLevels = LEVEL_NUMBERS;
let activeSpreads = SPREAD_NUMBERS;

const state = {
  mode: "easy",
  rounds: 20,
  autoNext: true,
  acceptRounded: false,
  current: null,
  score: 0,
  streak: 0,
  asked: 0,
  startedAt: null,
  timerId: null,
  history: []
};

const hints = {
  easy: "2-digit whole number ± 1-digit fraction (all eighths). E.g. 87 + 4 5/8.",
  medium: "2-digit with eighths ± smaller 2-digit with eighths. E.g. 91.500 − 23.375.",
  hard: "Level price ± spread from pool, exact eighths. Up to 350.",
  mixed: "Random Easy / Medium / Hard."
};

const el = id => document.getElementById(id);
const qEl = el("question");
const feedback = el("feedback");
const input = el("answerInput");

function toEighths(x) { return Math.round(Number(x) * 8); }

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function valueToDecimalText(eighths) {
  return (eighths / 8).toFixed(3);
}

function valueToQuestionText(eighths, clean = false) {
  if (clean) return String(eighths / 8);
  return (eighths / 8).toFixed(3);
}

function valueToMixedText(eighths) {
  const sign = eighths < 0 ? "-" : "";
  eighths = Math.abs(eighths);
  const whole = Math.floor(eighths / 8);
  const frac = eighths % 8;
  const f = ["", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"][frac];
  return sign + whole + (f ? " " + f : "");
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

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Math.round(Number(raw) * 8);
  }

  const mixed = raw.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (!den) return null;
    const sign = whole < 0 ? -1 : 1;
    return whole * 8 + sign * Math.round((num / den) * 8);
  }

  const pure = raw.match(/^(-?\d+)\/(\d+)$/);
  if (pure) {
    const num = Number(pure[1]);
    const den = Number(pure[2]);
    if (!den) return null;
    return Math.round((num / den) * 8);
  }

  return null;
}

function validRange(ans) {
  return ans >= 70 * 8 && ans <= 350 * 8;
}

function makeQuestion() {
  const mode = state.mode === "mixed" ? choice(["easy", "medium", "hard"]) : state.mode;
  if (mode === "easy") return makeEasy();
  if (mode === "medium") return makeMedium();
  return makeHard();
}

function makeEasy() {
  // 2-digit integer base ± 1-digit with all eighths fractions.
  let a, bEighths, op, ans;
  let tries = 0;
  do {
    a = randInt(70, 99);
    bEighths = randInt(8, 79); // 1.000 to 9.875 in eighths
    op = Math.random() < 0.55 ? "+" : "-";
    ans = op === "+" ? a * 8 + bEighths : a * 8 - bEighths;
    tries++;
  } while (!validRange(ans) && tries < 50);

  return {
    question: `${a} ${op} ${valueToMixedText(bEighths)}`,
    answer: ans,
    clean: false,
    explainer: `${a} ${op} ${valueToMixedText(bEighths)} = ${valueToMixedText(ans)}`
  };
}

function makeMedium() {
  // 2-digit with eighths ± smaller 2-digit with eighths.
  let aEighths, bEighths, op, ans;
  let tries = 0;
  do {
    aEighths = randInt(70 * 8, 99 * 8 + 7); // 70.000–99.875
    bEighths = randInt(10 * 8, 49 * 8 + 7); // 10.000–49.875
    op = Math.random() < 0.55 ? "+" : "-";
    ans = op === "+" ? aEighths + bEighths : aEighths - bEighths;
    tries++;
  } while (!validRange(ans) && tries < 80);

  return {
    question: `${valueToQuestionText(aEighths)} ${op} ${valueToQuestionText(bEighths)}`,
    answer: ans,
    clean: false,
    explainer: `${valueToMixedText(aEighths)} ${op} ${valueToMixedText(bEighths)} = ${valueToMixedText(ans)}`
  };
}

function makeHard() {
  // Level price from pool ± spread. Single step, bigger numbers up to 350.
  // Spreads are always 2-digit, so never 3-digit + 3-digit.
  let a, b, op, ans;
  let tries = 0;
  do {
    a = toEighths(choice(activeLevels));
    b = toEighths(choice(activeSpreads));
    op = Math.random() < 0.55 ? "+" : "-";
    ans = op === "+" ? a + b : a - b;
    tries++;
  } while (!validRange(ans) && tries < 80);

  return {
    question: `${valueToQuestionText(a)} ${op} ${valueToQuestionText(b)}`,
    answer: ans,
    clean: false,
    explainer: `${valueToMixedText(a)} ${op} ${valueToMixedText(b)} = ${valueToMixedText(ans)}`
  };
}

function generateQuestion() {
  state.current = makeQuestion();
  state.asked++;
  qEl.textContent = state.current.question;
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
    feedback.textContent = "Use 155.625 or 155 5/8.";
    return;
  }

  const correct = state.current.answer;
  const ok = state.acceptRounded ? Math.abs(userAns - correct) <= 0 : userAns === correct;
  const solved = `${state.current.question} = ${valueToDecimalText(correct)} (${valueToMixedText(correct)})`;

  if (ok) {
    state.score++;
    state.streak++;
    feedback.className = "feedback good";
    feedback.textContent = "Correct.";
    addHistory("✓ " + solved);
    updateStats();
    if (state.autoNext) setTimeout(nextOrEnd, 350);
  } else {
    state.streak = 0;
    feedback.className = "feedback bad";
    feedback.textContent = `Wrong. ${valueToDecimalText(correct)} / ${valueToMixedText(correct)}`;
    addHistory("✕ " + solved);
    updateStats();
  }
}

function addHistory(text) {
  state.history.unshift(text);
  state.history = state.history.slice(0, 10);
  const list = el("history");
  list.innerHTML = "";
  for (const h of state.history) {
    const li = document.createElement("li");
    li.textContent = h;
    list.appendChild(li);
  }
}

function nextOrEnd() {
  if (state.asked >= state.rounds) endDrill();
  else generateQuestion();
}

function skip() {
  if (!state.current) return;
  state.streak = 0;
  const correct = state.current.answer;
  feedback.className = "feedback bad";
  feedback.textContent = `Skipped. ${valueToDecimalText(correct)} / ${valueToMixedText(correct)}`;
  addHistory(`↷ ${state.current.question} = ${valueToDecimalText(correct)} (${valueToMixedText(correct)})`);
  updateStats();
  setTimeout(nextOrEnd, 700);
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
  el("modeHint").textContent = hints[mode];
  qEl.textContent = "Press Start";
  feedback.className = "feedback";
  feedback.textContent = "Answer as 155.625, 155 5/8, or 156 if clean.";
  state.current = null;
}

function saveSettings() {
  state.rounds = Number(el("roundsVal").value);
  state.autoNext = el("autoNext").checked;
  state.acceptRounded = el("acceptRounded").checked;
  el("settingsPanel").classList.add("hidden");
  feedback.className = "feedback";
  feedback.textContent = `Saved: ${state.rounds} rounds.`;
}

function renderBoard() {
  const board = el("boardGrid");
  board.innerHTML = "";
  const values = [
    ...activeLevels.map(v => ["Level", v]),
    ...activeSpreads.map(v => ["Spread", v])
  ];
  values.forEach(([name, value], i) => {
    const div = document.createElement("div");
    const a = document.createElement("span");
    const b = document.createElement("strong");
    a.textContent = `${name} ${i + 1}`;
    b.textContent = value.toFixed(3);
    div.appendChild(a);
    div.appendChild(b);
    board.appendChild(div);
  });
}

document.querySelectorAll(".mode").forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

document.querySelectorAll(".fraction-buttons button").forEach(btn => {
  btn.addEventListener("click", () => {
    let v = input.value.trim();
    const dot = btn.dataset.frac;
    if (/^-?\d+$/.test(v)) input.value = v + dot;
    else input.value = v + " " + dot;
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

function parsePool(text) {
  return text.split(/[\n,]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(Number)
    .filter(n => !isNaN(n) && n >= 70 && n <= 350 && Math.abs(Math.round(n * 8) - n * 8) < 0.001);
}

function loadPool() {
  const lvlText = el("customLevels").value.trim();
  const sprText = el("customSpreads").value.trim();
  const lvls = lvlText ? parsePool(lvlText) : null;
  const sprs = sprText ? parsePool(sprText) : null;
  const msgs = [];

  if (lvlText && (!lvls || lvls.length === 0)) {
    el("poolStatus").textContent = "No valid level numbers found. Values must be multiples of 1/8 between 70–350.";
    return;
  }
  if (sprText && (!sprs || sprs.length === 0)) {
    el("poolStatus").textContent = "No valid spread numbers found. Values must be multiples of 1/8 between 70–350.";
    return;
  }

  if (lvls && lvls.length > 0) {
    activeLevels = lvls;
    msgs.push(`${lvls.length} level${lvls.length !== 1 ? "s" : ""}`);
  } else {
    activeLevels = LEVEL_NUMBERS;
  }

  if (sprs && sprs.length > 0) {
    activeSpreads = sprs;
    msgs.push(`${sprs.length} spread${sprs.length !== 1 ? "s" : ""}`);
  } else {
    activeSpreads = SPREAD_NUMBERS;
  }

  el("poolStatus").textContent = msgs.length
    ? `Loaded: ${msgs.join(", ")}. Restart drill to use.`
    : "Using defaults.";
  renderBoard();
}

function resetPool() {
  activeLevels = LEVEL_NUMBERS;
  activeSpreads = SPREAD_NUMBERS;
  el("customLevels").value = "";
  el("customSpreads").value = "";
  el("poolStatus").textContent = "Reset to defaults.";
  renderBoard();
}

el("loadPoolBtn").addEventListener("click", loadPool);
el("resetPoolBtn").addEventListener("click", resetPool);

renderBoard();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
