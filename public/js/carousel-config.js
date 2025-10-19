// Centralized carousel config for all trips
// Adjust values here once; the JS will apply CSS variables accordingly.
window.GW_CAROUSEL_CONFIG = {
  // Video aesthetics
  videoRadiusPx: 14,

  // Peek and gap per breakpoint
  mobile: { peek: '10%', gap: '-15px' }, // e.g., '-15px' for tight overlap, or '0px'
  desktop: { peek: '6%', gap: '20px' },

  // Swipe/drag tuning
  swipe: {
    // fraction of viewport width for threshold (e.g., 0.06 = 6%)
    thresholdFrac: 0.06,
    // fast flick detection
    minFlickDeltaPx: 16,
    maxFlickMs: 250,
    minVelocityPxPerMs: 0.6
  },

  // Wheel step cooldown (ms) for trackpads
  wheelStepCooldownMs: 280
};
