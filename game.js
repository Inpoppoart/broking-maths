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
// Monster — a Dragon-Quest-style pixel SLIME that perches above the
// question and escalates from a cute blue blob into a furious red
// fanged beast as the timer drains. It sits in the top band of the
// stage and never overlaps the numbers, so the math stays readable.
// ─────────────────────────────────────────────────────────────────
const Monster = (() => {
  let cv, cx, qEl, W = 0, H = 0, dpr = 1;
  let urgency = 0, blink = 0, blinkTimer = 0;
  let running = false, active = false;

  const lerp  = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  const clamp = (t) => Math.max(0, Math.min(1, t));

  // 16×12 slime silhouette (classic DQ teardrop dome)
  const SLIME = [
    "......####......",
    "....########....",
    "...##########...",
    "..############..",
    ".##############.",
    ".##############.",
    "################",
    "################",
    "################",
    "################",
    ".##############.",
    "..############..",
  ];
  const SW = 16, SH = SLIME.length;
  const B = (r, c) => r >= 0 && r < SH && c >= 0 && c < SW && SLIME[r][c] === "#";

  // body colour: DQ blue → purple → angry red
  function bodyRgb(u) {
    if (u < 0.5) { const t = u * 2;        return [lerp(64, 150, t), lerp(132, 86, t), lerp(228, 206, t)]; }
    const t = (u - 0.5) * 2;               return [lerp(150, 232, t), lerp(86, 40, t), lerp(206, 50, t)];
  }
  const css  = (rgb, a = 1) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;
  const dark = (rgb, f) => [rgb[0] * f, rgb[1] * f, rgb[2] * f];

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
    const body = bodyRgb(u);

    // hop: gentle at rest, frantic at rage — slime bounces UP so it never
    // dips toward the question below it.
    const hopRate = lerp(0.004, 0.015, u);
    const phase   = Math.sin(t * hopRate);
    const hop     = Math.abs(phase) * lerp(3, 11, u);

    // Anchor the slime to the band ABOVE the live question element, so the
    // numbers always stay clear no matter the floor layout.
    let bandBottom = H * 0.40;
    if (qEl) {
      const qr = qEl.getBoundingClientRect(), cr = cv.getBoundingClientRect();
      if (cr.height) bandBottom = qr.top - cr.top;
    }
    bandBottom = Math.max(46, bandBottom - 4);       // small gap above the number

    // size to fill that band, looming larger with urgency but capped to fit
    let pxBase = lerp(bandBottom * 0.72, bandBottom * 0.97, u) / SH;
    pxBase = Math.min(pxBase, W * 0.052);            // never wider than the stage

    // squash & stretch (jiggly slime)
    const jig = phase * 0.09;
    const pxX = pxBase * (1 - jig);
    const pxY = pxBase * (1 + jig);
    const sprW = SW * pxX, sprH = SH * pxY;

    const groundY = bandBottom;                      // bottom hovers just above the number
    let originX = (W - sprW) / 2;
    const originY = groundY - sprH - hop;            // grows UPWARD as it looms

    // final-seconds jitter
    if (u > 0.85) originX += (Math.random() - 0.5) * lerp(0, 7, clamp((u - 0.85) / 0.15));

    const P = (c, r, w, h, color) => {
      cx.fillStyle = color;
      cx.fillRect(originX + c * pxX, originY + r * pxY, w * pxX + 0.5, h * pxY + 0.5);
    };

    // ground shadow (shrinks as the slime hops up)
    cx.fillStyle = "rgba(0,0,0,0.28)";
    cx.beginPath();
    cx.ellipse(W / 2, groundY + pxY * 0.5, sprW * 0.46 * (1 - hop / 60), pxY * 1.1, 0, 0, Math.PI * 2);
    cx.fill();

    // overall glow ramps up with rage
    cx.save();
    cx.shadowColor = css(body, 1);
    cx.shadowBlur  = lerp(6, 26, u);

    const main    = css(body);
    const outline = css(dark(body, 0.42));
    const shade   = css(dark(body, 0.72));

    // body: fill + pixel outline + lower shading
    for (let r = 0; r < SH; r++) {
      for (let c = 0; c < SW; c++) {
        if (!B(r, c)) continue;
        const edge = !B(r - 1, c) || !B(r + 1, c) || !B(r, c - 1) || !B(r, c + 1);
        P(c, r, 1, 1, edge ? outline : (r >= 9 ? shade : main));
      }
    }
    cx.shadowBlur = 0;

    // top-left sheen (DQ highlight)
    const hi = "rgba(255,255,255,0.5)";
    P(3.2, 2.4, 1.6, 0.9, hi);
    P(2.4, 3.3, 1.4, 0.8, hi);

    // ── face ────────────────────────────────────────────────────
    const browDrop  = clamp((u - 0.3) / 0.5);   // 0 calm → 1 furious
    const mouthOpen = clamp((u - 0.42) / 0.4);
    const fangs     = u > 0.6;

    blinkTimer += 0.016;
    if (blinkTimer > lerp(3.2, 14, u) + Math.random() * 1.5) { blink = 1; blinkTimer = 0; }
    if (blink > 0) blink = Math.max(0, blink - 0.14);
    const eyeH = lerp(3.0, 1.5, browDrop) * (blink > 0 ? 0.25 : 1);

    const white = "#f4f8ff", pupil = "#0a1020";
    // eyes (left cols ~4-5, right cols ~10-11), vertically centred ~row 5
    const eyeTop = 5.4 - eyeH / 2;
    P(4.0, eyeTop, 2.0, eyeH, white);
    P(10.0, eyeTop, 2.0, eyeH, white);
    // pupils glare inward + downward as it gets angry
    const pupY = eyeTop + eyeH * 0.45 + browDrop * 0.5;
    P(4.7 + browDrop * 0.4, pupY, 1.0, Math.max(0.8, eyeH * 0.55), pupil);
    P(10.3 - browDrop * 0.4, pupY, 1.0, Math.max(0.8, eyeH * 0.55), pupil);

    // angry slanted brows
    if (browDrop > 0.05) {
      const bcol = css(dark(body, 0.3));
      cx.fillStyle = bcol;
      cx.save();
      // left brow ↘
      cx.translate(originX + 4.6 * pxX, originY + (eyeTop - 0.7) * pxY);
      cx.rotate(0.5 * browDrop);
      cx.fillRect(-1.6 * pxX, -0.5 * pxY, 3.2 * pxX, 1.0 * pxY * (0.6 + browDrop));
      cx.restore();
      cx.save();
      // right brow ↙
      cx.translate(originX + 11.4 * pxX, originY + (eyeTop - 0.7) * pxY);
      cx.rotate(-0.5 * browDrop);
      cx.fillRect(-1.6 * pxX, -0.5 * pxY, 3.2 * pxX, 1.0 * pxY * (0.6 + browDrop));
      cx.restore();
    }

    // mouth: smug line when calm → gaping fanged maw at rage
    const mouthC = css(dark(body, 0.22));
    if (mouthOpen < 0.15) {
      P(6.3, 8.6, 3.4, 0.7, mouthC);            // calm smile line
    } else {
      const mh = lerp(0.8, 2.6, mouthOpen);
      const mw = lerp(3.0, 4.4, mouthOpen);
      const mx = 8 - mw / 2;
      P(mx, 8.2, mw, mh, "#1b0307");            // dark maw
      if (fangs) {                               // white fangs top & bottom
        P(mx + 0.4, 8.2, 0.8, mh * 0.5, white);
        P(mx + mw - 1.2, 8.2, 0.8, mh * 0.5, white);
        P(mx + mw * 0.5 - 0.4, 8.2 + mh * 0.5, 0.8, mh * 0.45, white);
      }
    }
    cx.restore();

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

  function setUrgency(u) { urgency = Math.max(0, Math.min(1, u)); }
  function setActive(a)  { active = a; if (!a) urgency = 0; }
  function reset()       { urgency = 0; active = false; blink = 0; blinkTimer = 0; }

  return { init, setUrgency, setActive, reset };
})();
window.Monster = Monster;

