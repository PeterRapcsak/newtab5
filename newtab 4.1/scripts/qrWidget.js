/*======================================================================
    qrWidget.js - QR-kód widget
------------------------------------------------------------------------
    CÉL:
     - Beírt/beillesztett szöveg vagy URL azonnali QR-kóddá alakítása
     - Minden generálás teljesen kliens-oldalon történik, a becsomagolt
       (vendored) qrcode-generator.js könyvtár segítségével — nincs
       hálózati hívás, semmilyen külső szolgáltatás nem látja, mit
       gépeltünk be
     - Szándékosan NEM kerül localStorage-ba sem, mivel amit ide
       beírunk (wifi jelszó, privát link) ne maradjon meg a fül
       bezárása után sem
    MŰKÖDÉS:
     - Az apró, sarokba illesztett előnézet mellett egy adott gépelési
       munkamenetben az ELSŐ érvényes kód automatikusan megnyit egy
       nagy modalt — az utána történő újragépelés már csak élőben
       frissíti a már nyitva lévő modal tartalmát, nem nyitja fel újra
       minden leütésnél
     - A kis előnézetre kattintva bármikor (újra) megnyitható a modal
======================================================================*/

import { qrcode } from './qrcode-generator.js';

const DEBOUNCE_MS = 200;       // ennyit vár gépelés után, mielőtt újragenerálná a kódot
let debounceHandle = null;
let currentSvg = null;         // az utoljára legenerált QR-kód SVG markupja
let currentText = '';          // a hozzá tartozó eredeti szöveg
let hasAutoOpenedForText = false; // ezen munkamenetben már megtörtént-e az automatikus modal-nyitás
let modalEl = null;

// CÉL: A kis, beágyazott előnézet konténerének lekérése
function getOutputEl() {
    return document.getElementById('qr-output');
}

/*
    CÉL: A nagy QR-modal létrehozása (csak első hívásra), vagy a már
    meglévő visszaadása
     - Kattintás a hátterére (backdrop) / az X gombra -> bezárás
*/
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
        if (e.target === modalEl) closeModal(); // magára a háttérre (backdrop) kattintottak
    });
    modalEl.querySelector('.qr-modal-close').addEventListener('click', closeModal);

    return modalEl;
}

// CÉL: A modal bezárása (ha épp létezik)
function closeModal() {
    if (modalEl) modalEl.classList.remove('open');
}

// CÉL: A modal tartalmának frissítése az aktuális SVG/szöveg alapján
function syncModalContent() {
    if (!modalEl) return;
    modalEl.querySelector('.qr-modal-output').innerHTML = currentSvg || '';
    modalEl.querySelector('.qr-modal-text').textContent = currentText;
}

// CÉL: A modal megnyitása (csak akkor, ha már van legenerált kód)
function openModal() {
    if (!currentSvg) return;
    getModal();
    syncModalContent();
    modalEl.classList.add('open');
}

// Ha még nincs semmi begépelve: a kimenet doboza vizuálisan NEM is
// létezik — nincs helyfoglaló "írj be valamit" placeholder, csak
// önmagában a beviteli mező.
function hideOutput() {
    const el = getOutputEl();
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
    currentSvg = null;
    closeModal();
}

// CÉL: Hibaüzenet megjelenítése a kimenet helyén (pld. túl hosszú szöveg esetén)
function renderError(message) {
    const el = getOutputEl();
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `<div class="widget-not-configured">${message}</div>`;
    currentSvg = null;
    closeModal();
}

/*
    CÉL: QR-kód generálása és megjelenítése a megadott szöveghez
    BE: text - a kódolandó szöveg/URL
    LOGIKA:
     - Üres szöveg esetén elrejti a kimenetet, és nullázza az "ezen
       munkamenetben már automatikusan megnyitottuk" jelzőt
     - Sikeres generálás után: ha a modal már nyitva van, csak
       frissíti; ha még nem volt automatikusan megnyitva ebben a
       gépelési munkamenetben, megnyitja most
     - Hiba esetén (pld. a szöveg túl hosszú egyetlen QR-kódhoz) hibaüzenetet ír ki
*/
function renderQr(text) {
    const el = getOutputEl();
    if (!el) return;

    if (!text.trim()) {
        hasAutoOpenedForText = false;
        hideOutput();
        return;
    }

    try {
        const qr = qrcode(0, 'M'); // typeNumber 0 = a legkisebb méret, ami még elfér az adat
        qr.addData(text);
        qr.make();

        currentSvg = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
        currentText = text;
        el.hidden = false;
        el.innerHTML = currentSvg;

        if (modalEl && modalEl.classList.contains('open')) {
            syncModalContent(); // már nyitva van -> csak frissítés
        } else if (!hasAutoOpenedForText) {
            openModal(); // ezen munkamenetben még nem nyílt meg automatikusan -> most igen
            hasAutoOpenedForText = true;
        }
    } catch {
        renderError("That's too much text for a single QR code");
    }
}

// Escape-re bezárja a modalt, ha épp nyitva van
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && modalEl.classList.contains('open')) {
        closeModal();
    }
});

/*
    CÉL: A QR-widget bekötése
     - Gépelésre (debounce-olva) újragenerálja a kódot
     - A kis előnézetre kattintva megnyitja a nagy modalt
*/
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
