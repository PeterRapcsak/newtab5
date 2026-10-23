/*======================================================================
    boot.js - Téma + megjelenési beállítások alkalmazása az ELSŐ festés előtt
----------------------------------------------------------------------
     - Klasszikus (nem module) script a <head>-ben: szinkron fut, így
       nincs villanás (alap téma -> mentett téma, látszó -> rejtett widget)
     - Itt élnek a megjelenési beállítások alapértékei és az alkalmazó
       függvény is; a settings.js (module) ezeket hívja globálisan
======================================================================*/

(() => {
    const root = document.documentElement;

    const UI_DEFAULTS = {
        tileSize: 72,           // a shortcut-ikonok MAXIMÁLIS mérete (px); kisebb képernyőn a fit lejjebb veszi
        fitToScreen: true,      // kisebbre vegye az ikonokat, hogy minden kiférjen
        labels: true,
        iconShape: 'rounded',   // 'rounded' | 'circle' | 'square'
        openInNewTab: false,
        searchInNewTab: true,
        cornerRadius: 100,      // % - minden lekerekítés szorzója
        animationSpeed: 'normal', // 'off' | 'fast' | 'normal' | 'slow'
        introAnimation: true,
        hoverEffects: true,
        widgets: { currency: true, time: true, qr: true, bottomBar: true },
        custom: { accent: '#7c8cf8', tint: 22, brightness: 9 }
    };

    globalThis.loadUiSettings = () => {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem('uiSettings')) || {};
        } catch {}
        return {
            ...UI_DEFAULTS,
            ...saved,
            widgets: { ...UI_DEFAULTS.widgets, ...saved.widgets },
            custom: { ...UI_DEFAULTS.custom, ...saved.custom }
        };
    };

    // "#rrggbb" -> [h, s, l] (fok, %, %)
    const hexToHsl = (hex) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        const d = max - min;
        if (!d) return [0, 0, Math.round(l * 100)];
        const s = d / (1 - Math.abs(2 * l - 1));
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
    };

    const CUSTOM_PROPS = ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--accent-primary', '--accent-secondary', '--accent-gradient', '--text-secondary', '--text-tertiary'];

    // CÉL: Egyéni téma: minden szín egyetlen kiemelőszínből + háttér-árnyalat/fényerő értékből
    globalThis.customThemeVars = ({ accent, tint, brightness }) => {
        const [h, s, l] = hexToHsl(accent);
        const bg = (dl) => `hsl(${h} ${tint}% ${brightness + dl}%)`;
        return {
            '--bg-primary': bg(0),
            '--bg-secondary': bg(4),
            '--bg-tertiary': bg(9),
            '--accent-primary': `hsl(${h} ${s}% ${l}%)`,
            '--accent-secondary': `hsl(${h} ${s}% ${Math.min(l + 11, 92)}%)`,
            '--accent-gradient': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%) 0%, hsl(${(h + 16) % 360} ${Math.max(s - 6, 0)}% ${Math.max(l - 13, 12)}%) 100%)`,
            '--text-secondary': `hsl(${h} ${Math.min(s, 30)}% 80%)`,
            '--text-tertiary': `hsl(${h} ${Math.min(s, 18)}% 62%)`
        };
    };

    globalThis.MOTION_FACTORS = { off: 0, fast: 0.55, normal: 1, slow: 1.8 };

    globalThis.applyUiSettings = (s) => {
        root.dataset.iconShape = s.iconShape;
        root.style.setProperty('--k', s.cornerRadius / 100);
        root.style.setProperty('--motion', globalThis.MOTION_FACTORS[s.animationSpeed] ?? 1);
        root.classList.toggle('motion-off', s.animationSpeed === 'off');
        root.classList.toggle('no-intro', !s.introAnimation);
        root.classList.toggle('no-hover-fx', !s.hoverEffects);
        root.classList.toggle('hide-labels', !s.labels);
        for (const [widget, visible] of Object.entries(s.widgets)) root.classList.toggle(`hide-${widget}`, !visible);

        const vars = root.dataset.theme === 'custom' ? globalThis.customThemeVars(s.custom) : {};
        for (const prop of CUSTOM_PROPS) {
            if (vars[prop]) root.style.setProperty(prop, vars[prop]);
            else root.style.removeProperty(prop);
        }
    };

    root.dataset.theme = localStorage.getItem('selectedTheme') || 'grey';
    if (localStorage.getItem('lowDetailMode') === 'true') root.classList.add('low-detail');
    globalThis.applyUiSettings(globalThis.loadUiSettings());
})();
