/* Executive Mind Chat Widget — vanilla JS, no dependencies
   ---------------------------------------------------------------
   Public API on window.EMChat:
     EMChat.open()
     EMChat.close()
     EMChat.toggle()
     EMChat.status()   -> 'online' | 'offline' | 'reconnecting'
     EMChat.on(event, fn)  -> events: 'message', 'status', 'ready'
   --------------------------------------------------------------- */

(function () {
  'use strict';

  const WORKER_BASE = 'https://em-chat-worker.old-wave-0324.workers.dev';
  const WS_BASE     = 'wss://em-chat-worker.old-wave-0324.workers.dev';

  const AGENT_MAP = {
    '/':        { id: 'muska',   name: 'Muska',   avatar: 'M' },
    '/muska':   { id: 'muska',   name: 'Muska',   avatar: 'M' },
    '/kimi':    { id: 'kimi',    name: 'Kimi',    avatar: 'K' },
    '/slater':  { id: 'slater',  name: 'Slater',  avatar: 'S' },
    '/aria':    { id: 'aria',    name: 'Aria',    avatar: 'A' },
    '/dash':    { id: 'dash',    name: 'Dash',    avatar: 'D' },
    '/vault':   { id: 'vault',   name: 'Vault',   avatar: 'V' },
    '/scout':   { id: 'scout',   name: 'Scout',   avatar: 'S' },
    '/cochran': { id: 'cochran', name: 'Cochran', avatar: 'C' },
    '/chief':   { id: 'chief',   name: 'Chief',   avatar: 'C' },
    '/book':    { id: 'muska',   name: 'Muska',   avatar: 'M' },
  };

  function detectAgent() {
    let path = window.location.pathname || '/';
    path = path.toLowerCase().replace(/\/+$/, '') || '/';
    // strip /index.html for subdirectory pages
    path = path.replace(/\/index\.html$/, '');
    return AGENT_MAP[path] || AGENT_MAP['/'];
  }

  // Simple event emitter
  class Emitter {
    constructor() { this._h = {}; }
    on(ev, fn)    { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
    off(ev, fn)   { if (!this._h[ev]) return; this._h[ev] = this._h[ev].filter(f => f !== fn); }
    emit(ev, ...args) { (this._h[ev] || []).forEach(f => { try { f(...args); } catch (_) {} }); }
  }

  const emitter = new Emitter();

  let ws = null;
  let status = 'connecting';
  let sessionId = null;
  let agent = detectAgent();
  let isOpen = false;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let manualClose = false;
  let agentBuffer = '';   // streaming buffer for the current agent reply
  let agentBufferEl = null; // DOM element we are streaming into

  // ---- DOM construction ---------------------------------------------------

  const root = document.createElement('div');
  root.id = 'em-chat-root';
  root.setAttribute('aria-live', 'polite');

  root.innerHTML = `
    <button id="em-chat-launcher" type="button" aria-label="Open chat with Executive Mind">
      <span class="em-pulse" aria-hidden="true"></span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
        <path d="M3 5h18v12H7l-4 4z"/>
        <path d="M7 9h10M7 12h7" stroke-width="1.5"/>
      </svg>
      <span id="em-chat-status-dot" data-status="reconnecting" aria-hidden="true"></span>
    </button>

    <div id="em-chat-panel" role="dialog" aria-label="Executive Mind Chat" aria-modal="false">
      <div class="em-chat-header">
        <div class="em-chat-header-info">
          <div class="em-chat-avatar" id="em-chat-avatar">${escapeHtml(agent.avatar)}</div>
          <div class="em-chat-title-block">
            <div class="em-chat-title" id="em-chat-title">${escapeHtml(agent.name)} — Executive Mind</div>
            <div class="em-chat-subtitle">
              <span class="em-mini-dot" data-status="reconnecting" id="em-chat-mini-dot"></span>
              <span id="em-chat-subtitle-text">Connecting…</span>
            </div>
          </div>
        </div>
        <button class="em-chat-close" type="button" aria-label="Close chat" id="em-chat-close">×</button>
      </div>

      <div class="em-chat-form-row" id="em-chat-form-row" hidden>
        <label for="em-chat-name">Your name (optional)</label>
        <input id="em-chat-name" type="text" maxlength="80" placeholder="e.g. Sam" autocomplete="name" />
      </div>

      <div class="em-chat-messages" id="em-chat-messages" role="log"></div>

      <form class="em-chat-composer" id="em-chat-composer" autocomplete="off">
        <textarea id="em-chat-input" rows="1" placeholder="Type a message…" maxlength="4000" aria-label="Message"></textarea>
        <button type="submit" class="em-chat-send" id="em-chat-send">SEND</button>
      </form>

      <div class="em-chat-footer">
        Powered by <a href="/" target="_blank" rel="noopener">Executive Mind</a> · AI agents, real talk.
      </div>
    </div>
  `;

  // Inject stylesheet
  if (!document.getElementById('em-chat-styles')) {
    const link = document.createElement('link');
    link.id = 'em-chat-styles';
    link.rel = 'stylesheet';
    link.href = (window.EM_CHAT_BASE || '/chat/') + 'chat-widget.css';
    document.head.appendChild(link);
  }

  // Wait for DOM ready
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    document.body.appendChild(root);
    bindUI();
    // Show the form for name collection (subtle — let users skip)
    document.getElementById('em-chat-form-row').hidden = false;
    // Pre-fill name from localStorage
    const savedName = localStorage.getItem('em_chat_name') || '';
    const savedEmail = localStorage.getItem('em_chat_email') || '';
    document.getElementById('em-chat-name').value = savedName;
    // Mark panel title once
    document.getElementById('em-chat-title').textContent = `${agent.name} — Executive Mind`;
    document.getElementById('em-chat-avatar').textContent = agent.avatar;

    // Kick off WebSocket on first user interaction OR immediately if they want
    // Lazy connect to save Cloudflare subrequests when the widget is never opened.
    addFirstOpenListener();
  });

  // ---- UI bindings --------------------------------------------------------

  function bindUI() {
    document.getElementById('em-chat-launcher').addEventListener('click', toggle);
    document.getElementById('em-chat-close').addEventListener('click', close);
    const composer = document.getElementById('em-chat-composer');
    const input    = document.getElementById('em-chat-input');
    const sendBtn  = document.getElementById('em-chat-send');

    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      sendUserMessage(text);
      input.value = '';
      autoresize(input);
    });

    input.addEventListener('input', () => autoresize(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        composer.requestSubmit();
      }
    });

    // Save name on blur
    document.getElementById('em-chat-name').addEventListener('blur', (e) => {
      const v = e.target.value.trim();
      if (v) localStorage.setItem('em_chat_name', v);
    });
  }

  function autoresize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  // ---- Open/close lifecycle ----------------------------------------------

  function addFirstOpenListener() {
    const once = () => {
      open();
      document.removeEventListener('mouseover', once);
      document.removeEventListener('touchstart', once);
      document.removeEventListener('keydown', once);
    };
    document.addEventListener('mouseover', once, { once: true, passive: true });
    document.addEventListener('touchstart', once, { once: true, passive: true });
    document.addEventListener('keydown', once, { once: true });
  }

  function open() {
    isOpen = true;
    manualClose = false;
    document.getElementById('em-chat-panel').dataset.open = 'true';
    document.getElementById('em-chat-input').focus();
    if (!ws || ws.readyState >= 2) {
      connect();
    }
  }

  function close() {
    isOpen = false;
    manualClose = true;
    document.getElementById('em-chat-panel').dataset.open = 'false';
  }

  function toggle() {
    isOpen ? close() : open();
  }

  // ---- Connection management --------------------------------------------

  function connect() {
    if (ws && ws.readyState <= 1) return; // already connecting/open
    setStatus('reconnecting');
    const path = encodeURIComponent(window.location.pathname);
    const url = `${WS_BASE}/api/chat/ws?path=${path}`;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      reconnectDelay = 1000;
      // Send hello with visitor info
      const hello = {
        type: 'hello',
        agentId: agent.id,
        pageUrl: window.location.pathname,
        visitorName: localStorage.getItem('em_chat_name') || undefined,
        visitorEmail: localStorage.getItem('em_chat_email') || undefined,
      };
      ws.send(JSON.stringify(hello));
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      // hide typing indicator on any agent-side message
      if (msg.type === 'token' || msg.type === 'agent') hideTyping();
      handleServerMessage(msg);
    });

    ws.addEventListener('close', () => {
      if (!manualClose) scheduleReconnect();
      else setStatus('offline');
    });

    ws.addEventListener('error', () => {
      // error events are followed by close
    });
  }

  function scheduleReconnect() {
    setStatus('reconnecting');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      connect();
    }, reconnectDelay);
  }

  function sendKeepalive() {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify({ type: 'ping' })); } catch (_) {}
    }
  }

  // ---- Server message handling -------------------------------------------

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'ready':
        sessionId = msg.sessionId;
        agent = { id: msg.agentId, name: msg.agentName, avatar: agent.avatar };
        document.getElementById('em-chat-title').textContent = `${msg.agentName} — Executive Mind`;
        if (msg.greeting && !hasAgentGreeting()) {
          appendMessage('agent', msg.greeting, msg.agentName);
          markAgentGreeting();
        }
        emitter.emit('ready', msg);
        break;

      case 'status':
        setStatus(msg.status);
        break;

      case 'token':
        // Streaming delta — append to current agent message
        appendStream(msg.text || '');
        break;

      case 'agent':
        // Finalize streamed message, or append a single-shot agent message
        finalizeStream(msg.text || '', msg.agentName || agent.name);
        if (msg.askForEmail) promptForEmail();
        break;

      case 'error':
        appendMessage('system', '⚠ ' + (msg.message || 'Error'));
        break;

      case 'pong':
        break;

      default:
        // ignore unknown
    }
  }

  // ---- Message rendering -------------------------------------------------

  const messagesEl = () => document.getElementById('em-chat-messages');

  function appendMessage(kind, text, who) {
    const el = document.createElement('div');
    el.className = 'em-msg em-msg-' + kind;
    if (kind === 'agent' && who) {
      const meta = document.createElement('span');
      meta.className = 'em-msg-meta';
      meta.textContent = who;
      el.appendChild(meta);
    }
    el.appendChild(document.createTextNode(text));
    messagesEl().appendChild(el);
    scrollToBottom();
    return el;
  }

  function appendStream(delta) {
    if (!agentBufferEl) {
      agentBufferEl = document.createElement('div');
      agentBufferEl.className = 'em-msg em-msg-agent';
      const meta = document.createElement('span');
      meta.className = 'em-msg-meta';
      meta.textContent = agent.name;
      agentBufferEl.appendChild(meta);
      agentBufferEl.appendChild(document.createTextNode(''));
      messagesEl().appendChild(agentBufferEl);
    }
    agentBuffer += delta;
    // Update the text node (last child)
    const textNode = agentBufferEl.lastChild;
    textNode.nodeValue = agentBuffer;
    scrollToBottom();
  }

  function finalizeStream(finalText, who) {
    if (agentBufferEl) {
      // Replace buffer with final
      if (finalText) {
        agentBufferEl.lastChild.nodeValue = finalText;
      }
      agentBufferEl = null;
      agentBuffer = '';
    } else if (finalText) {
      appendMessage('agent', finalText, who);
    }
    scrollToBottom();
  }

  function scrollToBottom() {
    const el = messagesEl();
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }

  // ---- Visitor state ----------------------------------------------------

  function hasAgentGreeting() {
    return localStorage.getItem('em_chat_greeted_' + agent.id) === '1';
  }
  function markAgentGreeting() {
    localStorage.setItem('em_chat_greeted_' + agent.id, '1');
  }

  function promptForEmail() {
    // Lightweight inline prompt — show name+email row prominently
    const row = document.getElementById('em-chat-form-row');
    row.hidden = false;
    if (!document.getElementById('em-chat-email')) {
      const label = document.createElement('label');
      label.htmlFor = 'em-chat-email';
      label.textContent = 'Your email (so we can reply)';
      const input = document.createElement('input');
      input.id = 'em-chat-email';
      input.type = 'email';
      input.placeholder = 'you@domain.com';
      input.autocomplete = 'email';
      input.value = localStorage.getItem('em_chat_email') || '';
      input.addEventListener('blur', (e) => {
        const v = e.target.value.trim();
        if (v) localStorage.setItem('em_chat_email', v);
      });
      row.appendChild(label);
      row.appendChild(input);
    }
  }

  // ---- Send user message -------------------------------------------------

  function sendUserMessage(text) {
    appendMessage('user', text);
    // Save name if filled
    const nameEl = document.getElementById('em-chat-name');
    if (nameEl && nameEl.value.trim()) {
      localStorage.setItem('em_chat_name', nameEl.value.trim());
    }
    // Check for offline fallback path
    if (!ws || ws.readyState !== 1) {
      handleOfflineMessage(text);
      return;
    }
    // Show typing indicator
    showTyping();
    try {
      ws.send(JSON.stringify({
        type: 'message',
        text,
        visitorName: localStorage.getItem('em_chat_name') || undefined,
        visitorEmail: localStorage.getItem('em_chat_email') || undefined,
      }));
    } catch (err) {
      hideTyping();
      handleOfflineMessage(text);
    }
  }

  function showTyping() {
    if (document.getElementById('em-typing')) return;
    const t = document.createElement('div');
    t.id = 'em-typing';
    t.className = 'em-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    messagesEl().appendChild(t);
    scrollToBottom();
  }
  function hideTyping() {
    const t = document.getElementById('em-typing');
    if (t) t.remove();
  }

  async function handleOfflineMessage(text) {
    showTyping();
    const email = localStorage.getItem('em_chat_email');
    const name  = localStorage.getItem('em_chat_name');

    if (!email) {
      hideTyping();
      appendMessage('system', 'The live crew is offline and we need an email to reach back. Drop one above ↑');
      promptForEmail();
      return;
    }

    try {
      const res = await fetch(WORKER_BASE + '/api/chat/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorName: name,
          visitorEmail: email,
          agentId: agent.id,
          agentName: agent.name,
          pageUrl: window.location.pathname,
          message: text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      hideTyping();
      if (data.success) {
        appendMessage('agent', `Message received — an agent from the Executive Mind team will reply to ${email} shortly.`, agent.name);
      } else {
        appendMessage('system', 'Couldn\'t queue that. Try again, or email us at agent@executivemind.io.');
      }
    } catch (err) {
      hideTyping();
      appendMessage('system', 'Network error. Try again, or email us at agent@executivemind.io.');
    }
  }

  // ---- Status indicator --------------------------------------------------

  function setStatus(s) {
    status = s;
    const dot   = document.getElementById('em-chat-status-dot');
    const mini  = document.getElementById('em-chat-mini-dot');
    const label = document.getElementById('em-chat-subtitle-text');
    if (dot)  dot.dataset.status = s;
    if (mini) mini.dataset.status = s;
    if (label) {
      if (s === 'online')        label.textContent = 'Online · live agent';
      else if (s === 'reconnecting') label.textContent = 'Reconnecting…';
      else                       label.textContent = 'Offline · message will be emailed';
    }
    emitter.emit('status', s);
  }

  // ---- Utility -----------------------------------------------------------

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Keepalive every 25s
  setInterval(sendKeepalive, 25000);

  // Expose public API
  window.EMChat = {
    open, close, toggle,
    on: (e, fn) => emitter.on(e, fn),
    status: () => status,
    send: sendUserMessage,
    agent: () => ({ ...agent }),
  };
})();
