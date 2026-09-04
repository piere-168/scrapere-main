export async function scrapeDataOnPage() {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const loadMoreLabels = [
        'hasil penelusuran lainnya',
        'lihat hasil lain',
        'lihat hasil penelusuran lainnya',
        'more results',
        'more search results',
        'load more results'
    ];
    const buttonAttempts = new WeakMap();

    const labelMatches = (text) => {
        if (!text) return false;
        return loadMoreLabels.some((label) => text === label || text.startsWith(`${label} `));
    };

    const isElementVisible = (el) => {
        if (!el) return false;
        if (el.offsetParent === null) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle(el);
        if (!style) return true;
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        if (parseFloat(style.opacity || '1') === 0) return false;
        return true;
    };

    const queryInput = document.querySelector('textarea[name="q"], input[name="q"]');
    const query = queryInput ? queryInput.value : '';

    const resolveHref = (rawHref) => {
        if (!rawHref) return null;
        try {
            const url = new URL(rawHref, window.location.href);
            if (url.pathname === '/url' && url.searchParams.has('q')) {
                return url.searchParams.get('q');
            }
            return url.href;
        } catch (err) {
            return null;
        }
    };

    const isInternalOrNonHttpLink = (href) => {
        try {
            const url = new URL(href, window.location.href);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
            const host = url.hostname.toLowerCase();
            if (host === 'webcache.googleusercontent.com') return true;
            if (host.includes('support.google') || host.includes('policies.google')) return true;
            if (/(^|\.)google\.[a-z.]+$/i.test(host)) return true;
            return false;
        } catch (err) {
            return true;
        }
    };

    const CONTAINER_SELECTORS = ['#rso', '#main', '#gsr'];

    const getScopeRoot = () => {
        const roots = CONTAINER_SELECTORS.map((s) => document.querySelector(s)).filter(Boolean);
        return roots.length ? roots[0] : document.body;
    };

    const isHttpUrl = (value) => {
        try {
            const url = new URL(value, window.location.href);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (err) {
            return false;
        }
    };

    const RESULT_ANCHOR_SELECTOR = 'a.UBFage, a[href^="/goto?url="]';

    const getResultBlocks = () => {
        const scope = getScopeRoot();
        return Array.from(scope.querySelectorAll(RESULT_ANCHOR_SELECTOR));
    };

    const tagAnchorsWithBatch = (batchNumber) => {
        const scope = getScopeRoot();
        Array.from(scope.querySelectorAll(RESULT_ANCHOR_SELECTOR))
            .filter((anchor) => !anchor.hasAttribute('data-scrape-batch'))
            .forEach((anchor) => anchor.setAttribute('data-scrape-batch', String(batchNumber)));
    };

    const findLoadMoreButton = () => {
        const selectors = 'button, a[role="button"], div[role="button"], span[role="button"]';
        const candidates = Array.from(document.querySelectorAll(selectors));
        return (
            candidates.find((el) => {
                if (el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled')) return false;
                const text = normalize(el.innerText || el.textContent);
                const aria = normalize(el.getAttribute('aria-label') || '');
                const matched = labelMatches(text) || labelMatches(aria);
                if (!matched) return false;
                if (!isElementVisible(el)) return false;
                const tries = buttonAttempts.get(el) || 0;
                if (tries >= 5) return false;
                return true;
            }) || null
        );
    };

    const waitForNewResults = async (previousCount, previousHeight) => {
        const maxWaitMs = 7000;
        const tickMs = 250;
        const start = performance.now();
        while (performance.now() - start < maxWaitMs) {
            await sleep(tickMs);
            const currentCount = getResultBlocks().length;
            const currentHeight = document.documentElement
                ? document.documentElement.scrollHeight
                : document.body.scrollHeight;
            if (currentCount > previousCount || currentHeight > previousHeight + 50) {
                return 'grown';
            }
        }
        return 'timeout';
    };

    const autoLoadStart = performance.now();
    const AUTOLOAD_DEADLINE_MS = 45000;
    const deadlineExceeded = () => performance.now() - autoLoadStart > AUTOLOAD_DEADLINE_MS;

    let batchCounter = 1;
    tagAnchorsWithBatch(batchCounter);

    for (let clickAttempts = 0; clickAttempts < 30; clickAttempts++) {
        if (deadlineExceeded()) break;
        const button = findLoadMoreButton();
        if (!button) break;

        const previousCount = getResultBlocks().length;
        const previousHeight = document.documentElement
            ? document.documentElement.scrollHeight
            : document.body.scrollHeight;
        let success = false;
        for (let retry = 0; retry < 5; retry++) {
            if (deadlineExceeded()) break;
            buttonAttempts.set(button, (buttonAttempts.get(button) || 0) + 1);
            button.scrollIntoView({ block: 'center' });
            button.dataset.scrapereAutoload = 'true';
            button.click();
            const waitResult = await waitForNewResults(previousCount, previousHeight);
            if (waitResult === 'grown') {
                success = true;
                buttonAttempts.delete(button);
                batchCounter += 1;
                tagAnchorsWithBatch(batchCounter);
                break;
            }
            await sleep(200);
            if (!document.contains(button) || !isElementVisible(button)) {
                break;
            }
        }

        if (deadlineExceeded()) break;

        if (!success) {
            const anotherButton = findLoadMoreButton();
            if (!anotherButton) {
                break;
            }
            if (anotherButton === button && (buttonAttempts.get(button) || 0) >= 5) {
                break;
            }
            continue;
        }

        await sleep(200);
    }

    const buildEntryId = (link) => {
        try {
            const url = new URL(link);
            let host = url.hostname.toLowerCase();
            if (host.startsWith('www.')) host = host.slice(4);
            return `${url.protocol}//${host}${url.pathname}${url.search}`.toLowerCase();
        } catch (err) {
            return link.toLowerCase();
        }
    };

    const extractMainLink = (anchor) => {
        const ampCur = (anchor.getAttribute('data-amp-cur') || '').trim();
        if (ampCur && isHttpUrl(ampCur)) return ampCur;

        const textCandidates = Array.from(anchor.querySelectorAll('span[role="text"], cite'));
        for (const el of textCandidates) {
            const text = (el.textContent || '').trim();
            if (/^https?:\/\//.test(text)) return text;
        }

        const resolvedHref = resolveHref(anchor.getAttribute('href'));
        if (resolvedHref && isHttpUrl(resolvedHref) && !isInternalOrNonHttpLink(resolvedHref)) {
            return resolvedHref;
        }

        return null;
    };

    const scrapedData = [];
    const seenLinks = new Set();
    const scope = getScopeRoot();
    const anchors = Array.from(scope.querySelectorAll(RESULT_ANCHOR_SELECTOR));
    let skipped = 0;

    for (const anchor of anchors) {
        const mainLink = extractMainLink(anchor);
        if (!mainLink || seenLinks.has(mainLink)) {
            skipped += 1;
            continue;
        }
        seenLinks.add(mainLink);

        const ampLink = anchor.getAttribute('data-amp') || null;
        const heading = anchor.querySelector('div[role="heading"][aria-level="3"], h3');
        const title = (
            (heading && heading.innerText) ||
            anchor.getAttribute('data-amp-title') ||
            ''
        ).trim() || 'Judul tidak ditemukan';
        const batch = parseInt(anchor.getAttribute('data-scrape-batch'), 10) || 1;
        const id = buildEntryId(mainLink);

        scrapedData.push({ id, title, mainLink, ampLink, batch });
    }

    const RESULTS_PER_PAGE = 10;
    scrapedData.forEach((entry, globalIndex) => {
        entry.page = Math.floor(globalIndex / RESULTS_PER_PAGE) + 1;
        entry.rank = (globalIndex % RESULTS_PER_PAGE) + 1;
        entry.rankGlobal = globalIndex + 1;
    });

    return { query, links: scrapedData, totalPages: batchCounter, skipped };
}
