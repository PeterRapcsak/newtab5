/*======================================================================
    search.js - Keresősáv és keresőmotorok
------------------------------------------------------------------------
    CÉL:
     - A keresőmotorok listája (searchEngines) és az aktuálisan
       kiválasztott motor (selectedEngine) tárolása
     - A fő keresősáv (Enter / Search gomb) és a "részletes keresés"
       popover (Google-stílusú operátorok: pontos kifejezés, fájltípus,
       stb.) összeállítása egyetlen URL-lé, majd megnyitása új fülön
     - Emellett: a keresősávra húzott (drag & drop) tartalom, illetve a
       (jelenleg nem létező HTML elemhez kötött, inaktív) "Lens" gomb
======================================================================*/

import { domElements } from './dom.js';

//! ---------- KERESŐMOTOROK ----------

// Minden motorhoz: azonosító, megjelenő név, kereső URL (a végére kerül
// a rákeresett szöveg) és egy favicon URL
export const searchEngines = [
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: 'https://www.google.com/favicon.ico' },
    { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: 'https://www.bing.com/favicon.ico' },
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', icon: 'https://duckduckgo.com/favicon.ico' },
    { id: 'brave', name: 'Brave', url: 'https://search.brave.com/search?q=', icon: 'https://search.brave.com/favicon.ico' },
    { id: 'yandex', name: 'Yandex', url: 'https://yandex.com/search/?text=', icon: 'https://yandex.com/favicon.ico' },
    { id: 'startpage', name: 'Startpage', url: 'https://startpage.com/do/dsearch?query=', icon: 'https://startpage.com/favicon.ico' },
    { id: 'baidu', name: 'Baidu', url: 'https://www.baidu.com/s?wd=', icon: 'https://www.baidu.com/favicon.ico' }
];
export let selectedEngine = 'google'; // alapértelmezett kereső, amíg a felhasználó nem vált másikra


/*
    CÉL: A kereső-választó <select> feltöltése/bekötése
     - Beállítja a <select> kezdőértékét a selectedEngine-re
     - "change" eseményre frissíti a selectedEngine változót
*/
export function initializeSearchSettings() {
    const engineSelect = document.getElementById('search-engine-select');
    if (engineSelect) {
        engineSelect.value = selectedEngine;
        engineSelect.addEventListener('change', (e) => {
            selectedEngine = e.target.value; // kiválasztott motor lecserélése
            console.log('Selected engine:', selectedEngine);
        });
    } else {
        console.error('Search engine not found');
    }
}


/*
    CÉL: A keresés lebonyolítása
     - Összegyűjti az alap keresőszöveget, illetve (ha nyitva van a
       "részletes keresés" popover) az ott megadott operátorokat
     - Összefűzi egy Google-szerű lekérdezés-string-gé, majd megnyitja
       a kiválasztott keresőmotor URL-jén, egy új böngészőfülön
    MEGJEGYZÉS:
     - A dátumszűrés (&tbs=qdr:) csak Google esetén értelmezett paraméter
*/
export function setupSearch() {
    // Ez a belső függvény végzi a tényleges munkát -> a lenti két
    // event listener (gombkattintás / Enter) is ezt hívja meg
    const performSearch = () => {
        const mainQuery = domElements.search.input?.value.trim();
        let query = mainQuery;
        let params = ''; // extra URL paraméterek (pld. dátumszűrés)

        //? Részletes keresés mezőinek beolvasása, HA a popover épp nyitva van
        if (domElements.advancedSearch && domElements.advancedSearch.classList.contains('popover-panel')) {
            const allWords = document.getElementById('adv-all-words').value.trim();
            const exactPhrase = document.getElementById('adv-exact-phrase').value.trim();
            const anyWords = document.getElementById('adv-any-words').value.trim();
            const noneWords = document.getElementById('adv-none-words').value.trim();
            const fileTypes = Array.from(document.querySelectorAll('#advanced-search input[type="checkbox"]:checked')).map(cb => cb.value);
            const dateRange = document.getElementById('adv-date-range').value;

            // Minden kitöltött mezőhöz hozzáfűzzük a megfelelő keresőoperátort
            if (allWords) query += ' ' + allWords.split(' ').join(' ');   // "minden szó" -> egyszerűen hozzáfűzve
            if (exactPhrase) query += ' "' + exactPhrase + '"';           // pontos kifejezés idézőjelben
            if (anyWords) {
                const anyWordsArr = anyWords.split(' ');
                query += anyWordsArr.length > 1 ? ' (' + anyWordsArr.join(' OR ') + ')' : ' ' + anyWords; // "vagy" kapcsolat
            }
            if (noneWords) query += ' -' + noneWords.split(' ').join(' -'); // kizárandó szavak "-" előjellel
            if (fileTypes.length > 0) query += ' (' + fileTypes.map(ft => 'filetype:' + ft).join(' OR ') + ')'; // fájltípus szűrés
            if (dateRange && selectedEngine === 'google') params += '&tbs=qdr:' + dateRange; // dátumszűrés, csak Google-nél
        }

        if (query) {
            const engine = searchEngines.find(e => e.id === selectedEngine);
            if (engine) {
                let searchUrl = `${engine.url}${encodeURIComponent(query)}`;
                if (selectedEngine === 'google' && params) {
                    searchUrl += params; // dátumszűrés csak itt kerül a végére
                }
                chrome.tabs.create({ url: searchUrl }); // megnyitás új fülön
            }
        }
    };

    if (domElements.search.button) {
        domElements.search.button.addEventListener('click', performSearch);
    }
    if (domElements.search.input) {
        domElements.search.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch(); // Enterre is induljon a keresés
        });
    }
    // Az #advanced-btn kattintása a quickTools.js-ben van bekötve — az
    // mindig ikonhoz igazított popoverként nyitja meg a részletes keresést,
    // minden képernyőméreten.
}

//! ---------- LENS GOMB ÉS DRAG & DROP A KERESŐSÁVRA ----------
//? MEGJEGYZÉS: a #lens-btn / #lens-input elemek jelenleg nincsenek benne
//? az index.html-ben, ezért a lenti "if (lensBtn)" ág itt nem fut le -
//? a kód egy (opcionális, jövőbeli) Lens funkcióhoz van előkészítve

const lensBtn = document.getElementById('lens-btn');
const lensInput = document.getElementById('lens-input');
const searchBar = document.querySelector('.search-bar');

if (lensBtn) {
    lensBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.bing.com/visualsearch' });
    });
}

// Kép ráhúzása (drag & drop) a keresősávra -> megnyitja a Bing vizuális
// keresőjét (magát a képet nem dolgozzuk fel, csak az oldalra navigálunk)
if (searchBar) {
    searchBar.addEventListener('dragover', e => {
        e.preventDefault();
        searchBar.classList.add('drag-over'); // vizuális visszajelzés húzás közben
    });

    searchBar.addEventListener('dragleave', e => {
        searchBar.classList.remove('drag-over');
    });

    searchBar.addEventListener('drop', e => {
        e.preventDefault();
        searchBar.classList.remove('drag-over');
        chrome.tabs.create({ url: 'https://www.bing.com/visualsearch' });
    });
}
