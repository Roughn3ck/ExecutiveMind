/* Executive Mind — single source of truth for the site footer.
 * Every page embeds a placeholder; this script paints the real footer in.
 *
 * Usage (any page):
 *   <div data-footer-slot></div>
 *   <script src="/assets/footer.js" defer></script>
 *
 * Edit this file to change the footer site-wide (socials, copyright, links).
 * Mirrors the nav.js pattern — JS include on static Cloudflare Pages, no build step.
 *
 * Socials: 2026-09-07 — removed Facebook + Instagram (Kris: "fuck meta"),
 * added Bluesky using Kris's personal handle (no EM company Bluesky yet —
 * SOCIAL-ACCOUNTS.md confirms r0ughn3ck.bsky.social is the canonical one).
 */

(function () {
    'use strict';

    // Social icons as inline SVG. Kept inline so we don't add an HTTP request.
    // Each icon: class="w-6 h-6 fill-currentColor", currentColor inherits from
    // the parent <a>'s text color so hover:green-400 takes effect.
    const SOCIALS = [
        // Bluesky (replaces Facebook — Kris 2026-09-07)
        {
            label: 'Bluesky',
            href:  'https://bsky.app/profile/r0ughn3ck.bsky.social',
            svg:   '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 64 57"><path d="M13.873 3.805C21.21 9.332 29.103 20.537 32 26.55v15.882c0-.338-.13.044-.41.867-1.512 4.456-7.418 21.847-20.923 7.944-7.111-7.32-3.819-14.64 9.125-16.85-7.405 1.264-15.73-.825-18.014-9.015C1.12 23.022 0 8.51 0 6.55 0-3.268 8.578-.182 13.873 3.805ZM50.127 3.805C42.79 9.332 34.897 20.537 32 26.55v15.882c0-.338.13.044.41.867 1.512 4.456 7.418 21.847 20.923 7.944 7.111-7.32 3.819-14.64-9.125-16.85 7.405 1.264 15.73-.825 18.014-9.015C62.88 23.022 64 8.51 64 6.55c0-9.818-8.578-6.732-13.873-2.745Z"/></svg>'
        },
        {
            label: 'TikTok',
            href:  'https://www.tiktok.com/@mercury_executivemind.io',
            svg:   '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-2.43.05-4.84-.94-6.37-2.96-2.2-2.95-2.2-6.82 0-9.78 1.59-2.02 4.19-2.92 6.37-2.92.09 1.52.54 3.01 1.62 4.02 1.08 1.01 2.54 1.54 4.05 1.52v-3.9c-1.25.04-2.5-.33-3.48-1.1-1.05-.83-1.5-2.01-1.48-3.23z"/></svg>'
        },
        {
            label: 'LinkedIn',
            href:  'https://www.linkedin.com/company/executivemind-io/about/',
            svg:   '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>'
        },
        {
            label: 'YouTube',
            href:  'https://www.youtube.com/@mercury_executivemind',
            svg:   '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'
        },
        {
            label: 'X',
            href:  'https://x.com/Mercury_Executi',
            svg:   '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
        },
        {
            label: 'Medium',
            href:  'https://medium.com/@mercury_executivemind.io',
            svg:   '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zM20.92 12A3.28 3.28 0 0 1 17.65 15.3 3.28 3.28 0 0 1 14.38 12a3.28 3.28 0 0 1 3.27-3.3A3.28 3.28 0 0 1 20.92 12zM24 12a1.93 1.93 0 0 1-1.92 1.94A1.93 1.93 0 0 1 20.16 12a1.93 1.93 0 0 1 1.92-1.94A1.93 1.93 0 0 1 24 12z"/></svg>'
        },
        {
            label: 'Substack',
            href:  'https://substack.com/@mercuryexecutivemind',
            svg:   '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M22.532 2.468H1.468V4.93h21.064V2.468zM1.468 11.299h21.064v2.468H1.468v-2.468zm0 8.831h21.064v2.468H1.468v-2.468z"/></svg>'
        },
        {
            label: 'Hugging Face',
            href:  'https://huggingface.co/ExecutiveMind',
            // Hugging Face keeps its emoji for personality (no official SVG we can ship)
            emoji: '🤗'
        },
    ];

    const COPYRIGHT_HTML =
        '&copy; 2025 Executive Mind. Crafted with <span class="text-green-400">♥</span> in Brisbane by Machine Intelligence.';

    function renderFooter() {
        const socials = SOCIALS.map(s => {
            if (s.emoji) {
                return `<a href="${s.href}" target="_blank" rel="noopener noreferrer" class="hover:text-green-400 transition-colors text-xl" title="${s.label}">${s.emoji}</a>`;
            }
            return `<a href="${s.href}" target="_blank" rel="noopener noreferrer" class="hover:text-green-400 transition-colors" title="${s.label}">${s.svg}</a>`;
        }).join('\n            ');

        return `
    <footer class="bg-black/95 border-t border-green-400 py-8">
        <div class="max-w-5xl mx-auto px-4 text-center text-gray-300">
            <div class="flex justify-center items-center space-x-6 mb-6">
            ${socials}
            </div>
            ${COPYRIGHT_HTML}
        </div>
    </footer>`;
    }

    function mount() {
        // Use the LAST footer slot on the page so any leftover/template slots are inert.
        const slots = document.querySelectorAll('[data-footer-slot]');
        if (!slots.length) return;
        const slot = slots[slots.length - 1];
        slot.outerHTML = renderFooter();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
