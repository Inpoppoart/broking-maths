// PIT BOSS — The Trading Floor  (roguelike edition)
// Floors of orders. Clear floors → draft relics. Every 5th floor is a BOSS.
// Floors roll a market condition. Internal unit = eighths. Math engine unchanged.

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

let activeLevels  = LEVEL_NUMBERS;
let activeSpreads = SPREAD_NUMBERS;
let activeRange   = null; // { min, max } in eighths, or null = use pools

// ─── Roguelike constants ───────────────────────────────────────────
const ORDERS_PER_FLOOR = 5;
const BOSS_EVERY        = 5;
const MAX_LIVES         = 3;
const MAX_LIVES_CAP     = 5;

const ALL_RELICS = [
  { id: "bull",   name: "BULL HORN",   icon: "📈", desc: "+40% cash on every fill." },
  { id: "speed",  name: "HOT WIRE",    icon: "⚡", desc: "Speed bonus triggers at <5 s." },
  { id: "shield", name: "STOP LOSS",   icon: "🛡", desc: "First misfill each floor is free." },
  { id: "double", name: "DOUBLE DOWN", icon: "✦",  desc: "Every 4th fill pays 2× cash." },
  { id: "combo",  name: "CARRY TRADE", icon: "♾",  desc: "Misfills no longer reset combo." },
  { id: "hp",     name: "SECOND WIND", icon: "💚", desc: "Restore 1 life now (max 5)." },
  { id: "xp",     name: "FAST TRACK",  icon: "🎓", desc: "+60% XP on every fill." },
  { id: "cash",   name: "FLOOR BONUS", icon: "💰", desc: "Receive $500 instantly." },
  { id: "clock",  name: "DEEP BREATH", icon: "⏳", desc: "+3 s on every timed order." },
  { id: "crit",   name: "INSIDER TIP", icon: "🎯", desc: "Combo damage to bosses doubled." },
];

// ─── Market conditions (non-boss floors) ───────────────────────────
const CONDITIONS = [
  { id: "calm",   name: "CALM TAPE",   icon: "🌤", desc: "Steady market — 20 s per order.",              limit: 20000, cash: 1.0 },
  { id: "bull",   name: "BULL RUN",    icon: "🐂", desc: "+50% cash this floor — 15 s per order.",        limit: 15000, cash: 1.5 },
  { id: "volat",  name: "VOLATILE",    icon: "🌊", desc: "Orders are timed — 9 s each.",                  limit: 9000,  cash: 1.2 },
  { id: "bear",   name: "BEAR RAID",   icon: "🐻", desc: "Fast & tense — 6 s each, +30% cash.",           limit: 6000,  cash: 1.3 },
  { id: "gold",   name: "GOLDEN HOUR", icon: "✨", desc: "4 relics to draft — 18 s per order.",            limit: 18000, cash: 1.0 },
];

// ─── Bosses (every 5th floor) ──────────────────────────────────────
const BOSSES = [
  { name: "MARGIN CALL",  emoji: "📉", limit: 8000 },
  { name: "THE BEAR",     emoji: "🐻", limit: 7000 },
  { name: "BLACK SWAN",   emoji: "🦢", limit: 6500 },
  { name: "THE WHALE",    emoji: "🐋", limit: 6000 },
  { name: "FLASH CRASH",  emoji: "💥", limit: 5500 },
];

const RANKS = [
  { min: 1,  name: "RUNNER",    badge: "▲" },
  { min: 3,  name: "CLERK",     badge: "◆" },
  { min: 5,  name: "TRADER",    badge: "★" },
  { min: 8,  name: "SR TRADER", badge: "✦" },
  { min: 11, name: "DESK HEAD", badge: "♛" },
  { min: 15, name: "VP",        badge: "⬢" },
  { min: 20, name: "PIT BOSS",  badge: "☼" },
];

const BASE_PAYOUT = { easy: 120, medium: 200, hard: 320, learn: 240 };
const MODE_XP     = { easy: 0,   medium: 6,   hard: 12,  learn: 10  };

const hints = {
  easy:   "10–300, fractions in ⅛. Gentle spread.",
  medium: "10–300, ⅛ fractions, forced carry/borrow (繰り上がり).",
  hard:   "10–300, sixteenths (1/16), forced carry/borrow.",
  mixed:  "Escalates each floor — starts easy, goes hard.",
  learn:  "Targets your weak spots from your stats."
};

// ─── Game state ───────────────────────────────────────────────────
const game = {
  mode: "easy", autoNext: true, playing: false, current: null,
  cash: 0, xp: 0, level: 1, lives: MAX_LIVES,
  combo: 0, bestCombo: 0, orders: 0,
  floor: 1, floorOrdersDone: 0,
  relics: [], shieldUsed: false, fillCount: 0,
  condition: null, boss: null,
  timeLimit: 0, deadline: 0, timerRAF: 0, answering: false,
  startedAt: null, timerId: null, questionStart: 0,
  history: []
};

const best = {
  floor: Number(localStorage.getItem("pb_bestFloor") || 0),
  cash:  Number(localStorage.getItem("pb_bestCash")  || 0)
};

// ─── DOM shortcuts ─────────────────────────────────────────────────
const el = id => document.getElementById(id);
const qEl      = el("question");
const feedback = el("feedback");
const input    = el("answerInput");
const stageEl  = document.querySelector(".stage");

// ─── Math helpers ─────────────────────────────────────────────────
// Internal unit = SIXTEENTHS. 1/8 = 2 units, 1/16 = 1 unit.
const U = 16;                    // units per whole
const RANGE_LO = 10, RANGE_HI = 300;
function toUnits(x) { return Math.round(Number(x) * U); }
function toEighths(x) { return Math.round(Number(x) * 8); } // legacy, pools
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function choice(arr) { return arr[randInt(0, arr.length - 1)]; }
function valueToDecimalText(u) { return (u / U).toFixed(4).replace(/0+$/, "").replace(/\.$/, ""); }
function frac16(u) { return ((u % U) + U) % U; }

const FRAC_PARTS = [
  null,[1,16],[1,8],[3,16],[1,4],[5,16],[3,8],[7,16],
  [1,2],[9,16],[5,8],[11,16],[3,4],[13,16],[7,8],[15,16]
];
const FRAC_TEXT = [
  "","1/16","1/8","3/16","1/4","5/16","3/8","7/16",
  "1/2","9/16","5/8","11/16","3/4","13/16","7/8","15/16"
];

function valueToFracHtml(u) {
  const sign = u < 0 ? "−" : "";
  u = Math.abs(u);
  const whole = Math.floor(u / U), frac = u % U;
  const fr = FRAC_PARTS[frac];
  if (!fr) return sign + whole;
  return `${sign}${whole}<span class="frac"><span>${fr[0]}</span><span>${fr[1]}</span></span>`;
}
function valueToMixedText(u) {
  const sign = u < 0 ? "-" : "";
  u = Math.abs(u);
  const whole = Math.floor(u / U), frac = u % U;
  const f = FRAC_TEXT[frac];
  return sign + whole + (f ? " " + f : "");
}

function parseAnswer(raw) {
  raw = raw.trim()
    .replace("⅛"," 1/8").replace("¼"," 1/4").replace("⅜"," 3/8")
    .replace("½"," 1/2").replace("⅝"," 5/8").replace("¾"," 3/4").replace("⅞"," 7/8");
  if (!raw) return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * U);
  const mixed = raw.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]), num = Number(mixed[2]), den = Number(mixed[3]);
    if (!den) return null;
    return whole * U + (whole < 0 ? -1 : 1) * Math.round((num / den) * U);
  }
  const pure = raw.match(/^(-?\d+)\/(\d+)$/);
  if (pure) { const n=Number(pure[1]),d=Number(pure[2]); if(!d) return null; return Math.round((n/d)*U); }
  return null;
}

function validRange(ans) { return ans >= RANGE_LO*U && ans <= RANGE_HI*U; }

// ─── Price range ──────────────────────────────────────────────────
function parseRangeValue(raw) {
  const e = parseAnswer(raw.trim()); // reuse existing parser: handles 92.5, 92 3/16, etc.
  if (e === null || e < RANGE_LO*U || e > RANGE_HI*U) return null;
  return e;
}
function setRange() {
  const minE = parseRangeValue(el("rangeMinInput").value);
  const maxE = parseRangeValue(el("rangeMaxInput").value);
  const st = el("rangeStatus");
  if (minE === null) { st.textContent = "Invalid 'From' — try 90, 92.5, or 92 3/16 (10–300)."; return; }
  if (maxE === null) { st.textContent = "Invalid 'To' — try 110 or 109.875 (10–300)."; return; }
  if (minE >= maxE)  { st.textContent = "'From' must be less than 'To'."; return; }
  activeRange = { min: minE, max: maxE };
  st.textContent = `Set: ${valueToMixedText(minE)} – ${valueToMixedText(maxE)} (${((maxE - minE) / U).toFixed(3)} wide).`;
}
function clearRange() {
  activeRange = null;
  el("rangeMinInput").value = "";
  el("rangeMaxInput").value = "";
  el("rangeStatus").textContent = "Cleared — using default pools.";
}

// ─── Price range ──────────────────────────────────────────────────
function parseRangeValue(raw) {
  const e = parseAnswer(raw.trim()); // reuse existing parser: handles 92.5, 92 3/8, etc.
  if (e === null || e < 70*8 || e > 350*8) return null;
  return e;
}
function setRange() {
  const minE = parseRangeValue(el("rangeMinInput").value);
  const maxE = parseRangeValue(el("rangeMaxInput").value);
  const st = el("rangeStatus");
  if (minE === null) { st.textContent = "Invalid 'From' — try 90, 92.5, or 92 3/8."; return; }
  if (maxE === null) { st.textContent = "Invalid 'To' — try 110 or 109.875."; return; }
  if (minE >= maxE)  { st.textContent = "'From' must be less than 'To'."; return; }
  activeRange = { min: minE, max: maxE };
  st.textContent = `Set: ${valueToMixedText(minE)} – ${valueToMixedText(maxE)} (${((maxE - minE) / 8).toFixed(3)} wide).`;
}
function clearRange() {
  activeRange = null;
  el("rangeMinInput").value = "";
  el("rangeMaxInput").value = "";
  el("rangeStatus").textContent = "Cleared — using default pools.";
}

// ─── Question builders ────────────────────────────────────────────
// Classify a question into learning categories (3 independent axes).
function computeTags(a, b, op) {
  const fa = frac16(a), fb = frac16(b);
  const sixteenth = (fa % 2 !== 0) || (fb % 2 !== 0);     // any true 1/16 part
  const carry = op === "+" ? (fa + fb >= U) : (fa < fb);   // carry / borrow needed
  return {
    op:   op === "+" ? "add" : "sub",
    frac: sixteenth ? "sixteenth" : "eighth",
    cb:   carry ? "carry" : "plain"
  };
}
function buildQ(aE, bE, op, ans, mode) {
  const t = computeTags(aE, bE, op);
  return {
    question: `${valueToMixedText(aE)} ${op} ${valueToMixedText(bE)}`,
    questionHtml: `${valueToFracHtml(aE)} <span class="op">${op}</span> ${valueToFracHtml(bE)}`,
    answer: ans, mode,
    cats: [t.op, t.frac, t.cb],
    explainer: `${valueToMixedText(aE)} ${op} ${valueToMixedText(bE)} = ${valueToMixedText(ans)}`
  };
}

// Whole-number band for operand A — honours the custom price range if set.
function aWholeBand() {
  if (activeRange) return [Math.ceil(activeRange.min / U), Math.floor(activeRange.max / U)];
  return [RANGE_LO, RANGE_HI];
}

// Core generator. gran = 2 → eighths, 1 → sixteenths.
// force → guarantee a carry (add) / borrow (sub) in the fraction column.
function generatePair({ gran, op, force, bWholeMax = 60 }) {
  const steps = U / gran;
  const [aLo, aHi] = aWholeBand();
  for (let t = 0; t < 250; t++) {
    let fa, fb;
    if (force) {
      if (op === "-") {                       // need frac(a) < frac(b)
        fa = randInt(0, steps - 2) * gran;
        fb = randInt(fa / gran + 1, steps - 1) * gran;
      } else {                                // need frac(a)+frac(b) >= U
        fa = randInt(1, steps - 1) * gran;
        const needSteps = Math.ceil((U - fa) / gran);
        fb = randInt(needSteps, steps - 1) * gran;
      }
    } else {
      fa = randInt(0, steps - 1) * gran;
      fb = randInt(0, steps - 1) * gran;
    }
    let wa, wb;
    if (op === "+") {
      const hiA = Math.min(aHi, RANGE_HI - 1);
      if (aLo > hiA) break;
      wa = randInt(aLo, hiA);
      const room = RANGE_HI - wa - 1;         // leave space for a carry
      if (room < 1) continue;
      wb = randInt(1, Math.min(bWholeMax, room));
    } else {
      const loA = Math.max(aLo, RANGE_LO + 2);
      if (loA > aHi) break;
      wa = randInt(loA, aHi);
      const hi = Math.min(bWholeMax, wa - RANGE_LO - 1); // keep answer >= RANGE_LO
      if (hi < 1) continue;
      wb = randInt(1, hi);
    }
    const a = wa * U + fa, b = wb * U + fb;
    const ans = op === "+" ? a + b : a - b;
    if (validRange(ans)) return { a, b, op, ans };
  }
  // fallback — always yields a valid pair
  const wa = randInt(50, 250), wb = randInt(1, 20);
  const a = wa * U, b = wb * U;
  return op === "-" ? { a, b, op: "-", ans: a - b } : { a, b, op: "+", ans: a + b };
}

const MODE_PARAMS = {
  easy:   { gran: 2, force: false, bMax: 25 },  // 1/8, no forced carry, small spread
  medium: { gran: 2, force: true,  bMax: 60 },  // 1/8, forced carry/borrow
  hard:   { gran: 1, force: true,  bMax: 60 },  // 1/16, forced carry/borrow
};

function makeForMode(mode) {
  if (mode === "learn") {
    const lp = learnParams();
    const p = generatePair({ gran: lp.gran, op: lp.op, force: lp.force, bWholeMax: 60 });
    return buildQ(p.a, p.b, p.op, p.ans, "learn");
  }
  const mp = MODE_PARAMS[mode] || MODE_PARAMS.medium;
  const op = Math.random() < 0.7 ? "-" : "+";  // subtraction-biased
  const p = generatePair({ gran: mp.gran, op, force: mp.force, bWholeMax: mp.bMax });
  return buildQ(p.a, p.b, p.op, p.ans, mode);
}

function makeQuestion() {
  let mode = game.mode;
  if (game.boss) {
    const r = Math.random();
    if (game.floor >= 15) mode = r < 0.75 ? "hard" : "medium";
    else if (game.floor >= 10) mode = r < 0.55 ? "hard" : "medium";
    else mode = r < 0.4 ? "hard" : "medium";
  } else if (mode === "mixed") {
    const r = Math.random();
    if      (game.floor >= 8) mode = r < 0.70 ? "hard" : "medium";
    else if (game.floor >= 5) mode = r < 0.40 ? "hard" : r < 0.80 ? "medium" : "easy";
    else if (game.floor >= 3) mode = r < 0.20 ? "hard" : r < 0.60 ? "medium" : "easy";
    else                      mode = r < 0.20 ? "medium" : "easy";
  }
  return makeForMode(mode);
}

// ─── Learning system ──────────────────────────────────────────────
// Tracks accuracy + speed per category so we can surface weak spots and
// let LEARN mode target them. Persisted in localStorage.
const LEARN_KEY = "pb_learn_v1";
const CATS = [
  { id: "sub",       label: "Subtraction",       axis: "op",   icon: "−" },
  { id: "add",       label: "Addition",          axis: "op",   icon: "+" },
  { id: "carry",     label: "Carry / borrow",    axis: "cb",   icon: "⇄" },
  { id: "plain",     label: "No carry / borrow", axis: "cb",   icon: "·" },
  { id: "sixteenth", label: "Sixteenths (1/16)", axis: "frac", icon: "1/16" },
  { id: "eighth",    label: "Eighths (½ ¼ ⅛)",   axis: "frac", icon: "1/8" },
];
const MIN_SAMPLES = 4;

function loadLearn() {
  try { return JSON.parse(localStorage.getItem(LEARN_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveLearn(s) {
  try { localStorage.setItem(LEARN_KEY, JSON.stringify(s)); } catch (e) {}
}
// Struggle score in [0,1]: 65% error rate + 35% slowness. null if too few samples.
function catScore(b) {
  if (!b || b.n < MIN_SAMPLES) return null;
  const err  = 1 - b.c / b.n;
  const avg  = b.ms / b.n;
  const slow = Math.max(0, Math.min(1, (avg - 2000) / 8000)); // 2s good → 10s bad
  return err * 0.65 + slow * 0.35;
}
function recordResult(correct, ms) {
  if (!game.current || !game.current.cats) return;
  const s = loadLearn();
  const t = Math.min(Math.max(ms, 0), 20000);
  game.current.cats.forEach(id => {
    const b = s[id] || (s[id] = { n: 0, c: 0, ms: 0 });
    b.n++; if (correct) b.c++; b.ms += t;
  });
  saveLearn(s);
  renderWeakSpots();
}
// Pick the weaker side of an axis (higher struggle score); default if no data.
function worseOf(s, aId, bId, def) {
  const sa = catScore(s[aId]), sb = catScore(s[bId]);
  if (sa == null && sb == null) return def;
  if (sa == null) return bId;
  if (sb == null) return aId;
  return sa >= sb ? aId : bId;
}
// LEARN mode targets the weakest side of every axis at once.
function learnParams() {
  const s = loadLearn();
  return {
    op:    worseOf(s, "sub", "add", "sub") === "sub" ? "-" : "+",
    gran:  worseOf(s, "sixteenth", "eighth", "eighth") === "sixteenth" ? 1 : 2,
    force: worseOf(s, "carry", "plain", "carry") === "carry",
  };
}
function resetLearn() {
  try { localStorage.removeItem(LEARN_KEY); } catch (e) {}
  renderWeakSpots();
}
function renderWeakSpots() {
  const wrap = el("weakSpots");
  if (!wrap) return;
  const s = loadLearn();
  const scored = CATS.map(c => ({ ...c, b: s[c.id], score: catScore(s[c.id]) }));
  const ready = scored.filter(c => c.score != null);
  const headline = el("weakHeadline");

  if (!ready.length) {
    if (headline) headline.textContent = "Play a few orders — insights unlock after " + MIN_SAMPLES + " each.";
    wrap.innerHTML = "";
  } else {
    const worst = ready.reduce((m, c) => c.score > m.score ? c : m, ready[0]);
    if (headline) headline.innerHTML = `Focus area: <b>${worst.label}</b>`;
    wrap.innerHTML = scored.map(c => {
      const has = c.b && c.b.n;
      const acc = has ? Math.round(c.b.c / c.b.n * 100) : 0;
      const avg = has ? (c.b.ms / c.b.n / 1000).toFixed(1) + "s" : "—";
      const n   = has ? c.b.n : 0;
      const scorePct = c.score != null ? Math.round(c.score * 100) : 0;
      const cls = c.score != null && c === worst ? " worst" : "";
      const dim = c.score == null ? " dim" : "";
      return `<div class="ws-row${cls}${dim}">
        <span class="ws-label">${c.label}</span>
        <span class="ws-meter"><span class="ws-fill" style="width:${scorePct}%"></span></span>
        <span class="ws-stat">${has ? acc + "% · " + avg + " · n" + n : "no data"}</span>
      </div>`;
    }).join("");
  }
}

// ─── Relics ───────────────────────────────────────────────────────
function hasRelic(id) { return game.relics.includes(id); }

function pickRelic(id) {
  const r = ALL_RELICS.find(r => r.id === id);
  if (r) {
    game.relics.push(id);
    if (id === "hp")   game.lives = Math.min(MAX_LIVES_CAP, game.lives + 1);
    if (id === "cash") game.cash += 500;
  }
  const overlay = el("relicDraft");
  overlay.classList.remove("show"); overlay.classList.add("hidden");
  game.playing = true;
  game.floor++;
  startFloor();
}

function showRelicDraft(extra) {
  const count = (game.condition && game.condition.id === "gold") ? 4 : 3;
  const available = ALL_RELICS.filter(r => !game.relics.includes(r.id))
    .sort(() => Math.random() - 0.5).slice(0, count);

  el("rdFloor").textContent = game.floor;
  el("rdSub").textContent = extra || "PICK A RELIC";
  const container = el("rdOptions");
  container.innerHTML = "";

  if (available.length === 0) {
    container.innerHTML = '<p class="rd-all-done">FULL INVENTORY — onward!</p>';
    setTimeout(() => { el("relicDraft").classList.add("hidden"); game.playing = true; game.floor++; startFloor(); }, 1500);
  } else {
    available.forEach(r => {
      const btn = document.createElement("button");
      btn.className = "relic-card";
      btn.innerHTML = `<div class="rc-icon">${r.icon}</div><div class="rc-text"><div class="rc-name">${r.name}</div><div class="rc-desc">${r.desc}</div></div>`;
      btn.addEventListener("click", () => { FX.sfx.levelup(); pickRelic(r.id); });
      container.appendChild(btn);
    });
  }
  const overlay = el("relicDraft");
  overlay.classList.remove("hidden");
  void overlay.offsetWidth;
  overlay.classList.add("show");
}

// ─── Floor / boss orchestration ───────────────────────────────────
function startFloor() {
  game.floorOrdersDone = 0;
  game.shieldUsed = false;
  const isBoss = game.floor % BOSS_EVERY === 0;

  if (isBoss) {
    const b = BOSSES[(game.floor / BOSS_EVERY - 1) % BOSSES.length];
    const maxHp = 5 + Math.floor(game.floor / BOSS_EVERY) * 2;  // 7,9,11...
    game.boss = { name: b.name, emoji: b.emoji, hp: maxHp, maxHp };
    game.condition = null;
    game.timeLimit = b.limit;
    showBoss();
    showConditionBanner({ icon: b.emoji, name: "BOSS — " + b.name, desc: `Deal ${maxHp} clean fills before you're wiped. Timed ${Math.round(b.limit/1000)}s.` , boss: true});
  } else {
    game.boss = null;
    hideBoss();
    game.condition = (game.floor === 1) ? CONDITIONS[0] : choice(CONDITIONS);
    game.timeLimit = game.condition.limit;
    showConditionBanner(game.condition);
  }
  updateHUD();
  generateQuestion();
}

function completeFloor() {
  game.playing = false;
  stopOrderTimer();
  FX.flash("rgba(57,255,139,0.18)");
  FX.sfx.levelup();
  Chart.pump(20);
  const c = FX.centerOf(qEl);
  FX.burst(c.x, c.y, { count: 38, power: 6, up: 4, colors: ["#39ff8b","#ffd23f","#5bd1ff","#fff"] });
  qEl.innerHTML = `FLOOR&nbsp;${game.floor}&nbsp;CLEAR`;
  feedback.className = "feedback good";
  feedback.textContent = "Orders filled. Draft a relic to continue.";
  setTimeout(() => showRelicDraft(), 850);
}

function showBoss() {
  const p = el("bossPanel");
  el("bossEmoji").textContent = game.boss.emoji;
  el("bossName").textContent = game.boss.name;
  p.classList.remove("hidden");
  updateBossHp();
}
function hideBoss() { el("bossPanel").classList.add("hidden"); }
function updateBossHp() {
  if (!game.boss) return;
  const pct = Math.max(0, game.boss.hp / game.boss.maxHp * 100);
  el("bossHpFill").style.width = pct + "%";
  el("bossHpText").textContent = `${Math.max(0, game.boss.hp)} / ${game.boss.maxHp}`;
}

function damageBoss(dmg) {
  game.boss.hp -= dmg;
  const sprite = el("bossEmoji");
  sprite.classList.remove("hit"); void sprite.offsetWidth; sprite.classList.add("hit");
  updateBossHp();
}

function defeatBoss() {
  game.playing = false;
  stopOrderTimer();
  const reward = 600 + game.floor * 80;
  game.cash += reward;
  Chart.pump(35);
  FX.sfx.levelup();
  const c = FX.centerOf(el("bossPanel"));
  FX.burst(c.x, c.y, { count: 60, power: 8, up: 5, colors: ["#ffd23f","#39ff8b","#fff","#5bd1ff"] });
  FX.flash("rgba(255,210,63,0.22)");
  FX.shake(true);
  el("bossEmoji").classList.add("defeated");
  qEl.innerHTML = `${game.boss.name}&nbsp;DOWN`;
  feedback.className = "feedback good";
  feedback.textContent = `Boss cleared! +${fmtCash(reward)}. Draft your reward.`;
  updateHUD();
  setTimeout(() => { hideBoss(); el("bossEmoji").classList.remove("defeated"); showRelicDraft("BOSS REWARD — PICK A RELIC"); }, 1100);
}

// ─── Order timer (timed conditions / bosses) ──────────────────────
function updateQuestionUrgency(u) {
  qEl.classList.remove("urg-warn", "urg-danger", "urg-rage");
  if      (u > 0.85) qEl.classList.add("urg-rage");
  else if (u > 0.65) qEl.classList.add("urg-danger");
  else if (u > 0.4)  qEl.classList.add("urg-warn");
}

function startOrderTimer() {
  stopOrderTimer();
  Monster.setActive(true);
  const wrap = el("orderTimer");
  if (!game.timeLimit) { wrap.classList.add("hidden"); return; }
  let limit = game.timeLimit + (hasRelic("clock") ? 3000 : 0);
  game.deadline = performance.now() + limit;
  wrap.classList.remove("hidden");
  const bar = el("orderTimerBar");
  const cd  = el("countdown");
  cd.classList.remove("hidden");
  let lastTier = 0, lastBeat = 0;
  const tick = () => {
    if (!game.playing || !game.current) return;
    const now = performance.now();
    const remain = game.deadline - now;
    const pct = Math.max(0, remain / limit * 100);
    bar.style.width = pct + "%";
    bar.classList.toggle("danger", pct < 30);
    const u = 1 - pct / 100;
    Monster.setUrgency(u);
    updateQuestionUrgency(u);

    // big visible countdown
    const secs = Math.max(0, remain / 1000);
    cd.textContent = secs >= 10 ? Math.ceil(secs) : secs.toFixed(1);
    cd.className = "countdown" + (u > 0.85 ? " rage" : u > 0.65 ? " danger" : u > 0.4 ? " warn" : "");

    // whole stage reacts
    stageEl.classList.toggle("danger", u > 0.5 && u <= 0.85);
    stageEl.classList.toggle("rage",   u > 0.85);

    // heartbeat: first beat per tier, then a quickening pulse in the red zone
    const tier = u > 0.85 ? 3 : u > 0.65 ? 2 : u > 0.4 ? 1 : 0;
    if (tier > lastTier && tier >= 2) FX.sfx.heartbeat();
    lastTier = tier;
    if (u > 0.65) {
      const interval = lerp(540, 190, (u - 0.65) / 0.35);
      if (now - lastBeat > interval) {
        FX.sfx.heartbeat();
        FX.sfx.fuse();                // crackling fuse
        lastBeat = now;
        if (u > 0.9) FX.shake(false); // final-seconds panic jitter
      }
    }

    if (remain <= 0) { onOrderTimeout(); return; }
    game.timerRAF = requestAnimationFrame(tick);
  };
  game.timerRAF = requestAnimationFrame(tick);
}
function stopOrderTimer() {
  if (game.timerRAF) cancelAnimationFrame(game.timerRAF);
  game.timerRAF = 0;
  el("orderTimer").classList.add("hidden");
  el("countdown").classList.add("hidden");
  stageEl.classList.remove("danger", "rage");
  Monster.setUrgency(0);
  updateQuestionUrgency(0);
}
function onOrderTimeout() {
  if (!game.current || game.answering) return;
  game.answering = true;
  recordResult(false, performance.now() - game.questionStart);
  Monster.explode();
  stopOrderTimer();
  applyMiss(game.current.answer, "💥 BOOM — TIMED OUT", "BOOM!");
}

// ─── Core loop ────────────────────────────────────────────────────
function generateQuestion() {
  game.current = makeQuestion();
  game.answering = false;
  game.orders++;
  if (game.boss) {
    el("floorMeta").textContent = `FLOOR ${game.floor} · BOSS`;
  } else {
    el("floorMeta").textContent = `FLOOR ${game.floor} · ORDER ${game.floorOrdersDone + 1}/${ORDERS_PER_FLOOR}`;
  }
  qEl.innerHTML = game.current.questionHtml;
  qEl.classList.remove("pop", "urg-warn", "urg-danger", "urg-rage");
  void qEl.offsetWidth;
  qEl.classList.add("pop");
  feedback.className = "feedback";
  feedback.textContent = game.boss ? `Hit ${game.boss.name} — name the price.` : `Name your price.`;
  input.value = "";
  input.focus();
  game.questionStart = performance.now();
  startOrderTimer();
}

function applyMiss(correct, label, popText) {
  if (hasRelic("shield") && !game.shieldUsed) {
    game.shieldUsed = true;
    FX.popup(FX.centerOf(qEl).x, FX.centerOf(qEl).y - 32, "STOP LOSS 🛡", "shield");
  } else {
    game.lives--;
  }
  if (!hasRelic("combo")) game.combo = 0;
  if (game.boss) game.boss.hp = Math.min(game.boss.maxHp, game.boss.hp + 1); // boss heals on miss

  feedback.className = "feedback bad";
  feedback.textContent = `${label} — ${valueToMixedText(correct)} (${valueToDecimalText(correct)})`;
  addHistory("✕ " + game.current.question + " = " + valueToMixedText(correct), "miss");

  const c = FX.centerOf(qEl);
  FX.popup(c.x, c.y - 28, game.lives <= 0 ? "WIPED!" : popText, "loss");
  FX.shake(true);
  FX.flash("rgba(255,77,94,0.20)");
  FX.sfx.wrong();
  Chart.pump(-14);
  updateBossHp();
  updateHUD();
  if (game.lives <= 0) { setTimeout(gameOver, 900); return; }
  if (game.autoNext) setTimeout(nextOrEnd, 1400);
}

function checkAnswer() {
  if (!game.playing || !game.current || game.answering) return;
  const userAns = parseAnswer(input.value);
  if (userAns === null) {
    feedback.className = "feedback bad";
    feedback.textContent = "Enter a price — e.g. 92 5/8 or 92.625.";
    FX.sfx.click();
    return;
  }
  game.answering = true;
  stopOrderTimer();

  const correct = game.current.answer;
  const qMode = game.current.mode;
  const elapsed = performance.now() - game.questionStart;
  recordResult(userAns === correct, elapsed);

  if (userAns === correct) {
    const cutoff = hasRelic("speed") ? 5000 : 3000;
    let speed = 1, speedLabel = "";
    if      (elapsed < cutoff) { speed = 1.5; speedLabel = "FAST! "; }
    else if (elapsed < 6000)   { speed = 1.2; }

    game.combo++;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    const mult = comboMult(game.combo);

    game.fillCount++;
    let payout = Math.round(BASE_PAYOUT[qMode] * mult * speed / 5) * 5;
    if (hasRelic("bull")) payout = Math.round(payout * 1.4);
    if (game.condition) payout = Math.round(payout * game.condition.cash);
    const doubled = hasRelic("double") && game.fillCount % 4 === 0;
    if (doubled) payout *= 2;
    game.cash += payout;

    let xpGain = Math.round(20 + mult * 6 + MODE_XP[qMode] + (speed > 1 ? 8 : 0));
    if (hasRelic("xp")) xpGain = Math.round(xpGain * 1.6);
    addXp(xpGain);

    feedback.className = "feedback good";
    feedback.textContent = `${speedLabel}${doubled ? "2×! " : ""}Filled +${fmtCash(payout)}  (x${mult})`;
    addHistory("✓ " + game.current.question + " = " + valueToMixedText(correct), "fill");

    const c = FX.centerOf(qEl);
    FX.burst(c.x, c.y, { count: 12 + mult*3, power: 3 + mult*0.5, up: 2 });
    FX.popup(c.x, c.y - 32, "+" + fmtCash(payout), "gain");
    if (mult >= 3) FX.popup(c.x, c.y - 68, "COMBO x" + mult, "combo");
    FX.sfx.correct(game.combo); FX.sfx.coin();
    FX.flash("rgba(57,255,139,0.09)");
    Chart.pump(8 + mult);

    if (game.boss) {
      let dmg = 1 + Math.floor(mult / 3);
      if (hasRelic("crit")) dmg += Math.floor(mult / 3);
      if (speed === 1.5) dmg += 1;
      damageBoss(dmg);
      FX.popup(FX.centerOf(el("bossPanel")).x, FX.centerOf(el("bossPanel")).y, "-" + dmg + " HP", "dmg");
      updateHUD();
      if (game.boss.hp <= 0) { defeatBoss(); return; }
      if (game.autoNext) setTimeout(nextOrEnd, 480);
      return;
    }

    updateHUD();
    if (game.autoNext) setTimeout(nextOrEnd, 480);

  } else {
    applyMiss(correct, "MISFILL", "MISFILL");
  }
}

function nextOrEnd() {
  if (game.lives <= 0) { gameOver(); return; }
  if (game.boss) { generateQuestion(); return; }
  game.floorOrdersDone++;
  if (game.floorOrdersDone >= ORDERS_PER_FLOOR) completeFloor();
  else generateQuestion();
}

function skip() {
  if (!game.playing || !game.current || game.answering) return;
  game.answering = true;
  stopOrderTimer();
  if (!hasRelic("combo")) game.combo = 0;
  const correct = game.current.answer;
  feedback.className = "feedback bad";
  feedback.textContent = `Passed — ${valueToMixedText(correct)}`;
  addHistory(`↷ ${game.current.question} = ${valueToMixedText(correct)}`, "skip");
  FX.sfx.click();
  updateHUD();
  setTimeout(nextOrEnd, 650);
}

function startDrill() {
  Object.assign(game, {
    playing: true, current: null, answering: false,
    cash: 0, xp: 0, level: 1, lives: MAX_LIVES,
    combo: 0, bestCombo: 0, orders: 0,
    floor: 1, floorOrdersDone: 0,
    relics: [], shieldUsed: false, fillCount: 0,
    condition: null, boss: null, timeLimit: 0,
    startedAt: Date.now(), history: []
  });
  el("history").innerHTML = "";
  el("relicDraft").classList.add("hidden");
  el("gameover").classList.remove("show"); el("gameover").classList.add("hidden");
  hideBoss();
  Monster.reset();
  Chart.reset();
  FX.setAmbient(true); FX.audio(); FX.sfx.deal();
  clearInterval(game.timerId);
  game.timerId = setInterval(updateTimer, 250);
  startFloor();
}

function gameOver() {
  game.playing = false; game.current = null;
  clearInterval(game.timerId);
  stopOrderTimer();
  Monster.reset();
  FX.setAmbient(false);
  FX.sfx.gameover();

  let newBest = "";
  if (game.floor > best.floor) { best.floor = game.floor; localStorage.setItem("pb_bestFloor", best.floor); newBest = "NEW BEST FLOOR! "; }
  if (game.cash > best.cash)   { best.cash  = game.cash;  localStorage.setItem("pb_bestCash",  best.cash); }

  el("goRank").textContent  = rankFor(game.level).name;
  el("goCash").textContent  = fmtCash(game.cash);
  el("goFloor").textContent = game.floor;
  el("goCombo").textContent = game.bestCombo;
  el("goBest").textContent  = `${newBest}Best: floor ${best.floor} · ${fmtCash(best.cash)}`;
  const go = el("gameover");
  go.classList.remove("hidden"); void go.offsetWidth; go.classList.add("show");
  qEl.textContent = "FLOOR CLOSED";
  feedback.className = "feedback";
  feedback.textContent = "Run over. Press BACK TO THE PIT.";
}

// ─── HUD ──────────────────────────────────────────────────────────
function rankFor(level) { let r = RANKS[0]; for (const c of RANKS) if (level >= c.min) r = c; return r; }
function xpForLevel(level) { return 100 + (level - 1) * 45; }
function comboMult(combo) { return Math.min(1 + Math.floor(combo / 3), 8); }
function fmtCash(n) { return "$" + n.toLocaleString("en-US"); }

function addXp(amount) {
  game.xp += amount;
  let leveled = false;
  while (game.xp >= xpForLevel(game.level)) { game.xp -= xpForLevel(game.level); game.level++; leveled = true; }
  if (leveled) onLevelUp();
}
function onLevelUp() {
  game.lives = Math.min(MAX_LIVES_CAP, game.lives + 1);
  const r = rankFor(game.level);
  el("luRank").textContent = r.name; el("luLevel").textContent = game.level;
  const lu = el("levelup");
  lu.classList.remove("hidden","show"); void lu.offsetWidth; lu.classList.add("show");
  setTimeout(() => { lu.classList.remove("show"); lu.classList.add("hidden"); }, 1500);
  FX.sfx.levelup();
  const c = FX.centerOf(qEl);
  FX.burst(c.x, c.y, { count: 34, power: 6, up: 3, colors: ["#39ff8b","#ffd23f","#5bd1ff"] });
}

function showConditionBanner(cond) {
  const b = el("conditionBanner");
  b.className = "cond-banner" + (cond.boss ? " boss" : "");
  b.innerHTML = `<span class="cb-icon">${cond.icon}</span><span class="cb-name">${cond.name}</span><span class="cb-desc">${cond.desc}</span>`;
  b.classList.remove("hidden","flash"); void b.offsetWidth; b.classList.add("flash");
}

function updateRelicsBar() {
  const bar = el("relicsBar");
  if (!game.relics.length) { bar.innerHTML = '<span class="no-relics">no relics yet</span>'; return; }
  bar.innerHTML = game.relics.map(id => {
    const r = ALL_RELICS.find(x => x.id === id);
    return `<span class="relic-tag" title="${r.name}: ${r.desc}">${r.icon}</span>`;
  }).join("");
}

function updateHUD() {
  const r = rankFor(game.level);
  el("rank").textContent = r.name; el("rankBadge").textContent = r.badge;
  el("level").textContent = game.level;
  el("cash").textContent = fmtCash(game.cash);
  const need = xpForLevel(game.level);
  el("xpBar").style.width = Math.max(0, Math.min(100, (game.xp / need) * 100)) + "%";
  el("xpText").textContent = `${game.xp} / ${need} XP`;
  const mult = comboMult(game.combo);
  el("combo").textContent = "x" + mult;
  el("comboFill").style.width = ((game.combo % 3) / 3 * 100) + "%";
  el("comboWrap").classList.toggle("hot", mult >= 4);
  const lives = el("lives");
  lives.innerHTML = "";
  const shown = Math.max(MAX_LIVES, game.lives);
  for (let i = 0; i < shown; i++) {
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
    li.className = h.cls || ""; li.textContent = h.text;
    list.appendChild(li);
  }
}

function updateTimer() {
  if (!game.startedAt) return;
  const sec = Math.floor((Date.now() - game.startedAt) / 1000);
  el("timer").textContent = `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
}

function setMode(mode) {
  game.mode = mode;
  document.querySelectorAll(".mode").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
  el("modeHint").textContent = hints[mode];
  // sixteenth keypad only where 1/16 answers can appear
  el("frac16").classList.toggle("hidden", !(mode === "hard" || mode === "learn"));
  FX.sfx.click();
  if (!game.playing) {
    qEl.innerHTML = "PRESS&nbsp;DEAL";
    feedback.className = "feedback"; feedback.textContent = "Fill the order. Answer like 92 5/8 or 92.625.";
  }
}

function saveSettings() {
  game.autoNext = el("autoNext").checked;
  el("settingsPanel").classList.add("hidden");
  feedback.className = "feedback"; feedback.textContent = "Settings saved.";
}

function renderBoard() {
  const board = el("boardGrid");
  board.innerHTML = "";
  [...activeLevels.map(v => ["LVL", v]), ...activeSpreads.map(v => ["SPR", v])]
    .forEach(([name, value], i) => {
      const div = document.createElement("div");
      const a = document.createElement("span"), b = document.createElement("strong");
      a.textContent = `${name}${i+1}`; b.textContent = value.toFixed(3);
      div.appendChild(a); div.appendChild(b); board.appendChild(div);
    });
}

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

// ─── Pools ────────────────────────────────────────────────────────
function parsePool(text) {
  return text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(Number)
    .filter(n => !isNaN(n) && n >= RANGE_LO && n <= RANGE_HI && Math.abs(Math.round(n*U)-n*U) < 0.001);
}
function loadPool() {
  const lvlText = el("customLevels").value.trim(), sprText = el("customSpreads").value.trim();
  const lvls = lvlText ? parsePool(lvlText) : null, sprs = sprText ? parsePool(sprText) : null;
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
document.querySelectorAll(".mode").forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
document.querySelectorAll(".fraction-buttons button").forEach(btn => {
  btn.addEventListener("click", () => {
    let v = input.value.trim();
    const dot = btn.dataset.frac;
    input.value = /^-?\d+$/.test(v) ? v + dot : v + " " + dot;
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
el("setRangeBtn").addEventListener("click", setRange);
el("clearRangeBtn").addEventListener("click", clearRange);
el("resetStatsBtn").addEventListener("click", () => { resetLearn(); FX.sfx.click(); });
el("soundBtn").addEventListener("click", () => {
  const on = !FX.getSound(); FX.setSound(on);
  el("soundBtn").textContent = on ? "🔊" : "🔇";
  if (on) { FX.audio(); FX.sfx.click(); }
});
input.addEventListener("keydown", e => {
  if (e.key === "Enter") { if (game.playing && game.current) checkAnswer(); else if (!game.playing) startDrill(); }
});

// ─── Boot ─────────────────────────────────────────────────────────
FX.init();
Chart.init();
Monster.init();
buildTicker();
renderBoard();
renderWeakSpots();
updateHUD();
if (best.floor) { feedback.textContent = `Best run: floor ${best.floor} · ${fmtCash(best.cash)}. Press DEAL.`; }

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
