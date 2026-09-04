const API_BASE = 'https://api.saligia.app/api';
let apiToken = null;

export async function loadToken() {
    const { apiToken: stored } = await chrome.storage.local.get('apiToken');
    apiToken = stored || null;
    return apiToken;
}

export async function saveToken(token) {
    apiToken = token || null;
    if (apiToken) {
        await chrome.storage.local.set({ apiToken });
    } else {
        await chrome.storage.local.remove('apiToken');
    }
}

export async function apiRequest(path, { method = 'GET', body = null } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiToken) {
        headers['Authorization'] = `Bearer ${apiToken}`;
    }

    const base = API_BASE.replace(/\/+$/, '');
    const normalizedPath = path.replace(/^\/+/, '');
    const url = `${base}/${normalizedPath}`;

    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${method} ${path} gagal: ${res.status} ${text}`);
    }

    return res.json();
}

export async function apiLogin(email, password) {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
    await saveToken(data.token);
    return data;
}

export async function apiLogout() {
    await saveToken(null);
}

export async function apiMe() {
    try {
        const data = await apiRequest('/auth/me');
        return data;
    } catch (err) {
        await saveToken(null);
        return null;
    }
}

export async function apiUpsertKeyword(keyword) {
    return apiRequest('/keywords/upsert', { method: 'POST', body: { keyword } });
}

export async function apiListKeywords() {
    return apiRequest('/keywords');
}

export async function apiGetWhitelist(keywordId) {
    return apiRequest(`/whitelist?keyword_id=${encodeURIComponent(keywordId)}`);
}

export async function apiAddWhitelistByKeyword(keywordId, urls) {
    return apiRequest('/whitelist/add', { method: 'POST', body: { keyword_id: keywordId, urls } });
}

export async function apiRemoveWhitelistByKeyword(keywordId, url) {
    return apiRequest('/whitelist/remove', { method: 'POST', body: { keyword_id: keywordId, url } });
}
