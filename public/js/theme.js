// Greekaway theme behaviors for uniform styling and animations
// - Sets flat variant (no PNG) and triggers cinematic entrance on load
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    try {
      // Allow override via localStorage if needed: set ga_variant to 'images' to revert
      var variant = (localStorage && localStorage.getItem('ga_variant')) || 'flat';
      if (variant === 'flat') document.body.classList.add('ga-variant-flat');
      else document.body.classList.add('ga-variant-images');

      // Trigger load animations once
      requestAnimationFrame(function(){
        // small delay to ensure layout is stable before animating
        setTimeout(function(){ document.body.classList.add('is-loaded'); }, 30);
      });

      // Ensure white underglow appears on touch by toggling a press class
      var pressTargets = function(el){
        return el && (el.closest('.category-btn') || el.closest('#trips-container .trip-card'));
      };
      var down = function(e){
        var t = pressTargets(e.target);
        if (!t) return;
        t.classList.add('is-pressing');
      };
      var up = function(e){
        // clear from any currently pressing elements
        document.querySelectorAll('.category-btn.is-pressing, #trips-container .trip-card.is-pressing').forEach(function(n){ n.classList.remove('is-pressing'); });
      };
      // Pointer events (modern)
      document.addEventListener('pointerdown', down, { passive: true });
      document.addEventListener('pointerup', up, { passive: true });
      document.addEventListener('pointercancel', up, { passive: true });
      // Fallbacks for older Safari
      document.addEventListener('touchstart', down, { passive: true });
      document.addEventListener('touchend', up, { passive: true });
      document.addEventListener('mousedown', down);
      document.addEventListener('mouseup', up);
    } catch(_) {
      document.body.classList.add('ga-variant-flat');
      document.body.classList.add('is-loaded');
    }
  });
})();
