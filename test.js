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

console.log(`${fail ? "FAIL" : "PASS"} — ${pass} passed, ${fail} failed`);
fails.slice(0, 25).forEach(f => console.log("  ✗ " + f));
if (fail) process.exitCode = 1;
