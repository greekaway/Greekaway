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
    return ctx;
  };

  /** Warm up / resume context — call on first user tap */
  const warmUp = () => {
    const ac = getCtx();
    if (ac.state === 'suspended') ac.resume();
  };

  /** Stop all currently playing sounds by closing & recreating the context */
  const stop = () => {
    try {
      if (ctx && ctx.state !== 'closed') ctx.close();
    } catch (_) { /* ignore */ }
    ctx = null;
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
    },

    /* ── Long tones (6-10 sec, for incoming calls/requests) ── */

    ringtone: {
      name: '📱 Ringtone',
      play(ac) {
        const t = ac.currentTime;
        for (let i = 0; i < 4; i++) {
          const off = i * 1.6;
          osc(ac, 'sine', 880, t + off, 0.3, 0.35);
          osc(ac, 'sine', 1108, t + off + 0.3, 0.3, 0.35);
          osc(ac, 'sine', 880, t + off + 0.6, 0.2, 0.3);
        }
      }
    },
    alarm: {
      name: '⏰ Alarm',
      play(ac) {
        const t = ac.currentTime;
        for (let i = 0; i < 5; i++) {
          const off = i * 1.4;
          osc(ac, 'square', 700, t + off, 0.25, 0.22);
          osc(ac, 'square', 900, t + off + 0.35, 0.25, 0.22);
          osc(ac, 'square', 700, t + off + 0.7, 0.25, 0.22);
        }
      }
    },
    cascade: {
      name: '🎶 Cascade',
      play(ac) {
        const notes = [523, 587, 659, 784, 880, 784, 659, 587, 523, 587, 659, 784];
        const t = ac.currentTime;
        notes.forEach((freq, i) => {
          osc(ac, 'sine', freq, t + i * 0.5, 0.45, 0.32);
        });
      }
    },
    pulse: {
      name: '💓 Pulse',
      play(ac) {
        const t = ac.currentTime;
        for (let i = 0; i < 8; i++) {
          const off = i * 0.9;
          osc(ac, 'sine', 660, t + off, 0.15, 0.4);
          osc(ac, 'sine', 880, t + off + 0.2, 0.15, 0.35);
          osc(ac, 'sine', 660, t + off + 0.4, 0.15, 0.3);
        }
      }
    },
    urgentCall: {
      name: '🚨 Urgent Call',
      play(ac) {
        const t = ac.currentTime;
        for (let i = 0; i < 6; i++) {
          const off = i * 1.2;
          const o1 = ac.createOscillator();
          const g1 = ac.createGain();
          o1.type = 'sine';
          o1.frequency.setValueAtTime(600, t + off);
          o1.frequency.linearRampToValueAtTime(1100, t + off + 0.5);
          o1.frequency.linearRampToValueAtTime(600, t + off + 1.0);
          g1.gain.setValueAtTime(0.3, t + off);
          g1.gain.exponentialRampToValueAtTime(0.001, t + off + 1.1);
          o1.connect(g1).connect(ac.destination);
          o1.start(t + off);
          o1.stop(t + off + 1.1);
        }
      }
    },
    melody: {
      name: '🎵 Melody',
      play(ac) {
        const t = ac.currentTime;
        const seq = [659,659,0,659,0,523,659,0,784,0,0,0,392];
        seq.forEach((freq, i) => {
          if (freq > 0) osc(ac, 'sine', freq, t + i * 0.4, 0.35, 0.3);
        });
      }
    },

    /* ── Ride-hailing dispatch tones ── */

    dispatch: {
      name: '🚕 Dispatch',
      play(ac) {
        const t = ac.currentTime;
        // Rising ping-pong: two-tone repeating (like Uber new-ride)
        for (let i = 0; i < 5; i++) {
          const off = i * 1.0;
          osc(ac, 'sine', 1047, t + off, 0.08, 0.45);
          osc(ac, 'sine', 1319, t + off + 0.12, 0.08, 0.45);
          osc(ac, 'sine', 1568, t + off + 0.24, 0.12, 0.4);
        }
      }
    },
    rideAlert: {
      name: '🛻 Ride Alert',
      play(ac) {
        const t = ac.currentTime;
        // Digital chirp with bass undertone (FreeNow style)
        for (let i = 0; i < 4; i++) {
          const off = i * 1.4;
          osc(ac, 'sine', 523, t + off, 0.06, 0.3);
          osc(ac, 'triangle', 784, t + off + 0.1, 0.06, 0.4);
          osc(ac, 'sine', 1047, t + off + 0.2, 0.1, 0.45);
          osc(ac, 'sine', 1319, t + off + 0.35, 0.1, 0.4);
          osc(ac, 'sine', 1047, t + off + 0.5, 0.06, 0.3);
          // bass pulse
          osc(ac, 'sine', 220, t + off + 0.65, 0.2, 0.15);
        }
      }
    },
    appPing: {
      name: '📲 App Ping',
      play(ac) {
        const t = ac.currentTime;
        // Clean modern notification (like smartphone ride apps)
        for (let i = 0; i < 3; i++) {
          const off = i * 2.0;
          osc(ac, 'sine', 880, t + off, 0.05, 0.4);
          osc(ac, 'sine', 1175, t + off + 0.08, 0.05, 0.4);
          osc(ac, 'sine', 1397, t + off + 0.16, 0.08, 0.45);
          // pause then repeat softer
          osc(ac, 'sine', 880, t + off + 0.6, 0.05, 0.3);
          osc(ac, 'sine', 1175, t + off + 0.68, 0.05, 0.3);
          osc(ac, 'sine', 1397, t + off + 0.76, 0.08, 0.35);
        }
      }
    },
    taxiCall: {
      name: '🚖 Taxi Call',
      play(ac) {
        const t = ac.currentTime;
        // Warm urgency: sweep up then 3-note melody, repeating
        for (let i = 0; i < 4; i++) {
          const off = i * 1.5;
          // sweep
          const sw = ac.createOscillator();
          const sg = ac.createGain();
          sw.type = 'sine';
          sw.frequency.setValueAtTime(500, t + off);
          sw.frequency.exponentialRampToValueAtTime(1200, t + off + 0.2);
          sg.gain.setValueAtTime(0.35, t + off);
          sg.gain.exponentialRampToValueAtTime(0.001, t + off + 0.3);
          sw.connect(sg).connect(ac.destination);
          sw.start(t + off);
          sw.stop(t + off + 0.3);
          // melody notes
          osc(ac, 'sine', 784, t + off + 0.35, 0.12, 0.4);
          osc(ac, 'sine', 988, t + off + 0.5, 0.12, 0.4);
          osc(ac, 'sine', 1175, t + off + 0.65, 0.2, 0.35);
        }
      }
    }
  };

  /* ── Sound groups for UI rendering ── */
  const GROUPS = [
    { label: 'Σύντομοι', ids: ['chime','alert','bell','horn','radar','siren','gong','triple'] },
    { label: 'Μεγάλοι',  ids: ['ringtone','alarm','cascade','pulse','urgentCall','melody'] },
    { label: 'Dispatch',  ids: ['dispatch','rideAlert','appPing','taxiCall'] }
  ];

  let loopTimer = null;
  let currentMp3 = null;

  const play = async (id) => {
    try {
      // Check if it's an MP3 file (id starts with mp3_)
      if (id && id.startsWith('mp3_')) {
        await playMp3(id);
        return;
      }
      const ac = getCtx();
      if (ac.state === 'suspended') await ac.resume();
      const s = SOUNDS[id || 'chime'];
      if (s) s.play(ac);
    } catch { /* silent fail */ }
  };

  /** Play an uploaded MP3 by id — needs config loaded */
  const playMp3 = async (id) => {
    stopMp3();
    const files = window._dpSoundFiles || [];
    const file = files.find(f => f.id === id);
    if (!file) return;
    currentMp3 = new Audio(file.url);
    try { await currentMp3.play(); } catch { /* silent */ }
  };

  const stopMp3 = () => {
    if (currentMp3) { currentMp3.pause(); currentMp3.currentTime = 0; currentMp3 = null; }
  };

  /** Play MP3 by URL directly */
  const playUrl = async (url) => {
    stopMp3();
    currentMp3 = new Audio(url);
    try { await currentMp3.play(); } catch { /* silent */ }
  };

  /** Play a sound in a repeating loop every `intervalMs` (default 4s) */
  const playLoop = (id, intervalMs) => {
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
    play(id);
    const ms = intervalMs || 4000;
    loopTimer = setInterval(() => play(id), ms);
  };

  /** Stop the repeating loop */
  const stopLoop = () => {
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
  };

  /* Warm-up on first user interaction so sounds work from SSE events */
  const tapEvents = ['click', 'touchstart', 'keydown'];
  const onFirstInteraction = () => {
    warmUp();
    tapEvents.forEach(e => document.removeEventListener(e, onFirstInteraction, true));
  };
  tapEvents.forEach(e => document.addEventListener(e, onFirstInteraction, { capture: true, once: false, passive: true }));

  window.DpSounds = { SOUNDS, GROUPS, play, stop, warmUp, playLoop, stopLoop, playUrl, stopMp3 };
})();
