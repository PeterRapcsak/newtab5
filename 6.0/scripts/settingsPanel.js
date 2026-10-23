/*======================================================================
    settingsPanel.js - Beállítások panel (fogaskerék, jobb alul)
----------------------------------------------------------------------
     - 3 fül, hogy a panel kis képernyőn is kiférjen görgetés nélkül:
        Appearance: 33 előre beállított téma (családonként EGY sor),
                    egyéni téma (szín + háttér-árnyalat + fényerő),
                    ikon-forma
        Layout:     ikonméret, "minden férjen ki", feliratok, widgetek
        General:    linkek/keresés új fülön, Low Detail Mode,
                    Refresh Icons, mentés/visszatöltés
     - Minden beállítás azonnal él (nincs Save gomb)
======================================================================*/

import { refreshAllIcons } from './iconRefresh.js';
import { renderShortcuts } from './shortcuts.js';
import { renderBottomBar } from './bottomBar.js';
import { exportAllSettings, importAllSettings } from './backup.js';
import { settings, updateSettings, reapplySettings } from './settings.js';
import { togglePopover, svgIcon, reducedMotion } from './ui.js';

// Családonként egy sor, mélységi sorrendben (a régi "szint" a tooltipben)
const THEME_FAMILIES = [
    ['Blue', [
        ['blue-deep', 'Deep Blue'], ['blue-navy', 'Navy Blue'], ['blue-midnight', 'Midnight Blue'],
        ['blue', 'Blue'], ['blue-steel', 'Steel Blue'], ['blue-ocean', 'Ocean Blue'],
        ['blue-sky', 'Sky Blue'], ['blue-ice', 'Ice Blue'], ['blue-frost', 'Frost Blue'],
        ['blue-royal', 'Royal Blue'], ['blue-cobalt', 'Cobalt Blue'], ['blue-azure', 'Azure Blue']
    ]],
    ['Grey', [
        ['grey-deep', 'Deep Grey'], ['grey-slate', 'Slate Grey'], ['grey-charcoal', 'Charcoal'],
        ['grey', 'Grey'], ['grey-chrome', 'Chrome Grey'], ['grey-silver', 'Silver'],
        ['grey-light', 'Light Grey'], ['grey-mist', 'Mist Grey'], ['grey-pearl', 'Pearl'],
        ['grey-graphite', 'Graphite'], ['grey-fog', 'Fog Grey'], ['grey-taupe', 'Taupe Grey']
    ]],
    ['Vibrant', [
        ['purple', 'Purple'], ['indigo', 'Indigo'], ['pink', 'Pink'], ['red', 'Red'], ['orange', 'Orange'],
        ['amber', 'Amber'], ['green', 'Green'], ['teal', 'Teal'], ['cyan', 'Cyan']
    ]]
];

const swatch = (id, title) => `<button type="button" class="theme-option" data-theme="${id}" title="${title}" aria-label="${title}">${svgIcon('check')}</button>`;

const toggle = (key, label, description = '') => `
    <label class="toggle-setting">
        <input type="checkbox" data-setting="${key}">
        <span class="toggle-slider"></span>
        <span class="toggle-text"><span class="toggle-label">${label}</span>${description ? `<span class="setting-description">${description}</span>` : ''}</span>
    </label>`;

const range = (key, label, min, max, step, unit) => `
    <label class="range-setting">
        <span class="range-head"><span>${label}</span><output data-output="${key}"></output></span>
        <input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" data-unit="${unit}">
    </label>`;

const PANEL_HTML = `
    <div class="mode-tabs settings-tabs" role="tablist">
        <button type="button" class="toggle-btn active" data-pane="0">Appearance</button>
        <button type="button" class="toggle-btn" data-pane="1">Layout</button>
        <button type="button" class="toggle-btn" data-pane="2">General</button>
    </div>

    <div class="settings-pane active">
        <h4>Theme</h4>
        ${THEME_FAMILIES.map(([family, themes]) => `
            <div class="theme-row"><span class="theme-row-label">${family}</span><div class="theme-options">${themes.map(([id, title]) => swatch(id, title)).join('')}</div></div>`).join('')}
        <div class="theme-row">
            <span class="theme-row-label">Custom</span>
            <div class="custom-theme">
                ${swatch('custom', 'Custom theme')}
                <label class="color-pick" title="Pick any accent color"><input type="color" data-setting="custom.accent"><span>Pick color</span></label>
            </div>
        </div>
        <div class="custom-sliders">
            ${range('custom.tint', 'Background tint', 0, 40, 1, '%')}
            ${range('custom.brightness', 'Brightness', 4, 20, 1, '%')}
        </div>

        <h4>Corners</h4>
        ${range('cornerRadius', 'Corner roundness (cards, bars, buttons, icons)', 0, 200, 5, '%')}

        <h4>Icon shape</h4>
        <div class="chip-group" data-group="iconShape">
            <button type="button" class="chip" data-value="rounded">Rounded</button>
            <button type="button" class="chip" data-value="circle">Circle</button>
            <button type="button" class="chip" data-value="square">Square</button>
        </div>
    </div>

    <div class="settings-pane">
        <h4>Shortcuts</h4>
        ${range('tileSize', 'Maximum icon size', 32, 120, 2, 'px')}
        ${toggle('fitToScreen', 'Fit everything on screen', 'Shrinks icons (and hides labels if needed) so nothing scrolls')}
        ${toggle('labels', 'Show labels')}
        <h4>Widgets</h4>
        ${toggle('widgets.currency', 'Currency converter')}
        ${toggle('widgets.time', 'Stopwatch, timer & Pomodoro')}
        ${toggle('widgets.qr', 'QR code generator')}
        ${toggle('widgets.bottomBar', 'Bottom bar')}
    </div>

    <div class="settings-pane">
        <h4>Behavior</h4>
        ${toggle('openInNewTab', 'Open shortcuts in a new tab')}
        ${toggle('searchInNewTab', 'Open searches in a new tab')}
        <h4>Motion</h4>
        <div class="chip-group" data-group="animationSpeed">
            <button type="button" class="chip" data-value="off">Off</button>
            <button type="button" class="chip" data-value="fast">Fast</button>
            <button type="button" class="chip" data-value="normal">Normal</button>
            <button type="button" class="chip" data-value="slow">Slow</button>
        </div>
        ${toggle('introAnimation', 'Startup animation', 'Cards glide in when a new tab opens')}
        ${toggle('hoverEffects', 'Hover effects', 'Icons and buttons lift up under the cursor')}
        ${toggle('lowDetail', 'Low Detail Mode', 'No animations, shadows or gradients — the lightest possible page')}
        <h4>Icons</h4>
        <div class="settings-inline">
            <button type="button" id="refresh-icons-btn" class="action-btn">Refresh Icons</button>
        </div>
        <p class="setting-description" id="refresh-icons-status">Fetches each shortcut and tool's real icon and caches it permanently. Asks for one-time permission to read those sites.</p>
        <h4>Backup</h4>
        <div class="settings-inline">
            <button type="button" class="action-btn" data-action="export">${svgIcon('export')}Export</button>
            <button type="button" class="action-btn" data-action="import">${svgIcon('import')}Import</button>
        </div>
    </div>
`;

const root = document.documentElement;

// "widgets.currency" -> settings.widgets.currency
const readSetting = (key) => key.split('.').reduce((obj, part) => obj?.[part], settings);
const patchFor = (key, value) => {
    const [head, sub] = key.split('.');
    return { [head]: sub ? { [sub]: value } : value };
};

export function initializeSettingsPanel() {
    const panel = document.createElement('div');
    panel.className = 'settings-panel popover';
    panel.innerHTML = PANEL_HTML;
    document.body.appendChild(panel);

    const gearButton = document.createElement('button');
    gearButton.id = 'theme-btn';
    gearButton.className = 'icon-btn';
    gearButton.title = 'Settings';
    gearButton.setAttribute('aria-label', 'Settings');
    gearButton.innerHTML = svgIcon('gear');
    gearButton.addEventListener('click', () => togglePopover(panel, gearButton));
    document.getElementById('page-controls').appendChild(gearButton);

    const customSwatch = panel.querySelector('.theme-option[data-theme="custom"]');

    // CÉL: Minden vezérlő az aktuális állapotot mutassa
    function sync() {
        panel.querySelectorAll('.theme-option').forEach((opt) => opt.classList.toggle('active', opt.dataset.theme === root.dataset.theme));
        customSwatch.style.background = globalThis.customThemeVars(settings.custom)['--accent-gradient'];
        panel.querySelectorAll('[data-setting]').forEach((input) => {
            const key = input.dataset.setting;
            const value = key === 'lowDetail' ? root.classList.contains('low-detail') : readSetting(key);
            if (input.type === 'checkbox') input.checked = value;
            else input.value = value;
            const output = panel.querySelector(`[data-output="${key}"]`);
            if (output) output.textContent = `${value}${input.dataset.unit}`;
        });
        panel.querySelectorAll('.chip-group').forEach((group) => {
            group.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.value === settings[group.dataset.group]));
        });
        panel.classList.toggle('custom-active', root.dataset.theme === 'custom');
    }

    // CÉL: Téma váltása; kattintásra áttűnéssel, a színválasztó húzásakor anélkül
    function setTheme(theme, animate) {
        localStorage.setItem('selectedTheme', theme);
        const apply = () => {
            root.dataset.theme = theme;
            reapplySettings(); // egyéni téma inline változói be/ki
        };
        if (animate && document.startViewTransition && !reducedMotion()) document.startViewTransition(apply);
        else apply();
        sync();
    }

    //! ---------- FÜLEK ----------

    const tabs = panel.querySelector('.settings-tabs');
    const panes = panel.querySelectorAll('.settings-pane');
    tabs.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-pane]');
        if (!tab) return;
        const index = Number(tab.dataset.pane);
        tabs.style.setProperty('--i', index);
        tabs.querySelectorAll('.toggle-btn').forEach((btn) => btn.classList.toggle('active', btn === tab));
        panes.forEach((pane, i) => pane.classList.toggle('active', i === index));
    });

    //! ---------- KATTINTÁSOK ----------

    panel.addEventListener('click', (e) => {
        const option = e.target.closest('.theme-option');
        if (option) return setTheme(option.dataset.theme, true);

        const chip = e.target.closest('.chip');
        if (chip) {
            updateSettings({ [chip.parentElement.dataset.group]: chip.dataset.value });
            return sync();
        }

        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'export') exportAllSettings();
        if (action === 'import') importAllSettings();
    });

    //! ---------- KAPCSOLÓK / CSÚSZKÁK (azonnal élnek) ----------

    panel.addEventListener('input', (e) => {
        const key = e.target.dataset.setting;
        if (!key) return;
        const input = e.target;
        let value = input.type === 'checkbox' ? input.checked : input.value;
        if (input.type === 'range') value = Number(value);

        if (key === 'lowDetail') {
            localStorage.setItem('lowDetailMode', value);
            root.classList.toggle('low-detail', value);
            return;
        }

        updateSettings(patchFor(key, value));
        // Az egyéni téma bármelyik vezérlője átkapcsol az egyéni témára
        if (key.startsWith('custom.') && root.dataset.theme !== 'custom') setTheme('custom', false);
        sync();
    });

    //! ---------- REFRESH ICONS ----------

    const refreshBtn = panel.querySelector('#refresh-icons-btn');
    const status = panel.querySelector('#refresh-icons-status');
    const defaultStatus = status.textContent;

    refreshBtn.addEventListener('click', () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';

        // Await NÉLKÜL, közvetlenül a kattintásból: a jogosultságkérés csak
        // user gesture-ön belül jelenhet meg (lásd iconRefresh.js)
        refreshAllIcons({
            onProgress: ({ done, total, current }) => {
                status.textContent = `Checking ${done}/${total}: ${current}`;
            }
        }).then(({ granted, total, cached }) => {
            if (!granted) {
                status.textContent = 'Permission was not granted, so icons were not refreshed.';
                return;
            }
            renderShortcuts();
            renderBottomBar();
            status.textContent = `Cached real icons for ${cached}/${total} shortcuts and tools.`;
        }).catch((error) => {
            console.error('Icon refresh failed:', error);
            status.textContent = 'Something went wrong refreshing icons — check the console.';
        }).finally(() => {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh Icons';
            setTimeout(() => { status.textContent = defaultStatus; }, 6000);
        });
    });

    sync();
}
