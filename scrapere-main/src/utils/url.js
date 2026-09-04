export function normalizeUrl(urlString) {
    if (!urlString) return null;
    const trimmed = urlString.trim();
    if (!trimmed || trimmed.toUpperCase() === 'N/A') {
        return null;
    }

    const buildNormalized = (urlObj) => {
        let hostname = urlObj.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        const pathname = urlObj.pathname || '/';
        return `${urlObj.protocol}//${hostname}${pathname}${urlObj.search}${urlObj.hash}`;
    };

    try {
        return buildNormalized(new URL(trimmed));
    } catch (firstError) {
        try {
            return buildNormalized(new URL(`https://${trimmed}`));
        } catch (secondError) {
            return trimmed;
        }
    }
}

export function extractHostname(urlString) {
    if (!urlString) return null;
    const trimmed = urlString.trim();
    if (!trimmed) return null;
    try {
        const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
        let hostname = url.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        return hostname;
    } catch (e) {
        return trimmed.replace(/^www\./, '');
    }
}

export function hostInSet(hostname, set) {
    if (!hostname || !set) return false;
    let current = String(hostname).toLowerCase();
    if (set.has(current)) return true;
    let dot = current.indexOf('.');
    while (dot > 0) {
        current = current.substring(dot + 1);
        if (set.has(current)) return true;
        dot = current.indexOf('.');
    }
    return false;
}
