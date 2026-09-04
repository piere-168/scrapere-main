export const dom = {
    getLinksButton: document.getElementById('getLinksButton'),
    resultsDiv: document.getElementById('results'),
    copyContainer: document.getElementById('copyContainer'),
    copyReportButton: document.getElementById('copyReportButton'),
    copyLinksButton: document.getElementById('copyLinksButton'),
    searchQueryDisplay: document.getElementById('searchQuery'),
    resetButton: document.getElementById('resetButton'),
    loginButton: document.getElementById('loginButton'),
    logoutButton: document.getElementById('logoutButton'),
    userInfo: document.getElementById('userInfo'),
    userEmail: document.getElementById('userEmail'),
    mainAppContainer: document.getElementById('mainAppContainer'),
    loginNotice: document.getElementById('loginNotice'),
    viewWhitelistButton: document.getElementById('viewWhitelistButton'),
    filterContainer: document.getElementById('filterContainer'),
    filterInput: document.getElementById('filterInput'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingMessage: document.getElementById('loadingMessage'),
    container: document.querySelector('.container'),
};

export function setUserEmail(email) {
    dom.userEmail.textContent = email || '';
}

export function setLoading(visible, message) {
    if (message) {
        dom.loadingMessage.textContent = message;
    }
    if (visible) {
        dom.loadingOverlay.classList.remove('hidden');
        dom.container.style.visibility = 'hidden';
    } else {
        dom.loadingOverlay.classList.add('hidden');
        dom.container.style.visibility = 'visible';
    }
}

export function toggleAuthUI(isLoggedIn) {
    if (isLoggedIn) {
        dom.userInfo.classList.remove('hidden');
        dom.mainAppContainer.classList.remove('hidden');
        dom.loginNotice.classList.add('hidden');
    } else {
        dom.userInfo.classList.add('hidden');
        dom.mainAppContainer.classList.add('hidden');
        dom.loginNotice.classList.remove('hidden');
    }
}

const MANUAL_FIELD_LABELS = {
    linkButton: 'Link Button',
    shortlink: 'Shortlink',
    linkTujuan: 'Link Tujuan',
};

function renderManualLinksSection(entryId, manualEntry) {
    if (!manualEntry) return '';
    const groups = Object.keys(MANUAL_FIELD_LABELS)
        .map((field) => {
            const urls = Array.isArray(manualEntry[field]) ? manualEntry[field] : [];
            if (urls.length === 0) return '';
            const chips = urls
                .map((url) => `
                    <span class="manual-link-chip">
                        <span class="manual-link-url">${url}</span>
                        <button class="manual-link-remove" data-field="${field}" data-url="${url}" title="Hapus" aria-label="Hapus">&times;</button>
                    </span>`)
                .join('');
            return `
                <div class="manual-links-group">
                    <span class="manual-links-label">${MANUAL_FIELD_LABELS[field]}</span>
                    ${chips}
                </div>`;
        })
        .filter(Boolean)
        .join('');

    if (!groups) return '';
    return `<div class="manual-links">${groups}</div>`;
}

export function renderResults(data, { onVisit, onWhitelist, onSelectEntry, onRemoveManualLink }, entryState = {}) {
    const { activeEntryId = null, manualLinks = {} } = entryState;

    dom.resultsDiv.innerHTML = '';
    dom.copyContainer.classList.add('hidden');
    dom.filterContainer.classList.add('hidden');
    dom.searchQueryDisplay.classList.add('hidden');
    dom.resetButton.classList.add('hidden');

    if (!data || !data.links || data.links.length === 0) {
        dom.resultsDiv.innerHTML = '<p class="empty">Belum ada data.</p>';
        return;
    }

    const frag = document.createDocumentFragment();
    data.links.forEach((linkItem) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'result-item';
        if (linkItem.id) wrapper.dataset.entryId = linkItem.id;
        if (linkItem.id && linkItem.id === activeEntryId) {
            wrapper.classList.add('active-entry');
        }
        wrapper.innerHTML = `
            <strong>${linkItem.title || 'Judul tidak ditemukan'}</strong>
            <span class="page-badge">Mobile Hal. ${linkItem.page || 1} · Rank ${linkItem.rank || 1}</span>
            <div class="link-row">
                <span class="link-url">${linkItem.mainLink}</span>
                <button class="action-icon visit-link-button" data-variant="main" data-url="${linkItem.mainLink}" title="Kunjungi" aria-label="Kunjungi">&#128640;</button>
                <button class="action-icon whitelist-button" data-url="${linkItem.mainLink}" title="Whitelist" aria-label="Whitelist">&#10133;</button>
                <span class="whitelist-status"></span>
            </div>
            ${linkItem.ampLink ? `
                <div class="link-row">
                    <span class="link-url">${linkItem.ampLink}</span>
                    <button class="action-icon visit-link-button" data-variant="amp" data-url="${linkItem.ampLink}" title="Kunjungi AMP" aria-label="Kunjungi AMP">&#9889;</button>
                    <button class="action-icon whitelist-button" data-url="${linkItem.ampLink}" title="Whitelist" aria-label="Whitelist">&#10133;</button>
                    <span class="whitelist-status"></span>
                </div>` : ''}
            ${renderManualLinksSection(linkItem.id, manualLinks[linkItem.id])}
        `;
        frag.appendChild(wrapper);
    });

    dom.resultsDiv.appendChild(frag);
    dom.copyContainer.classList.remove('hidden');
    dom.filterContainer.classList.remove('hidden');
    dom.searchQueryDisplay.classList.remove('hidden');
    dom.resetButton.classList.remove('hidden');
    dom.searchQueryDisplay.textContent = data.query || '';

    dom.resultsDiv.querySelectorAll('.visit-link-button').forEach((button) => {
        button.addEventListener('click', onVisit);
    });
    dom.resultsDiv.querySelectorAll('.whitelist-button').forEach((button) => {
        button.addEventListener('click', onWhitelist);
    });
    if (typeof onRemoveManualLink === 'function') {
        dom.resultsDiv.querySelectorAll('.manual-link-remove').forEach((button) => {
            button.addEventListener('click', (event) => {
                const card = event.target.closest('.result-item');
                const entryId = card ? card.dataset.entryId : null;
                if (!entryId) return;
                onRemoveManualLink(entryId, event.target.dataset.field, event.target.dataset.url);
            });
        });
    }
    if (typeof onSelectEntry === 'function') {
        dom.resultsDiv.querySelectorAll('.result-item').forEach((card) => {
            card.addEventListener('click', (event) => {
                if (event.target.closest('.action-icon, .manual-link-remove')) return;
                if (!card.dataset.entryId) return;
                onSelectEntry(card.dataset.entryId);
            });
        });
    }
}
