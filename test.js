// Test suite for the drill engine.  Run with:  node test.js
// Pure logic only — drill.js has no DOM dependency.
const D = require("./drill.js");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { c ? pass++ : (fail++, fails.push(m)); };
const eq = (a, b, m) => ok(a === b, `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
let seed = 20260830;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const U = 16, T0 = new Date("2026-08-30T10:00:00Z").getTime();

// ── rendering ───────────────────────────────────────────────────────
["", "1/16","1/8","3/16","1/4","5/16","3/8","7/16","1/2","9/16","5/8","11/16","3/4","13/16","7/8","15/16"]
  .forEach((w, s) => eq(D.fracText(s), w, `fracText(${s}/16)`));
eq(D.mixedText(183*U + 6), "183 3/8", "mixed 183 3/8");
eq(D.mixedText(83*U), "83", "whole number shows no fraction");
eq(D.mixedText(0), "0", "zero");
eq(D.mixedText(2 - 14), "-3/4", "negative fraction 1/8 - 7/8");
eq(D.mixedText((187*U+4) - (17*U+8)), "169 3/4", "187 1/4 - 17 1/2 borrows correctly");

// ── parsing ─────────────────────────────────────────────────────────
[["137",2192],["137.5",2200],["137 3/8",2198],["3/8",6],["-3/4",-12],[".5",8],["abc",null],["",null]]
  .forEach(([i, w]) => eq(D.parseAnswer(i), w, `parseAnswer(${JSON.stringify(i)})`));
// display and parse must round-trip across the whole supported range
let rt = 0;
for (let u = 10*U; u <= 300*U; u++) if (D.parseAnswer(D.mixedText(u)) !== u) rt++;
eq(rt, 0, "display/parse round-trips for every value 10..300");

// ── generators: guarantees, range, and correctness ──────────────────
const CASES = [[2,1,"none"],[2,1,"units"],[2,2,"none"],[2,2,"units"],
  [3,1,"none"],[3,1,"units"],[3,1,"cascade"],[3,2,"none"],[3,2,"units"],[3,2,"tens"],[3,2,"cascade"],
  [3,3,"none"],[3,3,"units"],[3,3,"tens"],[3,3,"cascade"]];
for (const [aD, bD, br] of CASES) {
  let nulls = 0, bad = 0, over = 0;
  for (let i = 0; i < 4000; i++) {
    const q = D.genInt({ aDigits: aD, bDigits: bD, borrow: br, rng });
    if (!q) { nulls++; continue; }
    if (q.a - q.b !== q.ans || q.ans <= 0) bad++;
    if (q.a > 300 || q.b > 300) over++;
    if (String(q.a).length !== aD || String(q.b).length !== bD) bad++;
    const s = D.borrowShape(q.a, q.b);
    if (br === "none"    && (s.unitsBorrow || s.tensBorrow)) bad++;
    if (br === "units"   && (!s.unitsBorrow || s.tensBorrow)) bad++;
    if (br === "tens"    && !(s.unitsBorrow && s.tensBorrow)) bad++;
    if (br === "cascade" && !s.cascade) bad++;
  }
  const l = `${aD}d-${bD}d ${br}`;
  eq(nulls, 0, `${l}: always generates`);
  eq(bad, 0, `${l}: borrow guarantee + arithmetic`);
  eq(over, 0, `${l}: within the 300 cap`);
}

// ── fraction spaces ─────────────────────────────────────────────────
eq(D.SPACE["3A"].length, 21, "3A has 21 pairs");
eq(D.SPACE["3B"].length, 21, "3B has 21 pairs");
ok(D.SPACE["3A"].every(([a,b]) => a > b), "3A is always positive");
ok(D.SPACE["3B"].every(([a,b]) => a < b), "3B is always negative");
ok(D.SPACE["3C"].every(([a,b]) => a % 2 || b % 2), "3C always involves a sixteenth");

// ── every level: valid, in range, rendering matches the answer ──────
for (const L of D.LEVELS) {
  let bad = 0, over = 0, nulls = 0; const keys = new Set();
  for (let i = 0; i < 4000; i++) {
    const q = D.buildQuestion(L, D.chooseItem(L, {}, rng, null), rng);
    if (!q) { nulls++; continue; }
    keys.add(q.key);
    const p = q.text.split(" − ");
    const a = D.parseAnswer(p[0]), b = D.parseAnswer(p[1]);
    if (a === null || b === null || a - b !== q.answer) bad++;
    if (Math.max(a, b, q.answer) > 300 * U) over++;
    if (L.id === "3A" && q.answer <= 0) bad++;
    if (L.id === "3B" && q.answer >= 0) bad++;
    if (L.stage !== 3 && q.answer <= 0) bad++;
  }
  eq(nulls, 0, `${L.id}: always generates`);
  eq(bad, 0, `${L.id}: rendered text matches the stored answer`);
  eq(over, 0, `${L.id}: nothing exceeds 300`);
  eq(keys.size, D.itemsFor(L).length, `${L.id}: every pattern is reachable`);
}

// ── adaptive selection ──────────────────────────────────────────────
const L2A = D.levelById("2A");
const stats = { "int.3d2d.units": { n:40, c:40, t:Array(20).fill(1500), r:Array(20).fill(1) },
                "int.3d2d.tens":  { n:40, c:24, t:Array(20).fill(7000), r:Array(20).fill(0).map((_,i)=>i<12?1:0) } };
let weak = 0;
for (let i = 0; i < 20000; i++) if (D.chooseItem(L2A, stats, rng, null).k === "int.3d2d.tens") weak++;
ok(weak/20000 > 0.55, `weak pattern over-exposed (${(weak/200).toFixed(1)}%)`);
ok(weak/20000 < 0.95, `strong pattern not starved (${(100-weak/200).toFixed(1)}%)`);

// ── progression gates ───────────────────────────────────────────────
const agg = (n,c,ms) => ({ n, c, t:Array(Math.min(n,40)).fill(ms),
  r:Array(Math.min(n,40)).fill(0).map((_,i)=>i<Math.round(Math.min(n,40)*(c/n))?1:0), since:40 });
const L1A = D.levelById("1A");
eq(D.gate(L1A, null).ok, false, "cold start cannot promote");
eq(D.gate(L1A, agg(10,10,1000)).ok, false, "too few samples blocks promotion");
eq(D.gate(L1A, agg(40,40,1000)).ok, true, "accurate and fast promotes");
eq(D.gate(L1A, agg(40,40,9000)).ok, false, "accurate but slow does not promote");
const fbi = D.gate(L1A, agg(40,32,900));
eq(fbi.ok, false, "fast-but-inaccurate blocked");
eq(fbi.fastButInaccurate, true, "fast-but-inaccurate flagged");
ok(/accuracy first/i.test(fbi.reason), "fast-but-inaccurate tells the user to slow down");
ok(!D.gate(L1A, agg(40,32,9000)).fastButInaccurate, "slow+inaccurate is a different diagnosis");
eq(D.gateOpen("3C", {}), false, "3C locked with no data");
eq(D.gateOpen("3C", { "3A": agg(40,40,900), "3B": agg(40,40,1200) }), true, "3C unlocks after 3A+3B");
eq(D.median(D.clean(Array(20).fill(1000).concat([60000]))), 1000, "hard outlier excluded from median");

// ── store + dashboard ───────────────────────────────────────────────
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k,v) => { m[k] = String(v); } }; };
const bad1 = mem(); bad1.setItem(D.KEY, "{not json");
eq(D.load(bad1).level, "1A", "corrupt storage recovers");
let S = D.blank();
const q = (k,c,l) => ({ key:k, cat:c, level:l });
D.record(S, q("int.2d1d.none","int","1A"), true, 1200, T0);
D.record(S, q("int.2d1d.none","int","1A"), true, 1400, T0);
D.record(S, q("int.2d1d.units","int","1A"), false, 5000, T0);
D.record(S, q("frac.10-2","frac","3A"), true, 700, T0);
let sum = D.summary(S, T0);
eq(sum.today.n, 4, "today counts every attempt");
eq(sum.today.median, 1300, "today median");
eq(sum.today.best, 700, "best is the fastest correct answer");
D.record(S, q("int.2d1d.none","int","1A"), false, 100, T0);
eq(D.summary(S, T0).today.best, 700, "a fast WRONG answer is never 'best'");
eq(D.summary(S, T0 + 86400000).today.n, 0, "a new day starts clean");
let big = D.blank();
for (let i = 0; i < 5000; i++) D.record(big, q("int.2d1d.none","int","1A"), true, 1000+i, T0);
ok(big.pat["int.2d1d.none"].t.length <= 30, "pattern time window is capped");
eq(big.pat["int.2d1d.none"].n, 5000, "lifetime counts are not capped");
ok(JSON.stringify(big).length < 60000, "storage stays small");

// weakest-pattern naming
let W = D.blank();
for (let i = 0; i < 20; i++) {
  D.record(W, q("int.3d2d.units","int","2A"), true, 1200, T0);
  D.record(W, q("int.3d2d.tens","int","2A"), i % 3 === 0, 8000, T0);
  D.record(W, q("mix.fracborrow","mixed","4B"), i % 3 === 0, 9000, T0);
}
const wk = D.summary(W, T0).weakest;
eq(wk.int.key, "int.3d2d.tens", "weakest integer pattern found");
ok(/borrowing across hundreds/.test(wk.int.name), `named: "${wk.int.name}"`);
eq(wk.mixed.name, "fractional borrowing", "weakest mixed pattern named");
eq(D.summary(D.blank(), T0).weakest.int, null, "no weakness claimed without evidence");

// level progression never leapfrogs a locked level
let P = D.blank(); P.level = "3B";
P.lvl["3B"] = agg(40,40,1000); P.lvl["3A"] = agg(40,27,1000);
eq(D.nextLevel(P), "3A", "a locked 3C routes back to the unmastered prerequisite");

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
