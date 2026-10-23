/*======================================================================
    qrWidget.js - QR-kód widget
----------------------------------------------------------------------
     - Beírt szöveg/URL -> QR-kód, teljesen kliens-oldalon (a vendored
       qrcode-generator.js-sel), hálózat nélkül
     - Szándékosan NINCS localStorage: ami ide kerül (wifi jelszó,
       privát link), a fül bezárásával nyom nélkül eltűnik
     - Egy gépelési munkamenetben az ELSŐ érvényes kód automatikusan
       megnyitja a nagy nézetet; utána csak élőben frissül
    6.0:
     - A 58 KB-os könyvtár csak az első használatkor töltődik be
       (dinamikus import), nem minden új fül indulásakor
     - A nagy nézet natív <dialog> (Escape, fókusz, top layer ingyen)
======================================================================*/

import { svgIcon } from './ui.js';

const DEBOUNCE_MS = 200;
let qrcode = null;          // a könyvtár, lustán betöltve
let currentSvg = null;
let currentText = '';
let hasAutoOpened = false;
let dialog = null;

const output = document.getElementById('qr-output');

function getDialog() {
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.className = 'qr-modal';
    dialog.innerHTML = `
        <div class="qr-modal-body">
            <button type="button" class="qr-modal-close delete-btn" aria-label="Close">${svgIcon('x')}</button>
            <div class="qr-modal-output"></div>
            <div class="qr-modal-text"></div>
        </div>
    `;
    document.body.appendChild(dialog);

    // A body kitölti a dialogot -> a dialogra magára csak a háttéren (backdrop) lehet kattintani
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
    });
    dialog.querySelector('.qr-modal-close').addEventListener('click', () => dialog.close());
    return dialog;
}

function syncDialog() {
    if (!dialog) return;
    dialog.querySelector('.qr-modal-output').innerHTML = currentSvg || '';
    dialog.querySelector('.qr-modal-text').textContent = currentText; // felhasználói szöveg -> textContent
}

function openDialog() {
    if (!currentSvg) return;
    getDialog();
    syncDialog();
    if (!dialog.open) dialog.showModal();
}

function showError(message) {
    output.hidden = false;
    output.innerHTML = `<div class="qr-error">${message}</div>`;
    currentSvg = null;
    dialog?.close();
}

async function renderQr(text, input) {
    if (!text.trim()) {
        hasAutoOpened = false; // a KÖVETKEZŐ begépelt szöveg újra kap automatikus nyitást
        output.hidden = true;
        output.innerHTML = '';
        currentSvg = null;
        dialog?.close();
        return;
    }

    qrcode ||= (await import('./qrcode-generator.js')).qrcode;
    if (input.value !== text) return; // közben tovább gépeltek -> egy újabb render jön

    try {
        const qr = qrcode(0, 'M'); // 0 = a legkisebb verzió, amibe belefér; 'M' ~15% hibatűrés
        qr.addData(text);
        qr.make();
        currentSvg = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
        currentText = text;
    } catch {
        return showError("That's too much text for a single QR code");
    }

    output.hidden = false;
    output.innerHTML = currentSvg;

    if (dialog?.open) syncDialog();
    else if (!hasAutoOpened) {
        hasAutoOpened = true;
        openDialog();
    }
}

export function initQrWidget() {
    const input = document.getElementById('qr-input');
    let debounce = 0;

    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => renderQr(input.value, input), DEBOUNCE_MS);
    });
    output.addEventListener('click', openDialog);
}
