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
        'whatsapp', 'wa me', 'telegram', 'livechat', 'live chat',
        'kontak', 'contact', 'rtp', 'alternatif', 'link alternatif',
        'main di', 'klaim', 'bonus', 'deposit', 'promo',
    ];

    const matchesActionText = (text) => {
        if (!text) return false;
        const lower = text.toLowerCase();
        return ACTION_KEYWORDS.some((keyword) => {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
            return new RegExp(`\\b${escaped}\\b`, 'i').test(lower);
        });
    };

    const JUNK_HOSTNAME_PATTERNS = [
        'cloudfront.net', '-demo.', 'demo-', '.pg-demo', 'spade-event', 'fastspin', 'jlfafafa',
        'ambengine', '10e20.net',
    ];
    const JUNK_URL_PATTERNS = ['gameid=', 'playmode=', 'casinoid=', 'clienttype=', '/launcher/'];
    const JUNK_EXACT_TEXTS = ['coba', 'demo', 'main sekarang', 'play now'];
    const JUNK_IMG_ALT_KEYWORDS = [
        'slot', 'casino', 'poker', 'sport', 'turnamen', 'tournament',
        'jackpot', 'provider', 'game', 'rtp live',
    ];

    const isJunkVendor = (hostname, fullUrl, text) => {
        const lowerHost = hostname.toLowerCase();
        if (JUNK_HOSTNAME_PATTERNS.some((p) => lowerHost.includes(p))) return true;
        const lowerUrl = fullUrl.toLowerCase();
        if (JUNK_URL_PATTERNS.some((p) => lowerUrl.includes(p))) return true;
        const lowerText = (text || '').toLowerCase();
        if (JUNK_EXACT_TEXTS.includes(lowerText)) return true;
        return false;
    };

    const isImgOnlyJunk = (anchor, imgEl) => {
        if (imgEl) {
            const src = (imgEl.getAttribute('src') || '').toLowerCase();
            if (src.includes('/games/')) return true;
            const alt = (imgEl.getAttribute('alt') || '').toLowerCase();
            if (JUNK_IMG_ALT_KEYWORDS.some((k) => alt.includes(k))) return true;
        }
        try {
            const rect = anchor.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return true;
        } catch (err) {
            // can't measure, treat as not junk
        }
        return false;
    };

    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const totalAnchors = anchors.length;
    const links = [];
    const indexByUrl = new Map();
    const domainCounts = new Map();

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

        const isInternal = parsedUrl.hostname === window.location.hostname;
        if (!isInternal) {
            domainCounts.set(parsedUrl.hostname, (domainCounts.get(parsedUrl.hostname) || 0) + 1);
        }

        const isSamePageFragment =
            parsedUrl.origin === window.location.origin &&
            parsedUrl.pathname === window.location.pathname &&
            parsedUrl.search === window.location.search;
        if (isSamePageFragment) continue;

        const imgEl = anchor.querySelector('img');
        const hasImg = Boolean(imgEl);
        const rawText = normalizeText(anchor.innerText);
        const url = parsedUrl.href;

        const matchedAction = matchesActionText(rawText);
        const passesActionOrImg = matchedAction || hasImg;
        if (!passesActionOrImg) continue;
        if (isJunkVendor(parsedUrl.hostname, url, rawText)) continue;
        if (!matchedAction && hasImg && isImgOnlyJunk(anchor, imgEl)) continue;

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

    const domainSummary = Array.from(domainCounts.entries())
        .map(([hostname, jumlah]) => ({ hostname, jumlah }))
        .sort((a, b) => b.jumlah - a.jumlah);

    return {
        pageUrl: window.location.href,
        pageTitle: document.title,
        links,
        totalAnchors,
        filteredOut: totalAnchors - links.length,
        domainSummary,
    };
}
