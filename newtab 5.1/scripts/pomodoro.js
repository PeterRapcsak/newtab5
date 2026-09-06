/*======================================================================
    pomodoro.js - Pomodoro (munka/szünet ciklus időzítő)
------------------------------------------------------------------------
    CÉL:
     - Pomodoro: munka/szünet ciklusú időzítő, a Time Tools kártya
       harmadik füleként (a Stopwatch/Timer mellett), nem önálló, lebegő
       widgetként — a timeTools.js vezérli a közös Start/Pause + Reset
       gombokat, és hívja meg innen a toggleRunning()/resetTimer()/
       isRunning() függvényeket, amikor épp ez az aktív eszköz
     - Túléli a newtab újratöltését: egy ABSZOLÚT végidőbélyeget tárol
       (nem egy futó intervallumot) — a visszaszámlálás minden
       betöltéskor/tick-nél a valós eltelt időből kerül újraszámolásra,
       így a fül bezárása és újranyitása nem állítja vissza és nem
       csúsztatja el
     - Amikor egy fázis véget ér, automatikusan lép a következőre (rövid
       szünet -> munka -> rövid szünet -> ... -> hosszú szünet), és
       fut tovább, hacsak nincs szüneteltetve
======================================================================*/

const STATE_KEY = 'pomodoroState';
const TICK_MS = 250;
// A hangerő-csúszka NÉGYZETESEN (nem lineárisan) skálázza a nyers gaint:
// 100%-nál MAX_BEEP_GAIN-szeres (jóval hangosabb, mint egy sima, 1-re
// korlátozott sinus), félúton (50%) nagyjából a régi, egyszerű gain=1
// hangerő, lejjebb pedig gyorsan halkul — így a csúszka teljes hosszában
// érezhető a különbség, nem csak a felső harmadában.
const MAX_BEEP_GAIN = 5;

const PHASE_LABELS = {
    work: 'FOCUS',
    shortBreak: 'SHORT BREAK',
    longBreak: 'LONG BREAK'
};

const PHASE_COLORS = {
    work: 'var(--accent-primary)',
    shortBreak: 'hsl(140 55% 55%)',
    longBreak: 'hsl(200 60% 60%)'
};

//! ---------- ÁLLAPOT ----------

// CÉL: Gyári alapértelmezett beállítások (percben; volume 0-100 skálán)
function defaultSettings() {
    return { workMin: 25, shortBreakMin: 5, longBreakMin: 15, sessionsUntilLong: 4, volume: 100 };
}

// CÉL: Gyári alapértelmezett állapot (munka fázissal, megállítva)
function defaultState() {
    const settings = defaultSettings();
    return {
        settings,
        phase: 'work',
        isRunning: false,
        endsAt: null,
        remainingMs: settings.workMin * 60000,
        sessionsCompleted: 0
    };
}

/*
    CÉL: Állapot betöltése localStorage-ból
     - Hiányzó/hibás mentett állapot esetén az alapértelmezettre esik vissza
     - A mentett settings-et is összefésüli az alapértelmezettel, hogy
       egy régebbi mentésből hiányzó új mező se okozzon hibát
*/
function loadState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        return {
            ...defaultState(),
            ...parsed,
            settings: { ...defaultSettings(), ...parsed.settings }
        };
    } catch {
        return defaultState();
    }
}

let state = loadState();
let tickHandle = null;
let audioCtx = null;

// CÉL: A jelenlegi állapot kimentése localStorage-ba
function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

// CÉL: Egy adott fázis teljes hossza ezredmásodpercben, a beállítások alapján
function durationMs(phase) {
    const { settings } = state;
    if (phase === 'work') return settings.workMin * 60000;
    if (phase === 'shortBreak') return settings.shortBreakMin * 60000;
    return settings.longBreakMin * 60000;
}

/*
    CÉL: A következő fázis meghatározása
     - Munka fázis után: minden sessionsUntilLong-adik alkalommal hosszú
       szünet (és a számláló nullázódik), egyébként rövid szünet
     - Bármelyik szünet után mindig munka jön
*/
function nextPhase() {
    if (state.phase === 'work') {
        state.sessionsCompleted += 1;
        if (state.sessionsCompleted >= state.settings.sessionsUntilLong) {
            state.sessionsCompleted = 0;
            return 'longBreak';
        }
        return 'shortBreak';
    }
    return 'work';
}

/*
    CÉL: Két, egymást követő "csippenés" lejátszása adott hangerővel
     - Az audio-óra (nem setTimeout) alapján ütemezve, hogy a második is
       minta-pontosan üljön
     - volumePercent 0-100; 0-nál nincs lejátszás (az exponenciális
       gain-rámpa nem futtatható 0 célértékkel)
     - A nyers gain a MAX_BEEP_GAIN-nel túlvezérelt (>1) tartományba
       megy, egy DynamicsCompressorNode-on át a kimenetre — így 100%-nál
       tényleg érezhetően hangos, de nem vág/torzul csúnyán, mint egy
       egyszerű, 1-re korlátozott gain esetén tenné
     - A beállítások popover is ezt hívja élő előhallgatásra, amikor a
       felhasználó húzza a csúszkát
*/
function playChime(volumePercent) {
    if (!(volumePercent > 0)) return;
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const peakGain = MAX_BEEP_GAIN * (volumePercent / 100) ** 2;
        const now = audioCtx.currentTime;

        const compressor = audioCtx.createDynamicsCompressor();
        compressor.connect(audioCtx.destination);

        [0, 0.45].forEach((offset) => {
            const start = now + offset;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.value = 880;
            osc.connect(gain);
            gain.connect(compressor);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
            osc.start(start);
            osc.stop(start + 0.4);
        });
    } catch {
        // A hang nem létfontosságú — a widget hang nélkül is jól működik.
    }
}

// CÉL: Riasztó hangjelzés lejátszása fázisváltáskor, a mentett hangerővel
function playBeep() {
    playChime(state.settings.volume);
}

//! ---------- IDŐSZÁMÍTÁS ----------

/*
    CÉL: Ha a fázis már véget ért (akár úgy is, hogy a fül közben be
    volt zárva), egyet lép a következő fázisra — ahelyett, hogy minden
    fázist lejátszana, ami közben ELVILEG eltelt volna
*/
function catchUp() {
    if (!state.isRunning || state.endsAt === null) return;
    if (Date.now() < state.endsAt) return;

    state.phase = nextPhase();
    state.endsAt = Date.now() + durationMs(state.phase);
    saveState();
    playBeep();
}

// CÉL: A hátralévő idő kiszámítása (ezredmásodpercben), futás közben az endsAt horgonyból
function remainingMs() {
    if (state.isRunning && state.endsAt !== null) {
        return Math.max(0, state.endsAt - Date.now());
    }
    return state.remainingMs;
}

/*
    CÉL: Idő formázása MM:SS alakra
     - Ugyanaz a digit/time-segment markup, amit a Timer használ, hogy a
       két számláló vizuálisan azonos legyen (egyenközű számjegyek,
       tompított kettőspont), ne csak a betűtípusuk egyezzen
*/
function formatTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `<span class="digit">${m.toString().padStart(2, '0')}</span><span class="time-segment">:</span><span class="digit">${s.toString().padStart(2, '0')}</span>`;
}

//! ---------- MEGJELENÍTÉS ----------

// CÉL: A Pomodoro panel DOM elemeinek lekérése
function getEls() {
    return {
        time: document.getElementById('pomodoro-time'),
        progressFill: document.getElementById('pomodoro-progress-fill'),
        phase: document.getElementById('pomodoro-phase')
    };
}

// CÉL: A kijelzés (hátralévő idő, fázis felirat/szín, haladás-sáv) frissítése az aktuális állapot alapján
function render() {
    const els = getEls();
    if (!els.time) return;

    const total = durationMs(state.phase);
    const remaining = remainingMs();
    const remainingFraction = total > 0 ? remaining / total : 0;

    els.time.innerHTML = formatTime(remaining);
    els.phase.textContent = PHASE_LABELS[state.phase];
    els.phase.style.color = PHASE_COLORS[state.phase];

    els.progressFill.style.width = `${(1 - remainingFraction) * 100}%`;
}

// CÉL: Egy "tick" — előbb esetleges fázisváltás pótlása (catchUp), majd újrarajzolás
function tick() {
    catchUp();
    render();
}

// CÉL: Az ismétlődő tick-elés elindítása (ha még nem fut)
function startTicking() {
    if (tickHandle) return;
    tickHandle = setInterval(tick, TICK_MS);
}

//! ---------- VEZÉRLÉS (timeTools.js hívja) ----------

// CÉL: Fut-e éppen a Pomodoro
export function isPomodoroRunning() {
    return state.isRunning;
}

/*
    CÉL: Indítás/szüneteltetés váltása
     - Megállításkor: a hátralévő idő kiszámítva és elmentve, endsAt törölve
     - Indításkor: endsAt beállítva a mostantól számított hátralévő időre
*/
export function toggleRunning() {
    if (state.isRunning) {
        state.remainingMs = remainingMs();
        state.isRunning = false;
        state.endsAt = null;
    } else {
        state.endsAt = Date.now() + state.remainingMs;
        state.isRunning = true;
    }
    saveState();
    render();
}

// CÉL: Teljes nullázás — vissza az első munka-fázisra, megállítva
export function resetTimer() {
    state.phase = 'work';
    state.sessionsCompleted = 0;
    state.isRunning = false;
    state.endsAt = null;
    state.remainingMs = durationMs('work');
    saveState();
    render();
}

// ---------------------------------------------------------------------
// Beállítások popover (ugyanaz a "chrome", mint a shortcuts.js szerkesztő popoverje)
// ---------------------------------------------------------------------
let settingsPopoverEl = null;

/*
    CÉL: A beállítások popover létrehozása (csak első hívásra), vagy a
    már meglévő visszaadása
*/
function getSettingsPopover() {
    if (settingsPopoverEl) return settingsPopoverEl;

    settingsPopoverEl = document.createElement('div');
    settingsPopoverEl.className = 'edit-shortcut-popover pomodoro-settings-popover glass-card';
    settingsPopoverEl.innerHTML = `
        <div class="endpoint-popover-title">Pomodoro settings</div>
        <label class="pomodoro-field">Focus (min)<input type="number" min="1" max="180" class="pomodoro-input-work"></label>
        <label class="pomodoro-field">Short break (min)<input type="number" min="1" max="60" class="pomodoro-input-short"></label>
        <label class="pomodoro-field">Long break (min)<input type="number" min="1" max="90" class="pomodoro-input-long"></label>
        <label class="pomodoro-field">Sessions before long break<input type="number" min="1" max="12" class="pomodoro-input-sessions"></label>
        <label class="pomodoro-field">Notification volume<span class="pomodoro-volume-control"><input type="range" min="0" max="100" step="5" class="pomodoro-input-volume"><span class="pomodoro-volume-value"></span></span></label>
        <div class="edit-shortcut-actions pomodoro-settings-actions">
            <button type="button" class="pomodoro-settings-defaults action-btn" title="Reset to defaults">Reset</button>
            <button type="button" class="pomodoro-settings-cancel action-btn">Cancel</button>
            <button type="button" class="pomodoro-settings-save btn-primary">Save</button>
        </div>
    `;
    document.body.appendChild(settingsPopoverEl);

    settingsPopoverEl.addEventListener('click', (e) => e.stopPropagation());
    settingsPopoverEl.querySelector('.pomodoro-settings-cancel').addEventListener('click', closeSettingsPopover);
    settingsPopoverEl.querySelector('.pomodoro-settings-save').addEventListener('click', saveSettings);
    settingsPopoverEl.querySelector('.pomodoro-settings-defaults').addEventListener('click', () => fillSettingsForm(defaultSettings()));

    const volumeInput = settingsPopoverEl.querySelector('.pomodoro-input-volume');
    volumeInput.addEventListener('input', () => updateVolumeLabel(settingsPopoverEl));
    volumeInput.addEventListener('change', () => playChime(Number(volumeInput.value)));

    settingsPopoverEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveSettings(); }
        else if (e.key === 'Escape') closeSettingsPopover();
    });

    return settingsPopoverEl;
}

// CÉL: A beállítások popover bezárása
function closeSettingsPopover() {
    if (settingsPopoverEl) settingsPopoverEl.classList.remove('open');
}

// CÉL: A popover pozicionálása a kattintás helyéhez, képernyőszélen túllógás elkerülésével
function positionPopover(popover, clickEvent) {
    const margin = 12;
    popover.style.left = `${clickEvent.clientX}px`;
    popover.style.top = `${clickEvent.clientY}px`;

    requestAnimationFrame(() => {
        const rect = popover.getBoundingClientRect();
        let left = clickEvent.clientX;
        let top = clickEvent.clientY;

        const overflowRight = rect.right - (window.innerWidth - margin);
        if (overflowRight > 0) left -= overflowRight;
        const overflowBottom = rect.bottom - (window.innerHeight - margin);
        if (overflowBottom > 0) top -= rect.height + 24; // felfelé "átbillentve" a kurzor fölé

        popover.style.left = `${Math.max(margin, left)}px`;
        popover.style.top = `${Math.max(margin, top)}px`;
    });
}

// CÉL: A hangerő-csúszka melletti százalék-felirat frissítése a csúszka aktuális értékére
function updateVolumeLabel(popover) {
    popover.querySelector('.pomodoro-volume-value').textContent = `${popover.querySelector('.pomodoro-input-volume').value}%`;
}

// CÉL: A popover mezőinek feltöltése a megadott beállításokkal
function fillSettingsForm(settings) {
    const popover = getSettingsPopover();
    popover.querySelector('.pomodoro-input-work').value = settings.workMin;
    popover.querySelector('.pomodoro-input-short').value = settings.shortBreakMin;
    popover.querySelector('.pomodoro-input-long').value = settings.longBreakMin;
    popover.querySelector('.pomodoro-input-sessions').value = settings.sessionsUntilLong;
    popover.querySelector('.pomodoro-input-volume').value = settings.volume;
    updateVolumeLabel(popover);
}

// CÉL: A beállítások popover megnyitása, a jelenlegi állapot értékeivel feltöltve
function openSettingsPopover(clickEvent) {
    const popover = getSettingsPopover();
    fillSettingsForm(state.settings);
    popover.classList.add('open');
    positionPopover(popover, clickEvent);
    popover.querySelector('.pomodoro-input-work').focus();
}

/*
    CÉL: Új beállítások validálása és alkalmazása
     - Közös a beállítások popover Save gombja és az Import All folyamat
       számára — mindkettőnek csak annyi kell: "itt az új settings,
       validáld és alkalmazd"
    BE: settings - { workMin, shortBreakMin, longBreakMin, sessionsUntilLong, volume }
    KI: true, ha sikerült alkalmazni; false, ha érvénytelen volt
    MEGJEGYZÉS:
     - Beállítás-váltáskor a FOLYAMATBAN lévő fázis frissen újraindul,
       nem próbálja megtartani az eltelt idő arányát törtrészként
*/
function applySettings(settings) {
    const { workMin, shortBreakMin, longBreakMin, sessionsUntilLong, volume } = settings;
    if ([workMin, shortBreakMin, longBreakMin, sessionsUntilLong].some((n) => !Number.isFinite(n) || n < 1)) {
        return false;
    }
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
        return false;
    }

    state.settings = { workMin, shortBreakMin, longBreakMin, sessionsUntilLong, volume };
    state.remainingMs = durationMs(state.phase);
    if (state.isRunning) state.endsAt = Date.now() + state.remainingMs;
    saveState();
    render();
    return true;
}

// CÉL: A popover mezőiből beállítások összeállítása, validálása és mentése
function saveSettings() {
    const popover = getSettingsPopover();
    const settings = {
        workMin: parseInt(popover.querySelector('.pomodoro-input-work').value, 10),
        shortBreakMin: parseInt(popover.querySelector('.pomodoro-input-short').value, 10),
        longBreakMin: parseInt(popover.querySelector('.pomodoro-input-long').value, 10),
        sessionsUntilLong: parseInt(popover.querySelector('.pomodoro-input-sessions').value, 10),
        volume: parseInt(popover.querySelector('.pomodoro-input-volume').value, 10)
    };

    if (!applySettings(settings)) {
        alert('Please enter valid positive numbers.');
        return;
    }
    closeSettingsPopover();
}

/*
    CÉL: A jelenlegi Pomodoro-beállítások lekérése (másolatként)
     - Az Export All / Import All (main.js) használja, hogy a Pomodoro
       fókusz/szünet hosszai is átkerüljenek a többi beállítással együtt,
       ne maradjanak csendben a régi böngészőn/profilon
*/
export function getPomodoroSettings() {
    return { ...state.settings };
}

// CÉL: Beállítások alkalmazása kívülről (Import All), hiányzó mezők pótlása az alapértelmezettel
export function setPomodoroSettings(settings) {
    applySettings({ ...defaultSettings(), ...settings });
}

// Popover bezárása kívülre kattintásra
document.addEventListener('click', (e) => {
    if (settingsPopoverEl && settingsPopoverEl.classList.contains('open') && !settingsPopoverEl.contains(e.target)) {
        closeSettingsPopover();
    }
});

/*
    CÉL: A Pomodoro panel bekötése (a Time Tools inicializálásakor hívva)
     - Pótolja az esetleg elmaradt fázisváltást, kirajzol, elindítja a tick-elést
     - Bekötia a beállítások (fogaskerék) gombot
*/
export function initPomodoroPanel() {
    const els = getEls();
    if (!els.time) return;

    catchUp();
    render();
    startTicking();

    document.getElementById('pomodoro-settings-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openSettingsPopover(e);
    });
}
