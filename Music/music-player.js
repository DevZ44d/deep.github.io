/**
 * music-player.js — Streaming Music Player
 * Real audio visualizer using Web Audio API AnalyserNode
 * Works when audio files are served from same origin (GitHub Pages)
 */

const MusicPlayer = (() => {

  const songs = (typeof PLAYLIST !== "undefined" && PLAYLIST.length) ? PLAYLIST : [];

  const WAVE_W = 340;
  const WAVE_H = 64;

  let current  = 0;
  let audio    = null;
  let playing  = false;

  let animId   = null;
  let phase    = 0;

  // Beat detection — tracks bass energy to fire edge glow on kick/snare
  let beatEnergy    = 0;   // smoothed bass RMS
  let beatPeak      = 0;   // recent peak for threshold
  let beatGlow      = 0;   // current glow intensity 0-1 (decays each frame)
  let beatCooldown  = 0;   // frames until next beat can fire

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
      analyser.fftSize = 4096;                  // High resolution bins
      analyser.smoothingTimeConstant = 0.82;    // Smooth but responsive
      analyser.minDecibels = -85;               // Tighter dB range → bars don't spike too high
      analyser.maxDecibels = -20;               // Keeps bars moderate in height
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

    let hasData = false;
    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > 0) { hasData = true; break; }
    }
    if (!hasData) return null;

    const nyquist = audioCtx.sampleRate / 2;
    // Focus on the musically meaningful range: 60 Hz – 14 kHz
    const minFreq = 60;
    const maxFreq = 14000;
    const minLog  = Math.log10(minFreq);
    const maxLog  = Math.log10(maxFreq);

    const raw = new Float32Array(BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      const freqLo = Math.pow(10, minLog + (i       / BAR_COUNT) * (maxLog - minLog));
      const freqHi = Math.pow(10, minLog + ((i + 1) / BAR_COUNT) * (maxLog - minLog));
      const binLo  = Math.floor(freqLo / nyquist * freqData.length);
      const binHi  = Math.ceil (freqHi / nyquist * freqData.length);
      const lo     = Math.max(0, Math.min(freqData.length - 1, binLo));
      const hi     = Math.max(lo + 1, Math.min(freqData.length, binHi));
      let sum = 0;
      for (let b = lo; b < hi; b++) sum += freqData[b];
      raw[i] = (sum / (hi - lo)) / 255;
    }

    // Perceptual gain curve:
    //   bass   (i < 0.20): slight cut   — bass bins are naturally loud
    //   mid    (0.20-0.65): neutral
    //   treble (i > 0.65): gentle boost — high freqs are naturally quiet
    const values = new Float32Array(BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / (BAR_COUNT - 1);
      let gain;
      if      (t < 0.20) gain = 0.55 + t * 0.80;          // bass: 0.55 → 0.71
      else if (t < 0.65) gain = 0.71 + (t - 0.20) * 0.60; // mid:  0.71 → 0.98
      else               gain = 0.98 + (t - 0.65) * 1.20; // treble: 0.98 → 1.38
      values[i] = Math.min(1, raw[i] * gain);
    }

    // ── Beat detection from raw bass bins (60–180 Hz) ──
    const bassLo  = Math.floor(60  / nyquist * freqData.length);
    const bassHi  = Math.ceil (180 / nyquist * freqData.length);
    let bassSum = 0, bassCount = 0;
    for (let b = bassLo; b < bassHi && b < freqData.length; b++) {
      bassSum += freqData[b]; bassCount++;
    }
    const bassRMS = bassCount > 0 ? (bassSum / bassCount) / 255 : 0;

    beatEnergy = beatEnergy * 0.85 + bassRMS * 0.15;
    beatPeak   = beatPeak   * 0.992 + beatEnergy * 0.008;

    if (beatCooldown > 0) beatCooldown--;
    const threshold = beatPeak * 1.35 + 0.08;
    if (bassRMS > threshold && beatCooldown === 0) {
      beatGlow     = Math.min(1, beatGlow + 0.75 + bassRMS * 0.5);
      beatCooldown = 8;
    }

    return values;
  }

  /* ── Draw wave ── */
  // Peak dot state — each bar has an independent falling peak marker
  const peakY       = new Float32Array(BAR_COUNT).fill(0); // current peak value 0-1
  const peakVel     = new Float32Array(BAR_COUNT).fill(0); // fall velocity
  const PEAK_GRAVITY = 0.0012;  // how fast peak falls
  const PEAK_HOLD    = 18;      // frames before peak starts dropping
  const peakHold     = new Int32Array(BAR_COUNT).fill(0);

  function drawWave(now) {
    const canvas = document.getElementById("mp-wave-bar");
    if (!canvas) { animId = requestAnimationFrame(drawWave); return; }

    const ctx  = canvas.getContext("2d");
    const W    = canvas.width;
    const H    = canvas.height;
    const gap  = 2.5;
    const barW = (W - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    const rad  = barW / 2;

    // MAX bar height: 42% of canvas height (keeps bars low, elegant)
    const MAX_BAR_RATIO = 0.42;

    ctx.clearRect(0, 0, W, H);
    phase += playing ? 0.06 : 0.032;

    if (playing) {
      beatGlow = Math.max(0, beatGlow - 0.045);
    } else {
      beatGlow = 0;
    }

    const realValues = playing ? getFreqValues() : null;
    if (!realValues) updateTargetsFallback(now);

    const smoothSpeed = playing ? 0.18 : 0.12;

    for (let i = 0; i < BAR_COUNT; i++) {
      let v;

      if (realValues) {
        // Fast attack (0.55), slow release (0.18) — punchy feel
        const target = realValues[i];
        if (target > barCurrent[i]) {
          barCurrent[i] += (target - barCurrent[i]) * 0.55;
        } else {
          barCurrent[i] += (target - barCurrent[i]) * 0.18;
        }
        v = barCurrent[i];
        // Tiny shimmer only — doesn't inflate bar height
        v += Math.sin(phase * barSpeed[i] * 2 + barPhase[i]) * 0.008;
      } else {
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

      // ── Bars grow from centre, capped at MAX_BAR_RATIO ──
      const barH = Math.max(2, v * H * MAX_BAR_RATIO);
      const x    = i * (barW + gap);
      const y    = (H - barH) / 2;
      const r    = Math.min(rad, barH / 2);

      const alpha = playing ? 0.50 + v * 0.50 : 0.25 + v * 0.35;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;

      // Subtle glow only for bars above 60% of their own max
      if (playing && v > 0.6) {
        ctx.shadowColor = `rgba(255,255,255,${(v - 0.6) * 0.35})`;
        ctx.shadowBlur  = 4 + v * 8;
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

      // ── Peak dot (only when real audio is playing) ──
      if (realValues && playing) {
        if (v >= peakY[i]) {
          peakY[i]   = v;
          peakHold[i] = PEAK_HOLD;
          peakVel[i]  = 0;
        } else {
          if (peakHold[i] > 0) {
            peakHold[i]--;
          } else {
            peakVel[i]  += PEAK_GRAVITY;
            peakY[i]    = Math.max(0, peakY[i] - peakVel[i]);
          }
        }

        if (peakY[i] > 0.04) {
          ctx.shadowBlur = 0;
          const dotH    = peakY[i] * H * MAX_BAR_RATIO;
          const dotY    = (H - dotH) / 2 - 2; // 2px gap above bar top
          const dotAlpha = 0.55 + peakY[i] * 0.45;
          ctx.fillStyle = `rgba(255,255,255,${dotAlpha})`;
          ctx.beginPath();
          ctx.roundRect(x, dotY, barW, 1.5, 0.75);
          ctx.fill();
        }
      } else {
        // Reset peaks when paused
        peakY[i]    = 0;
        peakVel[i]  = 0;
        peakHold[i] = 0;
      }
    }

    ctx.shadowBlur = 0;
    if (beatGlow > 0.01) {
      const ease  = beatGlow * beatGlow;           // quadratic — snappy attack, smooth tail
      const bRad  = 999;                           // matches CSS border-radius: 999px
      const alpha1 = ease * 0.85;
      const alpha2 = ease * 0.40;
      const alpha3 = ease * 0.18;
      const spread1 = 10 + ease * 14;
      const spread2 = ease * 30;

      ctx.save();
      ctx.shadowColor = `rgba(255,255,255,${alpha1})`;
      ctx.shadowBlur  = spread1;
      ctx.strokeStyle = `rgba(255,255,255,${alpha1 * 0.6})`;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.roundRect(2, 2, W - 4, H - 4, bRad);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.shadowColor = `rgba(255,255,255,${alpha2})`;
      ctx.shadowBlur  = spread2;
      ctx.strokeStyle = `rgba(255,255,255,${alpha2 * 0.3})`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.roundRect(1, 1, W - 2, H - 2, bRad);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = `rgba(255,255,255,${alpha3})`;
      ctx.shadowBlur  = 50 + ease * 30;
      ctx.strokeStyle = `rgba(255,255,255,${alpha3 * 0.2})`;
      ctx.lineWidth   = 0.5;
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, bRad);
      ctx.stroke();
      ctx.restore();
    }

    animId = requestAnimationFrame(drawWave);
  }

  function createAudioElement() {
    audio = new Audio();
    audio.preload = "metadata";
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
