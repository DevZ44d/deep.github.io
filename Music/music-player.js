/**
 * music-player.js — Streaming Music Player
 * Realistic procedural wave that mimics real audio analysis
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

  // Per-bar state for organic randomness
  const BAR_COUNT = 55;
  const barTarget  = new Float32Array(BAR_COUNT); // target amplitude
  const barCurrent = new Float32Array(BAR_COUNT); // smoothed current
  const barPhase   = new Float32Array(BAR_COUNT); // individual phase offset
  const barSpeed   = new Float32Array(BAR_COUNT); // individual speed

  // Init per-bar randoms once
  for (let i = 0; i < BAR_COUNT; i++) {
    barPhase[i] = Math.random() * Math.PI * 2;
    barSpeed[i] = 0.6 + Math.random() * 0.8;
    barCurrent[i] = 0.05;
    barTarget[i]  = 0.05;
  }

  // How often we randomise targets (ms)
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

  /* ── Realistic wave engine ── */
  function updateTargets(now) {
    // Refresh targets every ~80ms — mimics audio "beats" changing
    if (now - lastTargetUpdate < 80) return;
    lastTargetUpdate = now;

    // Pick a random "energy center" — like a beat hitting certain frequencies
    const center = rnd(0.15, 0.85);
    const width  = rnd(0.15, 0.45);
    const energy = playing ? rnd(0.4, 1.0) : rnd(0.25, 0.65);

    for (let i = 0; i < BAR_COUNT; i++) {
      const pos  = i / (BAR_COUNT - 1);
      // Gaussian bump around center
      const dist = (pos - center) / width;
      const bump = Math.exp(-dist * dist * 2.5);
      // Add some random noise per bar
      const noise = rnd(-0.08, 0.08);
      barTarget[i] = Math.max(0.03, Math.min(1, bump * energy + noise));
    }
  }

  function drawWave(now) {
    const canvas = document.getElementById("mp-wave-bar");
    if (!canvas) { animId = requestAnimationFrame(drawWave); return; }

    const ctx   = canvas.getContext("2d");
    const W     = canvas.width;
    const H     = canvas.height;
    const gap   = 2.5;
    const barW  = (W - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    const rad   = barW / 2;

    ctx.clearRect(0, 0, W, H);

    // Advance global phase
    phase += playing ? 0.06 : 0.032;

    updateTargets(now);

    // Smooth each bar toward its target
    const smoothSpeed = playing ? 0.18 : 0.12;

    for (let i = 0; i < BAR_COUNT; i++) {
      barCurrent[i] += (barTarget[i] - barCurrent[i]) * smoothSpeed;

      // Layer 1: smoothed random target
      let v = barCurrent[i];

      if (playing) {
        // Layer 2: fast per-bar sine (high-freq shimmer)
        v += Math.sin(phase * barSpeed[i] * 3.5 + barPhase[i]) * 0.08;
        // Layer 3: slow global sine (breathing/rhythm)
        v += Math.sin(phase * 0.8 + i * 0.22) * 0.06;
        // Layer 4: envelope — edges slightly lower like real spectrum
        const env = Math.sin((i / (BAR_COUNT - 1)) * Math.PI);
        v *= (0.65 + env * 0.35);
      } else {
        // Idle: active wave animation (same style as playing but calmer)
        v += Math.sin(phase * barSpeed[i] * 2.0 + barPhase[i]) * 0.12;
        v += Math.sin(phase * 0.5 + i * 0.22) * 0.08;
        const env = Math.sin((i / (BAR_COUNT - 1)) * Math.PI);
        v *= (0.55 + env * 0.45);
      }

      v = Math.max(0.03, Math.min(1, v));

      const barH = Math.max(2, v * H * (playing ? 0.92 : 0.88));
      const x    = i * (barW + gap);
      const y    = (H - barH) / 2;
      const r    = Math.min(rad, barH / 2);

      // Colour — brighter taller bars (mimics real visualiser)
      const alpha = playing ? 0.55 + v * 0.45 : 0.30 + v * 0.40;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;

      // Glow on tall bars
      if (playing && v > 0.5) {
        ctx.shadowColor = `rgba(255,255,255,${(v - 0.5) * 0.6})`;
        ctx.shadowBlur  = 8 + v * 18;
      } else {
        ctx.shadowBlur = 0;
      }

      // Rounded pill bar
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

  /* ── Audio element ── */
  function createAudioElement() {
    if (audio) {
      audio.pause();
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.src = "";
      audio.load();
    }
    audio = new Audio();
    audio.preload     = "metadata";
    audio.crossOrigin = null;
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
  }

  function onEnded() { next(); }
  function onError(e) {
    console.warn("[MusicPlayer] error:", songs[current]?.url);
    if (skipGuard) return;
    skipGuard = true;
    setTimeout(() => { skipGuard = false; }, 3000);
    if (songs.length > 1) setTimeout(next, 500);
  }

  /* ── Load song ── */
  function loadSong(idx, autoplay) {
    if (!songs.length) return;
    current = ((idx % songs.length) + songs.length) % songs.length;
    createAudioElement();
    audio.src = songs[current].url;
    resetTicker(label(current));
    setStyle(false);

    if (autoplay) {
      playing = true;
      setStyle(true);
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
    if (playing) {
      audio.pause();
      playing = false;
      setStyle(false);
    } else {
      if (!audio || !audio.src || audio.src === location.href) {
        loadSong(current, true);
        return;
      }
      audio.play().then(() => {
        playing = true;
        setStyle(true);
      }).catch(() => {});
    }
  }

  function prev() { loadSong(current - 1, playing); }
  function next() { loadSong(current + 1, playing); }

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