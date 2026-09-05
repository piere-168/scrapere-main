const MENU_ROOT_ID = 'serpLinkCopierRoot';

const MENU_ITEMS = [
    { id: 'serpLinkCopier_linkButton_link', field: 'linkButton', source: 'link', title: 'Catat sebagai Link Button' },
    { id: 'serpLinkCopier_shortlink_link', field: 'shortlink', source: 'link', title: 'Catat sebagai Shortlink' },
    { id: 'serpLinkCopier_linkTujuan_link', field: 'linkTujuan', source: 'link', title: 'Catat sebagai Link Tujuan' },
    { id: 'serpLinkCopier_linkButton_page', field: 'linkButton', source: 'page', title: 'Catat URL halaman ini sebagai Link Button' },
    { id: 'serpLinkCopier_shortlink_page', field: 'shortlink', source: 'page', title: 'Catat URL halaman ini sebagai Shortlink' },
    { id: 'serpLinkCopier_linkTujuan_page', field: 'linkTujuan', source: 'page', title: 'Catat URL halaman ini sebagai Link Tujuan' },
];

function registerContextMenus() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: MENU_ROOT_ID,
            title: 'SERP Link Copier',
            contexts: ['link', 'page'],
        });
        MENU_ITEMS.forEach((item) => {
            chrome.contextMenus.create({
                id: item.id,
                parentId: MENU_ROOT_ID,
                title: item.title,
                contexts: [item.source],
            });
        });
    });
}

chrome.runtime.onInstalled.addListener(registerContextMenus);
chrome.runtime.onStartup.addListener(registerContextMenus);

function flashBadge(text, color, durationMs) {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text });
    setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
    }, durationMs);
}

async function saveManualLink(entryId, field, url) {
    const { manualLinks } = await chrome.storage.local.get('manualLinks');
    const current = manualLinks || {};
    const entry = current[entryId] || { linkButton: [], shortlink: [], linkTujuan: [], pageLinks: [], screenshot: null };
    if (!Array.isArray(entry[field])) entry[field] = [];
    if (!entry[field].includes(url)) {
        entry[field].push(url);
    }
    current[entryId] = entry;
    await chrome.storage.local.set({ manualLinks: current });
}

async function handleUpload(entryId, base64) {
    try {
        const { imgbbKey } = await chrome.storage.local.get('imgbbKey');
        if (!imgbbKey) {
            return { ok: false, error: 'API key ImgBB belum diisi.' };
        }

        const formData = new FormData();
        formData.append('key', imgbbKey);
        formData.append('image', base64);

        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData,
        });
        const json = await response.json();

        if (!response.ok || !json.success) {
            const errorMessage = (json.error && json.error.message) || 'Upload gagal';
            return { ok: false, error: errorMessage };
        }

        const url = json.data.url;
        const { manualLinks } = await chrome.storage.local.get('manualLinks');
        const current = manualLinks || {};
        const entry = current[entryId] || { linkButton: [], shortlink: [], linkTujuan: [], pageLinks: [], screenshot: null };
        entry.screenshot = url;
        current[entryId] = entry;
        await chrome.storage.local.set({ manualLinks: current });

        flashBadge('OK', '#188038', 1500);
        return { ok: true, url };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'uploadScreenshot') {
        handleUpload(msg.entryId, msg.base64).then(sendResponse);
        return true;
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const menuItem = MENU_ITEMS.find((item) => item.id === info.menuItemId);
    if (!menuItem) return;

    const url = menuItem.source === 'page' ? (tab && tab.url) : info.linkUrl;
    if (!url) {
        flashBadge('!', '#d93025', 1500);
        return;
    }

    const { activeEntryId } = await chrome.storage.local.get('activeEntryId');
    if (!activeEntryId) {
        flashBadge('!', '#d93025', 1500);
        return;
    }

    await saveManualLink(activeEntryId, menuItem.field, url);
    flashBadge('OK', '#188038', 1500);
});
