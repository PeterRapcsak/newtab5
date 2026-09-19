/*======================================================================
    qrWidget.js - QR-kód widget
----------------------------------------------------------------------
    FELADAT:
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

//! ---------- ÁLLAPOT ----------

const DEBOUNCE_MS = 200;          // ennyit vár gépelés után, mielőtt újragenerálná a kódot
let debounceHandle = null;        // a futó setTimeout azonosítója (hogy eldobhassuk)
let currentSvg = null;            // az utoljára legenerált QR-kód SVG markupja
let currentText = '';             // a hozzá tartozó eredeti szöveg
let hasAutoOpenedForText = false; // ezen munkamenetben már megtörtént-e az automatikus modal-nyitás
let modalEl = null;               // a nagy modal DOM-eleme, lustán (első használatkor) hozzuk létre

// Ezek szándékosan modul-szintű változók és NEM localStorage: lásd a
// fenti fejlécet, a beírt szöveg a fül bezárásával nyom nélkül eltűnik

//! ---------- SEGÉDFÜGGVÉNYEK ----------

// CÉL: A kis, beágyazott előnézet konténerének lekérése
// (nem tesszük el változóba, mert a widget a DOM-ban később is épülhet)
function getOutputEl() {
    return document.getElementById('qr-output');
}

/*
    CÉL: A nagy QR-modal létrehozása (csak első hívásra), vagy a már
    meglévő visszaadása
     - Kattintás a hátterére (backdrop) / az X gombra -> bezárás
*/
function getModal() {
    if (modalEl) return modalEl; // már megvan -> nem építjük fel újra

    modalEl = document.createElement('div');
    modalEl.className = 'qr-modal-overlay';
    modalEl.innerHTML = `
        <div class="qr-modal glass-card">
            <button type="button" class="qr-modal-close" aria-label="Close">&times;</button>
            <div class="qr-modal-output"></div>
            <div class="qr-modal-text"></div>
        </div>
    `;
    // A <body> végére megy, hogy a többi elem fölött, teljes képernyőn üljön
    document.body.appendChild(modalEl);

    modalEl.addEventListener('click', (e) => {
        // Az e.target CSAK akkor maga az overlay, ha a sötét háttérre
        // kattintottak - a fehér kártyán belüli kattintás nem zárja be
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
    if (!modalEl) return; // nyitva sem volt még -> nincs mit szinkronizálni

    // Az SVG markup, ezért innerHTML...
    modalEl.querySelector('.qr-modal-output').innerHTML = currentSvg || '';

    // ...a felhasználó szövege viszont textContent, hogy véletlenül se
    // tudjon HTML-t injektálni a saját oldalunkba
    modalEl.querySelector('.qr-modal-text').textContent = currentText;
}

// CÉL: A modal megnyitása (csak akkor, ha már van legenerált kód)
function openModal() {
    if (!currentSvg) return; // üres modalt nincs értelme felnyitni
    getModal();              // létrehozás, ha ez az első alkalom
    syncModalContent();      // friss tartalom
    modalEl.classList.add('open');
}

// Ha még nincs semmi begépelve: a kimenet doboza vizuálisan NEM is
// létezik — nincs helyfoglaló "írj be valamit" placeholder, csak
// önmagában a beviteli mező.
function hideOutput() {
    const el = getOutputEl();
    if (!el) return;

    el.hidden = true;
    el.innerHTML = '';  // a régi kód ne maradjon a DOM-ban
    currentSvg = null;  // és az állapotban se
    closeModal();       // ha közben nyitva volt a modal, azt is csukjuk
}

// CÉL: Hibaüzenet megjelenítése a kimenet helyén (pld. túl hosszú szöveg esetén)
function renderError(message) {
    const el = getOutputEl();
    if (!el) return;

    el.hidden = false;

    // A message mindig a mi saját, fix szövegünk (nem felhasználói input),
    // ezért itt nyugodtan lehet innerHTML
    el.innerHTML = `<div class="widget-not-configured">${message}</div>`;

    currentSvg = null; // hibás állapotban nincs mit nagyban megmutatni
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

    //? Kiürítette a mezőt -> minden vissza az alapállapotba
    // A jelző nullázása fontos: így a KÖVETKEZŐ begépelt szöveg megint
    // kapni fog egy automatikus modal-nyitást
    if (!text.trim()) {
        hasAutoOpenedForText = false;
        hideOutput();
        return;
    }

    try {
        const qr = qrcode(0, 'M'); // typeNumber 0 = a legkisebb méret, ami még elfér az adat
        // 'M' = hibatűrési szint (Medium, kb. 15%) - jó kompromisszum a
        // sűrűség és az aközött, hogy sérülten/ferdén is beolvasható maradjon

        qr.addData(text);
        qr.make(); // innentől kérdezhető le a mátrix

        // scalable: true -> az SVG a konténerhez igazodik, nem fix pixelméretű
        currentSvg = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
        currentText = text;

        el.hidden = false;
        el.innerHTML = currentSvg;

        //? Modal kezelése: frissítés VAGY (munkamenetenként egyszeri) megnyitás
        if (modalEl && modalEl.classList.contains('open')) {
            syncModalContent(); // már nyitva van -> csak frissítés
        } else if (!hasAutoOpenedForText) {
            openModal(); // ezen munkamenetben még nem nyílt meg automatikusan -> most igen
            hasAutoOpenedForText = true;
        }
        // Ha már volt automatikus nyitás és a felhasználó bezárta, akkor
        // gépelésre NEM ugrik fel újra - az idegesítő lenne
    } catch {
        // A könyvtár akkor dob, ha az adat a legnagyobb (40-es) verzióba sem fér bele
        renderError("That's too much text for a single QR code");
    }
}

// Escape-re bezárja a modalt, ha épp nyitva van
// (modul-szinten, egyszer kötjük be - nem minden megnyitásnál újra)
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
    if (!input) return; // nincs widget a lapon -> nincs mit bekötni

    // Debounce: minden leütés eldobja az előző időzítőt, így csak akkor
    // generálunk, ha a felhasználó DEBOUNCE_MS ideig nem nyomott billentyűt
    input.addEventListener('input', () => {
        clearTimeout(debounceHandle);
        debounceHandle = setTimeout(() => renderQr(input.value), DEBOUNCE_MS);
    });

    // A kis előnézetre kattintva bármikor visszahozható a nagy nézet
    output?.addEventListener('click', () => {
        if (currentSvg) openModal();
    });
}
