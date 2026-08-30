// SUBTRACTION DRILL — DOM wiring for the fast loop.
// QUESTION -> ANSWER -> IMMEDIATE FEEDBACK -> NEXT QUESTION. Nothing else in the path.

const el = id => document.getElementById(id);
const qEl = el("question"), fbEl = el("feedback"), inEl = el("answer");

// The answer field is a plain div, not an <input>: on iOS no input element can be
// focused without risking the keyboard or its accessory bar appearing. Entry comes
// from the numpad, or from a physical keyboard via the document-level handler below.
let entry = "", locked = false;
function setEntry(v) {
  entry = v;
  inEl.textContent = v;
  inEl.classList.toggle("empty", !v);
}

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

  // Show only the keys this level can actually need: digits on integer and mixed
  // levels, fractions from stage 3 up. Stage 3 answers are pure fractions, so the
  // digit keys are dead weight there and collapse to a single utility row.
  const needFrac = L.stage >= 3;
  const need16 = L.id === "3C" || L.id === "4D";
  el("fracPad").classList.toggle("hidden", !needFrac);
  el("pad16").classList.toggle("hidden", !need16);
  el("numpad").classList.toggle("utils-only", L.stage === 3);
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
  setEntry("");
  locked = false;
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
  if (!running || !cur || locked) return;
  const raw = entry.trim();
  if (!raw) return;
  const val = Drill.parseAnswer(raw);
  if (val === null) { fbEl.textContent = "?"; fbEl.className = "feedback bad"; return; }

  const ms = performance.now() - askedAt;
  const correct = val === cur.answer;
  locked = true;

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

function setGoLabel() { el("goBtn").textContent = running ? "ANSWER !" : "START"; }

function start() {
  running = true;
  setGoLabel();
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
el("goBtn").addEventListener("click", () => { running ? submit() : start(); });
el("skipBtn").addEventListener("click", skip);
// Physical keyboards are handled at the document level so the answer field never
// needs focus. Keys that belong to a real control are left alone.
document.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target, tag = t && t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SUMMARY") return;
  if (e.key === "Enter") { e.preventDefault(); running ? submit() : start(); return; }
  if (!running || locked) return;
  if (e.key === "Backspace")      { e.preventDefault(); press("del"); }
  else if (e.key === "Escape")    { press("clr"); }
  else if (e.key === "-")         { press("neg"); }
  else if (/^[0-9]$/.test(e.key)) { press(e.key); }
  else if (e.key === "/" || e.key === "." || e.key === " ") { e.preventDefault(); press(e.key); }
});
function press(k) {
  if (k === "del")      setEntry(entry.slice(0, -1));
  else if (k === "clr") setEntry("");
  else if (k === "neg") setEntry(entry.startsWith("-") ? entry.slice(1) : "-" + entry);
  else                  setEntry(entry + k);
  FX.sfx.click();
}

el("numpad").addEventListener("click", e => {
  const b = e.target.closest("button[data-k]");
  if (!b || !running || locked) return;
  press(b.dataset.k);
});
el("numpad").addEventListener("click", e => {
  const b = e.target.closest("button[data-k]");
  if (!b || !running || inEl.disabled) return;
  const k = b.dataset.k, v = inEl.value;
  if (k === "del")      inEl.value = v.slice(0, -1);
  else if (k === "clr") inEl.value = "";
  else if (k === "neg") inEl.value = v.startsWith("-") ? v.slice(1) : "-" + v;
  else                  inEl.value = v + k;
  FX.sfx.click();
});
document.querySelectorAll(".fracpad button").forEach(b => {
  b.addEventListener("click", () => {
    if (!running || locked) return;
    const v = entry.trim();
    setEntry(/\d$/.test(v) ? v + " " + b.dataset.f : v + b.dataset.f);
    FX.sfx.click();
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
  setGoLabel();
  qEl.textContent = "READY"; qEl.className = "question";
  setEntry("");
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
