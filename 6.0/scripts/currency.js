/*======================================================================
    currency.js - Valutaváltó
----------------------------------------------------------------------
     - Élő árfolyamok a Frankfurter API-ból (ECB adatok), kétirányú
       átváltás (amelyik mezőbe gépelnek, abból számol a másikba)
     - Magyar számformátum: pont az ezres, vessző a tizedes elválasztó
    6.0:
     - Pénznem-lista (7 nap) és árfolyamok (1 óra) localStorage-ban
       cache-elve -> egy új fül általában EGYETLEN hálózati kérést sem
       indít (az 5.1 minden új fülön kettőt)
     - A kiválasztott pénznempár mentve (fromCurrency / toCurrency)
    API: https://frankfurter.dev/ - kulcs nélküli, csak munkanapokon frissül
======================================================================*/

// A régi api.frankfurter.app ide irányít át (301) -> közvetlenül ezt hívjuk
const API = 'https://api.frankfurter.dev/v1';
const LIST_KEY = 'currencyListCache';
const RATES_KEY = 'currencyRateCache';
const LIST_TTL = 7 * 24 * 3600000;
export const CACHE_EXPIRATION = 3600000;

const fromSelect = document.getElementById('from-currency');
const toSelect = document.getElementById('to-currency');
const amountInput = document.getElementById('amount');
const resultInput = document.getElementById('result');

let lastEditedInput = 'amount';
let conversionId = 0; // a gyorsan egymást követő átváltások közül csak a LEGUTOLSÓ írhat a mezőbe

function readCache(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
        return {};
    }
}

const rateCache = readCache(RATES_KEY); // { "EUR_HUF": { rate, timestamp } }

//! ---------- SZÁMFORMÁZÁS ----------

// 1234.5 -> "1.234,5" (max 2 tizedes)
function formatWithDots(value) {
    if (!value && value !== 0) return '';
    const [intPart, decPart] = Number(value).toString().split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decPart ? `${formattedInt},${decPart.slice(0, 2)}` : formattedInt;
}

// "1.234,5" -> 1234.5 (üresre NaN)
function parseFormattedNumber(str) {
    if (!str) return NaN;
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
}

// CÉL: Élő formázás gépelés közben, a kurzorpozíció megtartásával
function formatInputLive(input) {
    const cursorPos = input.selectionStart;
    const oldLength = input.value.length;

    let raw = input.value.replace(/[^\d,]/g, '');
    const comma = raw.indexOf(',');
    if (comma !== -1) {
        raw = raw.slice(0, comma) + ',' + raw.slice(comma + 1).replace(/,/g, '').slice(0, 2);
    }

    const [intPart, decPart] = raw.split(',');
    const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (decPart !== undefined ? ',' + decPart : '');
    input.value = formatted;

    const newPos = Math.max(0, cursorPos + formatted.length - oldLength);
    input.setSelectionRange(newPos, newPos);
}

//! ---------- PÉNZNEMEK ----------

async function getCurrencyList() {
    const cached = readCache(LIST_KEY);
    if (cached.list && Date.now() - cached.timestamp < LIST_TTL) return cached.list;

    try {
        const response = await fetch(`${API}/currencies`);
        const list = Object.keys(await response.json());
        localStorage.setItem(LIST_KEY, JSON.stringify({ list, timestamp: Date.now() }));
        return list;
    } catch (error) {
        // Nincs net -> egy elavult lista is jobb, mint az üres
        console.error('Error fetching currencies:', error);
        return cached.list || [];
    }
}

export async function loadCurrencies() {
    const list = await getCurrencyList();
    if (!list.length) return;

    const options = list.map((c) => new Option(c, c));
    fromSelect.replaceChildren(...options);
    toSelect.replaceChildren(...options.map((o) => o.cloneNode(true)));

    fromSelect.value = localStorage.getItem('fromCurrency') || 'EUR';
    toSelect.value = localStorage.getItem('toCurrency') || 'HUF';
    if (!fromSelect.value) fromSelect.value = list[0];
    if (!toSelect.value) toSelect.value = list[0];

    amountInput.value = '1';
    convertCurrency('amount');
}

//! ---------- ÁTVÁLTÁS ----------

async function getRate(from, to) {
    if (from === to) return 1;

    const key = `${from}_${to}`;
    const hit = rateCache[key];
    if (hit && Date.now() - hit.timestamp < CACHE_EXPIRATION) return hit.rate;

    const response = await fetch(`${API}/latest?from=${from}&to=${to}`);
    const rate = (await response.json()).rates?.[to];
    if (!(rate > 0)) throw new Error(`no rate for ${key}`);
    rateCache[key] = { rate, timestamp: Date.now() };
    localStorage.setItem(RATES_KEY, JSON.stringify(rateCache));
    return rate;
}

/*
    CÉL: Átváltás a két kiválasztott pénznem között
    BE: source - 'amount' vagy 'result': melyik mezőből számol a másikba
*/
export async function convertCurrency(source) {
    const id = ++conversionId;
    const input = source === 'amount' ? amountInput : resultInput;
    const output = source === 'amount' ? resultInput : amountInput;
    const value = parseFormattedNumber(input.value);

    if (isNaN(value) || value < 0) {
        output.value = '';
        return;
    }

    try {
        const rate = await getRate(fromSelect.value, toSelect.value);
        if (id !== conversionId) return; // közben indult egy újabb
        output.value = formatWithDots(source === 'amount' ? value * rate : value / rate);
    } catch (error) {
        console.error('Error fetching exchange rate:', error);
        if (id === conversionId) output.value = '';
    }
}

//! ---------- BEKÖTÉS ----------

export function setupCurrencyInputs() {
    let debounceTimer;
    const convertSoon = (source) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => convertCurrency(source), 250);
    };

    [[amountInput, 'amount'], [resultInput, 'result']].forEach(([input, source]) => {
        input.addEventListener('input', () => {
            formatInputLive(input);
            lastEditedInput = source;
            convertSoon(source);
        });
    });

    [[fromSelect, 'fromCurrency'], [toSelect, 'toCurrency']].forEach(([select, key]) => {
        select.addEventListener('change', () => {
            localStorage.setItem(key, select.value);
            convertSoon(lastEditedInput);
        });
    });

    // ▲/▼ léptetőgombok: ±1, nem mehet 0 alá
    document.querySelectorAll('.spinner-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById(btn.dataset.target);
            const next = Math.max(0, (parseFormattedNumber(input.value) || 0) + Number(btn.dataset.step));
            input.value = formatWithDots(next);
            lastEditedInput = btn.dataset.target;
            convertCurrency(lastEditedInput);
        });
    });
}
