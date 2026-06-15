// PIT BOSS — The Trading Floor
// Arcade survival math game. Internal unit = eighths. Math engine unchanged.

const LEVEL_NUMBERS = [
  74.875, 83.625, 92.500,
  108.375, 116.875, 124.500, 133.250, 142.625, 155.875,
  164.500, 173.250, 182.125, 191.500, 207.375, 216.875,
  225.500, 234.125, 243.625, 258.875, 267.500, 276.375,
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

const RANKS = [
  { min: 1,  name: "RUNNER",     badge: "▲" },
  { min: 3,  name: "CLERK",      badge: "◆" },
  { min: 5,  name: "TRADER",     badge: "★" },
  { min: 8,  name: "SR TRADER",  badge: "✦" },
  { min: 11, name: "DESK HEAD",  badge: "♛" },
  { min: 15, name: "VP",         badge: "⬢" },
  { min: 20, name: "PIT BOSS",   badge: "☼" }
];

const BASE_PAYOUT = { easy: 120, medium: 200, hard: 320 };
const MODE_XP = { easy: 0, medium: 6, hard: 12 };
const MAX_LIVES = 3;

const hints = {
  easy: "2-digit with eighths ± 1-digit with eighths.",
  medium: "2-digit with eighths ± smaller 2-digit with eighths.",
  hard: "Level price ± spread from the pool. Up to 350.",
  mixed: "Random Easy / Medium / Hard orders."
};

const game = {
  mode: "easy",
  autoNext: true,
  playing: false,
  current: null,
  cash: 0,
  xp: 0,
  level: 1,
  lives: MAX_LIVES,
  combo: 0,
  bestCombo: 0,
  orders: 0,
  startedAt: null,
  timerId: null,
  questionStart: 0,
  history: []
};

const el = id => document.getElementById(id);
const qEl = el("question");
const feedback = el("feedback");
const input = el("answerInput");

// ---------- math helpers ----------
function toEighths(x) { return Math.round(Number(x) * 8); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function choice(arr) { return arr[randInt(0, arr.length - 1)]; }
function valueToDecimalText(eighths) { return (eighths / 8).toFixed(3); }

function valueToFracHtml(eighths) {
  const sign = eighths < 0 ? "−" : "";
  eighths = Math.abs(eighths);
  const whole = Math.floor(eighths / 8);
  const frac = eighths % 8;
  const fr = [null, [1, 8], [1, 4], [3, 8], [1, 2], [5, 8], [3, 4], [7, 8]][frac];
  if (!fr) return sign + whole;
  return `${sign}${whole}<span class="frac"><span>${fr[0]}</span><span>${fr[1]}</span></span>`;
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
    .replace("⅛", " 1/8").replace("¼", " 1/4").replace("⅜", " 3/8")
    .replace("½", " 1/2").replace("⅝", " 5/8").replace("¾", " 3/4").replace("⅞", " 7/8");
  if (!raw) return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 8);
  const mixed = raw.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]), num = Number(mixed[2]), den = Number(mixed[3]);
    if (!den) return null;
    const sign = whole < 0 ? -1 : 1;
    return whole * 8 + sign * Math.round((num / den) * 8);
  }
  const pure = raw.match(/^(-?\d+)\/(\d+)$/);
  if (pure) {
    const num = Number(pure[1]), den = Number(pure[2]);
    if (!den) return null;
    return Math.round((num / den) * 8);
  }
  return null;
}

function validRange(ans) { return ans >= 70 * 8 && ans <= 350 * 8; }

function makeQuestion() {
  const mode = game.mode === "mixed" ? choice(["easy", "medium", "hard"]) : game.mode;
  if (mode === "easy") return makeEasy();
  if (mode === "medium") return makeMedium();
  return makeHard();
}

function buildQ(aE, bE, op, ans) {
  return {
    question: `${valueToMixedText(aE)} ${op} ${valueToMixedText(bE)}`,
    questionHtml: `${valueToFracHtml(aE)} <span class="op">${op}</span> ${valueToFracHtml(bE)}`,
    answer: ans,
    explainer: `${valueToMixedText(aE)} ${op} ${valueToMixedText(bE)} = ${valueToMixedText(ans)}`
  };
}

function makeEasy() {
  let a, b, op, ans, tries = 0;
  do {
    a = randInt(70 * 8, 99 * 8 + 7);
    b = randInt(8, 79);
    op = Math.random() < 0.55 ? "+" : "-";
    ans = op === "+" ? a + b : a - b;
    tries++;
  } while (!validRange(ans) && tries < 50);
  return buildQ(a, b, op, ans);
}

function makeMedium() {
  let a, b, op, ans, tries = 0;
  do {
    a = randInt(70 * 8, 99 * 8 + 7);
    b = randInt(10 * 8, 49 * 8 + 7);
    op = Math.random() < 0.55 ? "+" : "-";
    ans = op === "+" ? a + b : a - b;
    tries++;
  } while (!validRange(ans) && tries < 80);
  return buildQ(a, b, op, ans);
}

function makeHard() {
  let a, b, op, ans, tries = 0;
  do {
    a = toEighths(choice(activeLevels));
    b = toEighths(choice(activeSpreads));
    op = Math.random() < 0.55 ? "+" : "-";
    ans = op === "+" ? a + b : a - b;
    tries++;
  } while (!validRange(ans) && tries < 80);
  return buildQ(a, b, op, ans);
}

// ---------- game logic ----------
function rankFor(level) {
  let r = RANKS[0];
  for (const cand of RANKS) if (level >= cand.min) r = cand;
  return r;
}
function xpForLevel(level) { return 100 + (level - 1) * 45; }
function comboMult(combo) { return Math.min(1 + Math.floor(combo / 3), 8); }
function fmtCash(n) { return "$" + n.toLocaleString("en-US"); }

function updateHUD() {
  const r = rankFor(game.level);
  el("rank").textContent = r.name;
  el("rankBadge").textContent = r.badge;
  el("level").textContent = game.level;
  el("cash").textContent = fmtCash(game.cash);

  const need = xpForLevel(game.level);
  const pct = Math.max(0, Math.min(100, (game.xp / need) * 100));
  el("xpBar").style.width = pct + "%";
  el("xpText").textContent = `${game.xp} / ${need} XP`;

  const mult = comboMult(game.combo);
  el("combo").textContent = "x" + mult;
  const within = game.combo % 3;
  el("comboFill").style.width = (within / 3) * 100 + "%";
  el("comboWrap").classList.toggle("hot", mult >= 4);

  const lives = el("lives");
  lives.innerHTML = "";
  for (let i = 0; i < MAX_LIVES; i++) {
    const h = document.createElement("span");
    h.className = "heart" + (i < game.lives ? "" : " dead");
    h.textContent = i < game.lives ? "♥" : "♡";
    lives.appendChild(h);
  }
}

function addXp(amount) {
  game.xp += amount;
  let leveled = false;
  while (game.xp >= xpForLevel(game.level)) {
    game.xp -= xpForLevel(game.level);
    game.level++;
    leveled = true;
  }
  if (leveled) onLevelUp();
}

function onLevelUp() {
  game.lives = Math.min(MAX_LIVES, game.lives + 1);
  const r = rankFor(game.level);
  el("luRank").textContent = r.name;
  el("luLevel").textContent = game.level;
  const lu = el("levelup");
  lu.classList.remove("hidden");
  void lu.offsetWidth;
  lu.classList.add("show");
  setTimeout(() => { lu.classList.remove("show"); lu.classList.add("hidden"); }, 1500);
  FX.sfx.levelup();
  const c = FX.centerOf(qEl);
  FX.burst(c.x, c.y, { count: 40, power: 6, up: 3, colors: ["#39ff8b", "#ffd23f", "#5bd1ff"] });
  FX.flash("rgba(57,255,139,0.18)");
}

function generateQuestion() {
  game.current = makeQuestion();
  game.orders++;
  el("orderNo").textContent = "#" + String(game.orders).padStart(3, "0");
  qEl.innerHTML = game.current.questionHtml;
  qEl.classList.remove("pop");
  void qEl.offsetWidth;
  qEl.classList.add("pop");
  feedback.className = "feedback";
  feedback.textContent = `${game.mode.toUpperCase()} order — name your price.`;
  input.value = "";
  input.focus();
  game.questionStart = performance.now();
}

function checkAnswer() {
  if (!game.playing || !game.current) return;
  const userAns = parseAnswer(input.value);
  if (userAns === null) {
    feedback.className = "feedback bad";
    feedback.textContent = "Enter a price — e.g. 92 5/8 or 92.625.";
    FX.sfx.click();
    return;
  }

  const correct = game.current.answer;
  const ok = userAns === correct;
  const solved = `${game.current.question} = ${valueToMixedText(correct)}`;

  if (ok) {
    const elapsed = performance.now() - game.questionStart;
    let speed = 1, speedLabel = "";
    if (elapsed < 3000) { speed = 1.5; speedLabel = "FAST FILL! "; }
    else if (elapsed < 6000) { speed = 1.2; }

    game.combo++;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    const mult = comboMult(game.combo);
    const payout = Math.round(BASE_PAYOUT[effectiveMode()] * mult * speed / 5) * 5;
    const xpGain = Math.round(20 + mult * 6 + MODE_XP[effectiveMode()] + (speed > 1 ? 8 : 0));

    game.cash += payout;
    addXp(xpGain);

    feedback.className = "feedback good";
    feedback.textContent = `${speedLabel}Filled +${fmtCash(payout)}  (x${mult})`;
    addHistory("✓ " + solved, "fill");

    const c = FX.centerOf(qEl);
    FX.burst(c.x, c.y, { count: 14 + mult * 3, power: 3 + mult * 0.5, up: 2 });
    FX.popup(c.x, c.y - 30, "+" + fmtCash(payout), "gain");
    if (mult >= 3) FX.popup(c.x, c.y - 64, "COMBO x" + mult, "combo");
    FX.sfx.correct(game.combo);
    FX.sfx.coin();
    FX.flash("rgba(57,255,139,0.10)");

    updateHUD();
    if (game.autoNext) setTimeout(nextOrEnd, 480);
  } else {
    game.combo = 0;
    game.lives--;
    feedback.className = "feedback bad";
    feedback.textContent = `MISFILL — it was ${valueToMixedText(correct)} (${valueToDecimalText(correct)})`;
    addHistory("✕ " + solved, "miss");

    const c = FX.centerOf(qEl);
    FX.popup(c.x, c.y - 30, "MISFILL", "loss");
    FX.shake(true);
    FX.flash("rgba(240,82,82,0.20)");
    FX.sfx.wrong();

    updateHUD();
    if (game.lives <= 0) { setTimeout(gameOver, 700); return; }
    if (game.autoNext) setTimeout(nextOrEnd, 1400);
  }
}

function effectiveMode() {
  // For payout we need the concrete mode; mixed picks per-question via answer source.
  // Approximate by current question difficulty band.
  if (game.mode !== "mixed") return game.mode;
  return "medium";
}

function addHistory(text, cls) {
  game.history.unshift({ text, cls });
  game.history = game.history.slice(0, 12);
  const list = el("history");
  list.innerHTML = "";
  for (const h of game.history) {
    const li = document.createElement("li");
    li.className = h.cls || "";
    li.textContent = h.text;
    list.appendChild(li);
  }
}

function nextOrEnd() {
  if (game.lives <= 0) gameOver();
  else generateQuestion();
}

function skip() {
  if (!game.playing || !game.current) return;
  game.combo = 0;
  const correct = game.current.answer;
  feedback.className = "feedback bad";
  feedback.textContent = `Passed — it was ${valueToMixedText(correct)}`;
  addHistory(`↷ ${game.current.question} = ${valueToMixedText(correct)}`, "skip");
  FX.sfx.click();
  updateHUD();
  setTimeout(nextOrEnd, 700);
}

function startDrill() {
  game.playing = true;
  game.cash = 0;
  game.xp = 0;
  game.level = 1;
  game.lives = MAX_LIVES;
  game.combo = 0;
  game.bestCombo = 0;
  game.orders = 0;
  game.startedAt = Date.now();
  game.history = [];
  el("history").innerHTML = "";
  el("gameover").classList.add("hidden");
  FX.setAmbient(true);
  FX.audio();
  FX.sfx.deal();
  updateHUD();
  clearInterval(game.timerId);
  game.timerId = setInterval(updateTimer, 250);
  generateQuestion();
}

function gameOver() {
  game.playing = false;
  game.current = null;
  clearInterval(game.timerId);
  FX.setAmbient(false);
  FX.sfx.gameover();
  el("goRank").textContent = rankFor(game.level).name;
  el("goCash").textContent = fmtCash(game.cash);
  el("goLevel").textContent = game.level;
  el("goCombo").textContent = game.bestCombo;
  const go = el("gameover");
  go.classList.remove("hidden");
  void go.offsetWidth;
  go.classList.add("show");
  qEl.textContent = "FLOOR CLOSED";
  feedback.className = "feedback";
  feedback.textContent = "Press BACK TO THE PIT to run it again.";
}

function updateTimer() {
  if (!game.startedAt) return;
  const sec = Math.floor((Date.now() - game.startedAt) / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  el("timer").textContent = `${m}:${s}`;
}

function setMode(mode) {
  game.mode = mode;
  document.querySelectorAll(".mode").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  el("modeHint").textContent = hints[mode];
  FX.sfx.click();
  if (!game.playing) {
    qEl.innerHTML = "PRESS&nbsp;DEAL";
    feedback.className = "feedback";
    feedback.textContent = "Fill the order. Answer like 92 5/8 or 92.625.";
  }
}

function saveSettings() {
  game.autoNext = el("autoNext").checked;
  el("settingsPanel").classList.add("hidden");
  feedback.className = "feedback";
  feedback.textContent = "Settings saved.";
}

function renderBoard() {
  const board = el("boardGrid");
  board.innerHTML = "";
  const values = [
    ...activeLevels.map(v => ["LVL", v]),
    ...activeSpreads.map(v => ["SPR", v])
  ];
  values.forEach(([name, value], i) => {
    const div = document.createElement("div");
    const a = document.createElement("span");
    const b = document.createElement("strong");
    a.textContent = `${name}${i + 1}`;
    b.textContent = value.toFixed(3);
    div.appendChild(a);
    div.appendChild(b);
    board.appendChild(div);
  });
}

// ---------- ticker ----------
function buildTicker() {
  const track = el("tickerTrack");
  const syms = ["VULC", "ORB", "KSR", "MNT", "AXL", "PIT", "DNE", "RGX", "TLR", "BND", "EQT", "FTR"];
  const items = [];
  for (let i = 0; i < 18; i++) {
    const s = syms[i % syms.length];
    const price = (70 + Math.random() * 280).toFixed(3);
    const up = Math.random() < 0.5;
    const chg = (Math.random() * 3 + 0.125).toFixed(3);
    items.push(
      `<span class="tk"><b>${s}</b> ${price} <i class="${up ? "up" : "dn"}">${up ? "▲" : "▼"}${chg}</i></span>`
    );
  }
  const html = items.join('<span class="tk-sep">•</span>');
  track.innerHTML = html + '<span class="tk-sep">•</span>' + html;
}

// ---------- wiring ----------
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
    FX.sfx.click();
  });
});

el("startBtn").addEventListener("click", startDrill);
el("checkBtn").addEventListener("click", checkAnswer);
el("skipBtn").addEventListener("click", skip);
el("restartBtn").addEventListener("click", () => {
  el("gameover").classList.remove("show");
  startDrill();
});
el("settingsBtn").addEventListener("click", () => el("settingsPanel").classList.toggle("hidden"));
el("saveSettings").addEventListener("click", saveSettings);
el("soundBtn").addEventListener("click", () => {
  const on = !FX.getSound();
  FX.setSound(on);
  el("soundBtn").textContent = on ? "🔊" : "🔇";
  if (on) { FX.audio(); FX.sfx.click(); }
});

input.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    if (game.playing && game.current) checkAnswer();
    else if (!game.playing) startDrill();
  }
});

// ---------- pools ----------
function parsePool(text) {
  return text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(Number)
    .filter(n => !isNaN(n) && n >= 70 && n <= 350 && Math.abs(Math.round(n * 8) - n * 8) < 0.001);
}

function loadPool() {
  const lvlText = el("customLevels").value.trim();
  const sprText = el("customSpreads").value.trim();
  const lvls = lvlText ? parsePool(lvlText) : null;
  const sprs = sprText ? parsePool(sprText) : null;
  const msgs = [];

  if (lvlText && (!lvls || lvls.length === 0)) {
    el("poolStatus").textContent = "No valid level numbers. Use multiples of 1/8 between 70–350.";
    return;
  }
  if (sprText && (!sprs || sprs.length === 0)) {
    el("poolStatus").textContent = "No valid spread numbers. Use multiples of 1/8 between 70–350.";
    return;
  }

  if (lvls && lvls.length) { activeLevels = lvls; msgs.push(`${lvls.length} levels`); }
  else activeLevels = LEVEL_NUMBERS;
  if (sprs && sprs.length) { activeSpreads = sprs; msgs.push(`${sprs.length} spreads`); }
  else activeSpreads = SPREAD_NUMBERS;

  el("poolStatus").textContent = msgs.length ? `Loaded: ${msgs.join(", ")}.` : "Using defaults.";
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

// ---------- boot ----------
FX.init();
buildTicker();
renderBoard();
updateHUD();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
