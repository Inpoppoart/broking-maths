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

  // ─── generators ─────────────────────────────────────────────────
  function ri(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
  function pick(rng, arr) { return arr[ri(rng, 0, arr.length - 1)]; }

  // Digits are chosen directly so the borrow structure is guaranteed.
  function genInt({ aDigits, bDigits, borrow, rng }) {
    const need = (lo, hi) => ri(rng, lo, hi);
    for (let attempt = 0; attempt < 200; attempt++) {
      let a, b;
      if (bDigits === 1) {
        const u  = borrow === 'none' ? need(1, 9) : need(0, 8);
        const bu = borrow === 'none' ? need(1, u) : need(u + 1, 9);
        if (aDigits === 2) {
          if (borrow === 'tens' || borrow === 'cascade') continue; // impossible
          a = need(1, 9) * 10 + u;
        } else {
          const t = borrow === 'cascade' ? 0 : borrow === 'units' ? need(1, 9) : need(0, 9);
          a = need(1, 9) * 100 + t * 10 + u;
        }
        b = bu;
      } else if (bDigits === 2) {
        const u  = borrow === 'none' ? need(1, 9) : need(0, 8);
        const bu = borrow === 'none' ? need(0, u) : need(u + 1, 9);
        let t, bt;
        if (borrow === 'none') { t = need(1, 9); bt = need(1, t); }
        else if (borrow === 'units') { t = need(1, 9); bt = need(1, t); if (t - 1 < bt) continue; }
        else if (borrow === 'cascade') { t = 0; bt = need(1, 9); }
        else { t = need(1, 8); bt = need(t + 1, 9); }
        const h = aDigits === 3 ? need(1, 9) : 0;
        a = h * 100 + t * 10 + u;
        b = bt * 10 + bu;
      } else {
        const u  = borrow === 'none' ? need(1, 9) : need(0, 8);
        const bu = borrow === 'none' ? need(0, u) : need(u + 1, 9);
        let t, bt;
        if (borrow === 'none') { t = need(1, 9); bt = need(0, t); }
        else if (borrow === 'units') { t = need(1, 9); bt = need(0, t - 1); }
        else if (borrow === 'cascade') { t = 0; bt = need(1, 9); }
        else { t = need(0, 8); bt = need(t + 1, 9); }
        const bh = need(1, 8);
        const hMin = bh + ((t - (borrow === 'none' ? 0 : 1)) < bt ? 1 : 0);
        if (hMin > 9) continue;
        const h = need(hMin, 9);
        a = h * 100 + t * 10 + u;
        b = bh * 100 + bt * 10 + bu;
      }
      if (b <= 0 || a - b <= 0) continue;
      if (String(a).length !== aDigits || String(b).length !== bDigits) continue;
      return { a, b, ans: a - b };
    }
    return null;
  }

  function borrowShape(a, b) {
    const au = a % 10, at = Math.floor(a / 10) % 10;
    const bu = b % 10, bt = Math.floor(b / 10) % 10;
    const uB = au < bu;
    const tB = (at - (uB ? 1 : 0)) < bt;
    return { unitsBorrow: uB, tensBorrow: tB, cascade: uB && at === 0 && tB };
  }

  const EIGHTHS = [2, 4, 6, 8, 10, 12, 14];
  const SIXTEENTHS = [1, 3, 5, 7, 9, 11, 13, 15];
  function spaceFor(level) {
    const out = [];
    if (level === '3A' || level === '3B') {
      for (const a of EIGHTHS) for (const b of EIGHTHS) {
        if (a === b) continue;
        if (level === '3A' && a > b) out.push([a, b]);
        if (level === '3B' && a < b) out.push([a, b]);
      }
    } else {
      const all = EIGHTHS.concat(SIXTEENTHS);
      for (const a of all) for (const b of all) {
        if (a === b) continue;
        if (a % 2 === 0 && b % 2 === 0) continue;
        out.push([a, b]);
      }
    }
    return out;
  }
  const SPACE = { '3A': spaceFor('3A'), '3B': spaceFor('3B'), '3C': spaceFor('3C') };

  function genMixed({ rng, intSpec, fracBorrow, allowSixteenths }) {
    const pool = allowSixteenths ? EIGHTHS.concat(SIXTEENTHS) : EIGHTHS.slice();
    let fa = 0, fb = 0;
    for (let i = 0; i < 200; i++) {
      fa = pick(rng, pool.concat([0]));
      fb = pick(rng, pool);
      if (fracBorrow ? fa < fb : fa >= fb) break;
    }
    if (fracBorrow && !(fa < fb)) { fa = 0; fb = pick(rng, pool); }
    if (!fracBorrow && !(fa >= fb)) { fb = 0; }
    const iq = genInt({ ...intSpec, rng });
    if (!iq) return null;
    return { a: iq.a * U + fa, b: iq.b * U + fb, ans: iq.a * U + fa - (iq.b * U + fb), fa, fb, ia: iq.a, ib: iq.b };
  }


  // ─── level ladder ───────────────────────────────────────────────
  const iv = (k, aDigits, bDigits, borrow) => ({ k, cat: 'int', spec: { aDigits, bDigits, borrow } });
  const mv = (k, intSpec, fracBorrow, allowSixteenths) =>
    ({ k, cat: 'mixed', mixed: { intSpec, fracBorrow, allowSixteenths } });

  const LEVELS = [
    { id:'1A', stage:1, name:'2-digit − 1-digit',        target:2600, items:[iv('int.2d1d.none',2,1,'none'), iv('int.2d1d.units',2,1,'units')] },
    { id:'1B', stage:1, name:'2-digit − 2-digit, clean', target:2800, items:[iv('int.2d2d.none',2,2,'none')] },
    { id:'1C', stage:1, name:'2-digit − 2-digit, borrow',target:3200, items:[iv('int.2d2d.units',2,2,'units')] },
    { id:'1D', stage:1, name:'3-digit − 1-digit',        target:3000, items:[iv('int.3d1d.none',3,1,'none'), iv('int.3d1d.units',3,1,'units'), iv('int.3d1d.cascade',3,1,'cascade')] },
    { id:'1E', stage:1, name:'3-digit − 2-digit',        target:3800, items:[iv('int.3d2d.none',3,2,'none'), iv('int.3d2d.units',3,2,'units')] },

    { id:'2A', stage:2, name:'3-digit − 2-digit, borrow',   target:4200, items:[iv('int.3d2d.units',3,2,'units'), iv('int.3d2d.tens',3,2,'tens')] },
    { id:'2B', stage:2, name:'3-digit − 2-digit, cascade',  target:4800, items:[iv('int.3d2d.cascade',3,2,'cascade')] },
    { id:'2C', stage:2, name:'3-digit − 3-digit',           target:5200, items:[iv('int.3d3d.none',3,3,'none'), iv('int.3d3d.units',3,3,'units')] },
    { id:'2D', stage:2, name:'3-digit − 3-digit, hard',     target:6000, items:[iv('int.3d3d.tens',3,3,'tens'), iv('int.3d3d.cascade',3,3,'cascade')] },

    { id:'3A', stage:3, name:'Eighths, quarters, halves', target:1800, frac:'3A' },
    { id:'3B', stage:3, name:'Negative differences',      target:2400, frac:'3B' },
    { id:'3C', stage:3, name:'Sixteenths',                target:3000, frac:'3C', gate:['3A','3B'] },

    { id:'4A', stage:4, name:'Mixed — easy integration',  target:5000, items:[mv('mix.easy',   {aDigits:3,bDigits:2,borrow:'none'},  false, false)] },
    { id:'4B', stage:4, name:'Mixed — fractional borrow', target:6000, items:[mv('mix.fracborrow',{aDigits:3,bDigits:2,borrow:'none'}, true, false)] },
    { id:'4C', stage:4, name:'Mixed — hard integer',      target:7000, items:[mv('mix.hardint.tens',{aDigits:3,bDigits:2,borrow:'tens'},true,false), mv('mix.hardint.cascade',{aDigits:3,bDigits:2,borrow:'cascade'},true,false)] },
    { id:'4D', stage:4, name:'Desk simulation',           target:7500, items:[
        mv('mix.desk.none',    {aDigits:3,bDigits:2,borrow:'none'},   false, false),
        mv('mix.desk.units',   {aDigits:3,bDigits:2,borrow:'units'},  true,  false),
        mv('mix.desk.tens',    {aDigits:3,bDigits:2,borrow:'tens'},   true,  false),
        mv('mix.desk.cascade', {aDigits:3,bDigits:2,borrow:'cascade'},true,  false),
        mv('mix.desk.16ths',   {aDigits:3,bDigits:2,borrow:'tens'},   true,  true)] },
  ];
  const STAGES = [
    { n:1, name:'INTEGER',        blurb:'Foundation subtraction' },
    { n:2, name:'HARDER INTEGER', blurb:'Borrowing under pressure' },
    { n:3, name:'FRACTIONS',      blurb:'Retrieval speed' },
    { n:4, name:'MIXED',          blurb:'Desk simulation' },
  ];
  const levelById = id => LEVELS.find(l => l.id === id);
  const levelIndex = id => LEVELS.findIndex(l => l.id === id);

  // Human labels for the dashboard's "weakest pattern" lines.
  const SHAPE_NAME = { '2d1d':'2-digit − 1-digit', '2d2d':'2-digit − 2-digit',
                       '3d1d':'3-digit − 1-digit', '3d2d':'3-digit − 2-digit', '3d3d':'3-digit − 3-digit' };
  const BORROW_NAME = { none:'no borrowing', units:'with borrowing', tens:'borrowing across hundreds', cascade:'cascade borrowing' };
  function patternName(key) {
    if (key.startsWith('int.')) {
      const [, shape, borrow] = key.split('.');
      return `${SHAPE_NAME[shape] || shape} ${BORROW_NAME[borrow] || borrow}`;
    }
    if (key.startsWith('frac.')) {
      const [a, b] = key.slice(5).split('-').map(Number);
      return `${fracText(a)} − ${fracText(b)}`;
    }
    if (key.startsWith('mix.')) {
      if (key === 'mix.easy') return 'straightforward fractions';
      if (key === 'mix.fracborrow') return 'fractional borrowing';
      if (key.indexOf('16ths') >= 0) return 'sixteenths in mixed';
      const b = key.split('.').pop();
      return `fractional borrowing + ${BORROW_NAME[b] || b}`;
    }
    return key;
  }
  const catOf = key => key.startsWith('int.') ? 'int' : key.startsWith('frac.') ? 'frac' : 'mixed';

  // ─── question construction ──────────────────────────────────────
  function buildQuestion(level, item, rng) {
    if (level.frac) {
      const [fa, fb] = item.pair;
      return { text: `${fracText(fa)} − ${fracText(fb)}`,
               html: `${mixedHtml(fa)} <span class="op">−</span> ${mixedHtml(fb)}`,
               answer: fa - fb, key: item.k, cat: 'frac', level: level.id };
    }
    if (item.cat === 'mixed') {
      const q = genMixed({ rng, ...item.mixed });
      if (!q) return null;
      return { text: `${mixedText(q.a)} − ${mixedText(q.b)}`,
               html: `${mixedHtml(q.a)} <span class="op">−</span> ${mixedHtml(q.b)}`,
               answer: q.ans, key: item.k, cat: 'mixed', level: level.id, fracBorrow: q.fa < q.fb };
    }
    const q = genInt({ ...item.spec, rng });
    if (!q) return null;
    return { text: `${q.a} − ${q.b}`, html: `${q.a} <span class="op">−</span> ${q.b}`,
             answer: q.ans * U, key: item.k, cat: 'int', level: level.id };
  }
  function itemsFor(level) {
    if (level.frac) return SPACE[level.frac].map(p => ({ k: `frac.${p[0]}-${p[1]}`, pair: p, cat: 'frac' }));
    return level.items;
  }

  // ─── statistics ─────────────────────────────────────────────────
  const OUTLIER_MS = 20000;               // hard ceiling: above this is not thinking time
  function median(arr) {
    if (!arr || !arr.length) return 0;
    const s = arr.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(arr) { return arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  // Times used for medians exclude hard outliers; they are counted separately.
  function clean(times) { return (times || []).filter(t => t <= OUTLIER_MS); }

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
  // Weight rises with weakness but never reaches zero, so nothing starves.
  const FLOOR = 0.15;
  function chooseItem(level, stats, rng, lastKey) {
    const items = itemsFor(level);
    if (items.length === 1) return items[0];
    const meds = items.map(it => median(clean((stats[it.k] || {}).t))).filter(m => m > 0);
    const ref = meds.length ? median(meds) : 0;
    const weights = items.map(it => {
      let w = FLOOR + weakness(stats[it.k], ref);
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
    return { ok: true, reason: `${(acc*100).toFixed(0)}% at ${(med/1000).toFixed(1)}s — ready to advance` };
  }
  function gateOpen(id, stats) {
    const l = levelById(id);
    if (!l || !l.gate) return true;
    return l.gate.every(g => { const lg = levelById(g); return lg && gate(lg, stats[g]).ok; });
  }

  // ─── persistence ────────────────────────────────────────────────
  const KEY = 'md_v1';
  const CAP_PAT = 30, CAP_LVL = 40, CAP_DAY = 300, KEEP_DAYS = 14;
  function blank() { return { v: 1, level: '1A', auto: true, pat: {}, lvl: {}, days: {} }; }
  function load(storage) {
    const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!ls) return blank();
    try {
      const s = JSON.parse(ls.getItem(KEY));
      if (!s || s.v !== 1) return blank();
      s.pat = s.pat || {}; s.lvl = s.lvl || {}; s.days = s.days || {};
      if (!levelById(s.level)) s.level = '1A';
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
  function bump(bucket, correct, ms, cap) {
    bucket.n++; if (correct) bucket.c++;          // lifetime totals, for "how much have I done"
    bucket.t.push(ms);
    bucket.r = bucket.r || [];
    bucket.r.push(correct ? 1 : 0);               // rolling window, for every DECISION
    if (bucket.t.length > cap) bucket.t.splice(0, bucket.t.length - cap);
    if (bucket.r.length > cap) bucket.r.splice(0, bucket.r.length - cap);
  }
  function record(s, q, correct, ms, now) {
    ms = Math.max(0, Math.round(ms));
    const dk = dayKey(now == null ? Date.now() : now);
    s.pat[q.key] = s.pat[q.key] || { n: 0, c: 0, t: [] };
    s.lvl[q.level] = s.lvl[q.level] || { n: 0, c: 0, t: [] };
    s.days[dk] = s.days[dk] || { n: 0, c: 0, t: [], best: 0, cat: {} };
    const day = s.days[dk];
    day.cat[q.cat] = day.cat[q.cat] || { n: 0, c: 0, t: [] };
    bump(s.pat[q.key], correct, ms, CAP_PAT);
    bump(s.lvl[q.level], correct, ms, CAP_LVL);
    s.lvl[q.level].since = (s.lvl[q.level].since || 0) + 1;
    bump(day, correct, ms, CAP_DAY);
    bump(day.cat[q.cat], correct, ms, CAP_DAY);
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
      cats: { int: catStat('int'), frac: catStat('frac'), mixed: catStat('mixed') },
      weakest: { int: weakestIn(s, 'int'), frac: weakestIn(s, 'frac'), mixed: weakestIn(s, 'mixed') },
    };
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
           ri, pick, genInt, borrowShape, genMixed, spaceFor, SPACE, EIGHTHS, SIXTEENTHS,
           LEVELS, STAGES, levelById, levelIndex, itemsFor, buildQuestion, patternName, catOf,
           median, mean, clean, weakness, chooseItem, gate, gateOpen, recentAcc, recentN,
           blank, load, save, record, summary, dayKey, nextLevel, weakestIn, wilsonLower,
           OUTLIER_MS, MIN_N, ACC_GATE, TEST_EVERY, DEMOTE_ACC, KEY };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Drill;
