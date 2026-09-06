export function findRedirectsOnPage() {
    const SPECIFICITY = { script: 3, 'meta-refresh': 2, noscript: 1, 'link-header': 1 };

    const IGNORED_HOSTNAME_PATTERNS = [
        'ipapi.co', 'ipwho.is', 'geojs.io', 'ipinfo.io', 'ip-api.com',
        'google-analytics', 'googletagmanager', 'gstatic', 'fonts.googleapis',
        'jquery', 'cdnjs', 'bootstrapcdn', 'schema.org', 'w3.org', 'gmpg.org',
    ];

    const truncate = (text, max) => (text.length > max ? text.slice(0, max) : text);

    const getKonteks = (text, index, matchLength) => {
        const start = Math.max(0, index - 40);
        const end = Math.min(text.length, index + matchLength + 40);
        return truncate(text.slice(start, end).replace(/\s+/g, ' ').trim(), 120);
    };

    const isIgnoredUrl = (url) => {
        try {
            const parsed = new URL(url);
            if (parsed.hostname === window.location.hostname) return true;
            const lowerHost = parsed.hostname.toLowerCase();
            return IGNORED_HOSTNAME_PATTERNS.some((p) => lowerHost.includes(p));
        } catch (err) {
            return true;
        }
    };

    const findings = [];
    const indexByUrl = new Map();

    const addFinding = (url, sumber, konteks) => {
        if (!url || isIgnoredUrl(url)) return;
        const existingIndex = indexByUrl.get(url);
        if (existingIndex !== undefined) {
            const existing = findings[existingIndex];
            if ((SPECIFICITY[sumber] || 0) > (SPECIFICITY[existing.sumber] || 0)) {
                existing.sumber = sumber;
                existing.konteks = konteks;
            }
            return;
        }
        indexByUrl.set(url, findings.length);
        findings.push({ url, sumber, konteks });
    };

    try {
        const scripts = Array.from(document.querySelectorAll('script:not([src])'));
        for (const script of scripts) {
            try {
                const text = script.textContent || '';
                if (!text.trim()) continue;

                const varUrlRe = /\b(?:target|url|redirect|dest|link|tujuan|goto)\s*=\s*["']((?:https?:)\/\/[^"']+)["']/gi;
                let match;
                while ((match = varUrlRe.exec(text)) !== null) {
                    addFinding(match[1], 'script', getKonteks(text, match.index, match[0].length));
                }

                const callRe = /(?:location\s*\.\s*replace|location\s*\.\s*assign|window\s*\.\s*open)\s*\(\s*["']((?:https?:)\/\/[^"']+)["']/gi;
                while ((match = callRe.exec(text)) !== null) {
                    addFinding(match[1], 'script', getKonteks(text, match.index, match[0].length));
                }

                const hrefAssignRe = /location\s*\.\s*href\s*=\s*["']((?:https?:)\/\/[^"']+)["']/gi;
                while ((match = hrefAssignRe.exec(text)) !== null) {
                    addFinding(match[1], 'script', getKonteks(text, match.index, match[0].length));
                }

                const genericUrlRe = /["'](https?:\/\/[^"'\s]+)["']/gi;
                while ((match = genericUrlRe.exec(text)) !== null) {
                    addFinding(match[1], 'script', getKonteks(text, match.index, match[0].length));
                }
            } catch (innerErr) {
                // lewati script ini, lanjut ke berikutnya
            }
        }
    } catch (err) {
        // querySelectorAll gagal, lewati tahap script
    }

    try {
        const metaRefreshEls = Array.from(document.querySelectorAll('meta[http-equiv="refresh" i]'));
        for (const meta of metaRefreshEls) {
            try {
                const content = meta.getAttribute('content') || '';
                const urlMatch = content.match(/url\s*=\s*(.+)$/i);
                if (urlMatch) {
                    const rawUrl = urlMatch[1].trim().replace(/^["']|["']$/g, '');
                    addFinding(rawUrl, 'meta-refresh', getKonteks(content, 0, content.length));
                }
            } catch (innerErr) {
                // lewati elemen ini
            }
        }
    } catch (err) {
        // querySelectorAll gagal, lewati tahap meta-refresh
    }

    try {
        const noscripts = Array.from(document.querySelectorAll('noscript'));
        for (const noscript of noscripts) {
            try {
                const text = noscript.textContent || '';

                const metaMatch = text.match(/<meta[^>]+http-equiv=["']refresh["'][^>]*content=["'][^"']*url\s*=\s*([^"'>]+)["']/i);
                if (metaMatch) {
                    const rawUrl = metaMatch[1].trim();
                    addFinding(rawUrl, 'noscript', getKonteks(text, metaMatch.index, metaMatch[0].length));
                }

                const hrefRe = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
                let match;
                while ((match = hrefRe.exec(text)) !== null) {
                    addFinding(match[1], 'noscript', getKonteks(text, match.index, match[0].length));
                }
            } catch (innerErr) {
                // lewati elemen ini
            }
        }
    } catch (err) {
        // querySelectorAll gagal, lewati tahap noscript
    }

    return {
        pageUrl: window.location.href,
        findings,
    };
}
