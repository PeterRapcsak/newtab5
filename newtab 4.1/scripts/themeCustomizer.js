/*======================================================================
    themeCustomizer.js - Téma testreszabó panel
------------------------------------------------------------------------
    CÉL:
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

/*
    CÉL: A téma testreszabó panel (gombbal együtt) felépítése és bekötése
     - Panel HTML felépítése (beállítások oszlop + színválasztó oszlop)
     - Mentett téma / Low Detail Mode visszatöltése
     - Refresh Icons, panel nyitás/zárás, témaválasztás eseménykezelői
*/
export function initializeThemeCustomizer() {
    const pageControls = document.getElementById('page-controls');
    if (!pageControls) return;

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

    // Fogaskerék ikongomb létrehozása
    const gearButton = document.createElement('button');
    gearButton.className = 'theme-toggle-btn';
    gearButton.innerHTML = '<i class="fas fa-cog"></i>';
    gearButton.title = 'Customize Theme';

    // Wrapper létrehozása a pozicionáláshoz
    const themeWrapper = document.createElement('div');
    themeWrapper.className = 'theme-wrapper';
    themeWrapper.appendChild(customizerPanel);
    themeWrapper.appendChild(gearButton);

    // A fix, jobb alsó gombcsoportban él, az Edit gomb mellett
    pageControls.appendChild(themeWrapper);

    // A téma-opciókat csak azután kérdezzük le, hogy bekerültek a DOM-ba
    const themeOptions = customizerPanel.querySelectorAll('.theme-option');

    //! ---------- MENTETT ÁLLAPOT VISSZATÖLTÉSE ----------

    // Mentett téma betöltése
    const savedTheme = localStorage.getItem('selectedTheme') || 'grey';
    applyTheme(savedTheme);

    // Mentett Low Detail Mode beállítás betöltése és alkalmazása
    const lowDetailToggle = customizerPanel.querySelector('#low-detail-toggle');
    const savedLowDetail = localStorage.getItem('lowDetailMode') === 'true';
    lowDetailToggle.checked = savedLowDetail;
    applyLowDetailMode(savedLowDetail);

    lowDetailToggle.addEventListener('change', () => {
        const isEnabled = lowDetailToggle.checked;
        localStorage.setItem('lowDetailMode', isEnabled);
        applyLowDetailMode(isEnabled);
    });

    //! ---------- REFRESH ICONS ----------

    // Refresh Icons: minden shortcut/tool valódi favicon-jának lekérése és cache-elése
    const refreshIconsBtn = customizerPanel.querySelector('#refresh-icons-btn');
    const refreshIconsStatus = customizerPanel.querySelector('#refresh-icons-status');
    const refreshIconsDefaultStatus = refreshIconsStatus.textContent;

    refreshIconsBtn.addEventListener('click', () => {
        refreshIconsBtn.disabled = true;
        refreshIconsBtn.textContent = 'Refreshing...';

        refreshAllIcons({
            onProgress: ({ done, total, current }) => {
                refreshIconsStatus.textContent = `Checking ${done}/${total}: ${current}`;
            }
        }).then(({ granted, total, cached }) => {
            if (!granted) {
                refreshIconsStatus.textContent = 'Permission was not granted, so icons were not refreshed.';
                return;
            }
            renderShortcuts();
            renderBottomBar();
            refreshIconsStatus.textContent = `Cached real icons for ${cached}/${total} shortcuts and tools.`;
        }).catch((error) => {
            console.error('Icon refresh failed:', error);
            refreshIconsStatus.textContent = 'Something went wrong refreshing icons — check the console.';
        }).finally(() => {
            refreshIconsBtn.disabled = false;
            refreshIconsBtn.textContent = 'Refresh Icons';
            setTimeout(() => {
                refreshIconsStatus.textContent = refreshIconsDefaultStatus;
            }, 6000);
        });
    });

    // CÉL: A Low Detail Mode tényleges alkalmazása (CSS osztály ki/be)
    function applyLowDetailMode(enabled) {
        document.documentElement.classList.toggle('low-detail', enabled);
    }

    //! ---------- PANEL NYITÁS/ZÁRÁS ----------

    // Panel láthatóság kapcsolása
    gearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        customizerPanel.classList.toggle('active');
    });

    // Panel bezárása kívülre kattintásra
    document.addEventListener('click', (e) => {
        if (!customizerPanel.contains(e.target) && e.target !== gearButton) {
            customizerPanel.classList.remove('active');
        }
    });

    //! ---------- TÉMAVÁLASZTÁS ----------

    // Témaválasztás
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.dataset.theme;
            applyTheme(theme);
            localStorage.setItem('selectedTheme', theme);

            // Aktív állapot frissítése
            themeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
        });
    });

    // CÉL: A kiválasztott téma tényleges alkalmazása (data-theme attribútummal)
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Aktív opció frissítése
        themeOptions.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === theme);
        });
    }
}
