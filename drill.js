// DRILL — pure training logic. No DOM. Loadable in a browser or under node.
// Internal unit: SIXTEENTHS (U = 16). Every value is an integer count of sixteenths.
const Drill = (() => {
  const U = 16;

  // ─── rendering ──────────────────────────────────────────────────
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a; }
  function fracText(s) {
    s = ((s % U) + U) % U;
    if (!s) return "";
    const g = gcd(s, U);
    return (s / g) + "/" + (U / g);
  }
  function fracParts(s) {
    s = ((s % U) + U) % U;
    if (!s) return null;
    const g = gcd(s, U);
    return [s / g, U / g];
  }
  function mixedText(u) {
    const sign = u < 0 ? "-" : "";
    const a = Math.abs(u);
    const w = Math.floor(a / U), f = fracText(a % U);
    if (!w) return f ? sign + f : "0";
    return sign + w + (f ? " " + f : "");
  }
  function mixedHtml(u) {
    const sign = u < 0 ? "−" : "";
    const a = Math.abs(u);
    const w = Math.floor(a / U), fp = fracParts(a % U);
    const frac = fp ? `<span class="frac"><span>${fp[0]}</span><span>${fp[1]}</span></span>` : "";
    if (!w) return fp ? sign + frac : "0";
    return sign + w + frac;
  }
  // Accepts: 137, 137.5, 137 3/8, 3/8, -3/4, .5
  function parseAnswer(raw) {
    if (raw == null) return null;
    raw = String(raw).trim()
      .replace(/⅛/g, " 1/8").replace(/¼/g, " 1/4").replace(/⅜/g, " 3/8")
      .replace(/½/g, " 1/2").replace(/⅝/g, " 5/8").replace(/¾/g, " 3/4")
      .replace(/⅞/g, " 7/8").replace(/−/g, "-").trim();
    if (!raw) return null;
    let neg = false;
    if (raw[0] === "-") { neg = true; raw = raw.slice(1).trim(); }
    let v = null;
    if (/^\d*\.\d+$|^\d+\.?$/.test(raw)) {
      v = Math.round(parseFloat(raw) * U);
    } else {
      const mixed = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
      const pure  = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (mixed) {
        const d = +mixed[3]; if (!d) return null;
        v = (+mixed[1]) * U + Math.round((+mixed[2] / d) * U);
      } else if (pure) {
        const d = +pure[2]; if (!d) return null;
        v = Math.round((+pure[1] / d) * U);
      }
    }
    if (v === null || !isFinite(v)) return null;
    return neg ? -v : v;
  }

  // ─── generator ──────────────────────────────────────────────────
  // One question shape: a 2-digit price with an eighth, plus or minus another
  // price with an eighth. Everything is built to guarantee its carry/borrow
  // structure rather than sampled and hoped for.
  function ri(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
  function pick(rng, arr) { return arr[ri(rng, 0, arr.length - 1)]; }

  const EIGHTHS = [2, 4, 6, 8, 10, 12, 14];   // 1/8 .. 7/8, never a whole number

  // fracCarry — the eighths column must (or must not) carry into the whole
  // intCarry  — the whole column must (or must not) carry across tens; null = either
  function genPrice({ bDigits, op, fracCarry, intCarry, rng }) {
    const loB = bDigits === 1 ? 1 : 10;
    const hiB = bDigits === 1 ? 9 : 99;
    for (let t = 0; t < 400; t++) {
      const fa = pick(rng, EIGHTHS), fb = pick(rng, EIGHTHS);
      const fc = op === '-' ? fa < fb : (fa + fb) >= U;
      if (fc !== fracCarry) continue;

      const wb = ri(rng, loB, hiB);
      const wa = ri(rng, 10, 99);
      let ic;
      if (op === '-') {
        const eff = wa - (fc ? 1 : 0);          // the fraction borrow comes off first
        if (eff <= wb) continue;                // keep the answer positive
        ic = (eff % 10) < (wb % 10);
      } else {
        ic = (wa % 10) + (wb % 10) + (fc ? 1 : 0) >= 10;
        if (wa + wb + (fc ? 1 : 0) > 199) continue;
      }
      if (intCarry !== null && ic !== intCarry) continue;

      const a = wa * U + fa, b = wb * U + fb;
      const ans = op === '-' ? a - b : a + b;
      if (ans <= 0) continue;
      return { a, b, op, ans, fracCarry: fc, intCarry: ic };
    }
    return null;
  }

  // ─── level ladder ───────────────────────────────────────────────
  // Two families, split by whether the eighths carry and whether the whole
  // numbers carry. Subtraction is weighted more heavily than addition.
  const SUB_BIAS = 1.8;
  function pair(id, shape, tag) {
    return [
      { k: `px.${shape}.sub.${tag}`, op: '-', bias: SUB_BIAS },
      { k: `px.${shape}.add.${tag}`, op: '+', bias: 1 },
    ];
  }
  const LEVELS = [
    { id:'A1', stage:1, name:'2-digit ± 1-digit, clean eighths', target:3500,
      spec:{ bDigits:1, fracCarry:false, intCarry:null }, items: pair('A1','2d1d','clean') },
    { id:'A2', stage:1, name:'2-digit ± 1-digit, eighths carry', target:4200,
      spec:{ bDigits:1, fracCarry:true,  intCarry:null }, items: pair('A2','2d1d','carry') },
    { id:'B1', stage:2, name:'2-digit ± 2-digit, clean eighths', target:4500,
      spec:{ bDigits:2, fracCarry:false, intCarry:false }, items: pair('B1','2d2d','clean') },
    { id:'B2', stage:2, name:'2-digit ± 2-digit, eighths carry', target:5500,
      spec:{ bDigits:2, fracCarry:true,  intCarry:false }, items: pair('B2','2d2d','carry') },
    { id:'B3', stage:2, name:'2-digit ± 2-digit, both carry',    target:6500,
      spec:{ bDigits:2, fracCarry:true,  intCarry:true  }, items: pair('B3','2d2d','both') },
  ];
  const STAGES = [
    { n:1, name:'2 ± 1 DIGIT', blurb:'Price against a small spread' },
    { n:2, name:'2 ± 2 DIGIT', blurb:'Price against a price' },
  ];
  const levelById = id => LEVELS.find(l => l.id === id);
  const levelIndex = id => LEVELS.findIndex(l => l.id === id);

  const SHAPE_NAME = { '2d1d': '2-digit ± 1-digit', '2d2d': '2-digit ± 2-digit' };
  const TAG_NAME   = { clean: 'clean eighths', carry: 'eighths carry', both: 'eighths + tens carry' };
  function patternName(key) {
    const p = key.split('.');           // px.<shape>.<op>.<tag>
    if (p[0] !== 'px') return key;
    return `${SHAPE_NAME[p[1]] || p[1]}, ${p[2] === 'sub' ? 'minus' : 'plus'}, ${TAG_NAME[p[3]] || p[3]}`;
  }
  const catOf = key => key.split('.')[2] === 'add' ? 'add' : 'sub';

  // ─── question construction ──────────────────────────────────────
  function buildQuestion(level, item, rng) {
    const q = genPrice({ ...level.spec, op: item.op, rng });
    if (!q) return null;
    const sign = q.op === '-' ? '−' : '+';
    return {
      text: `${mixedText(q.a)} ${sign} ${mixedText(q.b)}`,
      html: `${mixedHtml(q.a)} <span class="op">${sign}</span> ${mixedHtml(q.b)}`,
      answer: q.ans, key: item.k, cat: catOf(item.k), level: level.id,
      op: q.op, fracCarry: q.fracCarry, intCarry: q.intCarry,
    };
  }
  function itemsFor(level) { return level.items; }

  // ─── statistics ─────────────────────────────────────────────────
  // Learning-design constants.
  const TARGET_P    = 0.85;   // in-session success rate that maximises learning rate
  const P_SIGMA     = 0.18;   // how sharply selection prefers items near TARGET_P
  const CV_GATE     = 0.50;   // response-time consistency required for "automatic"
  const REVIEW_SHARE     = 0.20;      // share of questions drawn from mastered levels
  const INTERLEAVE_SHARE = 0.15;      // share mixed in from earlier levels regardless of due
  const REVIEW_BASE_MS   = 8 * 60000; // first review interval after mastering
  const REVIEW_MAX_STR   = 10;        // interval doubles per pass, up to ~5.7 days
  const WARMUP_N         = 3;         // opening answers of a session: slow, not representative

  const OUTLIER_MS = 20000;               // hard ceiling: above this is not thinking time
  function median(arr) {
    if (!arr || !arr.length) return 0;
    const s = arr.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(arr) { return arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  // Times used for medians exclude hard outliers; they are counted separately.
  function clean(times) { return (times || []).filter(t => t <= OUTLIER_MS); }
  // Coefficient of variation. Automatic retrieval is CONSISTENT; effortful
  // calculation is erratic, so spread separates the two better than the median does.
  function cv(times) {
    const a = clean(times);
    if (a.length < 5) return 0;           // too little to judge — do not block on it
    const m = mean(a);
    if (!m) return 0;
    const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length;
    return Math.sqrt(v) / m;
  }

  // Decisions use recent performance, never lifetime: a learner who has improved
  // must not be held back by mistakes made hundreds of questions ago.
  function recentAcc(agg) {
    if (!agg) return 0;
    const r = agg.r;
    if (r && r.length) return r.reduce((a, b) => a + b, 0) / r.length;
    return agg.n ? agg.c / agg.n : 0;             // pre-window data
  }
  function recentN(agg) {
    if (!agg) return 0;
    return agg.r && agg.r.length ? agg.r.length : (agg.n || 0);
  }

  // Lower bound of the accuracy confidence interval — resists small-sample luck.
  function wilsonLower(x, n, z) {
    if (!n) return 0;
    const p = x / n, d = 1 + z * z / n, c = p + z * z / (2 * n);
    const s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return (c - s) / d;
  }

  const PRIOR = 0.35, SHRINK = 5;         // small-n shrinkage toward a neutral prior
  function weakness(agg, refMedian) {
    if (!agg || !agg.n) return PRIOR;
    const err = 1 - recentAcc(agg);
    const med = median(clean(agg.t));
    let slow = 0;
    if (refMedian > 0 && med > 0) slow = Math.max(0, Math.min(1, (med / refMedian - 1) / 1.2));
    const raw = 0.6 * err + 0.4 * slow;
    const n = recentN(agg);
    return (raw * n + PRIOR * SHRINK) / (n + SHRINK);
  }

  // ─── adaptive selection ─────────────────────────────────────────
  // Prefer items whose predicted success sits near TARGET_P. Items you almost
  // always get right teach little; items you almost always miss teach little too.
  function difficultyFit(agg) {
    if (!agg || recentN(agg) < 3) return 1;      // unknown difficulty — stay neutral
    const p = recentAcc(agg);
    // Asymmetric on purpose: too easy is worse than too hard. An item you always
    // get right teaches nothing, whereas one you often miss still has headroom.
    const sigma = p > TARGET_P ? P_SIGMA : P_SIGMA * 1.8;
    const dz = (p - TARGET_P) / sigma;
    return Math.exp(-0.5 * dz * dz);
  }

  // Weight rises with weakness but never reaches zero, so nothing starves.
  const FLOOR = 0.15;
  function chooseItem(level, stats, rng, lastKey) {
    const items = itemsFor(level);
    if (items.length === 1) return items[0];
    const meds = items.map(it => median(clean((stats[it.k] || {}).t))).filter(m => m > 0);
    const ref = meds.length ? median(meds) : 0;
    const weights = items.map(it => {
      const agg = stats[it.k];
      let w = (FLOOR + (0.15 + weakness(agg, ref)) * difficultyFit(agg)) * (it.bias || 1);
      if (it.k === lastKey) w *= 0.35;    // discourage immediate repeats
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  // ─── progression ────────────────────────────────────────────────
  const MIN_N = 20, ACC_GATE = 0.95, WILSON_FLOOR = 0.85, Z = 1.96;
  const TEST_EVERY = 40;           // one promotion test per fully-refreshed window (= CAP_LVL)
  const DEMOTE_ACC = 0.70;         // clearly out of depth -> step back down
  function gate(level, agg) {
    if (!agg || recentN(agg) < MIN_N) {
      return { ok: false, reason: `${recentN(agg)}/${MIN_N} answered at this level` };
    }
    const acc = recentAcc(agg), med = median(clean(agg.t));
    const nr = recentN(agg);
    const lower = wilsonLower(acc * nr, nr, Z);
    const fast = med > 0 && med <= level.target;
    if (acc >= ACC_GATE && lower < WILSON_FLOOR) {
      return { ok: false, reason: `${(acc*100).toFixed(0)}% so far — keep going to confirm it` };
    }
    if (acc < ACC_GATE) {
      // Fast but inaccurate is the failure mode the brief calls out explicitly.
      return { ok: false, fastButInaccurate: fast,
               reason: fast ? `Fast (${(med/1000).toFixed(1)}s) but only ${(acc*100).toFixed(0)}% accurate — slow down, accuracy first`
                            : `${(acc*100).toFixed(0)}% accurate — need ${ACC_GATE*100}%` };
    }
    if (!fast) return { ok: false, reason: `${(acc*100).toFixed(0)}% accurate — now get median under ${(level.target/1000).toFixed(1)}s (at ${(med/1000).toFixed(1)}s)` };
    // Fast on average but erratic means you are still calculating, not recalling.
    const spread = cv(agg.t);
    if (spread > CV_GATE) {
      return { ok: false, uneven: true,
               reason: `${(med/1000).toFixed(1)}s but uneven — still working them out, not recalling` };
    }
    return { ok: true, reason: `${(acc*100).toFixed(0)}% at ${(med/1000).toFixed(1)}s, steady — ready to advance` };
  }
  function gateOpen(id, stats) {
    const l = levelById(id);
    if (!l || !l.gate) return true;
    return l.gate.every(g => { const lg = levelById(g); return lg && gate(lg, stats[g]).ok; });
  }

  // ─── persistence ────────────────────────────────────────────────
  const KEY = 'md_v1';
  const CAP_PAT = 30, CAP_LVL = 40, CAP_DAY = 300, KEEP_DAYS = 14;
  function blank() { return { v: 1, level: LEVELS[0].id, auto: true, pat: {}, lvl: {}, days: {} }; }
  function load(storage) {
    const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!ls) return blank();
    try {
      const s = JSON.parse(ls.getItem(KEY));
      if (!s || s.v !== 1) return blank();
      s.pat = s.pat || {}; s.lvl = s.lvl || {}; s.days = s.days || {};
      // Saved progress from an older ladder: drop what no longer exists, so stale
      // pattern keys cannot surface in the dashboard as a "weakest pattern".
      if (!levelById(s.level)) s.level = LEVELS[0].id;
      for (const k of Object.keys(s.pat)) if (k.indexOf('px.') !== 0) delete s.pat[k];
      for (const k of Object.keys(s.lvl)) if (!levelById(k)) delete s.lvl[k];
      return s;
    } catch (e) { return blank(); }
  }
  function save(s, storage) {
    const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!ls) return;
    try { ls.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function dayKey(now) {
    const d = new Date(now);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function bump(bucket, correct, ms, cap, countTime) {
    bucket.n++; if (correct) bucket.c++;          // lifetime totals, for "how much have I done"
    bucket.r = bucket.r || [];
    bucket.r.push(correct ? 1 : 0);               // rolling window, for every DECISION
    // Warm-up answers are slow but not less accurate, so their correctness counts
    // and their timing does not.
    if (countTime !== false) {
      bucket.t.push(ms);
      if (bucket.t.length > cap) bucket.t.splice(0, bucket.t.length - cap);
    }
    if (bucket.r.length > cap) bucket.r.splice(0, bucket.r.length - cap);
  }
  function record(s, q, correct, ms, now, opts) {
    opts = opts || {};
    ms = Math.max(0, Math.round(ms));
    const nowMs = now == null ? Date.now() : now;
    const timed = !opts.warmup;
    const dk = dayKey(nowMs);
    s.pat[q.key] = s.pat[q.key] || { n: 0, c: 0, t: [] };
    s.lvl[q.level] = s.lvl[q.level] || { n: 0, c: 0, t: [] };
    s.days[dk] = s.days[dk] || { n: 0, c: 0, t: [], best: 0, cat: {} };
    const day = s.days[dk];
    day.cat[q.cat] = day.cat[q.cat] || { n: 0, c: 0, t: [] };
    bump(s.pat[q.key], correct, ms, CAP_PAT, timed);
    bump(s.lvl[q.level], correct, ms, CAP_LVL, timed);
    const lv = s.lvl[q.level];
    lv.since = (lv.since || 0) + 1;
    // Interleaved questions are background variety, not a scheduled review: if they
    // reset the clock the expanding intervals never get a chance to run.
    if (opts.mode !== "interleave") lv.seen = nowMs;
    if (opts.mode === "review") {                        // expanding interval on success
      lv.str = correct ? Math.min((lv.str || 0) + 1, REVIEW_MAX_STR) : Math.max(0, (lv.str || 0) - 1);
    }
    bump(day, correct, ms, CAP_DAY, timed);
    bump(day.cat[q.cat], correct, ms, CAP_DAY, timed);
    if (correct && ms <= OUTLIER_MS && (!day.best || ms < day.best)) day.best = ms;
    const keys = Object.keys(s.days).sort();
    while (keys.length > KEEP_DAYS) delete s.days[keys.shift()];
    return s;
  }

  // ─── dashboard ──────────────────────────────────────────────────
  function weakestIn(s, cat) {
    let worst = null, worstScore = -1;
    const meds = Object.keys(s.pat).filter(k => catOf(k) === cat)
      .map(k => median(clean(s.pat[k].t))).filter(m => m > 0);
    const ref = meds.length ? median(meds) : 0;
    for (const k of Object.keys(s.pat)) {
      if (catOf(k) !== cat) continue;
      const agg = s.pat[k];
      if (!agg || agg.n < 5) continue;            // need real evidence before naming it
      const w = weakness(agg, ref);
      if (w > worstScore) { worstScore = w; worst = k; }
    }
    return worst ? { key: worst, name: patternName(worst), score: worstScore,
                     n: s.pat[worst].n, acc: recentAcc(s.pat[worst]),
                     med: median(clean(s.pat[worst].t)) } : null;
  }
  function summary(s, now) {
    const dk = dayKey(now == null ? Date.now() : now);
    const day = s.days[dk] || { n: 0, c: 0, t: [], best: 0, cat: {} };
    const t = clean(day.t);
    const catStat = c => {
      const b = (day.cat || {})[c];
      if (!b || !b.n) return null;
      return { n: b.n, acc: b.c / b.n, med: median(clean(b.t)) };
    };
    return {
      today: {
        n: day.n,
        acc: day.n ? day.c / day.n : 0,
        median: median(t), mean: mean(t), best: day.best || 0,
        outliers: (day.t || []).length - t.length,
      },
      cats: { sub: catStat('sub'), add: catStat('add') },
      weakest: { sub: weakestIn(s, 'sub'), add: weakestIn(s, 'add') },
    };
  }

  // ─── spaced review + interleaving ───────────────────────────────
  // Levels you have already worked through. Kept in the pool even if a bad review
  // has knocked them below the gate, otherwise a lapse would stop you revisiting it.
  function reviewPool(s) {
    const i = levelIndex(s.level);
    return LEVELS.slice(0, Math.max(0, i)).map(L => L.id).filter(id => recentN(s.lvl[id]) >= 5);
  }
  function reviewInterval(str) { return REVIEW_BASE_MS * Math.pow(2, Math.min(str || 0, REVIEW_MAX_STR)); }
  function reviewUrgency(s, id, now) {
    const a = s.lvl[id];
    if (!a) return 0;
    return (now - (a.seen || 0)) / reviewInterval(a.str);
  }
  // Where the next question comes from: due review, interleaved earlier work, or
  // the level you are actually training.
  function chooseSource(s, now, rng) {
    const pool = reviewPool(s);
    if (!pool.length) return { id: s.level, mode: "current" };
    const r = rng();
    if (r < REVIEW_SHARE) {
      const due = pool.filter(id => reviewUrgency(s, id, now) >= 1)
                      .sort((a, b) => reviewUrgency(s, b, now) - reviewUrgency(s, a, now));
      if (due.length) return { id: due[Math.floor(rng() * Math.min(due.length, 3))], mode: "review" };
      // Nothing is actually due — spend the budget on the growth edge rather than
      // padding the session with material that does not need revisiting.
      return { id: s.level, mode: "current" };
    }
    if (r < REVIEW_SHARE + INTERLEAVE_SHARE) {
      return { id: pool[Math.floor(rng() * pool.length)], mode: "interleave" };
    }
    return { id: s.level, mode: "current" };
  }

  // Adaptive level pick: stay put until the gate opens, then step up.
  function nextLevel(s) {
    const i = levelIndex(s.level);
    const cur = LEVELS[i];
    const agg = s.lvl[cur.id];
    // Only test for promotion once per window of FRESH evidence. Re-testing an
    // overlapping sliding window after every answer would let a mediocre run
    // pass by luck sooner or later.
    if (!agg || (agg.since || 0) < TEST_EVERY) return cur.id;
    const passed = gate(cur, agg).ok;
    const acc = recentAcc(agg);
    agg.since = 0;                                  // consume this test either way
    if (!passed) {
      // Out of depth (possibly a lucky promotion earlier) — step back down so the
      // user drills what they can actually do. Promotion is self-correcting.
      if (acc < DEMOTE_ACC && i > 0) return LEVELS[i - 1].id;
      return cur.id;
    }
    const nxt = LEVELS[i + 1];
    if (!nxt) return cur.id;
    if (gateOpen(nxt.id, s.lvl)) return nxt.id;
    // Next level is gated shut. Never leapfrog it — send the user to the
    // prerequisite they have not mastered, so they drill what unblocks them.
    const unmet = (nxt.gate || []).find(g => !gate(levelById(g), s.lvl[g]).ok);
    return unmet || cur.id;
  }

  return { U, gcd, fracText, fracParts, mixedText, mixedHtml, parseAnswer,
           ri, pick, genPrice, EIGHTHS,
           LEVELS, STAGES, levelById, levelIndex, itemsFor, buildQuestion, patternName, catOf,
           median, mean, clean, cv, weakness, difficultyFit, chooseItem, gate, gateOpen, recentAcc, recentN,
           chooseSource, reviewPool, reviewUrgency, reviewInterval,
           blank, load, save, record, summary, dayKey, nextLevel, weakestIn, wilsonLower,
           OUTLIER_MS, MIN_N, ACC_GATE, TEST_EVERY, DEMOTE_ACC, KEY,
           TARGET_P, CV_GATE, REVIEW_SHARE, INTERLEAVE_SHARE, WARMUP_N };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Drill;
