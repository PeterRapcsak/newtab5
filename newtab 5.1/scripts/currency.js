/*======================================================================
    currency.js - Valutaváltó
------------------------------------------------------------------------
    CÉL:
     - Élő árfolyamok lekérése a Frankfurter API-ból (ECB adatok), és
       kétirányú átváltás: összeg -> eredmény VAGY eredmény -> összeg
       (attól függően, melyik mezőbe gépel épp a felhasználó)
     - Magyar számformátum a mezőkben: pont az ezres, vessző a tizedes
       elválasztó (pld. "1.234,5")
     - Óránkénti (CACHE_EXPIRATION) memóriabeli cache-elés árfolyam-
       párononként, hogy ne kelljen minden gépelésnél újra lekérni
======================================================================*/

import { domElements } from './dom.js';

export const exchangeRateCache = {};       // { "EUR_HUF": { rate, timestamp }, ... }
export const CACHE_EXPIRATION = 3600000;   // 1 óra (ms)
export let lastEditedInput = 'amount';     // melyik mezőbe gépelt utoljára a felhasználó

//! ---------- SZÁMFORMÁZÁS ----------

/*
    CÉL: Szám formázása pontokkal, mint ezres elválasztóval (a tizedeseket megtartja)
    BE: value - szám vagy szám-string
    KI: formázott string, pld. 1234.5 -> "1.234,5"
*/
function formatWithDots(value) {
    if (!value && value !== 0) return '';
    const num = Number(value);
    // Egész és tizedes rész szétválasztása
    const [intPart, decPart] = num.toString().split('.');
    // Ezres elválasztó pontok hozzáadása az egész részhez
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
    if (!str) return NaN;
    // Ezres elválasztó pontok törlése, majd a tizedesvessző pontra cserélése
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
        const response = await fetch('https://api.frankfurter.app/currencies');
        const currencies = await response.json();
        const currencyList = Object.keys(currencies);

        if (domElements.currency.fromSelect && domElements.currency.toSelect) {
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

            domElements.currency.fromSelect.value = 'EUR';
            domElements.currency.toSelect.value = 'HUF';
            domElements.currency.amountInput.value = '1';
            convertCurrency('amount');
        }
    } catch (error) {
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

    if (source === 'amount') {
        amount = parseFormattedNumber(domElements.currency.amountInput?.value);
        if (isNaN(amount) || amount < 0) {
            domElements.currency.resultInput.value = '';
            return;
        }
    } else {
        result = parseFormattedNumber(domElements.currency.resultInput?.value);
        if (isNaN(result) || result < 0) {
            domElements.currency.amountInput.value = '';
            return;
        }
    }

    const cacheKey = `${from}_${to}`;
    const now = Date.now();

    if (exchangeRateCache[cacheKey] && (now - exchangeRateCache[cacheKey].timestamp < CACHE_EXPIRATION)) {
        //? Van friss cache -> nem kell hálózati kérés
        const rate = exchangeRateCache[cacheKey].rate;
        if (source === 'amount') {
            result = amount * rate;
            domElements.currency.resultInput.value = formatWithDots(result);
        } else {
            amount = result / rate;
            domElements.currency.amountInput.value = formatWithDots(amount);
        }
    } else {
        //? Nincs (friss) cache -> API hívás
        try {
            const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
            const data = await response.json();
            const rate = data.rates[to];
            exchangeRateCache[cacheKey] = { rate, timestamp: now };
            if (source === 'amount') {
                result = amount * rate;
                domElements.currency.resultInput.value = formatWithDots(result);
            } else {
                amount = result / rate;
                domElements.currency.amountInput.value = formatWithDots(amount);
            }
        } catch (error) {
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
    const cursorPos = input.selectionStart;
    const oldValue = input.value;
    const oldLength = oldValue.length;

    // Minden karakter törlése, ami nem számjegy vagy vessző (tizedeshez)
    let rawValue = oldValue.replace(/[^\d,]/g, '');

    // Csak egy vessző lehet
    const commaIndex = rawValue.indexOf(',');
    if (commaIndex !== -1) {
        const beforeComma = rawValue.slice(0, commaIndex).replace(/,/g, '');
        const afterComma = rawValue.slice(commaIndex + 1).replace(/,/g, '').slice(0, 2);
        rawValue = beforeComma + ',' + afterComma;
    }

    // Vessző mentén szétválasztjuk, hogy csak az egész részt formázzuk
    const [intPart, decPart] = rawValue.split(',');

    // Egész rész formázása ezres elválasztó pontokkal
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    // Visszaillesztés
    const formattedValue = decPart !== undefined ? `${formattedInt},${decPart}` : formattedInt;

    input.value = formattedValue;

    // Kurzorpozíció korrigálása a formázás által okozott hosszkülönbséggel
    const newLength = formattedValue.length;
    const diff = newLength - oldLength;
    const newCursorPos = Math.max(0, cursorPos + diff);
    input.setSelectionRange(newCursorPos, newCursorPos);
}

//! ---------- LÉPTETŐ (SPINNER) GOMBOK ----------

// CÉL: A ▲/▼ léptetőgombok bekötése (±1 az adott mezőn, majd újraszámolás)
function setupSpinnerButtons() {
    const spinnerButtons = document.querySelectorAll('.spinner-btn');
    spinnerButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

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
    let debounceTimer;
    if (domElements.currency.amountInput) {
        domElements.currency.amountInput.addEventListener('input', () => {
            formatInputLive(domElements.currency.amountInput);
            lastEditedInput = 'amount';
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                convertCurrency('amount');
            }, 300);
        });
    }
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
