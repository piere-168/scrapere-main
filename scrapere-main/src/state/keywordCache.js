import { apiGetWhitelist, apiListKeywords, apiUpsertKeyword } from '../api/client.js';
import { normalizeUrl, extractHostname } from '../utils/url.js';

const WHITELIST_CACHE_KEY = 'whitelistCache';
const KEYWORD_CACHE_KEY = 'keywordIdCache';
const UMUM_KEY = 'umumKeywordIdCache';

const WHITELIST_TTL = 10 * 60 * 1000;
const KEYWORD_TTL = 10 * 60 * 1000;

let currentKeywordId = null;
let currentKeywordName = 'Umum';

export function setCurrentKeywordName(name) {
    currentKeywordName = (name || 'Umum').trim() || 'Umum';
}

export function getCurrentKeywordId() {
    return currentKeywordId;
}

export function setCurrentKeywordId(value) {
    currentKeywordId = value || null;
}

export async function getWhitelistWithCache(keywordId) {
    if (!keywordId) return { items: [], urlSet: new Set(), hostSet: new Set() };
    const store = await chrome.storage.local.get(WHITELIST_CACHE_KEY);
    const whitelistCache = store[WHITELIST_CACHE_KEY] || {};
    const now = Date.now();
    const entry = whitelistCache[String(keywordId)];
    if (entry && (now - entry.ts) < WHITELIST_TTL) {
        return {
            items: Array.isArray(entry.items) ? entry.items : [],
            urlSet: new Set(entry.urls || []),
            hostSet: new Set(entry.hosts || []),
        };
    }
    const items = await apiGetWhitelist(keywordId);
    const normalized = buildWhitelistIndex(items);
    whitelistCache[String(keywordId)] = { items, urls: Array.from(normalized.urlSet), hosts: Array.from(normalized.hostSet), ts: now };
    await chrome.storage.local.set({ [WHITELIST_CACHE_KEY]: whitelistCache });
    return normalized;
}

export async function rememberKeywordId(keyword, id, ttlMs = KEYWORD_TTL) {
    const normalized = (keyword || '').trim().toLowerCase();
    if (!normalized) return;
    const store = await chrome.storage.local.get(KEYWORD_CACHE_KEY);
    const cache = store[KEYWORD_CACHE_KEY] || {};
    cache[normalized] = { id: id || null, exp: Date.now() + ttlMs };
    await chrome.storage.local.set({ [KEYWORD_CACHE_KEY]: cache });
    if (normalized === 'umum') {
        await chrome.storage.local.set({ [UMUM_KEY]: { id: id || null, ts: Date.now() } });
    }
}

export async function getKeywordIdCached(keyword, ttlMs = KEYWORD_TTL) {
    const normalized = (keyword || '').trim().toLowerCase();
    if (!normalized) return null;
    const now = Date.now();
    const store = await chrome.storage.local.get(KEYWORD_CACHE_KEY);
    const cache = store[KEYWORD_CACHE_KEY] || {};
    const cached = cache[normalized];
    if (cached && typeof cached.exp === 'number' && cached.exp > now) {
        return cached.id || null;
    }

    const keywords = await apiListKeywords().catch(() => []);
    if (Array.isArray(keywords)) {
        keywords.forEach((kw) => {
            const name = (kw.keyword || '').trim().toLowerCase();
            if (!name) return;
            cache[name] = { id: kw.id, exp: now + KEYWORD_TTL };
        });
        await chrome.storage.local.set({ [KEYWORD_CACHE_KEY]: cache });
    }

    const resolved = cache[normalized] ? cache[normalized].id : null;
    cache[normalized] = { id: resolved || null, exp: now + ttlMs };
    await chrome.storage.local.set({ [KEYWORD_CACHE_KEY]: cache });
    return resolved || null;
}

export async function getUmumKeywordIdCached() {
    const store = await chrome.storage.local.get(UMUM_KEY);
    const entry = store[UMUM_KEY];
    const ttl = 24 * 60 * 60 * 1000;
    if (entry && (Date.now() - (entry.ts || 0)) < ttl) {
        return entry.id || null;
    }
    const id = await getKeywordIdCached('umum', ttl);
    await chrome.storage.local.set({ [UMUM_KEY]: { id, ts: Date.now() } });
    return id;
}

export async function ensureCurrentKeywordId() {
    const label = (currentKeywordName || '').trim() || 'Umum';
    if (currentKeywordId) {
        return currentKeywordId;
    }
    try {
        const existing = await getKeywordIdCached(label);
        if (existing) {
            currentKeywordId = existing;
            return existing;
        }
    } catch (err) {
        console.warn('Keyword cache lookup failed:', err);
    }

    const up = await apiUpsertKeyword(label);
    currentKeywordId = up.id;
    await rememberKeywordId(label, up.id);
    return currentKeywordId;
}

export async function invalidateKeywordIdCacheById(keywordId) {
    if (!keywordId) return;
    const store = await chrome.storage.local.get(KEYWORD_CACHE_KEY);
    const cache = store[KEYWORD_CACHE_KEY] || {};
    let mutated = false;
    Object.keys(cache).forEach((key) => {
        const entry = cache[key];
        if (entry && Number(entry.id) === Number(keywordId)) {
            delete cache[key];
            mutated = true;
        }
    });
    if (mutated) {
        await chrome.storage.local.set({ [KEYWORD_CACHE_KEY]: cache });
    }
    if (Number(currentKeywordId) === Number(keywordId)) {
        currentKeywordId = null;
    }
}

export async function clearKeywordCaches() {
    await chrome.storage.local.remove([WHITELIST_CACHE_KEY, KEYWORD_CACHE_KEY, UMUM_KEY]);
    currentKeywordId = null;
    currentKeywordName = 'Umum';
}

function buildWhitelistIndex(items) {
    const urlSet = new Set();
    const hostSet = new Set();
    if (Array.isArray(items)) {
        items.forEach((item) => {
            const raw = item && (item.url || item.domain) ? String(item.url || item.domain).trim() : '';
            if (!raw) return;
            const normalized = normalizeUrl(raw) || raw;
            const normalizedLower = normalized.toLowerCase();
            const rawLower = raw.toLowerCase();
            urlSet.add(rawLower);
            urlSet.add(normalizedLower);
            const hostRaw = extractHostname(raw);
            const hostNorm = extractHostname(normalized);
            if (hostRaw) hostSet.add(hostRaw.toLowerCase());
            if (hostNorm) hostSet.add(hostNorm.toLowerCase());
        });
    }
    return { items: Array.isArray(items) ? items : [], urlSet, hostSet };
}
