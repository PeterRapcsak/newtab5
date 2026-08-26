// QR code widget: type or paste text/a URL, get a QR code instantly.
// Generated fully client-side via the vendored qrcode-generator library —
// no network call, no external service seeing what you typed. Deliberately
// not persisted to localStorage either, since whatever's typed here (a
// wifi password, a private link) shouldn't linger after the tab closes.
//
// The inline preview is small (it's a corner widget), so the first time a
// given typing session produces a valid code it auto-opens a large modal —
// re-typing after that just updates the already-open modal live instead of
// re-popping it on every keystroke. Clicking the small preview (re)opens it
// on demand.

import { qrcode } from './qrcode-generator.js';

const DEBOUNCE_MS = 200;
let debounceHandle = null;
let currentSvg = null;
let currentText = '';
let hasAutoOpenedForText = false;
let modalEl = null;

function getOutputEl() {
    return document.getElementById('qr-output');
}

function getModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.className = 'qr-modal-overlay';
    modalEl.innerHTML = `
        <div class="qr-modal glass-card">
            <button type="button" class="qr-modal-close" aria-label="Close">&times;</button>
            <div class="qr-modal-output"></div>
            <div class="qr-modal-text"></div>
        </div>
    `;
    document.body.appendChild(modalEl);

    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeModal(); // click on the backdrop itself
    });
    modalEl.querySelector('.qr-modal-close').addEventListener('click', closeModal);

    return modalEl;
}

function closeModal() {
    if (modalEl) modalEl.classList.remove('open');
}

function syncModalContent() {
    if (!modalEl) return;
    modalEl.querySelector('.qr-modal-output').innerHTML = currentSvg || '';
    modalEl.querySelector('.qr-modal-text').textContent = currentText;
}

function openModal() {
    if (!currentSvg) return;
    getModal();
    syncModalContent();
    modalEl.classList.add('open');
}

// Nothing typed yet: the output box doesn't exist visually at all — no
// "type something" placeholder taking up space, just the input on its own.
function hideOutput() {
    const el = getOutputEl();
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
    currentSvg = null;
    closeModal();
}

function renderError(message) {
    const el = getOutputEl();
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `<div class="widget-not-configured">${message}</div>`;
    currentSvg = null;
    closeModal();
}

function renderQr(text) {
    const el = getOutputEl();
    if (!el) return;

    if (!text.trim()) {
        hasAutoOpenedForText = false;
        hideOutput();
        return;
    }

    try {
        const qr = qrcode(0, 'M'); // typeNumber 0 = smallest size that fits the data
        qr.addData(text);
        qr.make();

        currentSvg = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
        currentText = text;
        el.hidden = false;
        el.innerHTML = currentSvg;

        if (modalEl && modalEl.classList.contains('open')) {
            syncModalContent();
        } else if (!hasAutoOpenedForText) {
            openModal();
            hasAutoOpenedForText = true;
        }
    } catch {
        renderError("That's too much text for a single QR code");
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && modalEl.classList.contains('open')) {
        closeModal();
    }
});

export function initQrWidget() {
    const input = document.getElementById('qr-input');
    const output = getOutputEl();
    if (!input) return;

    input.addEventListener('input', () => {
        clearTimeout(debounceHandle);
        debounceHandle = setTimeout(() => renderQr(input.value), DEBOUNCE_MS);
    });

    output?.addEventListener('click', () => {
        if (currentSvg) openModal();
    });
}
