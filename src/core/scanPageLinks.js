export function scanPageLinksOnPage() {
    const normalizeText = (text) => (text || '').replace(/\s+/g, ' ').trim();
    const truncate = (text, max) => (text.length > max ? text.slice(0, max) : text);

    const isLogo = (anchor) => {
        if (anchor.querySelector('img')) return true;
        const cls = (anchor.getAttribute('class') || '').toLowerCase();
        const id = (anchor.getAttribute('id') || '').toLowerCase();
        return cls.includes('logo') || id.includes('logo');
    };

    const isButton = (anchor) => {
        if ((anchor.getAttribute('role') || '').toLowerCase() === 'button') return true;
        const cls = (anchor.getAttribute('class') || '').toLowerCase();
        if (cls.includes('btn') || cls.includes('button')) return true;
        try {
            const style = window.getComputedStyle(anchor);
            const bg = style.backgroundColor || '';
            const hasBackground = bg && bg !== 'transparent' && !/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg);
            const radius = parseFloat(style.borderRadius) || 0;
            if (hasBackground && radius > 0) return true;
        } catch (err) {
            // computed style unavailable, ignore
        }
        return false;
    };

    const getKind = (anchor) => {
        if (isLogo(anchor)) return 'logo';
        if (isButton(anchor)) return 'button';
        return 'link';
    };

    const ACTION_KEYWORDS = [
        'daftar', 'login', 'masuk', 'register', 'sign in', 'sign up',
        'whatsapp', 'wa', 'telegram', 'livechat', 'live chat', 'cs',
        'kontak', 'contact', 'rtp', 'promo',
    ];

    const matchesActionText = (text) => {
        if (!text) return false;
        const lower = text.toLowerCase();
        return ACTION_KEYWORDS.some((keyword) => {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
            return new RegExp(`\\b${escaped}\\b`, 'i').test(lower);
        });
    };

    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const totalAnchors = anchors.length;
    const links = [];
    const indexByUrl = new Map();

    for (const anchor of anchors) {
        const rawHref = anchor.getAttribute('href');
        if (!rawHref) continue;
        const trimmedHref = rawHref.trim();
        if (!trimmedHref) continue;

        let parsedUrl;
        try {
            parsedUrl = new URL(trimmedHref, window.location.href);
        } catch (err) {
            continue;
        }
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') continue;

        const isSamePageFragment =
            parsedUrl.origin === window.location.origin &&
            parsedUrl.pathname === window.location.pathname &&
            parsedUrl.search === window.location.search;
        if (isSamePageFragment) continue;

        const isInternal = parsedUrl.hostname === window.location.hostname;
        const isExternal = !isInternal;
        const hasImg = Boolean(anchor.querySelector('img'));
        const rawText = normalizeText(anchor.innerText);

        const passesRule = isExternal || matchesActionText(rawText) || (hasImg && isExternal);
        if (!passesRule) continue;

        const url = parsedUrl.href;
        const text = truncate(rawText, 80);
        const kind = getKind(anchor);

        if (indexByUrl.has(url)) {
            const existing = links[indexByUrl.get(url)];
            if (!existing.text && text) {
                existing.text = text;
            }
            continue;
        }

        indexByUrl.set(url, links.length);
        links.push({ url, text, isInternal, kind });
    }

    return {
        pageUrl: window.location.href,
        pageTitle: document.title,
        links,
        totalAnchors,
        filteredOut: totalAnchors - links.length,
    };
}
