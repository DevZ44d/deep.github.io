/**
 * music-player.js — Streaming Music Player
 * Real audio visualizer using Web Audio API AnalyserNode
 * Works when audio files are served from same origin (GitHub Pages)
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

  // Per-bar state for idle / fallback animation
  const barTarget  = new Float32Array(BAR_COUNT);
  const barCurrent = new Float32Array(BAR_COUNT);
  const barPhase   = new Float32Array(BAR_COUNT);
  const barSpeed   = new Float32Array(BAR_COUNT);

  for (let i = 0; i < BAR_COUNT; i++) {
    barPhase[i]   = Math.random() * Math.PI * 2;
    barSpeed[i]   = 0.6 + Math.random() * 0.8;
    barCurrent[i] = 0.05;
    barTarget[i]  = 0.05;
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
      // Larger fftSize = more frequency bins = better resolution across all bars
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.78;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.connect(audioCtx.destination);
    } catch (e) {
      console.warn("[MusicPlayer] Web Audio API not available:", e);
      audioCtx = null;
      analyser = null;
    }
  }

  function connectAudioSource() {
    if (!audioCtx || !analyser || !audio) return;
    if (source) return;
    try {
      source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      webAudioReady = true;
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

  /* ── Fallback procedural wave (idle or no Web Audio) ── */
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

  /* ── Real frequency values from AnalyserNode (logarithmic scale) ── */
  function getFreqValues() {
    if (!webAudioReady || !analyser || !freqData) return null;
    analyser.getByteFrequencyData(freqData);

    // Check if analyser is actually returning data (all zeros = CORS blocked)
    let hasData = false;
    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > 0) { hasData = true; break; }
    }
    if (!hasData) return null;

    // Use logarithmic frequency mapping so high-freq bars aren't always empty.
    // Human hearing is logarithmic — this mirrors how music actually sounds.
    const nyquist   = audioCtx.sampleRate / 2;
    const minFreq   = 40;    // Hz — skip sub-bass rumble
    const maxFreq   = 18000; // Hz — cover full audible range
    const minLog    = Math.log10(minFreq);
    const maxLog    = Math.log10(maxFreq);

    const values = new Float32Array(BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      // Frequency edges for this bar (log scale)
      const freqLo = Math.pow(10, minLog + (i     / BAR_COUNT) * (maxLog - minLog));
      const freqHi = Math.pow(10, minLog + ((i+1) / BAR_COUNT) * (maxLog - minLog));

      // Convert Hz → bin index
      const binLo = Math.floor(freqLo / nyquist * freqData.length);
      const binHi = Math.ceil (freqHi / nyquist * freqData.length);
      const lo    = Math.max(0, Math.min(freqData.length - 1, binLo));
      const hi    = Math.max(lo + 1, Math.min(freqData.length, binHi));

      let sum = 0;
      for (let b = lo; b < hi; b++) sum += freqData[b];
      values[i] = (sum / (hi - lo)) / 255;
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

    const smoothSpeed = playing ? 0.18 : 0.12;

    for (let i = 0; i < BAR_COUNT; i++) {
      let v;

      if (realValues) {
        // Real audio data path — no edge envelope so right side shows too
        barCurrent[i] += (realValues[i] - barCurrent[i]) * 0.35;
        v = barCurrent[i];
        // Subtle shimmer only
        v += Math.sin(phase * barSpeed[i] * 2 + barPhase[i]) * 0.02;
      } else {
        // Fallback procedural path
        barCurrent[i] += (barTarget[i] - barCurrent[i]) * smoothSpeed;
        v = barCurrent[i];
        if (playing) {
          v += Math.sin(phase * barSpeed[i] * 3.5 + barPhase[i]) * 0.08;
          v += Math.sin(phase * 0.8 + i * 0.22) * 0.06;
          const env = Math.sin((i / (BAR_COUNT - 1)) * Math.PI);
          v *= (0.65 + env * 0.35);
        } else {
          v += Math.sin(phase * barSpeed[i] * 2.0 + barPhase[i]) * 0.12;
          v += Math.sin(phase * 0.5 + i * 0.22) * 0.08;
          const env = Math.sin((i / (BAR_COUNT - 1)) * Math.PI);
          v *= (0.55 + env * 0.45);
        }
      }

      v = Math.max(0.03, Math.min(1, v));

      const barH = Math.max(2, v * H * (playing ? 0.92 : 0.88));
      const x    = i * (barW + gap);
      const y    = (H - barH) / 2;
      const r    = Math.min(rad, barH / 2);

      const alpha = playing ? 0.55 + v * 0.45 : 0.30 + v * 0.40;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;

      if (playing && v > 0.5) {
        ctx.shadowColor = `rgba(255,255,255,${(v - 0.5) * 0.6})`;
        ctx.shadowBlur  = 8 + v * 18;
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

  /* ── Single persistent Audio element ── */
  function createAudioElement() {
    audio = new Audio();
    audio.preload = "metadata";
    // crossOrigin = "anonymous" is required so Web Audio API AnalyserNode
    // can read frequency data from external URLs without CORS blocking it.
    // The server at deep.is-a.dev must send Access-Control-Allow-Origin: *
    audio.crossOrigin = "anonymous";
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
