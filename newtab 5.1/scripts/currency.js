/*======================================================================
    currency.js - Valutaváltó
----------------------------------------------------------------------
    FELADAT:
     - Élő árfolyamok lekérése a Frankfurter API-ból (ECB adatok), és
       kétirányú átváltás: összeg -> eredmény VAGY eredmény -> összeg
       (attól függően, melyik mezőbe gépel épp a felhasználó)
     - Magyar számformátum a mezőkben: pont az ezres, vessző a tizedes
       elválasztó (pld. "1.234,5")
     - Óránkénti (CACHE_EXPIRATION) memóriabeli cache-elés árfolyam-
       párononként, hogy ne kelljen minden gépelésnél újra lekérni

    API: https://frankfurter.dev/
    Megjegyzés: kulcs nélküli, ingyenes API, viszont CSAK munkanapokon
    frissül (az ECB sem ad hétvégére árfolyamot)
======================================================================*/

import { domElements } from './dom.js';

export const exchangeRateCache = {};       // { "EUR_HUF": { rate, timestamp }, ... }
export const CACHE_EXPIRATION = 3600000;   // 1 óra (ms)
export let lastEditedInput = 'amount';     // melyik mezőbe gépelt utoljára a felhasználó
// A lastEditedInput azért kell, mert <select> váltásnál nem tudjuk,
// melyik irányba számoljunk -> abba, amit a felhasználó utoljára piszkált

//! ---------- SZÁMFORMÁZÁS ----------

/*
    CÉL: Szám formázása pontokkal, mint ezres elválasztóval (a tizedeseket megtartja)
    BE: value - szám vagy szám-string
    KI: formázott string, pld. 1234.5 -> "1.234,5"
*/
function formatWithDots(value) {

    // Figyelem: a sima !value a 0-ra is igaz, ezért kell a külön 0-ellenőrzés
    if (!value && value !== 0) return '';

    const num = Number(value);

    // Egész és tizedes rész szétválasztása
    // (a toString() mindig ponttal ad vissza, a vessző csak megjelenítés)
    const [intPart, decPart] = num.toString().split('.');

    // Ezres elválasztó pontok hozzáadása az egész részhez
    // \B      = ne szóhatáron álljunk (tehát a szám elejére NE tegyen pontot)
    // (?=...) = előretekintés, maga a karakter nem fogy el
    // https://stackoverflow.com/questions/2901102/how-to-format-a-number-with-commas-as-thousands-separators
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    // Tizedes résszel együtt adjuk vissza, ha van (max 2 tizedesjegy a megjelenítéshez)
    return decPart ? `${formattedInt},${decPart.slice(0, 2)}` : formattedInt;
}

/*
    CÉL: A formázott számot visszaalakítani lebegőpontos számmá
    (az ezres elválasztók eltávolítása, tizedesvessző -> tizedespont)
    BE: str - formázott string, pld. "1.234,5"
    KI: float, vagy NaN, ha üres/érvénytelen
*/
function parseFormattedNumber(str) {
    if (!str) return NaN; // üres mező -> NaN, a hívó majd lekezeli

    // Ezres elválasztó pontok törlése, majd a tizedesvessző pontra cserélése
    // (a második replace szándékosan NEM globális: csak egy vessző lehet)
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
}

//! ---------- PÉNZNEMEK BETÖLTÉSE ----------

/*
    CÉL: Az elérhető pénznemek lekérése az API-ból, és mindkét <select>
    feltöltése velük
     - Alapértelmezett pár: EUR -> HUF, kezdő összeg: 1
     - Feltöltés után rögtön el is indít egy átváltást
*/
export async function loadCurrencies() {
    try {
        // A válasz egy { "EUR": "Euro", "HUF": "Hungarian Forint", ... } objektum
        const response = await fetch('https://api.frankfurter.app/currencies');
        const currencies = await response.json();

        // Minket csak a kódok (a kulcsok) érdekelnek, a teljes nevek nem
        const currencyList = Object.keys(currencies);

        if (domElements.currency.fromSelect && domElements.currency.toSelect) {

            // Mindkét <select>-be külön <option> kell, ugyanaz az elem nem
            // lóghat két helyen a DOM-ban (a második appendChild elmozdítaná)
            currencyList.forEach(currency => {
                const option1 = document.createElement('option');
                option1.value = currency;
                option1.textContent = currency;
                domElements.currency.fromSelect.appendChild(option1);

                const option2 = document.createElement('option');
                option2.value = currency;
                option2.textContent = currency;
                domElements.currency.toSelect.appendChild(option2);
            });

            //? Alapértelmezett pár és kezdőérték beállítása
            domElements.currency.fromSelect.value = 'EUR';
            domElements.currency.toSelect.value = 'HUF';
            domElements.currency.amountInput.value = '1';

            // Hogy ne üres eredménnyel induljon a kártya
            convertCurrency('amount');
        }
    } catch (error) {
        // Nincs net / leállt az API -> a <select>-ek üresen maradnak,
        // de az oldal többi része ettől még működik
        console.error('Error fetching currencies:', error);
    }
}

//! ---------- ÁTVÁLTÁS ----------

/*
    CÉL: Összeg átváltása a két kiválasztott pénznem között
    BE: source - 'amount' vagy 'result': melyik mezőből induljon a
        számítás (a MÁSIK mezőt fogja kiszámolni/felülírni)
    LOGIKA:
     - Ha van friss (< CACHE_EXPIRATION) cache-elt árfolyam ehhez a
       párhoz, azt használja, egyébként lekéri az API-ból és cache-eli
     - source alapján vagy amount*rate = result, vagy result/rate = amount
*/
export async function convertCurrency(source) {
    const from = domElements.currency.fromSelect?.value;
    const to = domElements.currency.toSelect?.value;
    let amount, result;

    //? Kiindulási érték beolvasása abból a mezőből, amit a felhasználó szerkeszt
    if (source === 'amount') {
        amount = parseFormattedNumber(domElements.currency.amountInput?.value);

        // Üres vagy negatív bemenet -> a másik mezőt is ürítjük
        if (isNaN(amount) || amount < 0) {
            domElements.currency.resultInput.value = '';
            return;
        }
    } else {
        result = parseFormattedNumber(domElements.currency.resultInput?.value);

        // Ugyanaz, csak fordított irányban
        if (isNaN(result) || result < 0) {
            domElements.currency.amountInput.value = '';
            return;
        }
    }

    const cacheKey = `${from}_${to}`; // pld: "EUR_HUF"
    const now = Date.now();

    if (exchangeRateCache[cacheKey] && (now - exchangeRateCache[cacheKey].timestamp < CACHE_EXPIRATION)) {
        //? Van friss cache -> nem kell hálózati kérés
        const rate = exchangeRateCache[cacheKey].rate;

        if (source === 'amount') {
            result = amount * rate;  // oda
            domElements.currency.resultInput.value = formatWithDots(result);
        } else {
            amount = result / rate;  // vissza
            domElements.currency.amountInput.value = formatWithDots(amount);
        }
    } else {
        //? Nincs (friss) cache -> API hívás
        try {
            const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
            const data = await response.json();

            // A válasz: { "rates": { "HUF": 395.2 }, ... } -> csak a célpénznem kell
            const rate = data.rates[to];

            // Eltesszük, hogy a következő gépelésnél már a cache-ből menjen
            exchangeRateCache[cacheKey] = { rate, timestamp: now };

            if (source === 'amount') {
                result = amount * rate;
                domElements.currency.resultInput.value = formatWithDots(result);
            } else {
                amount = result / rate;
                domElements.currency.amountInput.value = formatWithDots(amount);
            }
        } catch (error) {
            // Sikertelen lekérés -> inkább semmit ne írjunk ki, mint rosszat
            console.error('Error fetching exchange rate:', error);
            domElements.currency.resultInput.value = '';
            domElements.currency.amountInput.value = '';
        }
    }
}

//! ---------- MEZŐ-FORMÁZÁS GÉPELÉS KÖZBEN ----------

/*
    CÉL: A mező tartalmának élő formázása gépelés közben (vesszős
    tizedeseket enged)
    BE: input - a formázandó <input> elem
    MEGJEGYZÉS:
     - A kurzorpozíciót is újraszámolja, hogy formázás után is a
       megfelelő helyen maradjon (ne ugorjon a mező végére minden leütésnél)
*/
function formatInputLive(input) {

    // Ezeket MÉG a felülírás előtt le kell menteni, utána már késő
    const cursorPos = input.selectionStart;
    const oldValue = input.value;
    const oldLength = oldValue.length;

    // Minden karakter törlése, ami nem számjegy vagy vessző (tizedeshez)
    let rawValue = oldValue.replace(/[^\d,]/g, '');

    // Csak egy vessző lehet
    const commaIndex = rawValue.indexOf(',');
    if (commaIndex !== -1) {
        // Az első vessző előtti rész marad, utána minden további vesszőt kidobunk
        const beforeComma = rawValue.slice(0, commaIndex).replace(/,/g, '');

        // A tizedes részt egyből 2 jegyre is vágjuk
        const afterComma = rawValue.slice(commaIndex + 1).replace(/,/g, '').slice(0, 2);

        rawValue = beforeComma + ',' + afterComma;
    }

    // Vessző mentén szétválasztjuk, hogy csak az egész részt formázzuk
    const [intPart, decPart] = rawValue.split(',');

    // Egész rész formázása ezres elválasztó pontokkal (ua. a regex, mint fentebb)
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    // Visszaillesztés
    // (decPart lehet üres string is - pld. "1234," -> ilyenkor is kell a vessző,
    //  ezért !== undefined a feltétel, és nem sima igazságérték-vizsgálat)
    const formattedValue = decPart !== undefined ? `${formattedInt},${decPart}` : formattedInt;

    input.value = formattedValue;

    // Kurzorpozíció korrigálása a formázás által okozott hosszkülönbséggel
    // (ha beszúrtunk egy ezres pontot, a kurzornak is egyet arrébb kell ugrania)
    // https://stackoverflow.com/questions/22574295/how-to-keep-the-cursor-position-after-formatting-an-input
    const newLength = formattedValue.length;
    const diff = newLength - oldLength;
    const newCursorPos = Math.max(0, cursorPos + diff); // a mező elejénél nem mehet negatívba
    input.setSelectionRange(newCursorPos, newCursorPos);
}

//! ---------- LÉPTETŐ (SPINNER) GOMBOK ----------

// CÉL: A ▲/▼ léptetőgombok bekötése (±1 az adott mezőn, majd újraszámolás)
function setupSpinnerButtons() {
    const spinnerButtons = document.querySelectorAll('.spinner-btn');

    spinnerButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // nehogy form-submit legyen belőle

            // A HTML-ben data-target mondja meg, melyik mezőhöz tartozik a gomb
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

            // Üres mezőből 0-ról indulunk (a || 0 a NaN-t is elkapja)
            const currentValue = parseFormattedNumber(input.value) || 0;

            const isUp = btn.classList.contains('spinner-up');
            const newValue = isUp ? currentValue + 1 : Math.max(0, currentValue - 1); // nem mehet negatívba

            input.value = formatWithDots(newValue);

            // Átváltás újraindítása az új értékkel
            lastEditedInput = targetId;
            convertCurrency(targetId);
        });
    });
}

/*
    CÉL: A valutaváltó mezőinek/gombjainak bekötése
     - "input" eseményre: élő formázás + debounce-olt átváltás (300ms)
     - <select> váltásra: debounce-olt átváltás az utoljára szerkesztett
       mező irányába (lastEditedInput)
    MEGJEGYZÉS:
     - Egyetlen közös debounceTimer-t használ mind a 4 mező, hogy gyors,
       egymást követő változtatásoknál csak egyszer fusson le ténylegesen
       az átváltás
*/
export function setupCurrencyInputs() {

    // Közös időzítő: minden új esemény eldobja az előzőt (debounce)
    let debounceTimer;

    //? "-ból/-ből" összeg mező
    if (domElements.currency.amountInput) {
        domElements.currency.amountInput.addEventListener('input', () => {
            formatInputLive(domElements.currency.amountInput); // formázás AZONNAL
            lastEditedInput = 'amount';
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                convertCurrency('amount'); // átváltás viszont csak 300ms szünet után
            }, 300);
        });
    }

    //? "-ba/-be" eredmény mező (visszafelé számol)
    if (domElements.currency.resultInput) {
        domElements.currency.resultInput.addEventListener('input', () => {
            formatInputLive(domElements.currency.resultInput);
            lastEditedInput = 'result';
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                convertCurrency('result');
            }, 300);
        });
    }

    //? Pénznem-váltás: nem tudjuk melyik irány kell -> lastEditedInput dönt
    if (domElements.currency.fromSelect) {
        domElements.currency.fromSelect.addEventListener('change', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                convertCurrency(lastEditedInput);
            }, 300);
        });
    }
    if (domElements.currency.toSelect) {
        domElements.currency.toSelect.addEventListener('change', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                convertCurrency(lastEditedInput);
            }, 300);
        });
    }

    // Léptetőgombok bekötése
    setupSpinnerButtons();
}
