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
      inner.innerHTML = `
        <div class="ga-chat-topbar">
          <div class="ga-chat-title">AI Assistant</div>
          <button type="button" class="ga-chat-close" aria-label="Κλείσιμο">✕</button>
        </div>

        <div class="ga-chat-log" id="gaChatLog"></div>

        <div class="ga-suggestion" id="gaSuggestion">Ρώτα ό,τι θέλεις για τα ταξίδια.</div>

        <div class="ga-inputbar">
          <form class="ga-form" id="gaChatForm">
            <div class="ga-inputwrap">
              <textarea id="gaChatInput" placeholder="Ρώτα οτιδήποτε" aria-label="Message" rows="1" required></textarea>
              <button type="button" class="ga-send" id="gaSendBtn" aria-label="Send">↑</button>
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
        bubble.textContent = (data && data.reply) ? data.reply : ((data && data.error) ? `Σφάλμα: ${data.error}` : 'Σφάλμα: δεν λάβαμε απάντηση τώρα.');
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
      bubble.textContent = 'Σφάλμα σύνδεσης με τον βοηθό.';
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
})();
