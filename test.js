// Test suite for the drill engine.  Run with:  node test.js
const D = require("./drill.js");
const G = require("./gauntlet.js");

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

// ══ GAUNTLET ════════════════════════════════════════════════════════
const gq = { level:'A1', op:'-', fracCarry:false, intCarry:false, answer:50*16+4 };
const carryQ = { ...gq, fracCarry:true, intCarry:true };
const bossRun = id => { const r = G.newRun(rng); r.blind = { ...r.blind, boss: G.BOSSES.filter(b=>b.id===id)[0] }; return r; };

// ── scoring is chips x mult ──
let g = G.newRun(rng);
let gr = G.play(g, gq, 1000, true);
eq(gr.chips, 60, "A1 base 25 + fast bonus 35");
eq(gr.mult, 1, "mult opens at 1");
eq(gr.scored, 60, "score is chips x mult");
eq(g.score, 60, "run score accumulates");
G.play(g, gq, 1000, true);
ok(G.play(g, gq, 1000, true).mult >= 2, "a streak raises mult");

// ── a miss costs a hand, scores nothing, breaks the streak ──
g = G.newRun(rng);
G.play(g, gq, 1000, true);
gr = G.play(g, gq, 1000, false);
eq(gr.scored, 0, "a miss scores nothing");
eq(g.streak, 0, "a miss breaks the streak");
eq(g.handsLeft, g.blind.hands - 2, "a miss still costs a hand");

// ── jokers ──
const withJoker = (ids, q, ms) => { const r = G.newRun(rng); r.jokers = ids; return G.play(r, q, ms, true); };
eq(withJoker(['borrower'], carryQ, 5000).mult, 5, "BORROWER +4 Mult on a carry");
eq(withJoker(['borrower'], gq, 5000).mult, 1, "BORROWER idle without a carry");
eq(withJoker(['speed'], gq, 1000).mult, 1.5, "QUICK HANDS x1.5 under 2s");
eq(withJoker(['speed'], gq, 5000).mult, 1, "QUICK HANDS idle when slow");
eq(withJoker(['compound','compound'], gq, 5000).mult, 1.56, "COMPOUND stacks multiplicatively");
eq(withJoker(['rope'], { ...gq, answer: 64*16 }, 5000).mult, 2, "TIGHTROPE x2 on a whole answer");
eq(withJoker(['rope'], gq, 5000).mult, 1, "TIGHTROPE idle on a fractional answer");
eq(withJoker(['both'], carryQ, 5000).mult, 9, "DOUBLE DIP +8 when both columns carry");
eq(withJoker([], gq, 5000).mult, 1, "no jokers, no bonus");
g = G.newRun(rng); g.jokers = ['insure'];
ok(G.play(g, gq, 1000, false).insured, "STOP LOSS rescues the first miss");
eq(G.play(g, gq, 1000, false).scored, 0, "STOP LOSS only fires once per blind");

// ── boss modifiers ──
eq(G.play(bossRun('clock'), gq, 5000, true).scored, 0, "THE CLOCK: over 4s scores nothing");
ok(G.play(bossRun('clock'), gq, 1500, true).scored > 0, "THE CLOCK: under 4s scores");
g = bossRun('drought');
for (let i = 0; i < 6; i++) G.play(g, gq, 5000, true);
eq(G.play(g, gq, 5000, true).mult, 1, "THE DROUGHT: streak gives no mult");
g = bossRun('tax'); g.score = 100; G.play(g, gq, 1000, false);
eq(g.score, 60, "THE TAX: a miss costs 40 chips");
g = bossRun('tax'); g.score = 10; G.play(g, gq, 1000, false);
eq(g.score, 0, "THE TAX never goes negative");
eq(G.questionSpec(bossRun('vice'), rng).op, '-', "THE VICE: minus only");
let allForced = true;
for (let i = 0; i < 50; i++) if (!G.questionSpec(bossRun('carry'), rng).forceCarry) allForced = false;
ok(allForced, "THE CARRY: every question forces a borrow");

// ── blinds, antes, clearing and losing ──
g = G.newRun(rng);
eq(g.blind.blindIdx, 0, "a run opens on the small blind");
G.advance(g, rng); G.advance(g, rng);
ok(!!g.blind.boss, "the third blind always has a boss");
G.advance(g, rng);
eq(g.ante, 2, "past the boss the ante increases");
eq(g.blindIdx, 0, "and the small blind comes round again");
ok(G.targetFor(3,0) > G.targetFor(1,0), "targets escalate with ante");
ok(G.poolFor(1).indexOf('B3') < 0, "early antes exclude the hardest level");
ok(G.poolFor(5).indexOf('A1') < 0, "late antes drop the easiest level");
g = G.newRun(rng); g.target = 60;
gr = G.play(g, gq, 1000, true);
eq(gr.state, 'cleared', "hitting the target clears the blind");
ok(g.money > 4, "clearing pays out");
g = G.newRun(rng); g.target = 1e9;
for (let i = 0; i < g.blind.hands; i++) gr = G.play(g, gq, 1000, true);
eq(gr.state, 'lost', "running out of hands ends the run");
eq(g.over, true, "the run is marked over");

// ── shop ──
g = G.newRun(rng); g.money = 30;
const offer = G.shopOffer(g, rng, 3);
eq(offer.length, 3, "the shop offers three");
eq(new Set(offer.map(j => j.id)).size, 3, "with no duplicates");
ok(G.buy(g, offer[0].id), "affordable jokers can be bought");
g.money = 0;
eq(G.buy(g, offer[1].id), false, "broke means no purchase");
g.money = 99; g.jokers = ['a','b','c','d','e'];
eq(G.buy(g, 'borrower'), false, "joker slots cap at five");
g.jokers = ['borrower'];
eq(G.buy(g, 'borrower'), false, "no duplicate non-stacking jokers");
ok(G.buy(g, 'compound') && G.buy(g, 'compound'), "stacking jokers may repeat");
let noDup = true;
for (let i = 0; i < 200; i++) {
  const r = G.newRun(rng); r.jokers = ['borrower','speed'];
  if (G.shopOffer(r, rng, 3).some(j => j.id === 'borrower' || j.id === 'speed')) noDup = false;
}
ok(noDup, "owned jokers never reappear in the shop");
for (const j of G.JOKERS) {
  let threw = false;
  try { const r = G.newRun(rng); r.jokers = [j.id]; G.play(r, gq, 1200, true); G.play(r, carryQ, 5000, true); }
  catch (e) { threw = true; }
  ok(!threw, `${j.name} scores without crashing`);
  ok(j.cost >= 3 && j.cost <= 8, `${j.name} is priced sanely`);
}
// gauntlet answers must never touch the practice windows
const GS = D.blank();
D.record(GS, q("px.2d1d.sub.clean","sub","A1"), true, 1500, T0, { gauntlet: true });
eq(Object.keys(GS.pat).length, 0, "a gauntlet answer leaves pattern stats untouched");
eq(Object.keys(GS.lvl).length, 0, "and level stats untouched");
eq(D.summary(GS, T0).today.n, 1, "but today's total still counts it");

console.log(`${fail ? "FAIL" : "PASS"} — ${pass} passed, ${fail} failed`);
fails.slice(0, 25).forEach(f => console.log("  ✗ " + f));
if (fail) process.exitCode = 1;
