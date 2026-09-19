/*======================================================================
    pomodoro.js - Pomodoro (munka/szünet ciklus időzítő)
----------------------------------------------------------------------
    FELADAT:
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

//! ---------- KONSTANSOK ----------

const STATE_KEY = 'pomodoroState'; // localStorage kulcs a teljes állapotnak
const TICK_MS = 250;               // ilyen sűrűn rajzolunk újra
// 250ms és nem 1000ms: így a másodperc-váltás sosem késik észrevehetően,
// és a fázisvégi hangjelzés is pontosabbnak érződik
// A hangerő-csúszka NÉGYZETESEN (nem lineárisan) skálázza a nyers gaint:
// 100%-nál MAX_BEEP_GAIN-szeres (jóval hangosabb, mint egy sima, 1-re
// korlátozott sinus), félúton (50%) nagyjából a régi, egyszerű gain=1
// hangerő, lejjebb pedig gyorsan halkul — így a csúszka teljes hosszában
// érezhető a különbség, nem csak a felső harmadában.
const MAX_BEEP_GAIN = 5;

// A három fázis felirata (ez jelenik meg a számláló alatt)
const PHASE_LABELS = {
    work: 'FOCUS',
    shortBreak: 'SHORT BREAK',
    longBreak: 'LONG BREAK'
};

// Fáziskód -> szín. A munka fázis a téma saját kiemelőszínét használja,
// a szünetek fix zöld/kék árnyalatot, hogy egy pillantásra megkülönböztethetők legyenek
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
        phase: 'work',                            // 'work' | 'shortBreak' | 'longBreak'
        isRunning: false,                         // fut-e épp a visszaszámlálás
        endsAt: null,                             // ABSZOLÚT végidőpont ms-ben (csak futás közben)
        remainingMs: settings.workMin * 60000,    // hátralévő idő (csak megállított állapotban érvényes)
        sessionsCompleted: 0                      // hány munkafázis telt el a hosszú szünet óta
    };
}
// Az endsAt / remainingMs szándékosan KÉT külön mező: futás közben az
// abszolút végidőpont a mérvadó (ez éli túl az újratöltést), megállítva
// pedig a "fagyasztott" hátralévő idő

/*
    CÉL: Állapot betöltése localStorage-ból
     - Hiányzó/hibás mentett állapot esetén az alapértelmezettre esik vissza
     - A mentett settings-et is összefésüli az alapértelmezettel, hogy
       egy régebbi mentésből hiányzó új mező se okozzon hibát
*/
function loadState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return defaultState(); // első indítás

        const parsed = JSON.parse(raw);

        // Kétszintű összefésülés: a settings egy beágyazott objektum, azt
        // külön is szét kell teríteni, különben a spread felülírná az
        // EGÉSZ settings objektumot a (esetleg hiányos) mentettel
        return {
            ...defaultState(),
            ...parsed,
            settings: { ...defaultSettings(), ...parsed.settings }
        };
    } catch {
        // Sérült mentés -> tiszta lappal indulunk
        return defaultState();
    }
}

let state = loadState();  // a modul teljes állapota, egyetlen objektumban
let tickHandle = null;    // a futó setInterval azonosítója (null = nem tickel)
let audioCtx = null;      // Web Audio kontextus, lustán hozzuk létre

// CÉL: A jelenlegi állapot kimentése localStorage-ba
function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

// CÉL: Egy adott fázis teljes hossza ezredmásodpercben, a beállítások alapján
function durationMs(phase) {
    const { settings } = state;
    if (phase === 'work') return settings.workMin * 60000;        // 60000 = 1 perc ms-ben
    if (phase === 'shortBreak') return settings.shortBreakMin * 60000;
    return settings.longBreakMin * 60000; // ami maradt: 'longBreak'
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

        // Megvolt a kör -> jár a hosszú szünet, és kezdjük elölről a számolást
        if (state.sessionsCompleted >= state.settings.sessionsUntilLong) {
            state.sessionsCompleted = 0;
            return 'longBreak';
        }

        return 'shortBreak';
    }

    // Szünet (bármelyik) után mindig vissza a munkához
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
    // A fordított feltétel (nem "<= 0") a NaN-t is kiszűri
    if (!(volumePercent > 0)) return;

    try {
        // Lusta létrehozás: a böngészők amúgy sem engednek AudioContext-et
        // felhasználói interakció előtt. A webkit- prefix a régebbi Safarihoz kell
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();

        // Négyzetes skálázás - lásd a MAX_BEEP_GAIN melletti magyarázatot
        const peakGain = MAX_BEEP_GAIN * (volumePercent / 100) ** 2;
        const now = audioCtx.currentTime;

        // A kompresszor fogja vissza az 1 fölötti gaint, hogy ne recsegjen
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.connect(audioCtx.destination);

        // Két csippenés: az első azonnal, a második 0.45 másodperccel később
        [0, 0.45].forEach((offset) => {
            const start = now + offset;

            const osc = audioCtx.createOscillator(); // hangforrás
            const gain = audioCtx.createGain();      // burkológörbe (hangerő-borítékolás)

            osc.frequency.value = 880; // A5 hang
            osc.connect(gain);
            gain.connect(compressor);

            // Burkológörbe: (majdnem) nulláról gyors felfutás, majd lecsengés.
            // Azért 0.0001 és nem 0, mert az exponenciális rámpa 0-val
            // matematikailag értelmezhetetlen (és a böngésző dobna is érte)
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.02); // attack
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);    // release

            // Az oszcillátor egyszer használatos: indul, leáll, és eldobható
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
    if (!state.isRunning || state.endsAt === null) return; // áll -> nincs mit pótolni
    if (Date.now() < state.endsAt) return;                 // még nem járt le

    // EGYET lépünk, nem while-lal pörgetjük végig az összes közben eltelt
    // fázist: ha valaki 3 nap után nyitja vissza a fület, nem akarunk 200
    // fázisváltást (és 200 csippenést) lejátszani neki
    state.phase = nextPhase();
    state.endsAt = Date.now() + durationMs(state.phase);

    saveState();
    playBeep();
}

// CÉL: A hátralévő idő kiszámítása (ezredmásodpercben), futás közben az endsAt horgonyból
function remainingMs() {
    // Futás közben MINDIG frissen számoljuk - így nem tud elcsúszni akkor
    // sem, ha a böngésző háttérben visszafogta a timereket
    if (state.isRunning && state.endsAt !== null) {
        return Math.max(0, state.endsAt - Date.now()); // negatívba ne mehessen
    }

    // Megállított állapotban a befagyasztott érték a mérvadó
    return state.remainingMs;
}

/*
    CÉL: Idő formázása MM:SS alakra
     - Ugyanaz a digit/time-segment markup, amit a Timer használ, hogy a
       két számláló vizuálisan azonos legyen (egyenközű számjegyek,
       tompított kettőspont), ne csak a betűtípusuk egyezzen
*/
function formatTime(ms) {
    // Ceil és nem floor: így a "0:01" csak akkor vált "0:00"-ra, amikor
    // az utolsó másodperc tényleg letelt, nem egy másodperccel előbb
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
    if (!els.time) return; // nincs kirajzolva a panel -> nincs mit frissíteni

    const total = durationMs(state.phase);
    const remaining = remainingMs();

    // A total > 0 ellenőrzés a 0-val osztást zárja ki
    const remainingFraction = total > 0 ? remaining / total : 0;

    els.time.innerHTML = formatTime(remaining); // innerHTML, mert a formatTime markupot ad
    els.phase.textContent = PHASE_LABELS[state.phase];
    els.phase.style.color = PHASE_COLORS[state.phase];

    // A sáv az ELTELT részt mutatja, ezért az (1 - hátralévő arány)
    els.progressFill.style.width = `${(1 - remainingFraction) * 100}%`;
}

// CÉL: Egy "tick" — előbb esetleges fázisváltás pótlása (catchUp), majd újrarajzolás
function tick() {
    catchUp();
    render();
}

// CÉL: Az ismétlődő tick-elés elindítása (ha még nem fut)
function startTicking() {
    if (tickHandle) return; // már megy -> nehogy két intervallum fusson egyszerre
    tickHandle = setInterval(tick, TICK_MS);
}
// Megjegyzés: szándékosan nincs stopTicking(). A tick olcsó, viszont
// megállított állapotban is látnunk kell, ha közben a beállítások
// változnak - így egyszerűbb végig futni hagyni

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
        //? MEGÁLLÍTÁS: az abszolút végidőpontot "befagyasztjuk" hátralévő idővé
        state.remainingMs = remainingMs(); // FONTOS: még az isRunning átállítása ELŐTT
        state.isRunning = false;
        state.endsAt = null;
    } else {
        //? INDÍTÁS: a hátralévő időből új abszolút végidőpont
        state.endsAt = Date.now() + state.remainingMs;
        state.isRunning = true;
    }

    saveState();
    render();
}

// CÉL: Teljes nullázás — vissza az első munka-fázisra, megállítva
export function resetTimer() {
    state.phase = 'work';
    state.sessionsCompleted = 0; // a hosszú szünetig tartó számláló is nullázódik
    state.isRunning = false;
    state.endsAt = null;
    state.remainingMs = durationMs('work');

    saveState();
    render();
}

// ---------------------------------------------------------------------
// Beállítások popover (ugyanaz a "chrome", mint a shortcuts.js szerkesztő popoverje)
// ---------------------------------------------------------------------
let settingsPopoverEl = null; // lustán létrehozott popover, egy példány az egész laphoz

/*
    CÉL: A beállítások popover létrehozása (csak első hívásra), vagy a
    már meglévő visszaadása
*/
function getSettingsPopover() {
    if (settingsPopoverEl) return settingsPopoverEl; // már felépítettük

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
    // A <body> közvetlen gyereke, hogy semmilyen szülő overflow/transform
    // ne vágja el, és a képernyőhöz képest lehessen pozicionálni
    document.body.appendChild(settingsPopoverEl);

    // A panelen BELÜLI kattintás ne buborékoljon fel a "kattintás kívülre"
    // kezelőhöz, mert az egyből be is csukná a popovert
    settingsPopoverEl.addEventListener('click', (e) => e.stopPropagation());

    //? Gombok bekötése
    settingsPopoverEl.querySelector('.pomodoro-settings-cancel').addEventListener('click', closeSettingsPopover);
    settingsPopoverEl.querySelector('.pomodoro-settings-save').addEventListener('click', saveSettings);
    // A "Reset" csak a MEZŐKET tölti fel az alapértékekkel - a mentéshez
    // utána még a Save-et is meg kell nyomni
    settingsPopoverEl.querySelector('.pomodoro-settings-defaults').addEventListener('click', () => fillSettingsForm(defaultSettings()));

    //? Hangerő-csúszka: két külön esemény, két külön célra
    const volumeInput = settingsPopoverEl.querySelector('.pomodoro-input-volume');
    volumeInput.addEventListener('input', () => updateVolumeLabel(settingsPopoverEl)); // húzás közben: csak a felirat
    volumeInput.addEventListener('change', () => playChime(Number(volumeInput.value))); // elengedéskor: előhallgatás

    //? Billentyűzet: Enter = mentés, Escape = mégse
    settingsPopoverEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveSettings(); } // preventDefault: ne submitoljon
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
    const margin = 12; // ennyi hely maradjon a képernyő széléig

    // Első körben egyszerűen a kurzorhoz tesszük
    popover.style.left = `${clickEvent.clientX}px`;
    popover.style.top = `${clickEvent.clientY}px`;

    // A méretét csak a következő képkockában tudjuk megkérdezni, amikor
    // a böngésző már kirajzolta -> akkor korrigálunk, ha kilógna
    requestAnimationFrame(() => {
        const rect = popover.getBoundingClientRect();
        let left = clickEvent.clientX;
        let top = clickEvent.clientY;

        // Jobbra kilóg -> pont annyival toljuk vissza balra
        const overflowRight = rect.right - (window.innerWidth - margin);
        if (overflowRight > 0) left -= overflowRight;

        // Lefelé kilóg -> nem csúsztatjuk, hanem átfordítjuk a kurzor FÖLÉ
        const overflowBottom = rect.bottom - (window.innerHeight - margin);
        if (overflowBottom > 0) top -= rect.height + 24; // felfelé "átbillentve" a kurzor fölé

        // A Math.max gondoskodik róla, hogy a bal/felső szélen se lógjon ki
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
    fillSettingsForm(state.settings);       // friss értékek a mezőkbe
    popover.classList.add('open');          // láthatóvá tesszük...
    positionPopover(popover, clickEvent);   // ...és csak utána mérjük/pozicionáljuk
    popover.querySelector('.pomodoro-input-work').focus(); // egyből gépelhessen
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

    // A négy hossz/darabszám mind pozitív egész kell legyen.
    // A Number.isFinite() a NaN-t ÉS a végtelent is kiszűri
    if ([workMin, shortBreakMin, longBreakMin, sessionsUntilLong].some((n) => !Number.isFinite(n) || n < 1)) {
        return false;
    }

    // A hangerő viszont lehet 0 is (néma), ezért kap külön ellenőrzést
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
        return false;
    }

    state.settings = { workMin, shortBreakMin, longBreakMin, sessionsUntilLong, volume };

    // Az aktuális fázis frissen újraindul az új hosszal (lásd MEGJEGYZÉS)
    state.remainingMs = durationMs(state.phase);

    // Ha épp futott, a végidőpontot is újra kell horgonyozni
    if (state.isRunning) state.endsAt = Date.now() + state.remainingMs;

    saveState();
    render();
    return true;
}

// CÉL: A popover mezőiből beállítások összeállítása, validálása és mentése
function saveSettings() {
    const popover = getSettingsPopover();

    // A 10-es számrendszer megadása a parseInt-nél nem stílus, hanem
    // biztonság: enélkül a "08"-at régebben 0-nak olvasta volna
    const settings = {
        workMin: parseInt(popover.querySelector('.pomodoro-input-work').value, 10),
        shortBreakMin: parseInt(popover.querySelector('.pomodoro-input-short').value, 10),
        longBreakMin: parseInt(popover.querySelector('.pomodoro-input-long').value, 10),
        sessionsUntilLong: parseInt(popover.querySelector('.pomodoro-input-sessions').value, 10),
        volume: parseInt(popover.querySelector('.pomodoro-input-volume').value, 10)
    };

    // Csak akkor csukjuk be, ha tényleg sikerült elmenteni - így a
    // felhasználó nem veszíti el, amit beírt
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
    return { ...state.settings }; // MÁSOLAT, hogy kívülről ne lehessen belepiszkálni
}

// CÉL: Beállítások alkalmazása kívülről (Import All), hiányzó mezők pótlása az alapértelmezettel
export function setPomodoroSettings(settings) {
    // Az alapértelmezettre terítjük rá a kapottat -> egy hiányos
    // (pld. régebbi verzióból származó) import sem okoz undefined mezőt
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
    if (!els.time) return; // nincs Pomodoro panel a lapon

    catchUp();      // pótoljuk, ami a fül bezárása alatt történt
    render();       // egyszer azonnal rajzolunk, hogy ne villanjon üresen
    startTicking(); // és innentől megy magától

    // Az optional chaining (?.) miatt nem baj, ha a gomb történetesen nincs meg
    document.getElementById('pomodoro-settings-btn')?.addEventListener('click', (e) => {
        e.stopPropagation(); // ne zárja be egyből a "kattintás kívülre" kezelő
        openSettingsPopover(e);
    });
}
