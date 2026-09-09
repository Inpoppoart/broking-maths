// Test suite for the drill engine.  Run with:  node test.js
const D = require("./drill.js");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { c ? pass++ : (fail++, fails.push(m)); };
const eq = (a, b, m) => ok(a === b, `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
let seed = 20260909;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const U = 16, T0 = new Date("2026-09-09T10:00:00Z").getTime();

// ── rendering ───────────────────────────────────────────────────────
["", "1/16","1/8","3/16","1/4","5/16","3/8","7/16","1/2","9/16","5/8","11/16","3/4","13/16","7/8","15/16"]
  .forEach((w, s) => eq(D.fracText(s), w, `fracText(${s}/16)`));
eq(D.mixedText(92*U + 6), "92 3/8", "92 3/8");
eq(D.mixedText(64*U), "64", "whole number shows no fraction");
eq(D.mixedText((53*U+4) - (8*U+6)), "44 7/8", "53 1/4 - 8 3/8 borrows the eighth");
eq(D.mixedText((52*U+8) - (19*U+14)), "32 5/8", "52 1/2 - 19 7/8 borrows both");
eq(D.mixedText((70*U+8) + (86*U+4)), "156 3/4", "70 1/2 + 86 1/4");

// ── parsing ─────────────────────────────────────────────────────────
[["92",1472],["92.5",1480],["92 3/8",1478],["3/8",6],["-3/4",-12],[".5",8],["abc",null],["",null]]
  .forEach(([i, w]) => eq(D.parseAnswer(i), w, `parseAnswer(${JSON.stringify(i)})`));
let rt = 0;
for (let u = 1*U; u <= 200*U; u++) if (D.parseAnswer(D.mixedText(u)) !== u) rt++;
eq(rt, 0, "display/parse round-trips for every value in range");

// ── generator: guarantees the carry structure each level claims ─────
for (const L of D.LEVELS) {
  for (const item of D.itemsFor(L)) {
    let nulls = 0, bad = 0, wrongFrac = 0, wrongInt = 0, wholeFrac = 0, oob = 0;
    for (let i = 0; i < 4000; i++) {
      const q = D.genPrice({ ...L.spec, op: item.op, rng });
      if (!q) { nulls++; continue; }
      if ((q.op === "-" ? q.a - q.b : q.a + q.b) !== q.ans) bad++;
      if (q.ans <= 0) bad++;
      if (q.fracCarry !== L.spec.fracCarry) wrongFrac++;
      if (L.spec.intCarry !== null && q.intCarry !== L.spec.intCarry) wrongInt++;
      // both operands must carry a real eighth — that is the whole point
      if (q.a % U === 0 || q.b % U === 0) wholeFrac++;
      if (q.a % 2 || q.b % 2) wholeFrac++;                 // eighths only, never sixteenths
      const wa = Math.floor(q.a / U), wb = Math.floor(q.b / U);
      if (wa < 10 || wa > 99) oob++;
      if (L.spec.bDigits === 1 ? (wb < 1 || wb > 9) : (wb < 10 || wb > 99)) oob++;
      if (q.ans > 200 * U) oob++;
    }
    const l = `${L.id} ${item.op}`;
    eq(nulls, 0, `${l}: always generates`);
    eq(bad, 0, `${l}: arithmetic and sign`);
    eq(wrongFrac, 0, `${l}: eighths-carry guarantee holds`);
    eq(wrongInt, 0, `${l}: whole-number carry guarantee holds`);
    eq(wholeFrac, 0, `${l}: both operands carry a real eighth`);
    eq(oob, 0, `${l}: digit counts respected`);
  }
}

// ── every level renders what it answers ─────────────────────────────
for (const L of D.LEVELS) {
  let bad = 0; const keys = new Set(); const ops = new Set();
  for (let i = 0; i < 4000; i++) {
    const q = D.buildQuestion(L, D.chooseItem(L, {}, rng, null), rng);
    if (!q) { bad++; continue; }
    keys.add(q.key); ops.add(q.op);
    const p = q.text.split(/ [−+] /);
    const a = D.parseAnswer(p[0]), b = D.parseAnswer(p[1]);
    if (a === null || b === null) { bad++; continue; }
    if ((q.op === "-" ? a - b : a + b) !== q.answer) bad++;
  }
  eq(bad, 0, `${L.id}: rendered text matches the stored answer`);
  eq(keys.size, D.itemsFor(L).length, `${L.id}: both operations reachable`);
  eq(ops.size, 2, `${L.id}: plus and minus both appear`);
}
eq(D.LEVELS.length, 5, "five levels, two families");
ok(D.LEVELS.every(L => L.spec.bDigits === 1 || L.spec.bDigits === 2), "only 1- and 2-digit second operands");

// ── subtraction is weighted above addition ──────────────────────────
const LB2 = D.levelById("B2");
let subs = 0;
for (let i = 0; i < 20000; i++) if (D.chooseItem(LB2, {}, rng, null).op === "-") subs++;
ok(subs / 20000 > 0.55, `subtraction favoured (${(subs/200).toFixed(0)}%)`);
ok(subs / 20000 < 0.85, `addition still practised (${(100-subs/200).toFixed(0)}%)`);

// ── adaptive selection ──────────────────────────────────────────────
const at = p => ({ n: 20, c: Math.round(20*p), t: Array(20).fill(1500),
                   r: Array(20).fill(0).map((_, i) => i < Math.round(20*p) ? 1 : 0) });
ok(D.difficultyFit(at(0.85)) > D.difficultyFit(at(1.00)), "85% preferred over always-right");
ok(D.difficultyFit(at(0.85)) > D.difficultyFit(at(0.40)), "85% preferred over mostly-wrong");
ok(D.difficultyFit(at(0.60)) > D.difficultyFit(at(1.00)), "too easy penalised harder than too hard");
eq(D.difficultyFit(null), 1, "unknown difficulty is neutral");
const wstats = {}; D.itemsFor(LB2).forEach((it, i) => { wstats[it.k] = at(i === 0 ? 0.99 : 0.85); });
let near = 0;
for (let i = 0; i < 20000; i++) if (D.chooseItem(LB2, wstats, rng, null).k === D.itemsFor(LB2)[1].k) near++;
ok(near/20000 > 0.35, `item near 85% pulled up despite the subtraction bias (${(near/200).toFixed(0)}%)`);

// ── consistency, gates ──────────────────────────────────────────────
const steady  = Array(30).fill(0).map((_, i) => 1000 + (i % 5) * 40);
const erratic = Array(30).fill(0).map((_, i) => (i % 2 ? 400 : 2600));
ok(D.cv(steady) < 0.2, `steady times have low CV (${D.cv(steady).toFixed(2)})`);
ok(D.cv(erratic) > 0.5, `erratic times have high CV (${D.cv(erratic).toFixed(2)})`);
eq(D.cv([1000, 1000]), 0, "CV needs enough samples before it judges");
const agg = (n,c,ms) => ({ n, c, t:Array(Math.min(n,40)).fill(ms),
  r:Array(Math.min(n,40)).fill(0).map((_,i)=>i<Math.round(Math.min(n,40)*(c/n))?1:0), since:40 });
const LA1 = D.levelById("A1");
eq(D.gate(LA1, null).ok, false, "cold start cannot promote");
eq(D.gate(LA1, agg(10,10,1000)).ok, false, "too few samples blocks promotion");
eq(D.gate(LA1, agg(40,40,1000)).ok, true, "accurate, fast and steady promotes");
eq(D.gate(LA1, agg(40,40,9000)).ok, false, "accurate but slow does not promote");
const fbi = D.gate(LA1, agg(40,32,900));
eq(fbi.ok, false, "fast-but-inaccurate blocked");
eq(fbi.fastButInaccurate, true, "fast-but-inaccurate flagged");
ok(/accuracy first/i.test(fbi.reason), "and told to slow down");
const mk = t => ({ n:t.length, c:t.length, t, r:t.map(()=>1), since:40 });
const uneven = D.gate(LA1, mk(Array(40).fill(0).map((_,i)=>(i%2?200:1700))));
eq(uneven.ok, false, "fast median but erratic does NOT promote");
eq(uneven.uneven, true, "erratic timing diagnosed distinctly");
eq(D.median(D.clean(Array(20).fill(1000).concat([60000]))), 1000, "hard outlier excluded");

// ── store + dashboard ───────────────────────────────────────────────
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k,v) => { m[k] = String(v); } }; };
const corrupt = mem(); corrupt.setItem(D.KEY, "{not json");
eq(D.load(corrupt).level, "A1", "corrupt storage recovers to the first level");
const q = (k,c,l) => ({ key:k, cat:c, level:l });
let S = D.blank();
D.record(S, q("px.2d1d.sub.clean","sub","A1"), true, 1200, T0);
D.record(S, q("px.2d1d.sub.clean","sub","A1"), true, 1400, T0);
D.record(S, q("px.2d1d.add.clean","add","A1"), false, 5000, T0);
let sum = D.summary(S, T0);
eq(sum.today.n, 3, "today counts every attempt");
eq(sum.today.median, 1400, "today median");
eq(sum.today.best, 1200, "best is the fastest correct answer");
eq(sum.cats.sub.n, 2, "minus row counts minus questions");
eq(sum.cats.add.n, 1, "plus row counts plus questions");
D.record(S, q("px.2d1d.sub.clean","sub","A1"), false, 50, T0);
eq(D.summary(S, T0).today.best, 1200, "a fast WRONG answer is never 'best'");
eq(D.summary(S, T0 + 86400000).today.n, 0, "a new day starts clean");
let big = D.blank();
for (let i = 0; i < 5000; i++) D.record(big, q("px.2d2d.sub.both","sub","B3"), true, 1000+i, T0);
ok(big.pat["px.2d2d.sub.both"].t.length <= 30, "pattern time window capped");
eq(big.pat["px.2d2d.sub.both"].n, 5000, "lifetime counts not capped");
ok(JSON.stringify(big).length < 60000, "storage stays small");

// weakest-pattern naming
let W = D.blank();
for (let i = 0; i < 20; i++) {
  D.record(W, q("px.2d2d.sub.clean","sub","B1"), true, 1200, T0);
  D.record(W, q("px.2d2d.sub.both","sub","B3"), i % 3 === 0, 8000, T0);
}
const wk = D.summary(W, T0).weakest;
eq(wk.sub.key, "px.2d2d.sub.both", "weakest minus pattern found");
ok(/eighths \+ tens carry/.test(wk.sub.name), `named: "${wk.sub.name}"`);
eq(D.summary(D.blank(), T0).weakest.sub, null, "no weakness claimed without evidence");

// ── warm-up, review, interleaving ───────────────────────────────────
let WU = D.blank();
const wq = q("px.2d1d.sub.clean","sub","A1");
D.record(WU, wq, true, 9000, T0, { warmup: true });
D.record(WU, wq, true, 1000, T0);
eq(WU.pat[wq.key].n, 2, "a warm-up answer still counts as answered");
eq(WU.pat[wq.key].t.length, 1, "but its slow time is excluded");
eq(D.summary(WU, T0).today.n, 2, "the dashboard still shows every answer");

let R = D.blank(); R.level = "B1";
["A1","A2"].forEach(id => { R.lvl[id] = agg(40,40,900); R.lvl[id].seen = T0; });
eq(D.reviewPool(R).length, 2, "levels already worked through form the review pool");
eq(D.reviewUrgency(R, "A1", T0), 0, "a just-seen level is not due");
ok(D.reviewUrgency(R, "A1", T0 + 9*60000) >= 1, "it becomes due after the first interval");
ok(D.reviewInterval(3) > D.reviewInterval(0), "the interval expands with each pass");
let R2 = D.blank(); R2.lvl["A1"] = agg(40,40,900);
D.record(R2, q("px.2d1d.sub.clean","sub","A1"), true, 900, T0, { mode: "review" });
eq(R2.lvl["A1"].str, 1, "a correct review lengthens the interval");
D.record(R2, q("px.2d1d.sub.clean","sub","A1"), false, 900, T0, { mode: "review" });
eq(R2.lvl["A1"].str, 0, "a missed review shortens it again");
let M = D.blank(); M.level = "B3";
D.LEVELS.slice(0,4).forEach(L => { M.lvl[L.id] = agg(40,40,900); M.lvl[L.id].seen = 0; });
const seenMode = { current:0, review:0, interleave:0 };
for (let i = 0; i < 20000; i++) seenMode[D.chooseSource(M, T0, rng).mode]++;
ok(seenMode.review/20000 > 0.1, `due levels get reviewed (${(seenMode.review/200).toFixed(0)}%)`);
ok(seenMode.interleave/20000 > 0.08, `earlier levels interleaved (${(seenMode.interleave/200).toFixed(0)}%)`);
ok(seenMode.current/20000 > 0.5, `most questions are the current level (${(seenMode.current/200).toFixed(0)}%)`);
eq(D.chooseSource(D.blank(), T0, rng).mode, "current", "cold start drills the current level");

// ── consistency (CV) as an automaticity marker ──────────────────────
const steady  = Array(30).fill(0).map((_, i) => 1000 + (i % 5) * 40);   // tight spread
const erratic = Array(30).fill(0).map((_, i) => (i % 2 ? 400 : 2600));  // same mean, wide
ok(D.cv(steady) < 0.2, `steady times have low CV (${D.cv(steady).toFixed(2)})`);
ok(D.cv(erratic) > 0.5, `erratic times have high CV (${D.cv(erratic).toFixed(2)})`);
eq(D.cv([1000, 1000]), 0, "CV needs enough samples before it judges");
const mk = (times, c) => ({ n: times.length, c: c == null ? times.length : c, t: times,
  r: times.map((_, i) => (c == null || i < c) ? 1 : 0), since: 40 });
eq(D.gate(L1A, mk(Array(40).fill(0).map((_, i) => 900 + (i % 4) * 30))).ok, true,
   "accurate, fast and steady promotes");
const unevenGate = D.gate(L1A, mk(Array(40).fill(0).map((_, i) => (i % 2 ? 200 : 1700))));
eq(unevenGate.ok, false, "fast median but erratic does NOT promote");
eq(unevenGate.uneven, true, "erratic timing is diagnosed distinctly");
ok(/still working them out/.test(unevenGate.reason), "and is explained to the user");

// ── difficulty targeting: prefer items near 85% success ─────────────
const at = p => ({ n: 20, c: Math.round(20*p), t: Array(20).fill(1500),
                   r: Array(20).fill(0).map((_, i) => i < Math.round(20*p) ? 1 : 0) });
ok(D.difficultyFit(at(0.85)) > D.difficultyFit(at(1.00)), "85% preferred over always-right");
ok(D.difficultyFit(at(0.85)) > D.difficultyFit(at(0.40)), "85% preferred over mostly-wrong");
eq(D.difficultyFit(null), 1, "unknown difficulty is neutral, not excluded");
// selection must still favour the near-target item without starving the others
const LX = D.levelById("2A");
const dstats = { "int.3d2d.units": at(0.99), "int.3d2d.tens": at(0.85) };
let near = 0;
for (let i = 0; i < 20000; i++) if (D.chooseItem(LX, dstats, rng, null).k === "int.3d2d.tens") near++;
ok(near/20000 > 0.55, `item near 85% is favoured (${(near/200).toFixed(0)}%)`);
ok(near/20000 < 0.95, `easy item is not starved (${(100-near/200).toFixed(0)}%)`);

// ── warm-up: correctness counts, timing does not ────────────────────
let WU = D.blank();
const wq = q("int.2d1d.none", "int", "1A");
D.record(WU, wq, true, 9000, T0, { warmup: true });
D.record(WU, wq, true, 1000, T0);
eq(WU.pat[wq.key].n, 2, "a warm-up answer still counts as answered");
eq(WU.pat[wq.key].t.length, 1, "but its slow time is excluded from the timing window");
eq(D.median(WU.pat[wq.key].t), 1000, "median reflects only post-warm-up answers");
eq(D.summary(WU, T0).today.n, 2, "the dashboard still shows every answer you gave");

// ── spaced review ───────────────────────────────────────────────────
let R = D.blank();
R.level = "1C";
["1A", "1B"].forEach(id => { R.lvl[id] = agg(40, 40, 900); R.lvl[id].seen = T0; });
eq(D.reviewPool(R).length, 2, "levels already worked through form the review pool");
ok(D.reviewPool(R).indexOf("1C") < 0, "the level you are training is not 'review'");
eq(D.reviewUrgency(R, "1A", T0), 0, "a just-seen level is not due");
ok(D.reviewUrgency(R, "1A", T0 + 9*60000) >= 1, "it becomes due after the first interval");
ok(D.reviewInterval(3) > D.reviewInterval(0), "the interval expands with each successful pass");
// a correct review answer pushes the next one further out; a wrong one pulls it back
let R2 = D.blank(); R2.lvl["1A"] = agg(40, 40, 900);
D.record(R2, q("int.2d1d.none", "int", "1A"), true, 900, T0, { mode: "review" });
eq(R2.lvl["1A"].str, 1, "a correct review lengthens the interval");
D.record(R2, q("int.2d1d.none", "int", "1A"), false, 900, T0, { mode: "review" });
eq(R2.lvl["1A"].str, 0, "a missed review shortens it again");
// the mix: mostly current, with real review and interleaving
let M = D.blank(); M.level = "2A";
D.LEVELS.slice(0, 5).forEach(L => { M.lvl[L.id] = agg(40, 40, 900); M.lvl[L.id].seen = 0; });
const seen = { current: 0, review: 0, interleave: 0 };
for (let i = 0; i < 20000; i++) seen[D.chooseSource(M, T0, rng).mode]++;
ok(seen.current/20000 > 0.55 && seen.current/20000 < 0.75, `most questions are the current level (${(seen.current/200).toFixed(0)}%)`);
ok(seen.review/20000 > 0.1, `due levels get reviewed (${(seen.review/200).toFixed(0)}%)`);
ok(seen.interleave/20000 > 0.08, `earlier levels are interleaved (${(seen.interleave/200).toFixed(0)}%)`);
let cold = D.blank();
eq(D.chooseSource(cold, T0, rng).mode, "current", "cold start always drills the current level");

console.log(`${fail ? "FAIL" : "PASS"} — ${pass} passed, ${fail} failed`);
fails.slice(0, 25).forEach(f => console.log("  ✗ " + f));
if (fail) process.exitCode = 1;
