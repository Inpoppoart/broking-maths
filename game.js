// PIT BOSS — FX engine: canvas particles, synth audio, popups, shake, ticker.
// Vanilla, no deps. Exposes window.FX.

const FX = (() => {
  let canvas, ctx, dpr = 1, W = 0, H = 0;
  let particles = [];
  let ambient = [];
  let running = false;
  let fxLayer, flashEl, shakeEl;
  let ambientOn = false;

  // ---- audio ----
  let actx = null;
  let soundOn = true;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, t0, dur, type = "square", gain = 0.08) {
    const a = audio();
    if (!a || !soundOn) return;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, a.currentTime + t0);
    g.gain.setValueAtTime(0.0001, a.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(gain, a.currentTime + t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(a.currentTime + t0);
    osc.stop(a.currentTime + t0 + dur + 0.02);
  }
  function sweep(f1, f2, t0, dur, type = "sawtooth", gain = 0.07) {
    const a = audio();
    if (!a || !soundOn) return;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, a.currentTime + t0);
    osc.frequency.exponentialRampToValueAtTime(f2, a.currentTime + t0 + dur);
    g.gain.setValueAtTime(gain, a.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(a.currentTime + t0);
    osc.stop(a.currentTime + t0 + dur + 0.02);
  }

  const sfx = {
    correct(combo) {
      const base = 520 + Math.min(combo, 8) * 40;
      tone(base, 0, 0.09, "square", 0.07);
      tone(base * 1.5, 0.06, 0.09, "square", 0.06);
    },
    coin() {
      tone(988, 0, 0.05, "square", 0.06);
      tone(1319, 0.05, 0.12, "square", 0.06);
    },
    wrong() {
      sweep(220, 70, 0, 0.35, "sawtooth", 0.09);
    },
    levelup() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => tone(n, i * 0.08, 0.18, "triangle", 0.08));
    },
    deal() {
      tone(330, 0, 0.06, "square", 0.05);
      tone(440, 0.06, 0.1, "square", 0.05);
    },
    click() { tone(660, 0, 0.03, "square", 0.03); },
    gameover() {
      sweep(440, 110, 0, 0.7, "sawtooth", 0.08);
      tone(196, 0.2, 0.5, "triangle", 0.06);
    },
    heartbeat() {
      tone(80, 0, 0.1, "sine", 0.055);
      tone(60, 0.18, 0.08, "sine", 0.042);
    },
    fuse() { tone(2200 + Math.random() * 600, 0, 0.03, "square", 0.012); },
    explode() {
      sweep(200, 38, 0, 0.55, "sawtooth", 0.13);
      tone(60, 0, 0.5, "triangle", 0.11);
      tone(96, 0.02, 0.3, "square", 0.05);
    }
  };

  // ---- canvas ----
  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init() {
    canvas = document.getElementById("fxCanvas");
    fxLayer = document.getElementById("fxLayer");
    flashEl = document.getElementById("flash");
    shakeEl = document.querySelector(".game");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    running = true;
    requestAnimationFrame(loop);
  }

  function spawnAmbient() {
    if (ambient.length > 26) return;
    ambient.push({
      x: Math.random() * W,
      y: H + 12,
      vy: -(0.25 + Math.random() * 0.5),
      vx: (Math.random() - 0.5) * 0.25,
      size: 8 + Math.random() * 12,
      char: Math.random() < 0.5 ? "$" : (Math.random() < 0.5 ? "⅛" : "▲"),
      alpha: 0.05 + Math.random() * 0.09
    });
  }

  function loop() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);

    if (ambientOn && Math.random() < 0.18) spawnAmbient();
    for (let i = ambient.length - 1; i >= 0; i--) {
      const p = ambient[i];
      p.x += p.vx; p.y += p.vy;
      if (p.y < -20) { ambient.splice(i, 1); continue; }
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = "#39ff8b";
      ctx.font = `${p.size}px ui-monospace, monospace`;
      ctx.fillText(p.char, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.g;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.rot += p.vr;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const a = Math.min(1, p.life / 18);
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === "coin") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * (0.55 + 0.45 * Math.abs(Math.cos(p.rot))), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.font = `bold ${p.size}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("$", 0, 1);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  }

  function burst(x, y, opts = {}) {
    const n = opts.count || 18;
    const colorset = opts.colors || ["#ffd23f", "#ffe98a", "#ffb627"];
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (opts.power || 4) * (0.4 + Math.random());
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (opts.up || 2),
        g: 0.16,
        size: (opts.size || 7) * (0.6 + Math.random() * 0.7),
        life: 36 + Math.random() * 24,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: colorset[(Math.random() * colorset.length) | 0],
        shape: opts.shape || "coin"
      });
    }
  }

  // ---- DOM popups ----
  function popup(x, y, text, cls = "") {
    if (!fxLayer) return;
    const d = document.createElement("div");
    d.className = "popup " + cls;
    d.textContent = text;
    d.style.left = x + "px";
    d.style.top = y + "px";
    fxLayer.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }

  // ---- screen effects ----
  function shake(big) {
    if (!shakeEl) return;
    shakeEl.classList.remove("shake-sm", "shake-lg");
    void shakeEl.offsetWidth;
    shakeEl.classList.add(big ? "shake-lg" : "shake-sm");
  }
  function flash(color) {
    if (!flashEl) return;
    flashEl.style.background = color;
    flashEl.classList.remove("on");
    void flashEl.offsetWidth;
    flashEl.classList.add("on");
  }

  function centerOf(elem) {
    const r = elem.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function setAmbient(on) { ambientOn = on; }
  function setSound(on) { soundOn = on; }
  function getSound() { return soundOn; }

  return {
    init, burst, popup, shake, flash, sfx, centerOf,
    setAmbient, setSound, getSound, audio
  };
})();

window.FX = FX;

// ─────────────────────────────────────────────────────────────────
// Living market chart — a price line that reacts to play.
// pump(+) on fills, pump(-) on misfills. Drifts with noise otherwise.
// ─────────────────────────────────────────────────────────────────
const Chart = (() => {
  let cv, cx, dpr = 1, W = 0, H = 0;
  let pts = [], price = 200, vel = 0, running = false;
  let flashFrames = 0, flashUp = true;
  const N = 160;

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init() {
    cv = document.getElementById("chartCanvas");
    if (!cv) return;
    cx = cv.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    for (let i = 0; i < N; i++) pts.push(price);
    running = true;
    requestAnimationFrame(loop);
  }

  function pump(amt) {
    vel += amt;
    flashFrames = 14;
    flashUp = amt >= 0;
  }
  function reset() { price = 200; vel = 0; pts = []; for (let i = 0; i < N; i++) pts.push(price); }

  function loop() {
    if (!running) return;
    vel += (Math.random() - 0.5) * 0.7;
    vel *= 0.9;
    price += vel;
    if (price < 40) { price = 40; vel = Math.abs(vel) * 0.5; }
    if (price > 360) { price = 360; vel = -Math.abs(vel) * 0.5; }
    pts.push(price);
    if (pts.length > N) pts.shift();
    draw();
    requestAnimationFrame(loop);
  }

  function draw() {
    cx.clearRect(0, 0, W, H);
    let min = Infinity, max = -Infinity;
    for (const p of pts) { if (p < min) min = p; if (p > max) max = p; }
    const pad = (max - min) * 0.25 + 8;
    min -= pad; max += pad;
    const span = max - min || 1;
    const x = i => (i / (N - 1)) * W;
    const y = v => H - ((v - min) / span) * H;

    // grid
    cx.strokeStyle = "rgba(91,209,255,0.07)";
    cx.lineWidth = 1;
    for (let g = 1; g < 5; g++) {
      const gy = (g / 5) * H;
      cx.beginPath(); cx.moveTo(0, gy); cx.lineTo(W, gy); cx.stroke();
    }

    const rising = pts[pts.length - 1] >= pts[Math.max(0, pts.length - 24)];
    let col = rising ? [57, 255, 139] : [255, 77, 94];
    if (flashFrames > 0) { col = flushColor(col); flashFrames--; }
    const rgb = `${col[0]},${col[1]},${col[2]}`;

    // area fill
    cx.beginPath();
    cx.moveTo(0, y(pts[0]));
    for (let i = 1; i < pts.length; i++) cx.lineTo(x(i), y(pts[i]));
    cx.lineTo(W, H); cx.lineTo(0, H); cx.closePath();
    const grad = cx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, `rgba(${rgb},0.22)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    cx.fillStyle = grad; cx.fill();

    // line
    cx.beginPath();
    cx.moveTo(0, y(pts[0]));
    for (let i = 1; i < pts.length; i++) cx.lineTo(x(i), y(pts[i]));
    cx.lineWidth = 2;
    cx.strokeStyle = `rgba(${rgb},0.9)`;
    cx.shadowColor = `rgba(${rgb},0.7)`;
    cx.shadowBlur = 8;
    cx.stroke();
    cx.shadowBlur = 0;

    // head dot
    const hx = x(pts.length - 1), hy = y(pts[pts.length - 1]);
    cx.fillStyle = `rgb(${rgb})`;
    cx.beginPath(); cx.arc(hx, hy, 3, 0, Math.PI * 2); cx.fill();
  }

  function flushColor(base) {
    return flashUp ? [255, 255, 255] : [255, 120, 120];
  }

  return { init, pump, reset };
})();
window.Chart = Chart;

// ─────────────────────────────────────────────────────────────────
// Monster — a pixel BOMB hugging the left side of the stage. Its fuse
// burns down as the timer drains and it detonates when time runs out,
// costing a life. Kept clear of the numbers so the math stays readable.
// ─────────────────────────────────────────────────────────────────
const Monster = (() => {
  let cv, cx, qEl, W = 0, H = 0, dpr = 1;
  let urgency = 0;
  let running = false, active = false;
  // bomb (left side) + explosion one-shot
  let bombX = 0, bombY = 0, bombR = 0;
  let boom = 0, exX = 0, exY = 0, exR = 0;

  const lerp  = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  const clamp = (t) => Math.max(0, Math.min(1, t));

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init() {
    cv = document.getElementById("monsterCanvas");
    if (!cv) return;
    qEl = document.getElementById("question");
    cx = cv.getContext("2d");
    cx.imageSmoothingEnabled = false;
    resize();
    window.addEventListener("resize", resize);
    running = true;
    requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (!running) return;
    cx.clearRect(0, 0, W, H);
    if (active) draw(ts || performance.now());
    requestAnimationFrame(loop);
  }

  function draw(t) {
    const u = urgency;

    // Find the question's vertical center so the bomb lines up with it.
    let qCenterY = H * 0.5;
    if (qEl) {
      const qr = qEl.getBoundingClientRect(), cr = cv.getBoundingClientRect();
      if (cr.height) qCenterY = (qr.top - cr.top) + qr.height / 2;
    }
    // ── bomb on the left, fuse burning toward the deadline ──
    if (boom) drawExplosion(t);
    else      drawBomb(t, u, qCenterY);

    // ── rage vignette: closes in from the EDGES only, centre stays clear
    // so it never darkens the numbers ──
    if (u > 0.62) {
      const s = (u - 0.62) / 0.38;
      const pulse = (Math.sin(t * 0.012) + 1) / 2;
      const g = cx.createRadialGradient(W / 2, H / 2, H * 0.12, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, "rgba(255,20,40,0)");
      g.addColorStop(0.6, "rgba(255,20,40,0)");
      g.addColorStop(1, `rgba(255,20,40,${s * (0.16 + pulse * 0.14)})`);
      cx.fillStyle = g;
      cx.fillRect(0, 0, W, H);
    }
  }

  // A pixel bomb hugging the left edge. It swells and heats up as the timer
  // drains; its fuse burns down to the casing right as time runs out.
  function drawBomb(t, u, qCenterY) {
    const r  = lerp(W * 0.052, W * 0.135, u);   // grows with urgency
    const cxp = lerp(W * 0.13, W * 0.17, u);    // hugs the left side, clear of the number
    const shk = u > 0.6 ? (Math.random() - 0.5) * lerp(0, 6, clamp((u - 0.6) / 0.4)) : 0;
    const bx = cxp + shk, by = qCenterY + shk * 0.6;
    bombX = bx; bombY = by; bombR = r;

    const heat = clamp((u - 0.45) / 0.55);      // 0 → glowing red-hot

    cx.save();
    cx.shadowColor = `rgba(255,${(120 - heat * 90) | 0},40,${0.4 + heat * 0.55})`;
    cx.shadowBlur  = lerp(6, 26, u);

    // body
    const bg = cx.createRadialGradient(bx - r * 0.32, by - r * 0.32, r * 0.15, bx, by, r);
    bg.addColorStop(0, heat > 0 ? `rgb(${(70 + heat * 175) | 0},${(38 + heat * 30) | 0},42)` : "#2b303c");
    bg.addColorStop(1, "#05070c");
    cx.fillStyle = bg;
    cx.beginPath(); cx.arc(bx, by, r, 0, Math.PI * 2); cx.fill();
    cx.shadowBlur = 0;

    // hot cracks
    if (heat > 0.3) {
      cx.strokeStyle = `rgba(255,${(170 - heat * 130) | 0},40,${heat})`;
      cx.lineWidth = 1.4 + heat * 1.6;
      cx.lineCap = "round";
      cx.beginPath();
      cx.moveTo(bx - r * 0.42, by - r * 0.12);
      cx.lineTo(bx - r * 0.05, by + r * 0.22);
      cx.lineTo(bx + r * 0.34, by - r * 0.04);
      cx.stroke();
    }

    // glint
    cx.fillStyle = "rgba(255,255,255,0.5)";
    cx.beginPath(); cx.arc(bx - r * 0.36, by - r * 0.4, r * 0.16, 0, Math.PI * 2); cx.fill();

    // fuse cap + burning fuse (shrinks toward the casing as u → 1)
    cx.fillStyle = "#3a2a14";
    cx.fillRect(bx - r * 0.22, by - r * 1.14, r * 0.44, r * 0.3);
    const capX = bx + r * 0.04, capY = by - r * 1.12;
    const fuseLen = r * 1.0 * (1 - u);
    const sparkX = capX + Math.sin(t * 0.02) * r * 0.14;
    const sparkY = capY - fuseLen;
    cx.strokeStyle = "#6b5a3a"; cx.lineWidth = Math.max(2, r * 0.12); cx.lineCap = "round";
    cx.beginPath();
    cx.moveTo(capX, capY);
    cx.quadraticCurveTo(capX + r * 0.3, (capY + sparkY) / 2, sparkX, sparkY);
    cx.stroke();

    // spark
    const sp = lerp(2, 6, u) + Math.random() * 3;
    cx.shadowColor = "#ffb020"; cx.shadowBlur = 14;
    cx.fillStyle = "#fff";
    cx.beginPath(); cx.arc(sparkX, sparkY, sp, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = "#ffd23f";
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, d = sp + Math.random() * sp * 1.6;
      cx.fillRect(sparkX + Math.cos(a) * d, sparkY + Math.sin(a) * d, 1.6, 1.6);
    }
    cx.shadowBlur = 0;
    cx.restore();
  }

  function drawExplosion(t) {
    const e = (t - boom) / 560;
    if (e >= 1) { boom = 0; return; }
    const R = exR * (1 + e * 4.5);
    const a = 1 - e;
    const g = cx.createRadialGradient(exX, exY, 0, exX, exY, R);
    g.addColorStop(0,   `rgba(255,255,230,${a})`);
    g.addColorStop(0.4, `rgba(255,150,40,${a * 0.9})`);
    g.addColorStop(0.8, `rgba(255,50,40,${a * 0.5})`);
    g.addColorStop(1,   "rgba(120,20,20,0)");
    cx.fillStyle = g;
    cx.beginPath(); cx.arc(exX, exY, R, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = `rgba(255,220,160,${a})`;
    cx.lineWidth = lerp(7, 1, e);
    cx.beginPath(); cx.arc(exX, exY, R * 0.92, 0, Math.PI * 2); cx.stroke();
  }

  // Detonate at the bomb's current position — visuals + sound + debris.
  function explode() {
    if (boom) return;
    exX = bombX; exY = bombY; exR = bombR || W * 0.12;
    boom = performance.now();
    if (typeof FX !== "undefined") {
      FX.sfx.explode();
      FX.flash("rgba(255,120,30,0.45)");
      FX.shake(true);
      const r = cv.getBoundingClientRect();
      FX.burst(r.left + exX, r.top + exY, {
        count: 46, power: 8, up: 3, size: 8, shape: "square",
        colors: ["#ff5a2a", "#ffd23f", "#ff2d4a", "#3a3a3a", "#fff"]
      });
    }
  }

  function setUrgency(u) { urgency = Math.max(0, Math.min(1, u)); }
  function setActive(a)  { active = a; if (!a) urgency = 0; }
  function reset()       { urgency = 0; active = false; boom = 0; }

  return { init, setUrgency, setActive, reset, explode };
})();
window.Monster = Monster;

