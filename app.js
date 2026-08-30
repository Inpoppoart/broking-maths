// SUBTRACTION DRILL — DOM wiring for the fast loop.
// QUESTION -> ANSWER -> IMMEDIATE FEEDBACK -> NEXT QUESTION. Nothing else in the path.

const el = id => document.getElementById(id);
const qEl = el("question"), fbEl = el("feedback"), inEl = el("answer");

const CORRECT_MS = 260;    // just long enough to register "yes"
const WRONG_MS   = 1900;   // long enough to actually read the right answer

let S = Drill.load();
let cur = null;            // current question
let askedAt = 0;           // performance.now() when the question became readable
let running = false;
let streak = 0;
let advanceTimer = 0;
const rng = Math.random;

// ─── level display ────────────────────────────────────────────────
function curLevel() { return Drill.levelById(S.level) || Drill.LEVELS[0]; }

function paintLevel() {
  const L = curLevel();
  const st = Drill.STAGES.find(s => s.n === L.stage);
  el("stageTag").textContent = `STAGE ${L.stage} · ${st ? st.name : ""}`;
  el("levelName").textContent = L.name;

  const agg = S.lvl[L.id];
  const g = Drill.gate(L, agg);
  const n = (agg && agg.n) || 0;
  el("gateFill").style.width = Math.min(100, n / Drill.MIN_N * 100) + "%";
  el("gateFill").className = "gatefill" + (g.ok ? " ready" : g.fastButInaccurate ? " warn" : "");
  el("gateText").textContent = g.reason;

  // fraction pads only where fractions can appear
  const needFrac = L.stage >= 3;
  const need16 = L.id === "3C" || L.id === "4D";
  el("fracPad").classList.toggle("hidden", !needFrac);
  el("pad16").classList.toggle("hidden", !need16);
}

// ─── the loop ─────────────────────────────────────────────────────
function nextQuestion() {
  const L = curLevel();
  const item = Drill.chooseItem(L, S.pat, rng, cur && cur.key);
  let q = Drill.buildQuestion(L, item, rng);
  if (!q) q = Drill.buildQuestion(L, Drill.itemsFor(L)[0], rng);
  cur = q;
  qEl.innerHTML = q.html;
  qEl.className = "question";
  fbEl.textContent = "";
  fbEl.className = "feedback";
  inEl.value = "";
  inEl.disabled = false;
  inEl.focus();
  // Clock starts once the question is actually painted, so we measure thinking
  // time rather than render time. Seed it synchronously so it can never be stale
  // from the previous question if the frame callbacks have not run yet.
  askedAt = performance.now();
  const forQ = cur;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (cur === forQ) askedAt = performance.now();
  }));
}

function submit() {
  if (!running || !cur || inEl.disabled) return;
  const raw = inEl.value.trim();
  if (!raw) return;
  const val = Drill.parseAnswer(raw);
  if (val === null) { fbEl.textContent = "?"; fbEl.className = "feedback bad"; return; }

  const ms = performance.now() - askedAt;
  const correct = val === cur.answer;
  inEl.disabled = true;

  Drill.record(S, cur, correct, ms, Date.now());

  if (correct) {
    streak++;
    qEl.className = "question ok";
    fbEl.className = "feedback good";
    fbEl.textContent = (ms / 1000).toFixed(1) + "s";
    if (streak > 0 && streak % 10 === 0) FX.sfx.streak(streak); else FX.sfx.correct();
  } else {
    streak = 0;
    qEl.className = "question no";
    fbEl.className = "feedback bad";
    fbEl.innerHTML = `${Drill.mixedHtml(cur.answer)} <span class="was">— you said ${esc(raw)}</span>`;
    FX.sfx.wrong();
  }
  el("streak").textContent = streak;
  paintToday();
  paintLevel();
  // Never let a promotion banner overwrite the correct answer the user still needs to read.
  maybeAdvanceLevel(correct);
  Drill.save(S);   // after maybeAdvanceLevel: it consumes the promotion test via agg.since

  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(nextQuestion, correct ? CORRECT_MS : WRONG_MS);
}

function skip() {
  if (!running || !cur) return;
  clearTimeout(advanceTimer);
  streak = 0;
  el("streak").textContent = 0;
  nextQuestion();
}

function maybeAdvanceLevel(announce) {
  if (!S.auto) return;
  const from = S.level;
  const nxt = Drill.nextLevel(S);
  if (nxt === from) return;
  const up = Drill.levelIndex(nxt) > Drill.levelIndex(from);
  S.level = nxt;
  Drill.save(S);
  const L = curLevel();
  if (announce) {
    if (up) FX.sfx.promote();
    fbEl.className = "feedback promote";
    fbEl.textContent = `${up ? "LEVEL UP →" : "STEPPING BACK →"} ${L.name}`;
  }
  paintLevel();
  paintLadder();
}

function start() {
  running = true;
  el("goBtn").textContent = "RESTART";
  FX.audio();
  streak = 0;
  el("streak").textContent = 0;
  nextQuestion();
}

// ─── dashboard ────────────────────────────────────────────────────
const secs = ms => ms ? (ms / 1000).toFixed(2) + "s" : "—";
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

function paintToday() {
  const s = Drill.summary(S);
  el("tQ").textContent = s.today.n;
  el("tAcc").textContent = s.today.n ? (s.today.acc * 100).toFixed(1) + "%" : "—";
  el("tMed").textContent = secs(s.today.median);
  el("tAvg").textContent = secs(s.today.mean);
  el("tBest").textContent = secs(s.today.best);

  const CATS = [["int", "INTEGER"], ["frac", "FRACTIONS"], ["mixed", "MIXED"]];
  el("catRows").innerHTML = CATS.map(([k, label]) => {
    const c = s.cats[k];
    return `<div class="cat-row"><span class="cr-k">${label}</span>` +
      (c ? `<span class="cr-med">${secs(c.med)}</span><span class="cr-sub">${(c.acc*100).toFixed(0)}% · ${c.n}</span>`
         : `<span class="cr-med dim">—</span><span class="cr-sub dim">no data today</span>`) + `</div>`;
  }).join("");

  el("weakRows").innerHTML = CATS.map(([k, label]) => {
    const w = s.weakest[k];
    return `<div class="weak-row"><span class="wk-k">Weakest ${label.toLowerCase()}</span>` +
      (w ? `<span class="wk-n">${w.name}</span><span class="wk-s">${(w.acc*100).toFixed(0)}% · ${secs(w.med)} · n${w.n}</span>`
         : `<span class="wk-n dim">not enough data yet</span>`) + `</div>`;
  }).join("");
}

function paintLadder() {
  const curIdx = Drill.levelIndex(S.level);
  el("ladder").innerHTML = Drill.LEVELS.map((L, i) => {
    const agg = S.lvl[L.id];
    const g = Drill.gate(L, agg);
    const locked = !Drill.gateOpen(L.id, S.lvl);
    const cls = L.id === S.level ? "on" : g.ok ? "done" : locked ? "locked" : i < curIdx ? "done" : "";
    const stat = agg && agg.n
      ? `${(agg.c / agg.n * 100).toFixed(0)}% · ${secs(Drill.median(Drill.clean(agg.t)))}`
      : (locked ? "locked" : "—");
    return `<button class="lv ${cls}" data-lv="${L.id}"${locked ? " disabled" : ""}>` +
      `<span class="lv-id">${L.id}</span><span class="lv-nm">${L.name}</span><span class="lv-st">${stat}</span></button>`;
  }).join("");
  el("ladder").querySelectorAll("button[data-lv]").forEach(b => {
    b.addEventListener("click", () => {
      S.level = b.dataset.lv;
      S.auto = false;
      el("autoLevel").checked = false;
      Drill.save(S);
      paintLevel(); paintLadder();
      if (running) { clearTimeout(advanceTimer); nextQuestion(); }
    });
  });
}

// ─── wiring ───────────────────────────────────────────────────────
el("goBtn").addEventListener("click", start);
el("skipBtn").addEventListener("click", skip);
inEl.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); running ? submit() : start(); }
});
document.querySelectorAll(".fracpad button").forEach(b => {
  b.addEventListener("click", () => {
    const v = inEl.value.trim();
    inEl.value = /\d$/.test(v) ? v + " " + b.dataset.f : v + b.dataset.f;
    inEl.focus();
  });
});
el("autoLevel").addEventListener("change", e => {
  S.auto = e.target.checked; Drill.save(S);
  if (S.auto) { S.level = Drill.nextLevel(S); Drill.save(S); paintLevel(); paintLadder(); }
});
el("soundChk").addEventListener("change", e => FX.setSound(e.target.checked));
el("resetBtn").addEventListener("click", () => {
  if (!confirm("Erase all drill history and progress?")) return;
  S = Drill.blank(); Drill.save(S);
  running = false; cur = null; streak = 0;
  el("goBtn").textContent = "START";
  qEl.textContent = "READY"; qEl.className = "question";
  fbEl.textContent = "Press START"; fbEl.className = "feedback";
  el("streak").textContent = "0";
  paintLevel(); paintToday(); paintLadder();
});

// ─── boot ─────────────────────────────────────────────────────────
el("autoLevel").checked = S.auto !== false;
el("soundChk").checked = FX.getSound();
if (S.auto) { S.level = Drill.nextLevel(S); Drill.save(S); }
paintLevel(); paintToday(); paintLadder();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
