/**
 * DriversSystem — AI Assistant Chat (client-side)
 *
 * Reads driverId from localStorage, fetches real data snapshot,
 * sends messages to /api/driverssystem/assistant which uses the
 * live data layer + OpenAI to produce financial answers.
 */
(async () => {
  'use strict';

  // ── Auth guard ──
  const driverPhone = localStorage.getItem('ds_driver_phone');
  if (!driverPhone) {
    const routePrefix = window.DriversSystemConfig
      ? window.DriversSystemConfig.getRoutePrefix()
      : '/driverssystem';
    const overlay = document.createElement('div');
    overlay.className = 'ds-assistant-auth';
    overlay.innerHTML = `
      <div class="ds-assistant-auth__card">
        <h2>🔒 Σύνδεση</h2>
        <p>Συνδέσου στο προφίλ σου για να χρησιμοποιήσεις τον βοηθό.</p>
        <a href="${routePrefix}/profile">Σύνδεση</a>
      </div>`;
    document.body.appendChild(overlay);
    return;
  }

  // ── DOM references ──
  const chatMessages = document.querySelector('[data-ds-chat-messages]');
  const chatInput = document.querySelector('[data-ds-chat-input]');
  const sendBtn = document.querySelector('[data-ds-chat-send]');
  const quickActions = document.querySelector('[data-ds-quick-actions]');
  const snapshotBar = document.querySelector('[data-ds-snapshot]');

  // ── Conversation history (for OpenAI context) ──
  const history = [];

  // ── Apply config (logo, labels) ──
  try {
    const cfg = await window.DriversSystemConfig.load();
    window.DriversSystemConfig.applyHero(document, cfg);
  } catch (_) {}

  // ── Back button ──
  const backBtn = document.querySelector('[data-ds-back]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        const prefix = window.DriversSystemConfig
          ? window.DriversSystemConfig.getRoutePrefix()
          : '/driverssystem';
        window.location.href = prefix + '/';
      }
    });
  }

  // ── Load financial snapshot ──
  async function loadSnapshot() {
    try {
      const res = await fetch(`/api/driverssystem/assistant/snapshot?driverId=${encodeURIComponent(driverPhone)}`);
      if (!res.ok) return;
      const data = await res.json();
      const fmt = (v) => (v || 0).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

      const netEl = document.querySelector('[data-snap-net]');
      const expEl = document.querySelector('[data-snap-expenses]');
      const balEl = document.querySelector('[data-snap-balance]');

      if (netEl) netEl.textContent = fmt(data.totalNet);
      if (expEl) expEl.textContent = fmt(data.totalExpenses);
      if (balEl) {
        balEl.textContent = fmt(data.balance);
        balEl.style.color = data.balance >= 0 ? '#4ecdc4' : '#ff6b6b';
      }

      if (snapshotBar) snapshotBar.style.display = 'flex';
    } catch (_) {
      // Snapshot is optional — don't block the chat
    }
  }

  loadSnapshot();

  // ── Helpers ──
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Minimal markdown-to-HTML converter for assistant replies
   * Supports: **bold**, _italic_, bullet lists (- or •), line breaks
   */
  function formatReply(text) {
    return text
      .split('\n')
      .map(line => {
        // Skip empty lines
        if (!line.trim()) return '';
        // Bullet lists
        if (/^\s*[-•]\s+/.test(line)) {
          const content = line.replace(/^\s*[-•]\s+/, '');
          return `<li>${formatInline(content)}</li>`;
        }
        // Skip separator lines
        if (/^[═─]{2,}/.test(line.trim())) return '';
        return `<p>${formatInline(line)}</p>`;
      })
      .filter(Boolean)
      .join('')
      // Wrap consecutive <li> in <ul>
      .replace(/(<li>[\s\S]*?<\/li>)+/g, (match) => `<ul>${match}</ul>`);
  }

  function formatInline(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
  }

  function addMessage(role, text) {
    const isUser = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `ds-chat-msg ds-chat-msg--${isUser ? 'user' : 'bot'}`;

    const bubble = document.createElement('div');
    bubble.className = 'ds-chat-msg__bubble';

    if (isUser) {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = formatReply(text);
    }

    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);
    scrollToBottom();
  }

  function addTypingIndicator() {
    const wrapper = document.createElement('div');
    wrapper.className = 'ds-chat-msg ds-chat-msg--bot';
    wrapper.id = 'ds-typing';

    const bubble = document.createElement('div');
    bubble.className = 'ds-chat-msg__bubble';
    bubble.innerHTML = '<div class="ds-chat-typing"><span></span><span></span><span></span></div>';

    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById('ds-typing');
    if (el) el.remove();
  }

  function scrollToBottom() {
    const chat = document.querySelector('[data-ds-chat]');
    if (chat) {
      requestAnimationFrame(() => {
        chat.scrollTop = chat.scrollHeight;
      });
    }
  }

  // ── Send message ──
  let sending = false;

  async function sendMessage(text) {
    if (sending) return;
    const msg = (text || '').trim();
    if (!msg) return;

    sending = true;
    sendBtn.disabled = true;
    chatInput.value = '';
    autoResizeInput();

    // Hide quick actions after first message
    if (quickActions) quickActions.style.display = 'none';

    // Show user message
    addMessage('user', msg);
    history.push({ role: 'user', content: msg });

    // Show typing indicator
    addTypingIndicator();

    try {
      const res = await fetch('/api/driverssystem/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          driverId: driverPhone,
          history: history.slice(-10)
        })
      });

      removeTypingIndicator();

      if (!res.ok) {
        addMessage('bot', '⚠️ Υπήρξε πρόβλημα. Δοκίμασε ξανά σε λίγο.');
        sending = false;
        sendBtn.disabled = false;
        return;
      }

      const data = await res.json();
      const reply = data.reply || 'Δεν μπόρεσα να απαντήσω.';

      addMessage('bot', reply);
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      removeTypingIndicator();
      addMessage('bot', '⚠️ Σφάλμα σύνδεσης. Ελέγξε το δίκτυό σου.');
    }

    sending = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }

  // ── Auto-resize textarea ──
  function autoResizeInput() {
    if (!chatInput) return;
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  }

  // ── Event listeners ──
  if (chatInput) {
    chatInput.addEventListener('input', autoResizeInput);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(chatInput.value);
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      sendMessage(chatInput.value);
    });
  }

  // Quick action buttons
  if (quickActions) {
    quickActions.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quick]');
      if (!btn) return;
      const text = btn.getAttribute('data-quick');
      if (text) sendMessage(text);
    });
  }

  // ── VisualViewport: keep input visible above keyboard / browser chrome ──
  (function initViewportFix() {
    const page = document.querySelector('.ds-ai-page');
    if (!page) return;

    // Use visualViewport API if supported (iOS Safari 15+, Chrome, etc.)
    if (window.visualViewport) {
      let pendingFrame = null;

      function onViewportResize() {
        if (pendingFrame) return;
        pendingFrame = requestAnimationFrame(() => {
          pendingFrame = null;
          const vv = window.visualViewport;
          // Offset between layout viewport bottom and visual viewport bottom
          const offset = window.innerHeight - vv.height - vv.offsetTop;
          page.style.setProperty('--vv-offset', Math.max(0, offset) + 'px');

          // Also set real height so the flex layout shrinks correctly
          page.style.height = vv.height + 'px';

          scrollToBottom();
        });
      }

      window.visualViewport.addEventListener('resize', onViewportResize);
      window.visualViewport.addEventListener('scroll', onViewportResize);

      // Reset when keyboard closes (focus lost)
      if (chatInput) {
        chatInput.addEventListener('blur', () => {
          setTimeout(() => {
            page.style.height = '';
            page.style.setProperty('--vv-offset', '0px');
          }, 100);
        });
      }
    }

    // Fallback: window resize (covers Android Chrome address bar)
    window.addEventListener('resize', () => {
      requestAnimationFrame(scrollToBottom);
    });
  })();
})();
