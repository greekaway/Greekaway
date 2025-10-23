// Greekaway AI Assistant client
// Renders a lightweight chat UI inside the #aiOverlay and handles streaming
(function(){
  function ensureUI(){
    const overlay = document.getElementById('aiOverlay');
    if (!overlay) return null;
    let inner = overlay.querySelector('.overlay-inner');
    if (!inner) { inner = document.createElement('div'); inner.className = 'overlay-inner'; overlay.appendChild(inner); }

    // Only build the UI once; avoid wiping event listeners on subsequent calls
    if (!inner.querySelector('#gaChatForm')) {
      const tr = (k) => (window.t ? window.t(k) : k);
      inner.innerHTML = `
        <div class="ga-chat-topbar">
          <div class="ga-chat-title">${tr('assistant.title')}</div>
          <button type="button" class="ga-chat-close" aria-label="${tr('assistant.close')}">✕</button>
        </div>

        <div class="ga-chat-log" id="gaChatLog"></div>

        <div class="ga-suggestion" id="gaSuggestion">${tr('assistant.suggestion')}</div>

        <div class="ga-inputbar">
          <form class="ga-form" id="gaChatForm">
            <div class="ga-inputwrap">
              <textarea id="gaChatInput" placeholder="${tr('assistant.placeholder')}" aria-label="${tr('assistant.aria_message')}" rows="1" required></textarea>
              <button type="button" class="ga-send" id="gaSendBtn" aria-label="${tr('assistant.aria_send')}">↑</button>
            </div>
          </form>
        </div>
      `;

      // Hook close
      const closeBtn = inner.querySelector('.ga-chat-close');
      if (closeBtn) closeBtn.addEventListener('click', () => window.closeOverlay && window.closeOverlay('aiOverlay'));
    }

    return inner;
  }

  function appendMessage(role, text){
    const log = document.getElementById('gaChatLog');
    if (!log) return;
    const row = document.createElement('div');
    row.className = `ga-msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'ga-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    log.appendChild(row);
    try { log.scrollTop = log.scrollHeight; } catch(_){ }
  }

  async function sendMessage(text){
    // If user is asking about "About Us" or who we are, navigate to About page instead
    try {
      const m = String(text || '').toLowerCase();
      const aboutIntent = /\babout\b|about\s+us|who\s+are\s+you|what\s+is\s+greekaway|\bσχετικά\b|ποιοι\s+είστε|τι\s+είναι\s+το\s+greekaway/.test(m);
      if (aboutIntent) {
        try { window.closeOverlay && window.closeOverlay('aiOverlay'); } catch(_) {}
        window.location.href = '/about';
        return;
      }
    } catch(_) {}
    // Hide suggestion once user sends first message
    try { const sug = document.getElementById('gaSuggestion'); if (sug) sug.style.display = 'none'; } catch(_){ }

    appendMessage('user', text);
    const log = document.getElementById('gaChatLog');
    const assistantRow = document.createElement('div');
    assistantRow.className = 'ga-msg assistant';
    const bubble = document.createElement('div');
    bubble.className = 'ga-bubble';
    assistantRow.appendChild(bubble);
  log.appendChild(assistantRow);
  try { log.scrollTop = log.scrollHeight; } catch(_){ }

    // Streaming
    try {
      const resp = await fetch('/api/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      if (!resp.ok || !resp.body) {
        const fallback = await fetch('/api/assistant', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message: text }) });
        const data = await fallback.json();
        const tr = (k) => (window.t ? window.t(k) : k);
        bubble.textContent = (data && data.reply) ? data.reply : ((data && data.error) ? `${tr('assistant.error_prefix')} ${data.error}` : tr('assistant.fallback_error'));
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false; let acc = '';
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          acc += chunk;
          bubble.textContent = acc;
          try { log.scrollTop = log.scrollHeight; } catch(_){ }
        }
      }
    } catch (e) {
      const tr = (k) => (window.t ? window.t(k) : k);
      bubble.textContent = tr('assistant.stream_error');
    }
  }

  function setup(){
    const inner = ensureUI();
    if (!inner) return;
  const form = document.getElementById('gaChatForm');
  const input = document.getElementById('gaChatInput');
  const sendBtn = document.getElementById('gaSendBtn');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!form || !input) return;
    // Autosize textarea and keep it wrapping
    const ta = /** @type {HTMLTextAreaElement} */(input);
    const MIN_HEIGHT = 42; // match input height baseline
    const MAX_HEIGHT = Math.max(160, Math.floor(window.innerHeight * 0.4));
    const autosize = () => {
      try {
        ta.style.height = 'auto';
        const next = Math.min(ta.scrollHeight, MAX_HEIGHT);
        ta.style.height = next + 'px';
        ta.style.overflowY = (ta.scrollHeight > MAX_HEIGHT) ? 'auto' : 'hidden';
      } catch(_) {}
    };
    autosize();
    ta.addEventListener('input', autosize);
    form.addEventListener('submit', function(e){
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      ta.style.height = MIN_HEIGHT + 'px';
      ta.style.overflowY = 'hidden';
      // On mobile Safari, blur to dismiss keyboard and avoid sticky zoom state
      try { ta.blur(); } catch(_){ }
      sendMessage(text);
    });
    if (sendBtn) {
      sendBtn.addEventListener('click', function(){
        const text = ta.value.trim();
        if (!text) return;
        ta.value = '';
        ta.style.height = MIN_HEIGHT + 'px';
        ta.style.overflowY = 'hidden';
        try { ta.blur(); } catch(_){ }
        sendMessage(text);
      });
    }
    // Enter sends; Shift+Enter = newline
    ta.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    // Avoid auto-focus on iOS to prevent Safari auto-zoom/viewport jump
    if (!isIOS) {
  try { ta.focus(); } catch(_) {}
    }

    // When overlay opens later (via openOverlay), attempt to refocus input
    const origOpen = window.openOverlay;
    if (typeof origOpen === 'function') {
      window.openOverlay = function(id){
        origOpen(id);
        if (id === 'aiOverlay') {
          // Rebuild UI in case the page changed content
          ensureUI();
          // Avoid auto-focus on iOS
          setTimeout(() => {
            const el = document.getElementById('gaChatInput');
            if (!isIOS) { try { el && el.focus(); } catch(_){} }
          }, 80);
        }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();

  // React to language changes to update static labels
  window.addEventListener('i18n:changed', () => {
    const inner = document.querySelector('#aiOverlay .overlay-inner');
    if (!inner) return;
    // Update title, suggestion, placeholders, buttons without rebuilding log
    const tr = (k) => (window.t ? window.t(k) : k);
    const title = inner.querySelector('.ga-chat-title'); if (title) title.textContent = tr('assistant.title');
    const closeBtn = inner.querySelector('.ga-chat-close'); if (closeBtn) closeBtn.setAttribute('aria-label', tr('assistant.close'));
    const sug = inner.querySelector('#gaSuggestion'); if (sug) sug.textContent = tr('assistant.suggestion');
    const ta = inner.querySelector('#gaChatInput'); if (ta) { ta.setAttribute('placeholder', tr('assistant.placeholder')); ta.setAttribute('aria-label', tr('assistant.aria_message')); }
    const send = inner.querySelector('#gaSendBtn'); if (send) send.setAttribute('aria-label', tr('assistant.aria_send'));
  });
})();
