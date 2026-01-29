// MoveAthens AI Assistant Chat UI
(function() {
  'use strict';
  
  let chatHistory = [];
  let isWaitingResponse = false;
  
  function detectLanguage() {
    const lang = document.documentElement.lang || navigator.language || 'el';
    return lang.startsWith('el') ? 'el' : 'en';
  }
  
  function t(key) {
    const lang = detectLanguage();
    const translations = {
      el: {
        placeholder: 'Γράψε το μήνυμά σου...',
        send: 'Αποστολή',
        greeting: 'Γεια σου! 👋 Είμαι ο βοηθός του MoveAthens. Ρώτησέ με για τιμές, οχήματα ή πώς να κλείσεις transfer!',
        error: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.',
        typing: 'Πληκτρολογεί...'
      },
      en: {
        placeholder: 'Type your message...',
        send: 'Send',
        greeting: 'Hello! 👋 I\'m the MoveAthens assistant. Ask me about prices, vehicles or how to book a transfer!',
        error: 'Something went wrong. Please try again.',
        typing: 'Typing...'
      }
    };
    return translations[lang]?.[key] || translations['el'][key] || key;
  }
  
  function initChat() {
    const container = document.getElementById('maChatContainer');
    if (!container) return;
    
    container.innerHTML = `
      <div class="ma-chat">
        <div class="ma-chat-messages" id="maChatMessages">
          <div class="ma-chat-message assistant">
            <div class="ma-chat-bubble">${t('greeting')}</div>
          </div>
        </div>
        <form class="ma-chat-form" id="maChatForm">
          <div class="ma-chat-input-wrap">
            <textarea 
              id="maChatInput" 
              placeholder="${t('placeholder')}" 
              rows="1"
              autocomplete="off"
            ></textarea>
            <button type="submit" class="ma-chat-send" id="maChatSend" aria-label="${t('send')}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"/>
              </svg>
            </button>
          </div>
        </form>
      </div>
    `;
    
    const form = document.getElementById('maChatForm');
    const input = document.getElementById('maChatInput');
    const sendBtn = document.getElementById('maChatSend');
    
    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    
    // Enter to send (shift+enter for newline)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
      }
    });
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message || isWaitingResponse) return;
      
      // Clear input
      input.value = '';
      input.style.height = 'auto';
      
      // Add user message
      appendMessage('user', message);
      chatHistory.push({ role: 'user', content: message });
      
      // Show typing indicator
      const typingEl = appendMessage('assistant', t('typing'), true);
      isWaitingResponse = true;
      sendBtn.disabled = true;
      
      try {
        // Try streaming first
        const response = await sendToAssistant(message);
        
        // Remove typing indicator
        typingEl?.remove();
        
        // Add assistant response
        appendMessage('assistant', response);
        chatHistory.push({ role: 'assistant', content: response });
      } catch (error) {
        typingEl?.remove();
        appendMessage('assistant', t('error'));
        console.error('[MA-Chat]', error);
      } finally {
        isWaitingResponse = false;
        sendBtn.disabled = false;
        input.focus();
      }
    });
    
    // Focus input
    setTimeout(() => input.focus(), 100);
  }
  
  function appendMessage(role, text, isTyping = false) {
    const messages = document.getElementById('maChatMessages');
    if (!messages) return null;
    
    const msg = document.createElement('div');
    msg.className = `ma-chat-message ${role}${isTyping ? ' typing' : ''}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'ma-chat-bubble';
    bubble.textContent = text;
    
    msg.appendChild(bubble);
    messages.appendChild(msg);
    
    // Scroll to bottom
    messages.scrollTop = messages.scrollHeight;
    
    return msg;
  }
  
  async function sendToAssistant(message) {
    const lang = detectLanguage();
    
    // Try streaming endpoint first
    try {
      const streamRes = await fetch('/api/moveathens/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: chatHistory.slice(-6), lang })
      });
      
      if (streamRes.ok && streamRes.headers.get('content-type')?.includes('text/event-stream')) {
        // Handle streaming
        return await handleStream(streamRes);
      }
      
      // If not streaming, try to parse as JSON
      const data = await streamRes.json();
      if (data.reply) return data.reply;
    } catch (e) {
      console.log('[MA-Chat] Stream failed, trying regular endpoint');
    }
    
    // Fallback to regular endpoint
    const res = await fetch('/api/moveathens/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: chatHistory.slice(-6), lang })
    });
    
    if (!res.ok) throw new Error('API error');
    
    const data = await res.json();
    return data.reply || t('error');
  }
  
  async function handleStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    
    // Get or create the last assistant bubble for streaming
    const messages = document.getElementById('maChatMessages');
    const typingMsg = messages?.querySelector('.ma-chat-message.assistant.typing');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              result += parsed.content;
              if (typingMsg) {
                const bubble = typingMsg.querySelector('.ma-chat-bubble');
                if (bubble) bubble.textContent = result;
              }
            }
          } catch (e) { /* skip */ }
        }
      }
    }
    
    return result;
  }
  
  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
  } else {
    initChat();
  }
  
  // Export for external use
  window.MoveAthensChat = { init: initChat, appendMessage, t };
})();
