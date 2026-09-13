// GAUNTLET — the Balatro-shaped run mode. Pure logic, no DOM.
// Answering a question is playing a hand: it scores Chips × Mult.
// Beat the blind's target within the hands you are given, or the run ends.
const Gauntlet = (() => {

  // ─── scoring ────────────────────────────────────────────────────
  // Harder shapes are worth more, so the boss modifiers that force hard
  // shapes are a genuine trade rather than pure punishment.
  const BASE_CHIPS = { A1: 25, A2: 40, B1: 45, B2: 65, B3: 90 };
  const SPEED_FAST = 2000, SPEED_OK = 4000;
  const FAST_BONUS = 35, OK_BONUS = 18;

  // ─── blinds ─────────────────────────────────────────────────────
  const BLIND_NAMES = ["SMALL BLIND", "BIG BLIND"];
  const BOSSES = [
    { id:'vice',    name:'THE VICE',    text:'Minus only',                  ops:['-'] },
    { id:'carry',   name:'THE CARRY',   text:'Every answer borrows',        forceCarry:true },
    { id:'clock',   name:'THE CLOCK',   text:'4s per hand or it scores 0',  limitMs:4000 },
    { id:'wall',    name:'THE WALL',    text:'Target x2, but +5 hands',     targetMul:2, extraHands:5 },
    { id:'drought', name:'THE DROUGHT', text:'Streak gives no Mult',        noStreak:true },
    { id:'tax',     name:'THE TAX',     text:'A miss costs 40 chips',       missCost:40 },
  ];

  // Which levels the ante draws from. The gauntlet escalates on its own,
  // independently of practice progress.
  function poolFor(ante) {
    if (ante <= 1) return ['A1', 'A2'];
    if (ante === 2) return ['A1', 'A2', 'B1'];
    if (ante === 3) return ['A2', 'B1', 'B2'];
    if (ante === 4) return ['B1', 'B2', 'B3'];
    return ['B2', 'B3'];
  }
  function targetFor(ante, blindIdx) {
    const base = [300, 450, 650][blindIdx];
    return Math.round(base * Math.pow(1.45, ante - 1) / 25) * 25;
  }
  const HANDS = 8;

  function blindSpec(ante, blindIdx, rng) {
    const boss = blindIdx === 2 ? BOSSES[Math.floor(rng() * BOSSES.length)] : null;
    let target = targetFor(ante, blindIdx);
    let hands = HANDS;
    if (boss) {
      if (boss.targetMul) target = Math.round(target * boss.targetMul);
      if (boss.extraHands) hands += boss.extraHands;
    }
    return {
      name: boss ? boss.name : BLIND_NAMES[blindIdx],
      text: boss ? boss.text : (blindIdx === 0 ? 'Warm up' : 'Bigger target'),
      boss, target, hands, blindIdx, ante,
    };
  }

  // ─── jokers ─────────────────────────────────────────────────────
  // Every joker keys off something about the MATHS, so the build you end up
  // with changes which questions you want to see.
  const JOKERS = [
    { id:'borrower', name:'BORROWER',  cost:5, text:'+4 Mult when the eighths borrow',
      score: c => { if (c.q.fracCarry) c.mult += 4; } },
    { id:'clean',    name:'CLEAN SLATE', cost:4, text:'+45 Chips when nothing borrows',
      score: c => { if (!c.q.fracCarry && !c.q.intCarry) c.chips += 45; } },
    { id:'speed',    name:'QUICK HANDS', cost:6, text:'x1.5 Mult under 2s',
      score: c => { if (c.ms < SPEED_FAST) c.xmult *= 1.5; } },
    { id:'minus',    name:'SHORT SELLER', cost:4, text:'+50 Chips on minus',
      score: c => { if (c.q.op === '-') c.chips += 50; } },
    { id:'plus',     name:'LONG BOOK',   cost:4, text:'+50 Chips on plus',
      score: c => { if (c.q.op === '+') c.chips += 50; } },
    { id:'metro',    name:'METRONOME',   cost:6, text:'x2 Mult if your last 3 were evenly paced',
      score: c => { if (c.steadyRun >= 3) c.xmult *= 2; } },
    { id:'rope',     name:'TIGHTROPE',   cost:5, text:'x2 Mult if the answer is a whole number',
      score: c => { if (c.q.answer % 16 === 0) c.xmult *= 2; } },
    { id:'fat',      name:'FAT STACK',   cost:4, text:'+40 Chips if the answer is over 50',
      score: c => { if (c.q.answer >= 50 * 16) c.chips += 40; } },
    { id:'boss',     name:'PIT BOSS',    cost:6, text:'+1 Mult per hand played this blind',
      score: c => { c.mult += c.handsPlayed; } },
    { id:'compound', name:'COMPOUND',    cost:6, text:'x1.25 Mult. Stacks.', stacks:true,
      score: c => { c.xmult *= 1.25; } },
    { id:'both',     name:'DOUBLE DIP',  cost:6, text:'+8 Mult when eighths AND tens borrow',
      score: c => { if (c.q.fracCarry && c.q.intCarry) c.mult += 8; } },
    { id:'insure',   name:'STOP LOSS',   cost:5, text:'Your first miss each blind still scores',
      score: () => {} },
  ];
  const jokerById = id => JOKERS.find(j => j.id === id);

  // ─── run state ──────────────────────────────────────────────────
  function newRun(rng) {
    const run = { ante: 1, blindIdx: 0, money: 4, jokers: [], score: 0,
                  handsLeft: 0, target: 0, blind: null, streak: 0, handsPlayed: 0,
                  steadyRun: 0, lastMs: 0, usedInsure: false, over: false, won: false, best: 0 };
    startBlind(run, rng);
    return run;
  }
  function startBlind(run, rng) {
    run.blind = blindSpec(run.ante, run.blindIdx, rng);
    run.target = run.blind.target;
    run.handsLeft = run.blind.hands;
    run.score = 0;
    run.handsPlayed = 0;
    run.streak = 0;
    run.steadyRun = 0;
    run.lastMs = 0;
    run.usedInsure = false;
  }

  // Constraints the current blind puts on question generation.
  function questionSpec(run, rng) {
    const b = run.blind, pool = poolFor(run.ante);
    const level = pool[Math.floor(rng() * pool.length)];
    const ops = (b.boss && b.boss.ops) || ['-', '-', '+'];   // minus-leaning by default
    return { level, op: ops[Math.floor(rng() * ops.length)],
             forceCarry: !!(b.boss && b.boss.forceCarry) };
  }

  // ─── playing a hand ─────────────────────────────────────────────
  function play(run, q, ms, correct) {
    const b = run.blind;
    const insured = !correct && run.jokers.indexOf('insure') >= 0 && !run.usedInsure;
    if (insured) run.usedInsure = true;

    const timedOut = !!(b.boss && b.boss.limitMs && ms > b.boss.limitMs);
    const scores = (correct || insured) && !timedOut;

    run.handsLeft--;
    run.handsPlayed++;

    if (!scores) {
      run.streak = 0;
      run.steadyRun = 0;
      const penalty = (b.boss && b.boss.missCost) || 0;
      if (penalty) run.score = Math.max(0, run.score - penalty);
      return finish(run, { scored: 0, chips: 0, mult: 0, insured, timedOut });
    }

    run.streak++;
    // "Evenly paced" means this answer landed close to the last one — the
    // consistency that actually marks automatic recall.
    if (run.lastMs && Math.abs(ms - run.lastMs) < 800) run.steadyRun++;
    else run.steadyRun = 1;
    run.lastMs = ms;

    const ctx = {
      q, ms, chips: BASE_CHIPS[q.level] || 15, mult: 1, xmult: 1,
      streak: run.streak, steadyRun: run.steadyRun, handsPlayed: run.handsPlayed, run,
    };
    if (ms < SPEED_FAST) ctx.chips += FAST_BONUS;
    else if (ms < SPEED_OK) ctx.chips += OK_BONUS;
    if (!(b.boss && b.boss.noStreak)) ctx.mult += Math.floor(run.streak / 2);

    for (const id of run.jokers) {
      const j = jokerById(id);
      if (j && j.score) j.score(ctx);
    }
    const mult = Math.max(1, ctx.mult) * ctx.xmult;
    const gained = Math.round(ctx.chips * mult);
    run.score += gained;
    return finish(run, { scored: gained, chips: ctx.chips, mult: Math.round(mult * 100) / 100, insured, timedOut });
  }

  function finish(run, res) {
    res.cleared = run.score >= run.target;
    res.outOfHands = run.handsLeft <= 0;
    if (res.cleared) {
      // Money for the win, plus a dollar per hand you did not need.
      res.reward = (run.blindIdx === 2 ? 5 : 3) + Math.max(0, run.handsLeft);
      run.money += res.reward;
      res.state = 'cleared';
    } else if (res.outOfHands) {
      run.over = true;
      res.state = 'lost';
    } else {
      res.state = 'playing';
    }
    if (run.score > run.best) run.best = run.score;
    return res;
  }

  function advance(run, rng) {
    run.blindIdx++;
    if (run.blindIdx > 2) { run.blindIdx = 0; run.ante++; }
    if (run.ante > 8) { run.won = true; run.over = true; return; }
    startBlind(run, rng);
  }

  // ─── shop ───────────────────────────────────────────────────────
  function shopOffer(run, rng, count) {
    const owned = run.jokers;
    const avail = JOKERS.filter(j => j.stacks || owned.indexOf(j.id) < 0);
    const out = [];
    const pick = avail.slice();
    while (out.length < (count || 3) && pick.length) {
      out.push(pick.splice(Math.floor(rng() * pick.length), 1)[0]);
    }
    return out;
  }
  function buy(run, id) {
    const j = jokerById(id);
    if (!j || run.money < j.cost) return false;
    if (!j.stacks && run.jokers.indexOf(id) >= 0) return false;
    if (run.jokers.length >= 5) return false;
    run.money -= j.cost;
    run.jokers.push(id);
    return true;
  }

  return { BASE_CHIPS, BOSSES, JOKERS, jokerById, poolFor, targetFor, blindSpec,
           newRun, startBlind, questionSpec, play, advance, shopOffer, buy, HANDS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Gauntlet;
