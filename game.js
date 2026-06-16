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
// Monster — creature eyes that wake and lunge as the timer drains.
// Rendered on #monsterCanvas, overlaid on the stage behind the UI.
// ─────────────────────────────────────────────────────────────────
const Monster = (() => {
  let cv, cx, W = 0, H = 0, dpr = 1;
  let urgency = 0, blink = 0, blinkTimer = 0;
  let running = false, active = false;

  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

  function eyeRgb(u) {
    // cyan (calm) → gold (warn) → blood-red (rage)
    if (u < 0.5) return [lerp(91, 255, u * 2), lerp(209, 200, u * 2), lerp(255, 40, u * 2)];
    const t = (u - 0.5) * 2;
    return [255, lerp(200, 28, t), lerp(40, 28, t)];
  }

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
    cx = cv.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    running = true;
    requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (!running) return;
    cx.clearRect(0, 0, W, H);
    if (active) draw(ts);
    requestAnimationFrame(loop);
  }

  function draw(ts) {
    const breathAmp  = lerp(3.5, 0.6, urgency);
    const breathRate = lerp(0.0012, 0.007, urgency);
    const breathY    = Math.sin(ts * breathRate) * breathAmp;

    // Eyes lunge downward as urgency rises — monster leaning in toward the question
    const eyeY    = H * lerp(0.17, 0.38, urgency) + breathY;
    const eyeSize = lerp(8, 26, urgency);
    const spread  = lerp(46, 16, urgency); // eyes converge as they lunge
    const cx0     = W / 2;

    const [er, eg, eb] = eyeRgb(urgency).map(Math.round);
    const eCol = `rgb(${er},${eg},${eb})`;

    // Blink: frequent at rest, almost never at RAGE (unblinking stare)
    blinkTimer += 0.016;
    const blinkInterval = lerp(3.0, 20, urgency);
    if (blinkTimer > blinkInterval + Math.random() * 2) { blink = 1; blinkTimer = 0; }
    if (blink > 0) blink = Math.max(0, blink - 0.1);

    // Half-lidded rest at low urgency — eyes "open" as monster wakes
    const restLid = lerp(0.52, 0, Math.min(1, urgency * 3.5));

    // Fade in from dim to vivid as urgency climbs
    const alpha = lerp(0.2, 1.0, Math.min(1, urgency * 3.5));

    const lx = cx0 - spread - eyeSize * 0.5;
    const rx = cx0 + spread + eyeSize * 0.5;

    cx.save();
    cx.globalAlpha = alpha;

    drawEye(lx, eyeY, eyeSize, eCol, Math.max(blink, restLid), ts, -1);
    drawEye(rx, eyeY, eyeSize, eCol, Math.max(blink, restLid), ts, +1);

    // Angry brows appear at urgency > 0.3
    if (urgency > 0.3) {
      const str = Math.min(1, (urgency - 0.3) / 0.5);
      cx.strokeStyle = eCol;
      cx.lineWidth   = 1.5 + str * 2.5;
      cx.lineCap     = "round";
      cx.shadowColor = eCol;
      cx.shadowBlur  = 4 + str * 10;
      const bY = eyeY - eyeSize * 0.95 - str * 5;
      cx.beginPath(); cx.moveTo(lx - eyeSize * 0.9, bY - str * 6); cx.lineTo(lx + eyeSize * 0.7, bY + str * 4); cx.stroke();
      cx.beginPath(); cx.moveTo(rx + eyeSize * 0.9, bY - str * 6); cx.lineTo(rx - eyeSize * 0.7, bY + str * 4); cx.stroke();
      cx.shadowBlur = 0;
    }

    // Fanged mouth appears at urgency > 0.58
    if (urgency > 0.58) {
      const str   = Math.min(1, (urgency - 0.58) / 0.32);
      const mY    = eyeY + eyeSize * 2.0 + str * 6;
      const mHalf = (spread + eyeSize) * 0.65 * str;
      cx.strokeStyle = eCol;
      cx.lineWidth   = 1.8 + str;
      cx.lineCap     = "round";
      cx.lineJoin    = "round";
      cx.shadowColor = eCol;
      cx.shadowBlur  = 8 + str * 10;
      cx.beginPath();
      cx.moveTo(cx0 - mHalf, mY);
      for (let i = 0; i <= 6; i++) {
        const px = cx0 - mHalf + (mHalf * 2 / 6) * i;
        cx.lineTo(px, mY + (i % 2 === 1 ? str * 9 : 0));
      }
      cx.lineTo(cx0 + mHalf, mY);
      cx.stroke();
      cx.shadowBlur = 0;
    }

    cx.restore();

    // RAGE vignette at urgency > 0.78 — independent of base alpha
    if (urgency > 0.78) {
      const str   = (urgency - 0.78) / 0.22;
      const pulse = (Math.sin(ts * 0.009) + 1) / 2;
      cx.save();
      cx.globalAlpha = str * pulse * 0.08;
      cx.fillStyle = "#ff1530";
      cx.fillRect(0, 0, W, H);
      cx.restore();
    }
  }

  function drawEye(x, y, size, eCol, blinkVal, ts, side) {
    const openH = 1 - blinkVal * 0.94;
    const pupX  = x + side * urgency * 4 * Math.sin(ts * 0.0018);

    cx.shadowColor = eCol;
    cx.shadowBlur  = 8 + urgency * 18;

    // Sclera
    cx.fillStyle = urgency > 0.55 ? "rgba(28,3,5,0.95)" : "rgba(6,9,20,0.92)";
    cx.beginPath(); cx.ellipse(x, y, size, size * openH, 0, 0, Math.PI * 2); cx.fill();

    // Iris
    cx.fillStyle = eCol;
    cx.beginPath(); cx.ellipse(pupX, y, size * 0.57, size * 0.57 * openH, 0, 0, Math.PI * 2); cx.fill();

    // Pupil: vertical slit at calm, wider at rage
    const pupW = lerp(0.17, 0.34, urgency);
    cx.fillStyle = "#000";
    cx.beginPath(); cx.ellipse(pupX, y, size * pupW, size * 0.27 * openH, 0, 0, Math.PI * 2); cx.fill();

    // Highlight glint
    cx.shadowBlur = 0;
    cx.fillStyle = `rgba(255,255,255,${0.55 - urgency * 0.25})`;
    cx.beginPath(); cx.arc(x - size * 0.18, y - size * 0.18, size * 0.1 * openH + 0.5, 0, Math.PI * 2); cx.fill();
  }

  function setUrgency(u) { urgency = Math.max(0, Math.min(1, u)); }
  function setActive(a)  { active = a; if (!a) urgency = 0; }
  function reset()       { urgency = 0; active = false; blink = 0; blinkTimer = 0; }

  return { init, setUrgency, setActive, reset };
})();
window.Monster = Monster;

