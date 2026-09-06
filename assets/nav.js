/* Executive Mind — single source of truth for the sticky site nav.
 * Every page embeds a placeholder; this script paints the real header in.
 *
 * Usage (any page):
 *   <div data-nav-slot
 *        data-nav-flavour="main|coldstack|book|agents"
 *        data-nav-active="home|asset|book|articles|security|key|gym|armchair|agents"></div>
 *   <script src="/assets/nav.js" defer></script>
 *
 * The script:
 *   - finds the LAST nav slot on the page (in case a template leaves extras)
 *   - paints a sticky <header> with the brand, primary nav, mobile burger
 *   - applies active-state highlighting via data-nav-active
 *   - wires up the mobile menu toggle
 *
 * Single point of change: edit this file to change nav structure site-wide.
 * Page authors only need to set data-nav-flavour and data-nav-active.
 */

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // 0. Inject shared nav CSS once per page. Keeps logo styling in one place
    //    so nav changes don't depend on per-page <style> blocks.
    // -------------------------------------------------------------------------
    const NAV_CSS = `
        .nav-logo {
            display: inline-block;
            height: 2.5rem;
            width: 2.5rem;
            max-width: 100%;
            object-fit: contain;
            object-position: left center;
            mix-blend-mode: screen;
            opacity: 0.95;
            /* Outer ~5% fade: solid letterform in the middle, dissolves to bg at the edge.
               Applied as a CSS mask so it crops the raster image directly. */
            -webkit-mask-image: radial-gradient(circle at center, #000 88%, transparent 100%);
            mask-image: radial-gradient(circle at center, #000 88%, transparent 100%);
        }`;
    function injectCss() {
        if (document.getElementById('nav-injected-styles')) return;
        const style = document.createElement('style');
        style.id = 'nav-injected-styles';
        style.textContent = NAV_CSS;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // 1. Nav flavours — each is a list of links shown in the desktop + mobile nav.
    //    "active" is matched against data-nav-active; links with matching
    //    data-nav-key get the highlight classes. "cta" links get a coloured call-out.
    // -------------------------------------------------------------------------
    const FLAVOURS = {
        main: {
            // Marketing / product / content pages
            items: [
                { href: '/#about',         label: 'About',            key: 'about' },
                { href: '/#services',      label: 'Services',         key: 'services' },
                { href: '/asset-management', label: 'Asset Management', key: 'asset', cta: 'green' },
                { href: '/book',           label: 'Book Now',         key: 'book',   cta: 'green' },
                { href: '/articles',       label: 'Articles',         key: 'articles' },
                { href: '/security',       label: 'Security',         key: 'security', cta: 'green' },
                { href: '/#team',          label: 'The Pack 🐺',      key: 'team' },
                { href: '/#contact',       label: 'Contact',          key: 'contact' },
            ],
        },
        coldstack: {
            // ColdStack / open-source product family (Key Manager, Gym Tracker, Armchair)
            // Active page receives a green highlight; outbound GitHub link gets an arrow.
            items: [
                { href: '/',                       label: 'Home',        key: 'home' },
                { href: '/key-manager',            label: 'ColdStack',   key: 'key',    cta: 'green' },
                { href: '/gym-tracker',            label: 'Gym Tracker', key: 'gym',    cta: 'green' },
                { href: '/armchair',               label: 'Armchair',    key: 'armchair', cta: 'green' },
                { href: 'https://github.com/Roughn3ck', label: 'GitHub →', key: 'github', external: true, cta: 'green' },
            ],
        },
        book: {
            // Slim booking page — fewer items, no mobile burger to keep noise low
            items: [
                { href: '/',             label: 'Home',     key: 'home' },
                { href: '/#services',   label: 'Services', key: 'services' },
                { href: '/articles',    label: 'Articles', key: 'articles' },
                { href: '/security',    label: 'Security', key: 'security' },
                { href: '/#team',       label: 'Team',     key: 'team' },
                { href: '/#contact',    label: 'Contact',  key: 'contact' },
            ],
        },
        agents: {
            // "Let the agents live" — Cochran marketing page, yellow CTA for legal counsel
            items: [
                { href: '/#about',    label: 'About',        key: 'about' },
                { href: '/#services', label: 'Services',     key: 'services' },
                { href: '/articles',  label: 'Articles',     key: 'articles' },
                { href: '/security',  label: 'Security',     key: 'security' },
                { href: '/#team',     label: 'The Pack 🐺',  key: 'team' },
                { href: '#contact',   label: 'Get Counsel',  key: 'contact', cta: 'yellow' },
            ],
        },
    };

    // -------------------------------------------------------------------------
    // 2. HTML builders
    // -------------------------------------------------------------------------
    function escAttr(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function renderLogo() {
        // The square stacked logo (letter large above "Executive Mind" wordmark).
        // .nav-logo CSS adds the ~5% outer fade mask.
        return `
            <picture>
                <source srcset="/assets/em-logo-grunge-dark.webp" type="image/webp">
                <img src="/assets/em-logo-grunge-dark.jpg"
                     alt="Executive Mind"
                     class="nav-logo"
                     width="1024" height="1024">
            </picture>`;
    }

    function renderLink(item, isActive) {
        const activeClasses = isActive ? ' text-green-400 font-bold' : '';
        const ctaClasses = !isActive && item.cta === 'green'  ? ' text-green-400 font-bold' : '';
        const ctaYellow = !isActive && item.cta === 'yellow' ? ' text-yellow-400 font-bold' : '';
        const target = item.external ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escAttr(item.href)}"${target} class="${(activeClasses + ctaClasses + ctaYellow).trim()}">${item.label}</a>`;
    }

    function renderNav(items, activeKey) {
        return items.map(item => renderLink(item, item.key === activeKey)).join('\n            ');
    }

    function renderMobileNav(items, activeKey) {
        return items.map(item => {
            const isActive = item.key === activeKey;
            const activeClasses = isActive ? ' text-green-400 font-bold' : '';
            const ctaClasses = !isActive && item.cta === 'green'  ? ' text-green-400 font-bold' : '';
            const ctaYellow = !isActive && item.cta === 'yellow' ? ' text-yellow-400 font-bold' : '';
            const target = item.external ? ' target="_blank" rel="noopener noreferrer"' : '';
            const extraClasses = (activeClasses + ctaClasses + ctaYellow).trim();
            const sep = extraClasses ? ' ' : '';
            return `<a href="${escAttr(item.href)}"${target} class="block${sep}${extraClasses}">${item.label}</a>`;
        }).join('\n            ');
    }

    function renderHeader(flavour, activeKey) {
        const config = FLAVOURS[flavour] || FLAVOURS.main;
        const borderClass = flavour === 'agents' ? ' border-b border-yellow-500/30' : '';
        const bgClass = flavour === 'agents' ? ' bg-black/80' : ' bg-black/70';

        return `
    <header class="sticky top-0${bgClass} py-4 px-4 z-50${borderClass}">
        <div class="flex justify-start items-center max-w-5xl mx-auto gap-6">
            <a href="/" class="font-bold text-xl tracking-widest select-none shrink-0">
                ${renderLogo()}
            </a>
            <nav class="hidden md:flex space-x-6 font-mono text-sm uppercase">
            ${renderNav(config.items, activeKey)}
            </nav>
            <button id="mobile-menu-btn" class="md:hidden ml-auto" aria-label="Open menu">
                <svg width="30" height="30" fill="none" aria-hidden="true">
                    <rect x="4" y="7"  width="22" height="2" rx="1" fill="#56e98f"/>
                    <rect x="4" y="15" width="22" height="2" rx="1" fill="#56e98f"/>
                    <rect x="4" y="23" width="22" height="2" rx="1" fill="#56e98f"/>
                </svg>
            </button>
        </div>
        <nav id="mobile-menu" class="md:hidden hidden mt-2 space-y-2 text-center font-mono uppercase">
            ${renderMobileNav(config.items, activeKey)}
        </nav>
    </header>`;
    }

    // -------------------------------------------------------------------------
    // 3. Mount + wire up
    // -------------------------------------------------------------------------
    function mount() {
        const slots = document.querySelectorAll('[data-nav-slot]');
        if (!slots.length) return;
        // Use the LAST slot so any leftover/template slots are inert.
        const slot = slots[slots.length - 1];

        const flavour  = (slot.getAttribute('data-nav-flavour')  || 'main').toLowerCase();
        const activeKey = slot.getAttribute('data-nav-active')  || '';

        injectCss();
        slot.outerHTML = renderHeader(flavour, activeKey);

        // Wire mobile burger → mobile menu
        const btn = document.getElementById('mobile-menu-btn');
        const menu = document.getElementById('mobile-menu');
        if (btn && menu) {
            btn.addEventListener('click', () => {
                menu.classList.toggle('hidden');
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
