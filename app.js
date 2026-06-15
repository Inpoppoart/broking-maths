// PIT BOSS — The Trading Floor  (roguelike edition)
// Each run = floors of ORDERS_PER_FLOOR questions. Clear a floor → pick a relic.
// Lives run out → run ends. Internal unit = eighths. Math engine unchanged.

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

// ─── Roguelike constants ───────────────────────────────────────────
const ORDERS_PER_FLOOR = 5;
const MAX_LIVES     = 3;
const MAX_LIVES_CAP = 5;

const ALL_RELICS = [
  { id: "bull",   name: "BULL HORN",   icon: "📈", desc: "+40% cash on every fill." },
  { id: "speed",  name: "HOT WIRE",    icon: "⚡", desc: "Speed bonus triggers at <5 s instead of <3 s." },
  { id: "shield", name: "STOP LOSS",   icon: "🛡", desc: "First misfill each floor costs no life." },
  { id: "double", name: "DOUBLE DOWN", icon: "✦",  desc: "Every 4th correct fill pays 2× cash." },
  { id: "combo",  name: "CARRY TRADE", icon: "♾",  desc: "Misfills no longer reset your combo." },
  { id: "hp",     name: "SECOND WIND", icon: "💚", desc: "Restore 1 life right now (max 5)." },
  { id: "xp",     name: "FAST TRACK",  icon: "🎓", desc: "+60% XP on every fill." },
  { id: "cash",   name: "FLOOR BONUS", icon: "💰", desc: "Receive $500 instantly." },
];

// ─── Rank table ───────────────────────────────────────────────────
const RANKS = [
  { min: 1,  name: "RUNNER",    badge: "▲" },
  { min: 3,  name: "CLERK",     badge: "◆" },
  { min: 5,  name: "TRADER",    badge: "★" },
  { min: 8,  name: "SR TRADER", badge: "✦" },
  { min: 11, name: "DESK HEAD", badge: "♛" },
  { min: 15, name: "VP",        badge: "⬢" },
  { min: 20, name: "PIT BOSS",  badge: "☼" },
];

const BASE_PAYOUT = { easy: 120, medium: 200, hard: 320 };
const MODE_XP     = { easy: 0,   medium: 6,   hard: 12  };

const hints = {
  easy:   "2-digit with eighths ± 1-digit with eighths.",
  medium: "2-digit with eighths ± smaller 2-digit with eighths.",
  hard:   "Level price ± spread from the pool. Up to 350.",
  mixed:  "Escalates each floor — starts easy, goes hard."
};

// ─── Game state ───────────────────────────────────────────────────
const game = {
  mode: "easy", autoNext: true, playing: false, current: null,
  cash: 0, xp: 0, level: 1, lives: MAX_LIVES,
  combo: 0, bestCombo: 0, orders: 0,
  floor: 1, floorOrdersDone: 0,
  relics: [], shieldUsed: false, fillCount: 0,
  startedAt: null, timerId: null, questionStart: 0,
  history: []
};

// ─── DOM shortcuts ─────────────────────────────────────────────────
const el = id => document.getElementById(id);
const qEl      = el("question");
const feedback = el("feedback");
const input    = el("answerInput");

// ─── Math helpers ─────────────────────────────────────────────────
function toEighths(x)          { return Math.round(Number(x) * 8); }
function randInt(min, max)     { return Math.floor(Math.random() * (max - min + 1)) + min; }
function choice(arr)           { return arr[randInt(0, arr.length - 1)]; }
function valueToDecimalText(e) { return (e / 8).toFixed(3); }

function valueToFracHtml(eighths) {
  const sign = eighths < 0 ? "−" : "";
  eighths = Math.abs(eighths);
  const whole = Math.floor(eighths / 8);
  const frac  = eighths % 8;
  const fr = [null,[1,8],[1,4],[3,8],[1,2],[5,8],[3,4],[7,8]][frac];
  if (!fr) return sign + whole;
  return `${sign}${whole}<span class="frac"><span>${fr[0]}</span><span>${fr[1]}</span></span>`;
}

function valueToMixedText(eighths) {
  const sign = eighths < 0 ? "-" : "";
  eighths = Math.abs(eighths);
  const whole = Math.floor(eighths / 8);
  const frac  = eighths % 8;
  const f = ["","1/8","1/4","3/8","1/2","5/8","3/4","7/8"][frac];
  return sign + whole + (f ? " " + f : "");
}

function parseAnswer(raw) {
  raw = raw.trim()
    .replace("⅛"," 1/8").replace("¼"," 1/4").replace("⅜"," 3/8")
    .replace("½"," 1/2").replace("⅝"," 5/8").replace("¾"," 3/4").replace("⅞"," 7/8");
  if (!raw) return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 8);
  const mixed = raw.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]), num = Number(mixed[2]), den = Number(mixed[3]);
    if (!den) return null;
    return whole * 8 + (whole < 0 ? -1 : 1) * Math.round((num / den) * 8);
  }
  const pure = raw.match(/^(-?\d+)\/(\d+)$/);
  if (pure) { const n=Number(pure[1]),d=Number(pure[2]); if(!d) return null; return Math.round((n/d)*8); }
  return null;
}

function validRange(ans) { return ans >= 70*8 && ans <= 350*8; }

// ─── Question builders ────────────────────────────────────────────
function buildQ(aE, bE, op, ans, mode) {
  return {
    question: `${valueToMixedText(aE)} ${op} ${valueToMixedText(bE)}`,
    questionHtml: `${valueToFracHtml(aE)} <span class="op">${op}</span> ${valueToFracHtml(bE)}`,
    answer: ans, mode,
    explainer: `${valueToMixedText(aE)} ${op} ${valueToMixedText(bE)} = ${valueToMixedText(ans)}`
  };
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
    a = randInt(70*8, 99*8+7);
    b = randInt(8, 79);
    op = Math.random() < 0.55 ? "+" : "-";
    ans = op === "+" ? a+b : a-b;
    tries++;
  } while (!validRange(ans) && tries < 50);
  return buildQ(a, b, op, ans, "easy");
}

function makeMedium() {
  let a, b, op, ans, tries = 0;
  do {
    a = randInt(70*8, 99*8+7);
    b = randInt(10*8, 49*8+7);
    op = Math.random() < 0.55 ? "+" : "-";
    ans = op === "+" ? a+b : a-b;
    tries++;
  } while (!validRange(ans) && tries < 80);
  return buildQ(a, b, op, ans, "medium");
}

function makeHard() {
  let a, b, op, ans, tries = 0;
  do {
    a = toEighths(choice(activeLevels));
    b = toEighths(choice(activeSpreads));
    op = Math.random() < 0.55 ? "+" : "-";
    ans = op === "+" ? a+b : a-b;
    tries++;
  } while (!validRange(ans) && tries < 80);
  return buildQ(a, b, op, ans, "hard");
}

function makeQuestion() {
  let mode = game.mode;
  // Mixed mode escalates with floor depth
  if (mode === "mixed") {
    const r = Math.random();
    if      (game.floor >= 8) mode = r < 0.70 ? "hard" : "medium";
    else if (game.floor >= 5) mode = r < 0.40 ? "hard" : r < 0.80 ? "medium" : "easy";
    else if (game.floor >= 3) mode = r < 0.20 ? "hard" : r < 0.60 ? "medium" : "easy";
    else                      mode = r < 0.20 ? "medium" : "easy";
  }
  if (mode === "easy")   return makeEasy();
  if (mode === "medium") return makeMedium();
  return makeHard();
}

// ─── Relic helpers ────────────────────────────────────────────────
function hasRelic(id) { return game.relics.includes(id); }

function pickRelic(id) {
  const r = ALL_RELICS.find(r => r.id === id);
  if (!r) return;
  game.relics.push(id);
  if (id === "hp")   game.lives = Math.min(MAX_LIVES_CAP, game.lives + 1);
  if (id === "cash") game.cash += 500;

  const overlay = el("relicDraft");
  overlay.classList.remove("show");
  overlay.classList.add("hidden");

  game.playing = true;
  startNextFloor();
}

function showRelicDraft() {
  const available = ALL_RELICS.filter(r => !game.relics.includes(r.id))
    .sort(() => Math.random() - 0.5).slice(0, 3);

  el("rdFloor").textContent = game.floor;
  const container = el("rdOptions");
  container.innerHTML = "";

  if (available.length === 0) {
    container.innerHTML = '<p class="rd-all-done">ALL RELICS ACQUIRED. CONTINUING…</p>';
    setTimeout(() => {
      el("relicDraft").classList.add("hidden");
      game.playing = true;
      startNextFloor();
    }, 1600);
  } else {
    available.forEach(r => {
      const btn = document.createElement("button");
      btn.className = "relic-card";
      btn.innerHTML = `
        <div class="rc-icon">${r.icon}</div>
        <div class="rc-text">
          <div class="rc-name">${r.name}</div>
          <div class="rc-desc">${r.desc}</div>
        </div>`;
      btn.addEventListener("click", () => { FX.sfx.levelup(); pickRelic(r.id); });
      container.appendChild(btn);
    });
  }

  const overlay = el("relicDraft");
  overlay.classList.remove("hidden");
  void overlay.offsetWidth;
  overlay.classList.add("show");
}

function completeFloor() {
  game.playing = false;
  FX.flash("rgba(57,255,139,0.18)");
  FX.sfx.levelup();
  const c = FX.centerOf(qEl);
  FX.burst(c.x, c.y, { count: 40, power: 6, up: 4,
    colors: ["#39ff8b","#ffd23f","#5bd1ff","#fff"] });
  qEl.innerHTML = `FLOOR&nbsp;${game.floor}&nbsp;CLEAR`;
  feedback.className = "feedback good";
  feedback.textContent = "All orders filled. Choose a relic to continue.";
  setTimeout(showRelicDraft, 900);
}

function startNextFloor() {
  game.floor++;
  game.floorOrdersDone = 0;
  game.shieldUsed = false;
  updateHUD();
  generateQuestion();
}

// ─── Core game loop ───────────────────────────────────────────────
function generateQuestion() {
  game.current = makeQuestion();
  game.orders++;
  el("floorNo").textContent  = game.floor;
  el("floorProg").textContent = `${game.floorOrdersDone + 1}/${ORDERS_PER_FLOOR}`;
  qEl.innerHTML = game.current.questionHtml;
  qEl.classList.remove("pop");
  void qEl.offsetWidth;
  qEl.classList.add("pop");
  feedback.className = "feedback";
  feedback.textContent = `Floor ${game.floor} · ${game.mode.toUpperCase()} order — name your price.`;
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
  const ok      = userAns === correct;
  const solved  = `${game.current.question} = ${valueToMixedText(correct)}`;
  const qMode   = game.current.mode;

  if (ok) {
    const elapsed = performance.now() - game.questionStart;
    const speedCutoff = hasRelic("speed") ? 5000 : 3000;
    let speed = 1, speedLabel = "";
    if      (elapsed < speedCutoff) { speed = 1.5; speedLabel = "FAST! "; }
    else if (elapsed < 6000)        { speed = 1.2; }

    game.combo++;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    const mult = comboMult(game.combo);

    // payout with relics
    game.fillCount++;
    let payout = Math.round(BASE_PAYOUT[qMode] * mult * speed / 5) * 5;
    if (hasRelic("bull"))                          payout = Math.round(payout * 1.4);
    if (hasRelic("double") && game.fillCount % 4 === 0) payout *= 2;
    game.cash += payout;

    // xp with relics
    let xpGain = Math.round(20 + mult * 6 + MODE_XP[qMode] + (speed > 1 ? 8 : 0));
    if (hasRelic("xp")) xpGain = Math.round(xpGain * 1.6);
    addXp(xpGain);

    const doubleMsg = hasRelic("double") && game.fillCount % 4 === 0 ? "2×! " : "";
    feedback.className = "feedback good";
    feedback.textContent = `${speedLabel}${doubleMsg}Filled +${fmtCash(payout)}  (x${mult} combo)`;
    addHistory("✓ " + solved, "fill");

    const c = FX.centerOf(qEl);
    FX.burst(c.x, c.y, { count: 12 + mult*3, power: 3 + mult*0.5, up: 2 });
    FX.popup(c.x, c.y - 32, "+" + fmtCash(payout), "gain");
    if (mult >= 3) FX.popup(c.x, c.y - 68, "COMBO x" + mult, "combo");
    FX.sfx.correct(game.combo);
    FX.sfx.coin();
    FX.flash("rgba(57,255,139,0.09)");

    updateHUD();
    if (game.autoNext) setTimeout(nextOrEnd, 480);

  } else {
    // shield relic absorbs first misfill per floor
    if (hasRelic("shield") && !game.shieldUsed) {
      game.shieldUsed = true;
      FX.popup(FX.centerOf(qEl).x, FX.centerOf(qEl).y - 32, "STOP LOSS 🛡", "shield");
    } else {
      game.lives--;
    }
    // carry trade keeps combo
    if (!hasRelic("combo")) game.combo = 0;

    feedback.className = "feedback bad";
    feedback.textContent = `MISFILL — ${valueToMixedText(correct)} (${valueToDecimalText(correct)})`;
    addHistory("✕ " + solved, "miss");

    const c = FX.centerOf(qEl);
    FX.popup(c.x, c.y - 28, game.lives <= 0 ? "WIPED!" : "MISFILL", "loss");
    FX.shake(true);
    FX.flash("rgba(255,77,94,0.20)");
    FX.sfx.wrong();

    updateHUD();
    if (game.lives <= 0) { setTimeout(gameOver, 900); return; }
    if (game.autoNext)   setTimeout(nextOrEnd, 1400);
  }
}

function nextOrEnd() {
  if (game.lives <= 0) { gameOver(); return; }
  game.floorOrdersDone++;
  if (game.floorOrdersDone >= ORDERS_PER_FLOOR) {
    completeFloor();
  } else {
    generateQuestion();
  }
}

function skip() {
  if (!game.playing || !game.current) return;
  if (!hasRelic("combo")) game.combo = 0;
  const correct = game.current.answer;
  feedback.className = "feedback bad";
  feedback.textContent = `Passed — ${valueToMixedText(correct)}`;
  addHistory(`↷ ${game.current.question} = ${valueToMixedText(correct)}`, "skip");
  FX.sfx.click();
  updateHUD();
  setTimeout(nextOrEnd, 700);
}

function startDrill() {
  Object.assign(game, {
    playing: true, current: null,
    cash: 0, xp: 0, level: 1, lives: MAX_LIVES,
    combo: 0, bestCombo: 0, orders: 0,
    floor: 1, floorOrdersDone: 0,
    relics: [], shieldUsed: false, fillCount: 0,
    startedAt: Date.now(), history: []
  });
  el("history").innerHTML = "";
  el("relicDraft").classList.add("hidden");
  el("relicsBar").innerHTML = "";
  el("gameover").classList.remove("show");
  el("gameover").classList.add("hidden");
  FX.setAmbient(true); FX.audio(); FX.sfx.deal();
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
  el("goRank").textContent  = rankFor(game.level).name;
  el("goCash").textContent  = fmtCash(game.cash);
  el("goFloor").textContent = game.floor;
  el("goCombo").textContent = game.bestCombo;
  const go = el("gameover");
  go.classList.remove("hidden");
  void go.offsetWidth;
  go.classList.add("show");
  qEl.textContent = "FLOOR CLOSED";
  feedback.className = "feedback";
  feedback.textContent = "Run over. Press BACK TO THE PIT to try again.";
}

// ─── HUD helpers ──────────────────────────────────────────────────
function rankFor(level) {
  let r = RANKS[0];
  for (const c of RANKS) if (level >= c.min) r = c;
  return r;
}
function xpForLevel(level) { return 100 + (level - 1) * 45; }
function comboMult(combo)  { return Math.min(1 + Math.floor(combo / 3), 8); }
function fmtCash(n)        { return "$" + n.toLocaleString("en-US"); }

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
  game.lives = Math.min(MAX_LIVES_CAP, game.lives + 1);
  const r = rankFor(game.level);
  el("luRank").textContent  = r.name;
  el("luLevel").textContent = game.level;
  const lu = el("levelup");
  lu.classList.remove("hidden", "show");
  void lu.offsetWidth;
  lu.classList.add("show");
  setTimeout(() => { lu.classList.remove("show"); lu.classList.add("hidden"); }, 1600);
  FX.sfx.levelup();
  const c = FX.centerOf(qEl);
  FX.burst(c.x, c.y, { count: 36, power: 6, up: 3, colors: ["#39ff8b","#ffd23f","#5bd1ff"] });
  FX.flash("rgba(57,255,139,0.18)");
}

function updateRelicsBar() {
  const bar = el("relicsBar");
  if (!game.relics.length) {
    bar.innerHTML = '<span class="no-relics">no relics yet</span>';
    return;
  }
  bar.innerHTML = game.relics.map(id => {
    const r = ALL_RELICS.find(x => x.id === id);
    return `<span class="relic-tag" title="${r.name}: ${r.desc}">${r.icon} <b>${r.name}</b></span>`;
  }).join("");
}

function updateHUD() {
  const r = rankFor(game.level);
  el("rank").textContent     = r.name;
  el("rankBadge").textContent = r.badge;
  el("level").textContent    = game.level;
  el("cash").textContent     = fmtCash(game.cash);

  const need = xpForLevel(game.level);
  el("xpBar").style.width    = Math.max(0, Math.min(100, (game.xp / need) * 100)) + "%";
  el("xpText").textContent   = `${game.xp} / ${need} XP`;

  const mult = comboMult(game.combo);
  el("combo").textContent    = "x" + mult;
  el("comboFill").style.width = ((game.combo % 3) / 3 * 100) + "%";
  el("comboWrap").classList.toggle("hot", mult >= 4);

  const lives = el("lives");
  lives.innerHTML = "";
  for (let i = 0; i < MAX_LIVES_CAP; i++) {
    if (i >= Math.max(MAX_LIVES_CAP, game.lives + 1) && i >= game.lives) continue;
    const h = document.createElement("span");
    h.className = "heart" + (i < game.lives ? "" : " dead");
    h.textContent = i < game.lives ? "♥" : "♡";
    lives.appendChild(h);
  }

  updateRelicsBar();
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
  [...activeLevels.map(v => ["LVL", v]), ...activeSpreads.map(v => ["SPR", v])]
    .forEach(([name, value], i) => {
      const div = document.createElement("div");
      const a = document.createElement("span"), b = document.createElement("strong");
      a.textContent = `${name}${i + 1}`; b.textContent = value.toFixed(3);
      div.appendChild(a); div.appendChild(b); board.appendChild(div);
    });
}

// ─── Ticker ───────────────────────────────────────────────────────
function buildTicker() {
  const track = el("tickerTrack");
  const syms = ["VULC","ORB","KSR","MNT","AXL","PIT","DNE","RGX","TLR","BND","EQT","FTR"];
  const items = syms.concat(syms).map(s => {
    const price = (70 + Math.random()*280).toFixed(3);
    const up = Math.random() < 0.5, chg = (Math.random()*3+0.125).toFixed(3);
    return `<span class="tk"><b>${s}</b> ${price} <i class="${up?"up":"dn"}">${up?"▲":"▼"}${chg}</i></span>`;
  });
  const html = items.join('<span class="tk-sep">•</span>');
  track.innerHTML = html + '<span class="tk-sep">•</span>' + html;
}

// ─── Pool management ──────────────────────────────────────────────
function parsePool(text) {
  return text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(Number)
    .filter(n => !isNaN(n) && n >= 70 && n <= 350 && Math.abs(Math.round(n*8)-n*8) < 0.001);
}
function loadPool() {
  const lvlText = el("customLevels").value.trim();
  const sprText = el("customSpreads").value.trim();
  const lvls = lvlText ? parsePool(lvlText) : null;
  const sprs = sprText ? parsePool(sprText) : null;
  const msgs = [];
  if (lvlText && (!lvls || !lvls.length)) { el("poolStatus").textContent = "No valid level numbers."; return; }
  if (sprText && (!sprs || !sprs.length)) { el("poolStatus").textContent = "No valid spread numbers."; return; }
  if (lvls?.length) { activeLevels = lvls; msgs.push(`${lvls.length} levels`); } else activeLevels = LEVEL_NUMBERS;
  if (sprs?.length) { activeSpreads = sprs; msgs.push(`${sprs.length} spreads`); } else activeSpreads = SPREAD_NUMBERS;
  el("poolStatus").textContent = msgs.length ? `Loaded: ${msgs.join(", ")}.` : "Using defaults.";
  renderBoard();
}
function resetPool() {
  activeLevels = LEVEL_NUMBERS; activeSpreads = SPREAD_NUMBERS;
  el("customLevels").value = ""; el("customSpreads").value = "";
  el("poolStatus").textContent = "Reset to defaults."; renderBoard();
}

// ─── Wiring ───────────────────────────────────────────────────────
document.querySelectorAll(".mode").forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});
document.querySelectorAll(".fraction-buttons button").forEach(btn => {
  btn.addEventListener("click", () => {
    let v = input.value.trim();
    const dot = btn.dataset.frac;
    if (/^-?\d+$/.test(v)) input.value = v + dot; else input.value = v + " " + dot;
    input.focus(); FX.sfx.click();
  });
});

el("startBtn").addEventListener("click", startDrill);
el("checkBtn").addEventListener("click", checkAnswer);
el("skipBtn").addEventListener("click", skip);
el("restartBtn").addEventListener("click", () => { el("gameover").classList.add("hidden"); startDrill(); });
el("settingsBtn").addEventListener("click", () => el("settingsPanel").classList.toggle("hidden"));
el("saveSettings").addEventListener("click", saveSettings);
el("loadPoolBtn").addEventListener("click", loadPool);
el("resetPoolBtn").addEventListener("click", resetPool);
el("soundBtn").addEventListener("click", () => {
  const on = !FX.getSound(); FX.setSound(on);
  el("soundBtn").textContent = on ? "🔊" : "🔇";
  if (on) { FX.audio(); FX.sfx.click(); }
});

input.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    if (game.playing && game.current) checkAnswer();
    else if (!game.playing) startDrill();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────
FX.init();
buildTicker();
renderBoard();
updateHUD();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
