/**
 * MoveAthens Driver Panel — Sound Library (MP3 only)
 * Plays uploaded MP3 sounds by id or URL.
 * Usage: DpSounds.play('mp3_xxx')  /  DpSounds.playUrl('/uploads/...')
 */
(() => {
  'use strict';

  let currentMp3 = null;
  let loopTimer = null;

  /** Stop any playing MP3 */
  const stop = () => {
    if (currentMp3) { currentMp3.pause(); currentMp3.currentTime = 0; currentMp3 = null; }
  };

  /** Play an uploaded MP3 by id — uses window._dpSoundFiles for lookup */
  const play = async (id) => {
    if (!id) return;
    stop();
    const files = window._dpSoundFiles || [];
    const file = files.find(f => f.id === id);
    if (!file) return;
    currentMp3 = new Audio(file.url);
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
  };

  window.DpSounds = { play, stop, playLoop, stopLoop, playUrl };
})();
