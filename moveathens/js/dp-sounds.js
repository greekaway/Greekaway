/**
 * MoveAthens Driver Panel — Sound Library (MP3 only)
 * Plays uploaded MP3 sounds by id or URL.
 * Pre-warms Audio objects on first gesture so iOS allows later playback.
 * Usage: DpSounds.play('mp3_xxx')  /  DpSounds.playUrl('/uploads/...')
 */
(() => {
  'use strict';

  let currentMp3 = null;
  let loopTimer = null;
  const cache = {};       // id → Audio (pre-warmed)
  let warmed = false;

  /** Pre-create + load Audio objects for all known sound files (call on gesture) */
  const warmUp = () => {
    if (warmed) return;
    warmed = true;
    const files = window._dpSoundFiles || [];
    files.forEach(f => {
      if (!f.id || !f.url || cache[f.id]) return;
      const a = new Audio(f.url);
      a.preload = 'auto';
      a.load();
      cache[f.id] = a;
    });
  };

  // Auto-warm on first user interaction (iOS requirement)
  const onGesture = () => {
    warmUp();
    ['click', 'touchstart'].forEach(t => document.removeEventListener(t, onGesture, true));
  };
  ['click', 'touchstart'].forEach(e =>
    document.addEventListener(e, onGesture, { capture: true, passive: true })
  );

  /** Stop any playing MP3 */
  const stop = () => {
    if (currentMp3) { currentMp3.pause(); currentMp3.currentTime = 0; currentMp3 = null; }
  };

  /** Play an uploaded MP3 by id — reuses pre-warmed Audio for iOS compat */
  const play = async (id) => {
    if (!id) return;
    stop();
    // Try cached (pre-warmed) first, fall back to new Audio
    if (cache[id]) {
      currentMp3 = cache[id];
      currentMp3.currentTime = 0;
    } else {
      const files = window._dpSoundFiles || [];
      const file = files.find(f => f.id === id);
      if (!file) return;
      currentMp3 = new Audio(file.url);
      cache[id] = currentMp3;
    }
    try { await currentMp3.play(); } catch { /* silent */ }
  };

  /** Play MP3 by URL directly */
  const playUrl = async (url) => {
    stop();
    currentMp3 = new Audio(url);
    try { await currentMp3.play(); } catch { /* silent */ }
  };

  /** Play a sound in a repeating loop every `intervalMs` (default 4s) */
  const playLoop = (id, intervalMs) => {
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
    play(id);
    loopTimer = setInterval(() => play(id), intervalMs || 4000);
  };

  /** Stop the repeating loop */
  const stopLoop = () => {
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
    stop();
  };

  window.DpSounds = { play, stop, playLoop, stopLoop, playUrl, warmUp };
})();
