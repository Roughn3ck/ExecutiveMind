/* Executive Mind Chat — embed loader
   ---------------------------------------------------------------
   Drop this on any page and it injects the chat widget.
   The base path can be overridden by setting window.EM_CHAT_BASE
   before this script runs (e.g. for staging).

   Usage:
     <script src="/chat/chat-embed.js" defer></script>
*/

(function () {
  'use strict';
  // Determine base path (defaults to /chat/)
  var base = (typeof window.EM_CHAT_BASE === 'string' && window.EM_CHAT_BASE) || '/chat/';
  if (!base.endsWith('/')) base += '/';
  window.EM_CHAT_BASE = base;

  // Inject the widget script
  var s = document.createElement('script');
  s.src = base + 'chat-widget.js';
  s.async = true;
  s.defer = true;
  (document.head || document.documentElement).appendChild(s);
})();
