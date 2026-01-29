import { domElements } from './dom.js';

export const exchangeRateCache = {};
export const CACHE_EXPIRATION = 3600000;
export let lastEditedInput = 'amount';

// Format number with dots as thousand separators (whole numbers only)
function formatWithDots(value) {
    if (!value && value !== 0) return '';
    // Round to whole number and add thousand separators
    const rounded = Math.round(Number(value));
    return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Parse formatted number back to float (remove thousand separators)
function parseFormattedNumber(str) {
    if (!str) return NaN;
    // Remove thousand separators (dots)
    return parseFloat(str.replace(/\./g, ''));
}

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
        const rate = exchangeRateCache[cacheKey].rate;
        if (source === 'amount') {
            result = amount * rate;
            domElements.currency.resultInput.value = formatWithDots(result);
        } else {
            amount = result / rate;
            domElements.currency.amountInput.value = formatWithDots(amount);
        }
    } else {
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

// Format input value live as user types (whole numbers only)
function formatInputLive(input) {
    const cursorPos = input.selectionStart;
    const oldValue = input.value;
    const oldLength = oldValue.length;
    
    // Remove everything except digits
    let rawValue = oldValue.replace(/[^\d]/g, '');
    
    // Format with dots as thousand separators
    const formattedValue = rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    input.value = formattedValue;
    
    // Adjust cursor position
    const newLength = formattedValue.length;
    const diff = newLength - oldLength;
    const newCursorPos = Math.max(0, cursorPos + diff);
    input.setSelectionRange(newCursorPos, newCursorPos);
}

// Handle spinner button clicks
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
            const newValue = isUp ? currentValue + 1 : Math.max(0, currentValue - 1);
            
            input.value = formatWithDots(newValue);
            
            // Trigger conversion
            lastEditedInput = targetId;
            convertCurrency(targetId);
        });
    });
}

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
    
    // Setup spinner buttons
    setupSpinnerButtons();
}