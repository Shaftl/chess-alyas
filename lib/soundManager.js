// lib/soundManager.js
// Professional SoundManager: cleaner timer countdown, game-start sound, stopTimerLow()
// Backwards-compatible API. Singleton exported at bottom.

class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.settingsKey = "chess_sound_settings_v3";
    this.settings = this._defaultSettings();
    this._loadSettings();
    this._gestureBound = false;
    this._FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
    this._timerLowHandles = []; // track scheduled timeouts for timerLow

    // Enhancer flags & nodes (quality improvements, not volume changes)
    this._enhancerEnabled = true; // set to false to disable all enhancements
    this._enhancerNodes = {
      filter: null,
      waveshaper: null,
      compressor: null,
    };
  }

  _defaultSettings() {
    return {
      globalEnabled: true,
      masterVolume: 0.9,
      sounds: {
        start: { enabled: true, volume: 0.9, wave: "triangle" },
        move: { enabled: true, volume: 0.8, wave: "triangle" },
        capture: { enabled: true, volume: 1.0, wave: "sawtooth" },
        tick: { enabled: true, volume: 0.45, wave: "square" },
        timerLow: { enabled: true, volume: 0.9, wave: "sine" },
        checkmate: { enabled: true, volume: 1.0, wave: "triangle" },
        // NEW sounds
        promotion: { enabled: true, volume: 0.95, wave: "triangle" },
        castle: { enabled: true, volume: 0.85, wave: "sawtooth" },
      },
    };
  }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(this.settingsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.settings = { ...this._defaultSettings(), ...(parsed || {}) };
      }
    } catch (e) {
      // ignore
    }
  }

  _saveSettings() {
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(this.settings));
    } catch (e) {}
  }

  ensureContextOnGesture() {
    if (this.ctx) return;
    if (typeof window === "undefined") return;
    if (this._gestureBound) return;
    const resume = () => {
      this.init();
      document.removeEventListener("click", resume);
      document.removeEventListener("keydown", resume);
      this._gestureBound = false;
    };
    document.addEventListener("click", resume);
    document.addEventListener("keydown", resume);
    this._gestureBound = true;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value =
        typeof this.settings.masterVolume === "number"
          ? this.settings.masterVolume
          : 0.9;

      // Build optional enhancer chain: peaking EQ -> waveshaper (soft clip) -> compressor -> destination
      // This improves presence and perceived loudness without changing user volume settings.
      try {
        // Peaking filter to add presence around 1.5-3kHz
        if (
          this._enhancerEnabled &&
          typeof this.ctx.createBiquadFilter === "function"
        ) {
          const f = this.ctx.createBiquadFilter();
          f.type = "peaking";
          f.frequency.value = 2000;
          f.gain.value = 2.6; // subtle presence boost
          f.Q.value = 1.0;
          this._enhancerNodes.filter = f;
        }

        // Soft clipping waveshaper for pleasant harmonic content
        if (
          this._enhancerEnabled &&
          typeof this.ctx.createWaveShaper === "function"
        ) {
          const ws = this.ctx.createWaveShaper();
          ws.curve = this._makeSoftClipCurve(4096, 0.5);
          ws.oversample = "2x";
          this._enhancerNodes.waveshaper = ws;
        }

        // Gentle dynamics compressor to increase perceived loudness
        if (
          this._enhancerEnabled &&
          typeof this.ctx.createDynamicsCompressor === "function"
        ) {
          const c = this.ctx.createDynamicsCompressor();
          // Conservative settings so dynamics still feel natural
          c.threshold.setValueAtTime(-26, this._now());
          c.knee.setValueAtTime(12, this._now());
          c.ratio.setValueAtTime(3.0, this._now());
          c.attack.setValueAtTime(0.003, this._now());
          c.release.setValueAtTime(0.2, this._now());
          this._enhancerNodes.compressor = c;
        }

        // Chain connections with safe fallbacks
        // masterGain -> (filter?) -> (waveshaper?) -> (compressor?) -> destination
        let inNode = this.masterGain;
        if (this._enhancerNodes.filter) {
          inNode.connect(this._enhancerNodes.filter);
          inNode = this._enhancerNodes.filter;
        }
        if (this._enhancerNodes.waveshaper) {
          inNode.connect(this._enhancerNodes.waveshaper);
          inNode = this._enhancerNodes.waveshaper;
        }
        if (this._enhancerNodes.compressor) {
          inNode.connect(this._enhancerNodes.compressor);
          inNode = this._enhancerNodes.compressor;
        }
        // Finally connect the tail to destination
        inNode.connect(this.ctx.destination);
      } catch (e) {
        // If enhancer construction fails, fall back to direct connection
        try {
          this.masterGain.connect(this.ctx.destination);
        } catch (err) {
          // ignore
        }
      }

      // If nothing connected above (older browsers), ensure direct connection
      if (!this.masterGain) return;
      // Note: if the chain above succeeded, masterGain is already connected through it.
      // If not, ensure a direct connection exists.
      // (The code above already attempts direct connect in catch; keep here just to be safe)
      if (!this.ctx.destination) return;
    } catch (e) {
      this.ctx = null;
    }
  }

  // Small soft-clip curve generator for waveshaper
  _makeSoftClipCurve(samples = 4096, amount = 0.5) {
    const curve = new Float32Array(samples);
    const k = typeof amount === "number" ? amount : 0.5;
    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      // gentle tanh-like shaping controlled by k
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  setMasterVolume(v) {
    this.settings.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain)
      this.masterGain.gain.value = this.settings.masterVolume;
    this._saveSettings();
  }

  enableGlobal(val) {
    this.settings.globalEnabled = !!val;
    this._saveSettings();
  }

  setSoundSetting(name, obj) {
    this.settings.sounds[name] = { ...this.settings.sounds[name], ...obj };
    this._saveSettings();
  }

  _now() {
    return (this.ctx && this.ctx.currentTime) || 0;
  }

  _panForSquare(square) {
    if (!square || typeof square !== "string")
      return (Math.random() - 0.5) * 0.2;
    const file = square[0];
    const idx = this._FILES.indexOf(file);
    if (idx === -1) return (Math.random() - 0.5) * 0.2;
    return (idx / (this._FILES.length - 1) - 0.5) * 1.4; // -0.7 .. 0.7
  }

  _distanceFromTo(from, to) {
    if (!from || !to) return null;
    const fx = this._FILES.indexOf(from[0]);
    const tx = this._FILES.indexOf(to[0]);
    const fy = Number(from[1]);
    const ty = Number(to[1]);
    if (fx === -1 || tx === -1 || Number.isNaN(fy) || Number.isNaN(ty))
      return null;
    return Math.hypot(tx - fx, ty - fy);
  }

  _playOscillator({
    freq = 440,
    duration = 0.12,
    wave = "sine",
    volume = 0.06,
    attack = 0.002,
    decay = 0.06,
    pan = 0,
    detune = 0,
    filterFreq = null,
    filterQ = 0.5,
    type = "sine",
    startOffset = 0,
    glideTo = null,
  } = {}) {
    if (!this.settings.globalEnabled) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime + startOffset;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || wave || "sine";
    o.frequency.setValueAtTime(freq, now);
    if (detune) o.detune.setValueAtTime(detune, now);
    if (glideTo && typeof glideTo === "number") {
      o.frequency.linearRampToValueAtTime(glideTo, now + duration);
    }

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(volume, now + attack);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume * 0.001),
      now + duration + decay
    );

    let nodeOut = g;
    if (filterFreq) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(filterFreq, now);
      f.Q.setValueAtTime(filterQ, now);
      g.connect(f);
      nodeOut = f;
    }

    // If stereo panner exists, use it, otherwise connect directly to masterGain
    if (typeof this.ctx.createStereoPanner === "function") {
      const p = this.ctx.createStereoPanner();
      p.pan.setValueAtTime(pan, now);
      nodeOut.connect(p);
      p.connect(this.masterGain);
    } else {
      nodeOut.connect(this.masterGain);
    }

    // Optional: add a tiny harmonic layer to enrich the tone (very low level)
    // Only add if enhancer chain exists to avoid changing behavior on older browsers
    let o2 = null;
    let g2 = null;
    try {
      if (
        this._enhancerEnabled &&
        this._enhancerNodes.compressor // use presence of compressor as proxy for enhancement availability
      ) {
        o2 = this.ctx.createOscillator();
        g2 = this.ctx.createGain();
        // slight detuned partial to add warmth without raising overall loudness
        o2.type = "sine";
        o2.frequency.setValueAtTime(freq * 1.495, now); // fifth-ish partial
        o2.detune.setValueAtTime((Math.random() - 0.5) * 6, now);
        g2.gain.setValueAtTime(volume * 0.18, now); // low level only
        g2.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, volume * 0.001),
          now + duration + decay
        );
        // route the harmonic through same pan path if panner exists
        if (typeof this.ctx.createStereoPanner === "function") {
          const p2 = this.ctx.createStereoPanner();
          p2.pan.setValueAtTime(pan * 0.6, now);
          g2.connect(p2);
          p2.connect(this.masterGain);
        } else {
          g2.connect(this.masterGain);
        }
        o2.connect(g2);
      }
    } catch (e) {
      // fail silently; harmonic layer is optional
    }

    o.connect(g);
    o.start(now);
    if (o2) {
      o2.start(now);
      o2.stop(now + duration + decay + 0.02);
    }
    o.stop(now + duration + decay + 0.02);
    return { osc: o, gain: g, harmonic: o2 ? { osc: o2, gain: g2 } : null };
  }

  _playNoiseBurst({
    duration = 0.03,
    volume = 0.04,
    pan = 0,
    attack = 0.001,
    decay = 0.02,
    filterFreq = 8000,
  } = {}) {
    if (!this.settings.globalEnabled) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    const buffer = this.ctx.createBuffer(
      1,
      Math.ceil(this.ctx.sampleRate * duration),
      this.ctx.sampleRate
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(volume, now + attack);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume * 0.001),
      now + duration + decay
    );

    let nodeOut = g;
    if (filterFreq) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(filterFreq, now);
      f.Q.setValueAtTime(0.6, now);
      g.connect(f);
      nodeOut = f;
    }

    if (typeof this.ctx.createStereoPanner === "function") {
      const p = this.ctx.createStereoPanner();
      p.pan.setValueAtTime(pan, now);
      nodeOut.connect(p);
      p.connect(this.masterGain);
    } else {
      nodeOut.connect(this.masterGain);
    }

    src.connect(g);
    src.start(now);
    src.stop(now + duration + decay + 0.02);
    return { src, gain: g };
  }

  // PUBLIC high-level sounds
  playStart() {
    const s = this.settings.sounds.start || {};
    if (!s.enabled || !this.settings.globalEnabled) return;
    try {
      if (!this.ctx) this.init();
      // ascending arpeggio + bright click + soft bloom
      const now = this.ctx.currentTime;
      const ar = [330, 440, 550];
      ar.forEach((freq, i) => {
        this._playOscillator({
          freq,
          duration: 0.22,
          volume: 0.06 * (s.volume || 1),
          attack: 0.005,
          decay: 0.12,
          pan: (i - 1) * 0.18,
          type: s.wave || "triangle",
          filterFreq: 3200 - i * 400,
          startOffset: i * 0.08,
        });
      });

      // click
      this._playNoiseBurst({
        duration: 0.02,
        volume: 0.03 * (s.volume || 1),
        filterFreq: 9000,
      });

      // gentle low bloom after
      setTimeout(() => {
        this._playOscillator({
          freq: 120,
          duration: 0.8,
          volume: 0.09 * (s.volume || 1),
          attack: 0.02,
          decay: 0.5,
          type: "sine",
          filterFreq: 600,
        });
      }, 340);
    } catch (e) {}
  }

  playMove(arg = false) {
    const data =
      typeof arg === "boolean" || typeof arg === "undefined"
        ? { captured: !!arg }
        : arg || {};
    const { captured = false, from = null, to = null } = data;
    const s = this.settings.sounds.move || {};
    if (!s.enabled || !this.settings.globalEnabled) return;

    try {
      if (!this.ctx) this.init();
      let pan = 0;
      if (to) pan = this._panForSquare(to);
      else if (from) pan = this._panForSquare(from);
      else pan = (Math.random() - 0.5) * 0.2;

      const distance = this._distanceFromTo(from, to);
      const baseFreq =
        220 +
        (distance ? Math.min(180, distance * 30) : Math.random() * 20 - 10);
      const detune = (Math.random() - 0.5) * 6;

      this._playNoiseBurst({
        duration: 0.02,
        volume: 0.03 * (s.volume || 1),
        pan,
        filterFreq: 9000,
        attack: 0.001,
        decay: 0.02,
      });

      this._playOscillator({
        freq: baseFreq,
        duration: 0.1 + (distance ? Math.min(0.18, distance * 0.03) : 0.02),
        volume: 0.035 * (s.volume || 1),
        attack: 0.003,
        decay: 0.06,
        pan,
        detune,
        filterFreq: 3000,
        filterQ: 1,
        type: s.wave || "triangle",
        glideTo: baseFreq + (captured ? 30 : -10),
      });

      this._playOscillator({
        freq: baseFreq * 2.4 + (Math.random() * 20 - 10),
        duration: 0.06,
        volume: 0.02 * (s.volume || 1),
        attack: 0.001,
        decay: 0.05,
        pan: pan * 0.6,
        detune: (Math.random() - 0.5) * 12,
        filterFreq: 6500,
        type: "sine",
        startOffset: 0.01,
      });

      if (captured) {
        const cap = this.settings.sounds.capture || {};
        this._playOscillator({
          freq: 160,
          duration: 0.18,
          volume: 0.06 * (cap.volume || 1),
          attack: 0.005,
          decay: 0.18,
          pan,
          type: "sawtooth",
          filterFreq: 600,
        });
        setTimeout(() => {
          this._playOscillator({
            freq: 240,
            duration: 0.12,
            volume: 0.04 * (cap.volume || 1),
            attack: 0.002,
            decay: 0.12,
            pan: pan * 0.7,
            type: "square",
            filterFreq: 1400,
          });
        }, 80);
        setTimeout(() => {
          this._playNoiseBurst({
            duration: 0.025,
            volume: 0.03 * (cap.volume || 1),
            pan: pan * 0.8,
            filterFreq: 7000,
            attack: 0.001,
            decay: 0.03,
          });
        }, 110);
      }
    } catch (e) {}
  }

  playCapture() {
    const s = this.settings.sounds.capture || {};
    if (!s.enabled || !this.settings.globalEnabled) return;
    try {
      if (!this.ctx) this.init();
      const pan = (Math.random() - 0.5) * 0.4;

      this._playOscillator({
        freq: 320,
        duration: 0.18,
        volume: 0.09 * (s.volume || 1),
        attack: 0.004,
        decay: 0.18,
        pan,
        type: "sawtooth",
        filterFreq: 1200,
        filterQ: 1,
      });
      setTimeout(() => {
        this._playOscillator({
          freq: 240,
          duration: 0.12,
          volume: 0.06 * (s.volume || 1),
          attack: 0.002,
          decay: 0.12,
          pan: pan * 0.6,
          type: "triangle",
          filterFreq: 1600,
        });
      }, 70);
      setTimeout(() => {
        this._playNoiseBurst({
          duration: 0.03,
          volume: 0.04 * (s.volume || 1),
          pan: pan * 0.7,
          filterFreq: 7000,
        });
      }, 100);
    } catch (e) {}
  }

  playTick() {
    const s = this.settings.sounds.tick || {};
    if (!s.enabled || !this.settings.globalEnabled) return;
    try {
      if (!this.ctx) this.init();
      const pan = (Math.random() - 0.5) * 0.2;
      this._playNoiseBurst({
        duration: 0.02,
        volume: 0.02 * (s.volume || 1),
        pan,
        filterFreq: 9000,
      });
      this._playOscillator({
        freq: 1100 + Math.random() * 200,
        duration: 0.028,
        volume: 0.025 * (s.volume || 1),
        attack: 0.0008,
        decay: 0.02,
        pan,
        type: s.wave || "square",
      });
    } catch (e) {}
  }

  // Improved timerLow: plays a sequence of ticks (default 6) with increasing urgency. Returns array of timeout ids.
  playTimerLow(count = 6, opts = {}) {
    const s = this.settings.sounds.timerLow || {};
    if (!s.enabled || !this.settings.globalEnabled) return [];
    try {
      if (!this.ctx) this.init();
      // stop previous timerLow runners
      this.stopTimerLow();
      const interval = opts.interval || 1000; // ms between ticks
      const handles = [];

      for (let i = 0; i < count; i++) {
        const delay = i * interval;
        const handle = setTimeout(() => {
          // urgency: ramp up frequency and volume as i increases
          const urgency = (i + 1) / count; // 0..1
          const freq = 700 + urgency * 800 + (Math.random() * 40 - 20);
          const vol = 0.03 + urgency * 0.06;
          // short metallic click + tonal overtone
          this._playNoiseBurst({
            duration: 0.02,
            volume: vol * (s.volume || 1),
            pan: 0,
            filterFreq: 9000,
          });
          this._playOscillator({
            freq,
            duration: 0.06,
            volume: vol * (s.volume || 1),
            attack: 0.001,
            decay: 0.04,
            type: s.wave || "sine",
            filterFreq: 3000 - urgency * 1800,
          });

          // last tick slightly longer/louder for emphasis
          if (i === count - 1) {
            this._playOscillator({
              freq: 420 + urgency * 200,
              duration: 0.12,
              volume: 0.07 * (s.volume || 1),
              attack: 0.002,
              decay: 0.12,
              type: "triangle",
              filterFreq: 1200,
            });
            this._playNoiseBurst({
              duration: 0.04,
              volume: 0.04 * (s.volume || 1),
              filterFreq: 8000,
            });
          }
        }, delay);
        handles.push(handle);
        this._timerLowHandles.push(handle);
      }
      return handles;
    } catch (e) {
      return [];
    }
  }

  stopTimerLow() {
    try {
      while (this._timerLowHandles.length) {
        const h = this._timerLowHandles.shift();
        try {
          clearTimeout(h);
        } catch (e) {}
      }
    } catch (e) {}
  }

  playCheckmate() {
    const s = this.settings.sounds.checkmate || {};
    if (!s.enabled || !this.settings.globalEnabled) return;
    try {
      if (!this.ctx) this.init();
      const chord = [880, 660, 440];
      chord.forEach((freq, i) => {
        this._playOscillator({
          freq,
          duration: 0.42,
          volume: 0.14 * (s.volume || 1),
          attack: 0.008,
          decay: 0.28,
          pan: (i - 1) * 0.25,
          type: s.wave || "triangle",
          filterFreq: 3200,
        });
      });

      setTimeout(() => {
        this._playOscillator({
          freq: 140,
          duration: 0.9,
          volume: 0.14 * (s.volume || 1),
          attack: 0.02,
          decay: 0.6,
          pan: 0,
          type: "sine",
          filterFreq: 600,
        });
      }, 520);
      setTimeout(() => {
        this._playOscillator({
          freq: 2200,
          duration: 0.6,
          volume: 0.06 * (s.volume || 1),
          attack: 0.01,
          decay: 0.5,
          pan: 0.2,
          type: "triangle",
          filterFreq: 4200,
        });
      }, 640);
    } catch (e) {}
  }

  // NEW: promotion sound (pleasant, clear trophy-like rising arpeggio + click)
  playPromotion() {
    const s = this.settings.sounds.promotion || {};
    if (!s.enabled || !this.settings.globalEnabled) return;
    try {
      if (!this.ctx) this.init();
      const now = this.ctx.currentTime;
      // rising arpeggio (3 notes) with slightly brighter timbre and a decisive bell click
      const freqs = [520, 740, 980];
      freqs.forEach((f, i) => {
        this._playOscillator({
          freq: f + (Math.random() * 10 - 5),
          duration: 0.28,
          volume: 0.06 * (s.volume || 1),
          attack: 0.004,
          decay: 0.12,
          pan: (i - 1) * 0.12,
          type: "triangle",
          filterFreq: 4200 - i * 300,
          startOffset: i * 0.09,
        });
      });

      // bright click to emphasise promotion moment
      this._playNoiseBurst({
        duration: 0.02,
        volume: 0.04 * (s.volume || 1),
        filterFreq: 11000,
      });

      // small low bloom to add weight
      setTimeout(() => {
        this._playOscillator({
          freq: 160,
          duration: 0.6,
          volume: 0.075 * (s.volume || 1),
          attack: 0.01,
          decay: 0.38,
          type: "sine",
          filterFreq: 700,
        });
      }, 160);
    } catch (e) {}
  }

  // NEW: castle sound (whoosh + wooden/metallic settle)
  playCastle() {
    const s = this.settings.sounds.castle || {};
    if (!s.enabled || !this.settings.globalEnabled) return;
    try {
      if (!this.ctx) this.init();
      // whoosh / sweep
      this._playOscillator({
        freq: 300,
        duration: 0.18,
        volume: 0.04 * (s.volume || 1),
        attack: 0.002,
        decay: 0.12,
        type: "sine",
        filterFreq: 1800,
        glideTo: 900,
      });
      // quick metallic click/settle
      setTimeout(() => {
        this._playNoiseBurst({
          duration: 0.03,
          volume: 0.04 * (s.volume || 1),
          filterFreq: 8000,
        });
      }, 70);
      // short lower thud for weight
      setTimeout(() => {
        this._playOscillator({
          freq: 140,
          duration: 0.26,
          volume: 0.06 * (s.volume || 1),
          attack: 0.007,
          decay: 0.18,
          type: "triangle",
          filterFreq: 600,
        });
      }, 100);
    } catch (e) {}
  }
}

const singleton = new SoundManager();
export default singleton;
