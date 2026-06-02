/**
 * music-player.js — Streaming Music Player
 * Real audio visualizer using Web Audio API AnalyserNode
 */

const MusicPlayer = (() => {

  const songs = (typeof PLAYLIST !== "undefined" && PLAYLIST.length) ? PLAYLIST : [];

  const WAVE_W = 340;
  const WAVE_H = 40;

  let current  = 0;
  let audio    = null;
  let playing  = false;
  let animId   = null;
  let phase    = 0;

  // Web Audio API
  let audioCtx      = null;
  let analyser      = null;
  let source        = null;
  let freqData      = null;
  let webAudioReady = false;

  const BAR_COUNT = 55;

  // Per-bar smoothed values + fallback state
  const barSmooth  = new Float32Array(BAR_COUNT); // smoothed real values
  const barTarget  = new Float32Array(BAR_COUNT); // fallback targets
  const barCurrent = new Float32Array(BAR_COUNT); // fallback current
  const barPhase   = new Float32Array(BAR_COUNT);
  const barSpeed   = new Float32Array(BAR_COUNT);

  for (let i = 0; i < BAR_COUNT; i++) {
    barPhase[i]   = Math.random() * Math.PI * 2;
    barSpeed[i]   = 0.6 + Math.random() * 0.8;
    barCurrent[i] = 0.05;
    barTarget[i]  = 0.05;
    barSmooth[i]  = 0.05;
  }

  let lastTargetUpdate = 0;
  let tickRaf      = null;
  let tickLastTime = null;
  let tickX        = 0;
  let skipGuard    = false;

  /* ── Helpers ── */
  function pad(n)   { return String(n + 1).padStart(2, "0"); }
  function label(i) {
    const s = songs[i];
    return `${pad(i)}. ${s.title}${s.artist ? " — " + s.artist : ""}`;
  }
  function rnd(min, max) { return min + Math.random() * (max - min); }

  /* ── Web Audio Setup ── */
  function setupAudioContext() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      // Low smoothing = fast reaction to drums/beats
      // High smoothing = smooth slow animation
      // 0.65 is a good balance: responsive but not too jumpy
      analyser.smoothingTimeConstant = 0.65;
      // Boost sensitivity range
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      freqData = new Uint8Array(analyser.frequencyBinCount); // 512 bins
      analyser.connect(audioCtx.destination);
    } catch (e) {
      console.warn("[MusicPlayer] Web Audio API not available:", e);
      audioCtx = null;
      analyser = null;
    }
  }

  function connectAudioSource() {
    if (!audioCtx || !analyser || !audio || source) return;
    try {
      source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      webAudioReady = true;
      console.info("[MusicPlayer] Web Audio connected ✓");
    } catch (e) {
      console.warn("[MusicPlayer] createMediaElementSource failed:", e);
      webAudioReady = false;
    }
  }

  /* ── DOM ── */
  function buildDOM() {
    const root = document.createElement("div");
    root.id = "mp-root";
    root.innerHTML = `
      <canvas id="mp-wave-bar" width="${WAVE_W}" height="${WAVE_H}"></canvas>
      <div id="mp-pill">
        <button id="mp-prev">&lt;&lt;</button>
        <div id="mp-ticker-clip">
          <div id="mp-ticker-text"></div>
        </div>
        <button id="mp-next">&gt;&gt;</button>
      </div>
      <div id="mp-tooltip">&#9654; Click the wave bar to play</div>
    `;
    document.body.appendChild(root);
    document.getElementById("mp-prev")    .addEventListener("click", prev);
    document.getElementById("mp-next")    .addEventListener("click", next);
    document.getElementById("mp-wave-bar").addEventListener("click", togglePlay);
  }

  /* ── Ticker ── */
  function startTicker() {
    if (tickRaf) { cancelAnimationFrame(tickRaf); tickRaf = null; }
    const txt  = document.getElementById("mp-ticker-text");
    const clip = document.getElementById("mp-ticker-clip");
    if (!txt || !clip) return;
    tickLastTime = null;
    function step(ts) {
      if (tickLastTime === null) tickLastTime = ts;
      const dt = Math.min(ts - tickLastTime, 50);
      tickLastTime = ts;
      tickX -= (playing ? 55 : 30) * dt / 1000;
      if (tickX < -(txt.scrollWidth + 20)) tickX = clip.offsetWidth + 20;
      txt.style.transform = `translateX(${tickX}px)`;
      tickRaf = requestAnimationFrame(step);
    }
    tickRaf = requestAnimationFrame(step);
  }

  function resetTicker(lbl) {
    if (tickRaf) { cancelAnimationFrame(tickRaf); tickRaf = null; }
    const txt  = document.getElementById("mp-ticker-text");
    const clip = document.getElementById("mp-ticker-clip");
    if (!txt || !clip) return;
    txt.textContent = lbl;
    tickX = (clip.offsetWidth || 160) + 20;
    txt.style.transform = `translateX(${tickX}px)`;
    setTimeout(startTicker, 60);
  }

  /* ── Fallback procedural wave ── */
  function updateTargetsFallback(now) {
    if (now - lastTargetUpdate < 80) return;
    lastTargetUpdate = now;
    const center = rnd(0.15, 0.85);
    const width  = rnd(0.15, 0.45);
    const energy = playing ? rnd(0.4, 1.0) : rnd(0.25, 0.65);
    for (let i = 0; i < BAR_COUNT; i++) {
      const pos   = i / (BAR_COUNT - 1);
      const dist  = (pos - center) / width;
      const bump  = Math.exp(-dist * dist * 2.5);
      const noise = rnd(-0.08, 0.08);
      barTarget[i] = Math.max(0.03, Math.min(1, bump * energy + noise));
    }
  }

  /* ── Real frequency values — full bar coverage, logarithmic scale ── */
  function getFreqValues() {
    if (!webAudioReady || !analyser || !freqData) return null;
    analyser.getByteFrequencyData(freqData);

    // Check we have actual data
    let hasData = false;
    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > 0) { hasData = true; break; }
    }
    if (!hasData) return null;

    const totalBins = freqData.length; // 512 bins with fftSize=1024
    // Cover full audible range — all 512 bins
    // Logarithmic scale: more resolution in bass, less in treble (matches human hearing)
    const values = new Float32Array(BAR_COUNT);

    for (let i = 0; i < BAR_COUNT; i++) {
      // Logarithmic bin mapping — bass gets more bars, treble gets less
      // pow(x, 2) = stronger log curve = more bass detail
      const startRatio = Math.pow(i / BAR_COUNT, 2);
      const endRatio   = Math.pow((i + 1) / BAR_COUNT, 2);
      const start = Math.floor(startRatio * totalBins);
      const end   = Math.max(start + 1, Math.floor(endRatio * totalBins));

      let sum = 0, count = 0;
      for (let b = start; b < end && b < totalBins; b++) {
        sum += freqData[b];
        count++;
      }
      const raw = count > 0 ? (sum / count) / 255 : 0;

      // Per-bar smoothing: fast attack, slow release (like real VU meters)
      // Attack: jump up quickly when signal rises
      // Release: fall down slowly — gives the "bouncing" bar effect
      const attack  = 0.6;  // fast rise
      const release = 0.12; // slow fall
      if (raw > barSmooth[i]) {
        barSmooth[i] += (raw - barSmooth[i]) * attack;
      } else {
        barSmooth[i] += (raw - barSmooth[i]) * release;
      }

      values[i] = barSmooth[i];
    }
    return values;
  }

  /* ── Draw wave ── */
  function drawWave(now) {
    const canvas = document.getElementById("mp-wave-bar");
    if (!canvas) { animId = requestAnimationFrame(drawWave); return; }

    const ctx  = canvas.getContext("2d");
    const W    = canvas.width;
    const H    = canvas.height;
    const gap  = 2.5;
    const barW = (W - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    const rad  = barW / 2;

    ctx.clearRect(0, 0, W, H);
    phase += playing ? 0.06 : 0.032;

    const realValues = playing ? getFreqValues() : null;
    if (!realValues) updateTargetsFallback(now);

    for (let i = 0; i < BAR_COUNT; i++) {
      let v;

      if (realValues) {
        // Pure real data — no envelope, each bar is truly independent
        v = realValues[i];

        // Amplify low values so quiet parts still show movement
        // sqrt gives more visual range to quiet signals
        v = Math.sqrt(v) * 0.85 + v * 0.15;

        // Very slight shimmer so it doesn't look static during sustained notes
        v += Math.sin(phase * barSpeed[i] + barPhase[i]) * 0.015;

      } else {
        // Fallback procedural
        const smoothSpeed = playing ? 0.18 : 0.12;
        barCurrent[i] += (barTarget[i] - barCurrent[i]) * smoothSpeed;
        v = barCurrent[i];
        if (playing) {
          v += Math.sin(phase * barSpeed[i] * 3.5 + barPhase[i]) * 0.08;
          v += Math.sin(phase * 0.8 + i * 0.22) * 0.06;
          const env = Math.sin((i / (BAR_COUNT - 1)) * Math.PI);
          v *= (0.5 + env * 0.5);
        } else {
          v += Math.sin(phase * barSpeed[i] * 2.0 + barPhase[i]) * 0.12;
          v += Math.sin(phase * 0.5 + i * 0.22) * 0.08;
          const env = Math.sin((i / (BAR_COUNT - 1)) * Math.PI);
          v *= (0.4 + env * 0.6);
        }
      }

      v = Math.max(0.02, Math.min(1, v));

      const barH = Math.max(2, v * H * (playing ? 0.96 : 0.88));
      const x    = i * (barW + gap);
      const y    = (H - barH) / 2;
      const r    = Math.min(rad, barH / 2);

      const alpha = playing ? 0.55 + v * 0.45 : 0.25 + v * 0.45;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;

      if (playing && v > 0.4) {
        ctx.shadowColor = `rgba(255,255,255,${(v - 0.4) * 0.5})`;
        ctx.shadowBlur  = 4 + v * 12;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.arcTo(x + barW, y,        x + barW, y + r,        r);
      ctx.lineTo(x + barW, y + barH - r);
      ctx.arcTo(x + barW, y + barH, x + barW - r, y + barH, r);
      ctx.lineTo(x + r,   y + barH);
      ctx.arcTo(x,        y + barH, x, y + barH - r,        r);
      ctx.lineTo(x,       y + r);
      ctx.arcTo(x,        y,        x + r, y,               r);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    animId = requestAnimationFrame(drawWave);
  }

  /* ── Audio element (single, persistent) ── */
  function createAudioElement() {
    audio = new Audio();
    audio.preload = "metadata";
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
  }

  function onEnded() { next(); }

  function onError() {
    console.warn("[MusicPlayer] audio error:", songs[current]?.url);
    if (skipGuard) return;
    skipGuard = true;
    setTimeout(() => { skipGuard = false; }, 3000);
    if (songs.length > 1) setTimeout(next, 500);
  }

  /* ── Load song ── */
  function loadSong(idx, autoplay) {
    if (!songs.length) return;
    current = ((idx % songs.length) + songs.length) % songs.length;
    audio.src = songs[current].url;
    resetTicker(label(current));
    setStyle(false);

    if (autoplay) {
      playing = true;
      setStyle(true);
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      audio.play().catch(err => {
        console.warn("[MusicPlayer] play blocked:", err);
        playing = false;
        setStyle(false);
      });
    }
  }

  /* ── Controls ── */
  function togglePlay() {
    if (!songs.length) return;
    setupAudioContext();
    connectAudioSource();

    if (playing) {
      audio.pause();
      playing = false;
      setStyle(false);
    } else {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      if (!audio.src || audio.src === location.href) {
        loadSong(current, true);
        return;
      }
      audio.play().then(() => {
        playing = true;
        setStyle(true);
      }).catch(() => {
        loadSong(current, true);
      });
    }
  }

  function prev() {
    setupAudioContext();
    connectAudioSource();
    loadSong(current - 1, playing);
  }

  function next() {
    setupAudioContext();
    connectAudioSource();
    loadSong(current + 1, playing);
  }

  function setStyle(on) {
    const r   = document.getElementById("mp-root");
    const tip = document.getElementById("mp-tooltip");
    if (r)   r.classList.toggle("mp-playing", on);
    if (tip) tip.textContent = on ? "⏸ Click to pause" : "▶ Click the wave bar to play";
  }

  function watchModal() {
    const modal = document.querySelector(".modal");
    if (!modal) return;
    new MutationObserver(() => {
      const r = document.getElementById("mp-root");
      if (r) r.style.top = modal.classList.contains("show") ? "62px" : "18px";
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  /* ── Init ── */
  function init() {
    if (!songs.length) {
      console.warn("[MusicPlayer] PLAYLIST is empty.");
      return;
    }
    buildDOM();
    createAudioElement();
    requestAnimationFrame(drawWave);
    resetTicker(label(current));
    watchModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
