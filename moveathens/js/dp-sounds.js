/**
 * MoveAthens Driver Panel — Alert Sound Library (Web Audio API)
 * Programmatic sounds — no external files needed.
 * Usage: DpSounds.play('chime')  /  DpSounds.SOUNDS  /  DpSounds.preview('chime')
 */
(() => {
  'use strict';

  let ctx = null;
  const getCtx = () => {
    if (!ctx || ctx.state === 'closed') ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  /* ── Tone helpers ── */
  const osc = (ac, type, freq, start, dur, gain) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g).connect(ac.destination);
    o.start(start);
    o.stop(start + dur);
  };

  /* ── Sound definitions ── */
  const SOUNDS = {
    chime: {
      name: '🔔 Chime',
      play(ac) {
        const t = ac.currentTime;
        osc(ac, 'sine', 880, t, 0.15, 0.4);
        osc(ac, 'sine', 1108.73, t + 0.15, 0.15, 0.4);
        osc(ac, 'sine', 1318.51, t + 0.3, 0.3, 0.35);
      }
    },
    alert: {
      name: '🚨 Alert',
      play(ac) {
        const t = ac.currentTime;
        for (let i = 0; i < 3; i++) {
          osc(ac, 'square', 800, t + i * 0.2, 0.1, 0.25);
          osc(ac, 'square', 1000, t + i * 0.2 + 0.1, 0.1, 0.25);
        }
      }
    },
    bell: {
      name: '🛎️ Bell',
      play(ac) {
        const t = ac.currentTime;
        osc(ac, 'sine', 1200, t, 0.08, 0.5);
        osc(ac, 'sine', 1500, t + 0.08, 0.08, 0.4);
        osc(ac, 'sine', 1200, t + 0.4, 0.08, 0.35);
        osc(ac, 'sine', 1500, t + 0.48, 0.08, 0.3);
      }
    },
    horn: {
      name: '📯 Horn',
      play(ac) {
        const t = ac.currentTime;
        osc(ac, 'sawtooth', 440, t, 0.3, 0.3);
        osc(ac, 'sawtooth', 554.37, t + 0.3, 0.3, 0.3);
        osc(ac, 'sawtooth', 659.25, t + 0.6, 0.4, 0.25);
      }
    },
    radar: {
      name: '📡 Radar',
      play(ac) {
        const t = ac.currentTime;
        osc(ac, 'sine', 600, t, 0.5, 0.35);
        osc(ac, 'sine', 900, t + 0.5, 0.5, 0.3);
        osc(ac, 'sine', 600, t + 1.0, 0.3, 0.25);
      }
    },
    siren: {
      name: '🚑 Siren',
      play(ac) {
        const t = ac.currentTime;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(600, t);
        o.frequency.linearRampToValueAtTime(1200, t + 0.4);
        o.frequency.linearRampToValueAtTime(600, t + 0.8);
        o.frequency.linearRampToValueAtTime(1200, t + 1.2);
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + 1.4);
      }
    },
    gong: {
      name: '🔊 Gong',
      play(ac) {
        const t = ac.currentTime;
        osc(ac, 'sine', 220, t, 1.0, 0.4);
        osc(ac, 'sine', 440, t, 0.5, 0.2);
        osc(ac, 'sine', 330, t, 0.7, 0.15);
      }
    },
    triple: {
      name: '🔺 Triple Beep',
      play(ac) {
        const t = ac.currentTime;
        osc(ac, 'sine', 1000, t, 0.12, 0.4);
        osc(ac, 'sine', 1000, t + 0.2, 0.12, 0.4);
        osc(ac, 'sine', 1400, t + 0.4, 0.2, 0.35);
      }
    }
  };

  const play = (id) => {
    try {
      const s = SOUNDS[id || 'chime'];
      if (s) s.play(getCtx());
    } catch { /* silent fail */ }
  };

  window.DpSounds = { SOUNDS, play };
})();
