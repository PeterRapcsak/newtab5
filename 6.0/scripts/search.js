/*======================================================================
    search.js - Keresősáv és keresőmotorok
----------------------------------------------------------------------
     - A fő keresősáv + a "részletes keresés" popover operátorai
       (pontos kifejezés, kizárt szavak, fájltípus, dátum) egyetlen
       lekérdezéssé fűzve, új fülön megnyitva
     - A kiválasztott keresőmotor mentve (selectedSearchEngine) — az 5.1
       csak exportálta ezt a kulcsot, de soha nem írta/olvasta
======================================================================*/

import { isOpen } from './ui.js';
import { settings } from './settings.js';

const ENGINE_KEY = 'selectedSearchEngine';

export const searchEngines = [
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
    { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=' },
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    { id: 'brave', name: 'Brave', url: 'https://search.brave.com/search?q=' },
    { id: 'yandex', name: 'Yandex', url: 'https://yandex.com/search/?text=' },
    { id: 'startpage', name: 'Startpage', url: 'https://startpage.com/do/dsearch?query=' },
    { id: 'baidu', name: 'Baidu', url: 'https://www.baidu.com/s?wd=' }
];

let selectedEngine = localStorage.getItem(ENGINE_KEY) || 'google';

const $ = (id) => document.getElementById(id);

// CÉL: Új fülön nyit (beállítható); sima weblapként (chrome.* nélkül) window.open-nel
function openTab(url) {
    if (!settings.searchInNewTab) location.href = url;
    else if (globalThis.chrome?.tabs?.create) chrome.tabs.create({ url });
    else window.open(url, '_blank', 'noopener');
}

export function initializeSearchSettings() {
    const engineSelect = $('search-engine-select');
    if (!searchEngines.some((e) => e.id === selectedEngine)) selectedEngine = 'google';
    engineSelect.value = selectedEngine;
    engineSelect.addEventListener('change', () => {
        selectedEngine = engineSelect.value;
        localStorage.setItem(ENGINE_KEY, selectedEngine);
    });
}

const words = (str) => str.split(/\s+/).filter(Boolean);

/*
    CÉL: A keresés lebonyolítása
    MEGJEGYZÉS:
     - A részletes mezőket csak akkor vesszük figyelembe, ha a popover
       épp nyitva van; a dátumszűrés (&tbs=qdr:) csak Google-nél él
*/
function performSearch() {
    let query = $('search-q').value.trim();
    let params = '';
    const advanced = $('advanced-search');

    if (isOpen(advanced)) {
        const allWords = $('adv-all-words').value.trim();
        const exactPhrase = $('adv-exact-phrase').value.trim();
        const anyWords = words($('adv-any-words').value);
        const noneWords = words($('adv-none-words').value);
        const fileTypes = [...advanced.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
        const dateRange = $('adv-date-range').value;

        if (allWords) query += ' ' + allWords;
        if (exactPhrase) query += ` "${exactPhrase}"`;
        if (anyWords.length) query += anyWords.length > 1 ? ` (${anyWords.join(' OR ')})` : ' ' + anyWords[0];
        if (noneWords.length) query += ' ' + noneWords.map((w) => '-' + w).join(' ');
        if (fileTypes.length) query += ` (${fileTypes.map((ft) => 'filetype:' + ft).join(' OR ')})`;
        if (dateRange && selectedEngine === 'google') params += '&tbs=qdr:' + dateRange;
    }

    query = query.trim();
    if (!query) return;

    const engine = searchEngines.find((e) => e.id === selectedEngine) || searchEngines[0];
    openTab(engine.url + encodeURIComponent(query) + params);
}

export function setupSearch() {
    $('search-btn').addEventListener('click', performSearch);
    $('search-q').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    // A részletes mezőkben is az Enter keressen
    $('advanced-search').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('input[type="text"]')) performSearch();
    });

    // Kép ráhúzása a keresősávra -> Bing vizuális keresés
    const searchBar = document.querySelector('.search-bar');
    searchBar.addEventListener('dragover', (e) => {
        e.preventDefault();
        searchBar.classList.add('drag-over');
    });
    searchBar.addEventListener('dragleave', () => searchBar.classList.remove('drag-over'));
    searchBar.addEventListener('drop', (e) => {
        e.preventDefault();
        searchBar.classList.remove('drag-over');
        openTab('https://www.bing.com/visualsearch');
    });
}
