// FX — minimal feedback layer for speed drills.
// Synth audio only: no canvas, no particles, nothing that can block the input path.
const FX = (() => {
  let actx = null;
  let soundOn = localStorage.getItem("md_sound") !== "0";

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
    const osc = a.createOscillator(), g = a.createGain();
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
    const osc = a.createOscillator(), g = a.createGain();
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
    correct() { tone(660, 0, 0.055, "square", 0.05); },
    streak(n) {
      const base = 620 + Math.min(n, 10) * 30;
      tone(base, 0, 0.05, "square", 0.05);
      tone(base * 1.5, 0.04, 0.07, "square", 0.04);
    },
    wrong()  { sweep(220, 80, 0, 0.24, "sawtooth", 0.07); },
    click()  { tone(660, 0, 0.02, "square", 0.025); },
    promote(){ [523, 659, 784, 1047].forEach((n, i) => tone(n, i * 0.07, 0.16, "triangle", 0.07)); },
  };

  function setSound(on) { soundOn = on; localStorage.setItem("md_sound", on ? "1" : "0"); }
  function getSound() { return soundOn; }

  return { sfx, audio, setSound, getSound };
})();
