export function readPageMetaOnPage() {
    const resolveHref = (href) => {
        if (!href) return null;
        try {
            return new URL(href, window.location.href).href;
        } catch (err) {
            return null;
        }
    };

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    const amphtmlLink = document.querySelector('link[rel="amphtml"]');
    const alternateLinks = Array.from(document.querySelectorAll('link[rel="alternate"]'));

    const canonical = canonicalLink ? resolveHref(canonicalLink.getAttribute('href')) : null;
    const amphtml = amphtmlLink ? resolveHref(amphtmlLink.getAttribute('href')) : null;
    const alternates = alternateLinks
        .map((link) => resolveHref(link.getAttribute('href')))
        .filter((href) => href && (href.startsWith('http://') || href.startsWith('https://')));

    return {
        finalUrl: window.location.href,
        title: document.title,
        canonical,
        amphtml,
        alternates,
    };
}
