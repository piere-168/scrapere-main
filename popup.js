import { auth, bootstrapAuth } from './src/core/auth.js';
import {
    apiAddWhitelistByKeyword,
    apiListKeywords,
    apiRemoveWhitelistByKeyword,
    apiUpsertKeyword,
} from './src/api/client.js';
import {
    clearKeywordCaches,
    ensureCurrentKeywordId,
    getCurrentKeywordId,
    getKeywordIdCached,
    getUmumKeywordIdCached,
    getWhitelistWithCache,
    invalidateKeywordIdCacheById,
    rememberKeywordId,
    setCurrentKeywordId,
    setCurrentKeywordName,
} from './src/state/keywordCache.js';
import { normalizeUrl, extractHostname, hostInSet } from './src/utils/url.js';
import { scrapeDataOnPage } from './src/core/scraper.js';
import { scanPageLinksOnPage } from './src/core/scanPageLinks.js';
import { dom, setLoading, toggleAuthUI, renderResults, setUserEmail } from './src/ui/view.js';

let fullScrapedData = null;
let pendingLogout = false;
let lastRenderedData = null;
let manualLinksState = {};
let activeEntryId = null;

function renderSkippedNotice(skipped) {
    let notice = document.getElementById('skippedNotice');
    if (!notice) {
        notice = document.createElement('p');
        notice.id = 'skippedNotice';
        notice.className = 'skipped-notice hidden';
        dom.resultsDiv.insertAdjacentElement('afterend', notice);
    }
    if (skipped > 0) {
        notice.textContent = `${skipped} hasil dilewati (kartu sosial media / tanpa URL)`;
        notice.classList.remove('hidden');
    } else {
        notice.textContent = '';
        notice.classList.add('hidden');
    }
}

function showResults(data) {
    lastRenderedData = data;
    renderResults(data, {
        onVisit: visitLink,
        onWhitelist: whitelistLink,
        onSelectEntry: selectActiveEntry,
        onRemoveManualLink: removeManualLink,
    }, {
        activeEntryId,
        manualLinks: manualLinksState,
    });
    renderSkippedNotice(data && typeof data.skipped === 'number' ? data.skipped : 0);
}

async function loadManualState() {
    const store = await chrome.storage.local.get(['manualLinks', 'activeEntryId']);
    manualLinksState = store.manualLinks || {};
    activeEntryId = store.activeEntryId || null;
}

function selectActiveEntry(entryId) {
    if (!entryId) return;
    chrome.storage.local.set({ activeEntryId: entryId });
}

async function removeManualLink(entryId, field, url) {
    if (!entryId || !field) return;
    const { manualLinks } = await chrome.storage.local.get('manualLinks');
    const current = manualLinks || {};
    const entry = current[entryId];
    if (!entry || !Array.isArray(entry[field])) return;
    entry[field] = entry[field].filter((u) => u !== url);
    await chrome.storage.local.set({ manualLinks: current });
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!changes.manualLinks && !changes.activeEntryId) return;
    if (changes.manualLinks) manualLinksState = changes.manualLinks.newValue || {};
    if (changes.activeEntryId) activeEntryId = changes.activeEntryId.newValue || null;
    if (lastRenderedData) showResults(lastRenderedData);
});

async function showLoggedInState(user) {
    toggleAuthUI(true);
    document.body.classList.add('logged-in');
    document.body.classList.remove('logged-out');
    setUserEmail(user.email);
    await loadManualState();
    chrome.storage.local.get('scrapeData', ({ scrapeData }) => {
        fullScrapedData = scrapeData;
        showResults(scrapeData);
    });
}

function showLoggedOutState() {
    toggleAuthUI(false);
    document.body.classList.add('logged-out');
    document.body.classList.remove('logged-in');
    setUserEmail('');
    fullScrapedData = null;
    showResults(null);
}

function getScrapeDataFromStorage() {
    return new Promise((resolve) => {
        chrome.storage.local.get('scrapeData', ({ scrapeData }) => resolve(scrapeData || null));
    });
}

async function getCachedScrapeData() {
    if (fullScrapedData && Array.isArray(fullScrapedData.links)) {
        return fullScrapedData;
    }
    const stored = await getScrapeDataFromStorage();
    if (stored && Array.isArray(stored.links)) {
        fullScrapedData = stored;
    }
    return fullScrapedData;
}

function resetData() {
    chrome.storage.local.remove(['scrapeData', 'manualLinks', 'activeEntryId'], () => {
        fullScrapedData = null;
        manualLinksState = {};
        activeEntryId = null;
        dom.filterInput.value = '';
        showResults(null);
    });
}

function filterResults() {
    if (!fullScrapedData) return;
    const term = dom.filterInput.value.toLowerCase();
    if (!term) {
        showResults(fullScrapedData);
        return;
    }
    const filteredLinks = fullScrapedData.links.filter((linkItem) => {
        const titleMatch = linkItem.title && linkItem.title.toLowerCase().includes(term);
        const mainLinkMatch = linkItem.mainLink.toLowerCase().includes(term);
        const ampLinkMatch = linkItem.ampLink && linkItem.ampLink.toLowerCase().includes(term);
        return titleMatch || mainLinkMatch || ampLinkMatch;
    });
    showResults({ query: fullScrapedData.query, links: filteredLinks, skipped: fullScrapedData.skipped });
}

function copyReport() {
    Promise.all([getCachedScrapeData(), chrome.storage.local.get('manualLinks')]).then(([scrapeData, store]) => {
        if (!scrapeData || !scrapeData.links || scrapeData.links.length === 0) return;
        const manualLinks = store.manualLinks || {};
        const checkedAt = new Date().toLocaleString('id-ID');
        const joinOrNone = (arr) => (Array.isArray(arr) && arr.length > 0 ? arr.join(', ') : 'Tidak ditemukan');
        const entries = scrapeData.links.map((link) => {
            const manual = manualLinks[link.id] || {};
            return [
                `Pelaku Phising : ${link.title || 'Tidak ditemukan'}`,
                `Korban Phising : ${scrapeData.query}`,
                `Main Link : ${link.mainLink}`,
                `Link AMP : ${link.ampLink || 'Tidak ditemukan'}`,
                `Posisi : Mobile SERP halaman ${link.page}, rank ${link.rank} (urutan ke-${link.rankGlobal})`,
                `Waktu Cek : ${checkedAt}`,
                `Link Button : ${joinOrNone(manual.linkButton)}`,
                `Shortlink : ${joinOrNone(manual.shortlink)}`,
                `Link Tujuan : ${joinOrNone(manual.linkTujuan)}`,
                `AMP Manual : ${joinOrNone(manual.ampManual)}`,
                `Engine : `,
            ].join('\n');
        });
        navigator.clipboard.writeText(entries.join('\n---------------------\n')).then(() => {
            dom.copyReportButton.textContent = 'Tersalin!';
            setTimeout(() => { dom.copyReportButton.textContent = 'Copy untuk Laporan'; }, 2000);
        });
    });
}

function copyLinksOnly() {
    getCachedScrapeData().then((scrapeData) => {
        if (!scrapeData || !scrapeData.links || scrapeData.links.length === 0) return;
        const linkSet = new Set();
        scrapeData.links.forEach((link) => {
            if (link.mainLink) linkSet.add(link.mainLink);
            if (link.ampLink) linkSet.add(link.ampLink);
        });
        navigator.clipboard.writeText(Array.from(linkSet).join('\n')).then(() => {
            dom.copyLinksButton.textContent = 'Tersalin!';
            setTimeout(() => { dom.copyLinksButton.textContent = 'Copy Link Saja'; }, 2000);
        });
    });
}

async function handleLogin() {
    const email = (dom.emailInput.value || '').trim();
    const password = dom.passwordInput.value || '';
    if (!email || !password) {
        alert('Mohon isi email dan password.');
        return;
    }

    setLoading(true, 'Menyambungkan...');
    try {
        await auth.signInWithEmailAndPassword(email, password);
        dom.loadingMessage.classList.remove('loading-error');
        dom.loadingMessage.classList.add('loading-success');
        toggleAuthUI(true);
        if (auth.currentUser) {
            showLoggedInState(auth.currentUser);
        }
    } catch (err) {
        console.error('Login gagal:', err);
        dom.loadingMessage.classList.remove('loading-success');
        dom.loadingMessage.classList.add('loading-error');
        const msg = (err && err.message ? String(err.message) : '').toLowerCase();
        const friendly = (msg.includes('401') || msg.includes('invalid_credentials'))
            ? 'Email atau password salah.'
            : 'Terjadi kesalahan saat login.';
        alert(friendly);
        dom.passwordInput.value = '';
        toggleAuthUI(false);
        showLoggedOutState();
    } finally {
        setLoading(false);
    }
}

async function handleLogout() {
    pendingLogout = true;
    setLoading(true, 'Mengakhiri sesi...');
    try {
        await auth.signOut();
        await chrome.storage.local.remove(['scrapeData', 'apiToken']);
        await clearKeywordCaches();
        fullScrapedData = null;
        dom.filterInput.value = '';
        showLoggedOutState();
    } finally {
        setTimeout(() => {
            setLoading(false);
            pendingLogout = false;
        }, 600);
    }
}

function visitLink(event) {
    const urlToOpen = event.target.dataset.url;
    if (urlToOpen) {
        chrome.tabs.create({ url: urlToOpen });
    }
}

function renderWhitelistRows(items, keywordId) {
    if (!Array.isArray(items) || items.length === 0) return '';
    return items
        .map((row) => {
            const val = (row && (row.url || row.domain)) ? (row.url || row.domain) : '';
            if (!val) return '';
            return `<div class="whitelist-item"><span>${val}</span><button class="remove-whitelist-button" data-url="${val}" data-keyword-id="${keywordId}" title="Hapus">Hapus</button></div>`;
        })
        .filter(Boolean)
        .join('');
}

async function getLinksAndFilter() {
    dom.resultsDiv.innerHTML = 'Mengambil link dari halaman SERP...';
    const user = auth.currentUser;
    if (!user) {
        alert('Anda harus login terlebih dahulu.');
        return;
    }

    await chrome.storage.local.remove(['manualLinks', 'activeEntryId']);
    manualLinksState = {};
    activeEntryId = null;

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab.url || !(tab.url.includes('google.com/search') || tab.url.includes('google.co.id/search'))) {
        dom.resultsDiv.innerHTML = '<div class="error">Hanya berfungsi di halaman Google Search.</div>';
        return;
    }

    let injectionResults;
    try {
        injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrapeDataOnPage,
        });
    } catch (injectionError) {
        console.error('Injeksi script gagal:', injectionError);
        dom.resultsDiv.innerHTML = '<div class="error">Injeksi ke halaman gagal.</div>';
        return;
    }

    const scrapeResult = injectionResults?.[0]?.result;
    console.log('Hasil scraping mentah:', scrapeResult);
    if (!scrapeResult) {
        dom.resultsDiv.innerHTML = '<div class="error">Hasil kosong dari halaman.</div>';
        return;
    }

    const activeQuery = (scrapeResult.query || '').trim();
    setCurrentKeywordName(activeQuery || 'Umum');
    try {
        const existingId = await getKeywordIdCached(activeQuery || 'Umum');
        setCurrentKeywordId(existingId);
    } catch (lookupError) {
        console.warn('Gagal memuat ID keyword, akan dibuat saat diperlukan:', lookupError);
        setCurrentKeywordId(null);
    }

    let whitelistedUrlSet = new Set();
    let whitelistedHostSet = new Set();
    try {
        const keywordId = getCurrentKeywordId();
        if (keywordId) {
            const wlActive = await getWhitelistWithCache(keywordId);
            if (wlActive.urlSet) wlActive.urlSet.forEach((u) => whitelistedUrlSet.add(u));
            if (wlActive.hostSet) wlActive.hostSet.forEach((h) => whitelistedHostSet.add(h));
        }
        const umumId = await getUmumKeywordIdCached();
        if (umumId && umumId !== keywordId) {
            const wlUmum = await getWhitelistWithCache(umumId);
            if (wlUmum.urlSet) wlUmum.urlSet.forEach((u) => whitelistedUrlSet.add(u));
            if (wlUmum.hostSet) wlUmum.hostSet.forEach((h) => whitelistedHostSet.add(h));
        }
    } catch (err) {
        console.error('Gagal mengambil whitelist:', err);
    }

    const seenPairs = new Set();
    scrapeResult.links = (scrapeResult.links || []).filter((linkItem) => {
        const rawMain = (linkItem.mainLink || '').trim();
        const rawAmp = (linkItem.ampLink || '').trim();
        const normalizedMain = normalizeUrl(rawMain) || rawMain;
        const normalizedAmp = normalizeUrl(rawAmp) || rawAmp;
        const key = `${(normalizedMain || '').toLowerCase()}|${(normalizedAmp || '').toLowerCase()}`;
        if (seenPairs.has(key)) return false;
        seenPairs.add(key);
        return true;
    });

    scrapeResult.links = scrapeResult.links.filter((linkItem) => {
        const rawMainLink = (linkItem.mainLink || '').trim();
        const rawAmpLink = (linkItem.ampLink || '').trim();
        const normalizedMainLink = normalizeUrl(rawMainLink);
        const normalizedAmpLink = normalizeUrl(rawAmpLink);
        const mainHostname = extractHostname(rawMainLink);
        const ampHostname = extractHostname(rawAmpLink);

        const isWhitelisted =
            (normalizedMainLink && whitelistedUrlSet.has(normalizedMainLink)) ||
            (normalizedAmpLink && whitelistedUrlSet.has(normalizedAmpLink)) ||
            (rawMainLink && whitelistedUrlSet.has(rawMainLink)) ||
            (rawAmpLink && whitelistedUrlSet.has(rawAmpLink)) ||
            hostInSet(mainHostname, whitelistedHostSet) ||
            hostInSet(ampHostname, whitelistedHostSet);

        return !isWhitelisted;
    });

    fullScrapedData = scrapeResult;
    chrome.storage.local.set({ scrapeData: scrapeResult }, () => {
        showResults(scrapeResult);
        dom.filterInput.value = '';
    });
}

async function scanPageLinks() {
    if (!activeEntryId) {
        alert('Pilih dulu entry di daftar hasil sebelum scan.');
        return;
    }

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab.url && (tab.url.includes('google.com/search') || tab.url.includes('google.co.id/search'))) {
        alert('Fitur ini untuk halaman situs target, bukan halaman Google.');
        return;
    }

    let injectionResults;
    try {
        injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scanPageLinksOnPage,
        });
    } catch (injectionError) {
        console.error('Scan link halaman gagal:', injectionError);
        alert('Gagal mengambil link dari halaman ini.');
        return;
    }

    const scanResult = injectionResults?.[0]?.result;
    if (!scanResult) {
        alert('Tidak ada data yang bisa diambil dari halaman ini.');
        return;
    }

    const urlsToSave = [scanResult.pageUrl, ...scanResult.links.map((link) => link.url)];

    const { manualLinks } = await chrome.storage.local.get('manualLinks');
    const current = manualLinks || {};
    const entry = current[activeEntryId] || { linkButton: [], shortlink: [], linkTujuan: [], ampManual: [], pageLinks: [] };
    if (!Array.isArray(entry.pageLinks)) entry.pageLinks = [];
    urlsToSave.forEach((url) => {
        if (url && !entry.pageLinks.includes(url)) {
            entry.pageLinks.push(url);
        }
    });
    current[activeEntryId] = entry;
    await chrome.storage.local.set({ manualLinks: current });

    manualLinksState = current;
    if (lastRenderedData) showResults(lastRenderedData);
}

async function whitelistLink(event) {
    const user = auth.currentUser;
    if (!user) return;
    const button = event.currentTarget || event.target;
    if (!button) return;
    if (button.dataset.pending === 'busy' || button.dataset.pending === 'done') return;

    const row = button.closest('.link-row');
    const statusEl = row ? row.querySelector('.whitelist-status') : null;
    const setStatus = (variant, text) => {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.className = 'whitelist-status';
        if (text) {
            statusEl.classList.add('active');
            if (variant) statusEl.classList.add(variant);
        }
    };

    const urlToWhitelist = (button.dataset.url || '').trim();
    if (!urlToWhitelist) {
        setStatus('error', 'URL tidak valid');
        return;
    }

    const normalizedUrl = normalizeUrl(urlToWhitelist);
    const hostnameOnly = extractHostname(normalizedUrl || urlToWhitelist);
    const normalizedHost = hostnameOnly ? hostnameOnly.toLowerCase() : null;
    const valueToSave = (normalizedHost || normalizedUrl || urlToWhitelist).trim();
    const valueToSaveLower = valueToSave.toLowerCase();

    button.dataset.pending = 'busy';
    button.disabled = true;
    button.classList.add('is-loading');
    setStatus('progress', 'Menambahkan...');

    try {
        const { scrapeData } = await chrome.storage.local.get('scrapeData');
        setCurrentKeywordName(scrapeData ? (scrapeData.query || '').trim() || 'Umum' : 'Umum');
        const keywordId = await ensureCurrentKeywordId();

        let alreadyExists = false;
        try {
            const existing = await getWhitelistWithCache(keywordId);
            const existingItems = existing && existing.items ? existing.items : [];
            const urlSet = existing.urlSet || new Set();
            const hostSet = existing.hostSet || new Set();
            if (urlSet.has(valueToSaveLower)) {
                alreadyExists = true;
            } else if (normalizedHost && hostSet.has(normalizedHost)) {
                alreadyExists = true;
            } else if (Array.isArray(existingItems)) {
                alreadyExists = existingItems.some((item) => {
                    const raw = item && (item.url || item.domain) ? String(item.url || item.domain).trim() : '';
                    if (!raw) return false;
                    if (normalizedHost) {
                        const existingHost = extractHostname(raw);
                        if (existingHost && existingHost.toLowerCase() === normalizedHost) {
                            return true;
                        }
                    }
                    return raw.toLowerCase() === valueToSaveLower;
                });
            }
        } catch (cacheErr) {
            console.warn('Gagal memeriksa whitelist lokal:', cacheErr);
        }

        if (alreadyExists) {
            button.dataset.pending = 'done';
            button.className = 'action-icon whitelist-button is-info';
            setStatus('info', 'Sudah ada');
            return;
        }

        const finalKeywordId = await addWhitelistWithRetry(keywordId, valueToSave);
        try {
            const store = await chrome.storage.local.get('whitelistCache');
            const cache = store.whitelistCache || {};
            delete cache[String(finalKeywordId)];
            await chrome.storage.local.set({ whitelistCache: cache });
        } catch (invalidateErr) {
            console.warn('Gagal menghapus cache whitelist:', invalidateErr);
        }

        button.dataset.pending = 'done';
        button.className = 'action-icon whitelist-button is-success';
        setStatus('success', 'Ditambahkan');
    } catch (err) {
        console.error('Gagal menambahkan ke whitelist:', err);
        button.className = 'action-icon whitelist-button is-error';
        button.disabled = false;
        delete button.dataset.pending;
        setStatus('error', 'Gagal, coba lagi');
    } finally {
        button.classList.remove('is-loading');
    }
}

async function addWhitelistWithRetry(keywordId, valueToSave) {
    try {
        await apiAddWhitelistByKeyword(keywordId, [valueToSave]);
        return keywordId;
    } catch (err) {
        const message = (err && err.message ? String(err.message) : '').toLowerCase();
        if (!(message.includes('403') || message.includes('forbidden'))) {
            throw err;
        }
        await invalidateKeywordIdCacheById(keywordId);
        const freshKeywordId = await ensureCurrentKeywordId();
        await apiAddWhitelistByKeyword(freshKeywordId, [valueToSave]);
        return freshKeywordId;
    }
}

async function renderWhitelistManager() {
    const user = auth.currentUser;
    if (!user) return;
    dom.resultsDiv.innerHTML = 'Mengambil whitelist dari server...';
    dom.copyContainer.classList.add('hidden');
    dom.resetButton.classList.add('hidden');
    dom.filterContainer.classList.add('hidden');
    dom.searchQueryDisplay.classList.add('hidden');
    const prevSearch = (document.getElementById('whitelistSearchInput')?.value || '').trim();

    const keywords = await apiListKeywords();

    dom.resultsDiv.innerHTML = `
        <div class="whitelist-manager-container">
            <div class="bulk-add-section">
                <h4>Tambah Link Massal (Bulk)</h4>
                <textarea id="bulkWhitelistInput" placeholder="Tempel daftar link di sini, satu link per baris..."></textarea>
                <div class="bulk-add-controls">
                    <input type="text" id="bulkQueryInput" placeholder="Nama Kueri untuk Kategori">
                    <button id="bulkAddButton">Tambahkan</button>
                </div>
            </div>
            <input type="text" id="whitelistSearchInput" placeholder="Cari di dalam whitelist...">
            <div class="accordion-container"></div>
        </div>
    `;

    const accordionContainer = dom.resultsDiv.querySelector('.accordion-container');
    if (!Array.isArray(keywords) || keywords.length === 0) {
        accordionContainer.innerHTML = '<p>Daftar whitelist Anda masih kosong.</p>';
    } else {
        const frag = document.createDocumentFragment();
        for (const kw of keywords) {
            const accordionItem = document.createElement('div');
            accordionItem.className = 'accordion-item';

            const header = document.createElement('button');
            header.className = 'accordion-header';
            header.textContent = `Kueri: "${kw.keyword}" (${kw.count || 0} link)`;
            header.dataset.keywordId = kw.id;

            const content = document.createElement('div');
            content.className = 'accordion-content';
            content.dataset.loaded = 'false';

            accordionItem.appendChild(header);
            accordionItem.appendChild(content);
            frag.appendChild(accordionItem);
        }
        accordionContainer.appendChild(frag);
    }

    document.getElementById('bulkAddButton').addEventListener('click', async () => {
        const urlsText = document.getElementById('bulkWhitelistInput').value;
        const queryAsCategory = document.getElementById('bulkQueryInput').value.trim();
        if (!urlsText || !queryAsCategory) {
            alert('Harap isi daftar link dan nama kueri.');
            return;
        }
        const urlsToAdd = urlsText
            .split('\n')
            .map((u) => u.trim())
            .filter(Boolean)
            .map((u) => (extractHostname(normalizeUrl(u) || u) || u).toLowerCase());
        if (urlsToAdd.length === 0) return;
        const up = await apiUpsertKeyword(queryAsCategory);
        await rememberKeywordId(queryAsCategory, up.id);
        await apiAddWhitelistByKeyword(up.id, urlsToAdd);
        await chrome.storage.local.remove('whitelistCache');
        renderWhitelistManager();
    });

    const searchInput = document.getElementById('whitelistSearchInput');
    searchInput.addEventListener('input', filterWhitelist);
    if (prevSearch) {
        searchInput.value = prevSearch;
        try { await filterWhitelist(); } catch (err) { console.warn(err); }
    }

    accordionContainer.addEventListener('click', async (evt) => {
        const header = evt.target.closest('.accordion-header');
        if (!header) return;
        header.classList.toggle('active');
        const content = header.nextElementSibling;
        if (content.style.maxHeight) {
            content.style.maxHeight = null;
        } else {
            if (content.dataset.loaded !== 'true') {
                const kid = parseInt(header.dataset.keywordId, 10);
                const cache = await getWhitelistWithCache(kid);
                const items = cache && cache.items ? cache.items : [];
                content.innerHTML = renderWhitelistRows(items, kid);
                content.dataset.loaded = 'true';
            }
            content.style.maxHeight = content.scrollHeight + 'px';
        }
    });

    accordionContainer.addEventListener('click', async (evt) => {
        const btn = evt.target.closest('.remove-whitelist-button');
        if (!btn) return;
        const urlToRemove = btn.dataset.url;
        const keywordId = parseInt(btn.dataset.keywordId, 10);
        await apiRemoveWhitelistByKeyword(keywordId, urlToRemove);
        await invalidateKeywordIdCacheById(keywordId);
        const store = await chrome.storage.local.get('whitelistCache');
        const cache = store.whitelistCache || {};
        delete cache[String(keywordId)];
        await chrome.storage.local.set({ whitelistCache: cache });
        renderWhitelistManager();
    });
}

async function filterWhitelist(event) {
    const inputEl = document.getElementById('whitelistSearchInput');
    const searchTerm = (event && event.target ? event.target.value : (inputEl ? inputEl.value : '')).trim().toLowerCase();
    const allItems = document.querySelectorAll('.accordion-item');

    for (const item of allItems) {
        const header = item.querySelector('.accordion-header');
        const content = item.querySelector('.accordion-content');
        if (!header || !content) continue;

        if (searchTerm && content.dataset.loaded !== 'true') {
            try {
                const kid = parseInt(header.dataset.keywordId, 10);
                const cache = await getWhitelistWithCache(kid);
                const items = cache && cache.items ? cache.items : [];
                content.innerHTML = renderWhitelistRows(items, kid);
                content.dataset.loaded = 'true';
                await filterWhitelist();
                return;
            } catch (err) {
                console.warn(err);
            }
        }

        const rows = Array.from(content.querySelectorAll('.whitelist-item'));
        if (!searchTerm) {
            item.style.display = '';
            rows.forEach((row) => { row.style.display = ''; });
            if (header.dataset.searchToggled === 'true') {
                header.classList.remove('active');
                delete header.dataset.searchToggled;
            }
            if (header.classList.contains('active')) {
                content.style.maxHeight = content.scrollHeight + 'px';
            } else {
                content.style.maxHeight = null;
            }
            continue;
        }

        const categoryMatch = header.textContent.toLowerCase().includes(searchTerm);
        let matchedLinks = 0;
        rows.forEach((row) => {
            const linkText = row.querySelector('span').textContent.toLowerCase();
            const isMatch = linkText.includes(searchTerm);
            row.style.display = isMatch ? '' : 'none';
            if (isMatch) matchedLinks += 1;
        });

        if (matchedLinks > 0 || categoryMatch) {
            item.style.display = '';
            if (!header.classList.contains('active')) {
                header.classList.add('active');
                header.dataset.searchToggled = 'true';
            }
            content.style.maxHeight = content.scrollHeight + 'px';
            if (!matchedLinks) {
                rows.forEach((row) => { row.style.display = ''; });
            }
        } else {
            item.style.display = 'none';
        }
    }
}

dom.copyReportButton.addEventListener('click', copyReport);
dom.copyLinksButton.addEventListener('click', copyLinksOnly);
dom.resetButton.addEventListener('click', resetData);
dom.filterInput.addEventListener('input', filterResults);
dom.loginButton.addEventListener('click', handleLogin);
dom.logoutButton.addEventListener('click', handleLogout);
dom.getLinksButton.addEventListener('click', getLinksAndFilter);
dom.scanPageLinksButton.addEventListener('click', scanPageLinks);
dom.viewWhitelistButton.addEventListener('click', renderWhitelistManager);

auth.onAuthStateChanged((user) => {
    if (pendingLogout) return;
    if (user) {
        toggleAuthUI(true);
        showLoggedInState(user);
    } else {
        toggleAuthUI(false);
        showLoggedOutState();
    }
    setLoading(false);
});

bootstrapAuth();
