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

