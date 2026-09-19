/*======================================================================
    themeCustomizer.js - Téma testreszabó panel
----------------------------------------------------------------------
    FELADAT:
     - A fogaskerék-ikon mögötti panel felépítése: színtéma-választó
       (33 beépített téma, család/tónus szerint csoportosítva),
       "Low Detail Mode" kapcsoló, és a "Refresh Icons" gomb
     - A kiválasztott téma/beállítások localStorage-ba mentése és
       induláskor való visszatöltése
    MEGJEGYZÉS:
     - A panel HTML-je itt, JS-ből, innerHTML-lel épül fel (nem
       index.html-ben van), ezért NEM szabad a sablon-stringen belül
       semmilyen JS-stílusú kommentet elhelyezni — az szó szerint
       megjelenő szövegként kerülne a lapra. Ahol mégis komment kell a
       markupon belül, ott valódi HTML kommentet használunk.
======================================================================*/

import { refreshAllIcons } from './iconRefresh.js';
import { renderShortcuts } from './shortcuts.js';
import { renderBottomBar } from './bottomBar.js';

// A renderShortcuts/renderBottomBar azért kell ide, mert az ikonok
// frissítése után újra ki kell rajzolni azt a két listát az új ikonokkal

/*
    CÉL: A téma testreszabó panel (gombbal együtt) felépítése és bekötése
     - Panel HTML felépítése (beállítások oszlop + színválasztó oszlop)
     - Mentett téma / Low Detail Mode visszatöltése
     - Refresh Icons, panel nyitás/zárás, témaválasztás eseménykezelői
*/
export function initializeThemeCustomizer() {

    // A fix, jobb alsó gombcsoport - ide kerül majd a fogaskerék is
    const pageControls = document.getElementById('page-controls');
    if (!pageControls) return; // nincs hova tenni -> nincs mit csinálni

    //! ---------- PANEL FELÉPÍTÉSE (HTML sablon) ----------

    // Téma testreszabó panel létrehozása, rendezett szekciókkal
    const customizerPanel = document.createElement('div');
    customizerPanel.className = 'theme-customizer';
    customizerPanel.innerHTML = `
        <div class="theme-customizer-columns">
            <div class="theme-customizer-col theme-settings-col">
                <h3>Settings</h3>

                <div class="theme-section settings-section">
                    <label class="toggle-setting">
                        <input type="checkbox" id="low-detail-toggle">
                        <span class="toggle-slider"></span>
                        <span class="toggle-label">Low Detail Mode</span>
                    </label>
                    <p class="setting-description">Reduces animations and effects for better performance</p>
                </div>

                <div class="theme-section settings-section">
                    <button type="button" id="refresh-icons-btn" class="action-btn">Refresh Icons</button>
                    <p class="setting-description" id="refresh-icons-status">Fetches each shortcut and tool's real icon and caches it permanently. Asks for one-time permission to read those sites.</p>
                </div>
            </div>

            <div class="theme-customizer-col theme-colors-col">
                <h3>Color Theme</h3>

                <!-- Egy család hue-nként, egy tier mélységenként/jellegenként —
                     válassz egy családot, aztán hogy milyen sötét/világos/
                     élénk legyen. A családonkénti csoportosítás (nem pedig a
                     Kék+Szürke összekeverése mélység szerint) teszi
                     valójában könnyen áttekinthetővé a 33 lehetőséget. -->
                <div class="theme-section">
                    <h4>Blue</h4>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Deep</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="blue-deep" title="Deep Blue"></div>
                            <div class="theme-option" data-theme="blue-navy" title="Navy Blue"></div>
                            <div class="theme-option" data-theme="blue-midnight" title="Midnight Blue"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Medium</span>
                        <div class="theme-options">
                            <div class="theme-option active" data-theme="blue" title="Blue"></div>
                            <div class="theme-option" data-theme="blue-steel" title="Steel Blue"></div>
                            <div class="theme-option" data-theme="blue-ocean" title="Ocean Blue"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Light</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="blue-sky" title="Sky Blue"></div>
                            <div class="theme-option" data-theme="blue-ice" title="Ice Blue"></div>
                            <div class="theme-option" data-theme="blue-frost" title="Frost Blue"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Vivid</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="blue-royal" title="Royal Blue"></div>
                            <div class="theme-option" data-theme="blue-cobalt" title="Cobalt Blue"></div>
                            <div class="theme-option" data-theme="blue-azure" title="Azure Blue"></div>
                        </div>
                    </div>
                </div>

                <div class="theme-section">
                    <h4>Grey</h4>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Deep</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="grey-deep" title="Deep Grey"></div>
                            <div class="theme-option" data-theme="grey-slate" title="Slate Grey"></div>
                            <div class="theme-option" data-theme="grey-charcoal" title="Charcoal"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Medium</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="grey" title="Grey"></div>
                            <div class="theme-option" data-theme="grey-chrome" title="Chrome Grey"></div>
                            <div class="theme-option" data-theme="grey-silver" title="Silver"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Light</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="grey-light" title="Light Grey"></div>
                            <div class="theme-option" data-theme="grey-mist" title="Mist Grey"></div>
                            <div class="theme-option" data-theme="grey-pearl" title="Pearl"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Tinted</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="grey-graphite" title="Graphite"></div>
                            <div class="theme-option" data-theme="grey-fog" title="Fog Grey"></div>
                            <div class="theme-option" data-theme="grey-taupe" title="Taupe Grey"></div>
                        </div>
                    </div>
                </div>

                <div class="theme-section">
                    <h4>Vibrant</h4>
                    <div class="theme-options">
                        <div class="theme-option" data-theme="purple" title="Purple"></div>
                        <div class="theme-option" data-theme="green" title="Green"></div>
                        <div class="theme-option" data-theme="red" title="Red"></div>
                        <div class="theme-option" data-theme="orange" title="Orange"></div>
                        <div class="theme-option" data-theme="pink" title="Pink"></div>
                        <div class="theme-option" data-theme="teal" title="Teal"></div>
                        <div class="theme-option" data-theme="cyan" title="Cyan"></div>
                        <div class="theme-option" data-theme="amber" title="Amber"></div>
                        <div class="theme-option" data-theme="indigo" title="Indigo"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    //! ---------- FOGASKERÉK GOMB ÉS BEILLESZTÉS ----------

    // Fogaskerék ikongomb létrehozása
    // (a Font Awesome-ból jön az ikon, lásd index.html)
    const gearButton = document.createElement('button');
    gearButton.className = 'theme-toggle-btn';
    gearButton.innerHTML = '<i class="fas fa-cog"></i>';
    gearButton.title = 'Customize Theme';

    // Wrapper létrehozása a pozicionáláshoz
    // A panel a CSS-ben abszolút pozicionált, ezért kell köré egy
    // relative wrapper, amihez képest a gomb FÖLÉ tud kinyílni
    const themeWrapper = document.createElement('div');
    themeWrapper.className = 'theme-wrapper';
    themeWrapper.appendChild(customizerPanel); // előbb a panel...
    themeWrapper.appendChild(gearButton);      // ...és utána a gomb (így a gomb van felül)

    // A fix, jobb alsó gombcsoportban él, az Edit gomb mellett
    pageControls.appendChild(themeWrapper);

    // A téma-opciókat csak azután kérdezzük le, hogy bekerültek a DOM-ba
    // (a querySelectorAll itt statikus NodeList-et ad - nekünk pont ez kell,
    //  mert a 33 opció a felépítés után már nem változik)
    const themeOptions = customizerPanel.querySelectorAll('.theme-option');

    //! ---------- MENTETT ÁLLAPOT VISSZATÖLTÉSE ----------

    // Mentett téma betöltése
    //? Ha a felhasználó még sosem választott, marad a 'grey' alapértelmezés
    const savedTheme = localStorage.getItem('selectedTheme') || 'grey';
    applyTheme(savedTheme);

    // Mentett Low Detail Mode beállítás betöltése és alkalmazása
    const lowDetailToggle = customizerPanel.querySelector('#low-detail-toggle');

    // A localStorage MINDENT stringként tárol, ezért kell a === 'true'
    const savedLowDetail = localStorage.getItem('lowDetailMode') === 'true';

    lowDetailToggle.checked = savedLowDetail; // a kapcsoló álljon a mentett állásba
    applyLowDetailMode(savedLowDetail);       // és a hatása is legyen meg azonnal

    // Kapcsolgatás: mentés + azonnali alkalmazás
    lowDetailToggle.addEventListener('change', () => {
        const isEnabled = lowDetailToggle.checked;
        localStorage.setItem('lowDetailMode', isEnabled);
        applyLowDetailMode(isEnabled);
    });

    //! ---------- REFRESH ICONS ----------

    // Refresh Icons: minden shortcut/tool valódi favicon-jának lekérése és cache-elése
    const refreshIconsBtn = customizerPanel.querySelector('#refresh-icons-btn');
    const refreshIconsStatus = customizerPanel.querySelector('#refresh-icons-status');

    // Az eredeti leírószöveg, hogy a folyamat végén vissza tudjuk állítani
    const refreshIconsDefaultStatus = refreshIconsStatus.textContent;

    refreshIconsBtn.addEventListener('click', () => {

        // Letiltjuk a gombot, nehogy párhuzamosan több frissítés induljon
        refreshIconsBtn.disabled = true;
        refreshIconsBtn.textContent = 'Refreshing...';

        refreshAllIcons({
            // A leírószöveg helyén írjuk ki, hol tart épp a folyamat
            onProgress: ({ done, total, current }) => {
                refreshIconsStatus.textContent = `Checking ${done}/${total}: ${current}`;
            }
        }).then(({ granted, total, cached }) => {

            //? A felhasználó elutasította a jogosultságkérést -> nincs mit tenni
            if (!granted) {
                refreshIconsStatus.textContent = 'Permission was not granted, so icons were not refreshed.';
                return;
            }

            // Sikeres frissítés -> mindkét listát újrarajzoljuk az új ikonokkal
            renderShortcuts();
            renderBottomBar();
            refreshIconsStatus.textContent = `Cached real icons for ${cached}/${total} shortcuts and tools.`;
        }).catch((error) => {
            // Itt tényleg csak váratlan hiba jöhet - a "nem találtam ikont"
            // eset NEM hiba, azt a cached szám jelzi
            console.error('Icon refresh failed:', error);
            refreshIconsStatus.textContent = 'Something went wrong refreshing icons — check the console.';
        }).finally(() => {
            // Akárhogy is végződött: gomb vissza használhatóra
            refreshIconsBtn.disabled = false;
            refreshIconsBtn.textContent = 'Refresh Icons';

            // Az eredményt hagyjuk kint pár másodpercig, aztán vissza a leírásra
            setTimeout(() => {
                refreshIconsStatus.textContent = refreshIconsDefaultStatus;
            }, 6000);
        });
    });

    /*
        CÉL: A Low Detail Mode tényleges alkalmazása (CSS osztály ki/be)
        BE: enabled - true, ha a gyengébb gépekre szánt mód kell
        MEGJEGYZÉS:
            Maga a munka a CSS-ben van: a .low-detail osztály kikapcsolja
            a blur/árnyék/animáció effekteket (lásd style.css)
    */
    function applyLowDetailMode(enabled) {
        // A toggle 2. paramétere: kényszerített be/ki állapot
        document.documentElement.classList.toggle('low-detail', enabled);
    }

    //! ---------- PANEL NYITÁS/ZÁRÁS ----------

    // Panel láthatóság kapcsolása
    gearButton.addEventListener('click', (e) => {
        e.stopPropagation(); // különben a lenti "kattintás kívülre" egyből be is zárná
        customizerPanel.classList.toggle('active');
    });

    // Panel bezárása kívülre kattintásra
    document.addEventListener('click', (e) => {
        // A .contains() a leszármazottakra is igaz -> a panelen belüli
        // kattintás (pld. egy színválasztó) nem zárja be a panelt
        if (!customizerPanel.contains(e.target) && e.target !== gearButton) {
            customizerPanel.classList.remove('active');
        }
    });

    //! ---------- TÉMAVÁLASZTÁS ----------

    // Témaválasztás: minden kis színnégyzetre egy-egy kattintáskezelő
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            // A téma nevét a HTML-beli data-theme attribútum hordozza
            const theme = option.dataset.theme;

            applyTheme(theme);
            localStorage.setItem('selectedTheme', theme); // hogy újranyitáskor is megmaradjon

            // Aktív állapot frissítése: előbb mindenkiről le, aztán erre az egyre rá
            themeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
        });
    });

    /*
        CÉL: A kiválasztott téma tényleges alkalmazása (data-theme attribútummal)
        BE: theme - a téma azonosítója, pld. "blue-midnight"
        MEGJEGYZÉS:
            A <html> elem data-theme attribútumára a style.css-ben
            [data-theme="..."] szelektorokkal vannak felakasztva a
            színváltozók -> egyetlen attribútum átírása átszínezi az
            egész oldalt, nem kell semmit kézzel újrarajzolni
    */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Aktív opció frissítése
        // (ez a betöltéskori hívás miatt is kell, nem csak kattintásra)
        themeOptions.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === theme);
        });
    }
}
