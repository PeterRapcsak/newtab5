/*======================================================================
    timeTools.js - Stopper és Visszaszámláló (Time Tools kártya)
------------------------------------------------------------------------
    CÉL:
     - Stopwatch (stopper) és Timer (visszaszámláló) osztályok, saját
       megjelenítéssel, localStorage-alapú állapotmentéssel
     - A Time Tools kártya 3 füle közötti váltás (Stopwatch / Timer /
       Pomodoro — a Pomodoro logikája külön, pomodoro.js-ben van), és a
       közös Start/Pause + Reset gombok bekötése az épp aktív eszközre
    MEGJEGYZÉS:
     - Mindkét osztály egy ABSZOLÚT időbélyeget ment (mikor indult /
       mikor ér véget), NEM magát a setInterval-t — újratöltéskor ebből
       számolható vissza a valós eltelt idő, így egy fül bezárása/
       újranyitása nem állítja vissza és nem csúsztatja el az órákat
======================================================================*/

import { initPomodoroPanel, toggleRunning as togglePomodoroRunning, resetTimer as resetPomodoro, isPomodoroRunning } from './pomodoro.js';

const STOPWATCH_STATE_KEY = 'stopwatchState';
const TIMER_STATE_KEY = 'timerState';

//! ======================== STOPWATCH (stopper) ========================

export class Stopwatch {
    constructor(displayElement) {
        this.display = displayElement;
        this.running = false;
        this.time = 0;
        this.interval = null;
        this.display.contentEditable = false;
        this.loadState();
        this.updateDisplay();
        if (this.running) this.resumeInterval();
    }

    /*
        CÉL: Mentett állapot visszatöltése localStorage-ból
        LOGIKA:
         - Egy abszolút "mintha ekkor a startedAt időbélyegen indult
           volna" horgonyt tárolunk, nem magát a futó intervallumot — egy
           újratöltés nem tudna élő setInterval-t megőrizni, de KI TUDJA
           SZÁMOLNI az eltelt időt ebből a horgonyból, ugyanaz a
           megközelítés, mint amit a pomodoro.js a saját állapotmentéséhez
           használ
    */
    loadState() {
        try {
            const raw = localStorage.getItem(STOPWATCH_STATE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            this.time = state.time || 0;
            this.running = !!state.running;
            if (this.running && typeof state.startedAt === 'number') {
                this.time = Date.now() - state.startedAt;
            }
        } catch {
            // Sérült/hiányzó állapot — egyszerűen tiszta lappal induljunk.
        }
    }

    // CÉL: Jelenlegi állapot (fut-e, eltelt idő, kezdő időbélyeg) mentése localStorage-ba
    saveState() {
        localStorage.setItem(STOPWATCH_STATE_KEY, JSON.stringify({
            running: this.running,
            time: this.time,
            startedAt: this.running ? Date.now() - this.time : null
        }));
    }

    // CÉL: A számláló-intervallum (újra)indítása egy kiszámolt kezdő időponttól
    resumeInterval() {
        this.display.classList.add('running');
        const startTime = Date.now() - this.time;
        this.interval = setInterval(() => {
            this.time = Date.now() - startTime;
            this.updateDisplay();
        }, 10);
    }

    // CÉL: Indítás (ha még nem fut)
    start() {
        if (!this.running) {
            this.running = true;
            this.saveState();
            this.resumeInterval();
        }
    }

    // CÉL: Megállítás (ha épp fut)
    stop() {
        if (this.running) {
            clearInterval(this.interval);
            this.running = false;
            this.display.classList.remove('running');
            this.saveState();
        }
    }

    // CÉL: Nullázás (megállítja, majd 0-ra állítja az eltelt időt)
    reset() {
        this.stop();
        this.time = 0;
        this.saveState();
        this.updateDisplay();
    }

    /*
        CÉL: A kijelző frissítése az aktuális eltelt idő (this.time,
        ezredmásodpercben) alapján
        LOGIKA:
         - Óra/perc/másodperc/századmásodperc szétbontása
         - Csak annyi mértékegységet mutat, amennyi szükséges (pld.
           1 percnél rövidebb eltelt időnél nem jelenik meg az óra/perc)
    */
    updateDisplay() {
        const totalMilliseconds = this.time;

        const hours = Math.floor(totalMilliseconds / 3600000);
        const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
        const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
        const centiseconds = Math.floor((totalMilliseconds % 1000) / 10);

        const formattedCentiseconds = `<span class="digit">${String(centiseconds).padStart(2, '0')}</span>`;
        let mainDisplayHtml = '';

        if (hours > 0) {
            // Ó:PP:MM formátum
            const formattedMinutes = String(minutes).padStart(2, '0');
            const formattedSeconds = String(seconds).padStart(2, '0');
            mainDisplayHtml = `<span class="digit">${hours}</span><span class="time-segment">:</span><span class="digit">${formattedMinutes}</span><span class="time-segment">:</span><span class="digit">${formattedSeconds}</span>`;
        } else if (minutes > 0) {
            // P:MM formátum
            const formattedSeconds = String(seconds).padStart(2, '0');
            mainDisplayHtml = `<span class="digit">${minutes}</span><span class="time-segment">:</span><span class="digit">${formattedSeconds}</span>`;
        } else {
            // Csak MM formátum
            mainDisplayHtml = `<span class="digit">${seconds}</span>`;
        }

        this.display.innerHTML = `${mainDisplayHtml}<span class="time-segment">.</span>${formattedCentiseconds}`;
    }
}

//! ======================== TIMER (visszaszámláló) ========================

export class Timer {
    constructor(displayElement, progressFillElement) {
        this.display = displayElement;
        this.progressFill = progressFillElement;
        this.running = false;
        this.remainingTime = 0;
        this.totalTime = 0;
        this.interval = null;
        // Melyik szegmens (óra/perc/mp) van "felfegyverezve" gépelésre egy
        // kattintás után, és az az óta begépelt nyers számjegyek — lásd
        // handleUnitClick()/handleUnitInput() lentebb.
        this.activeUnit = null;
        this.editBuffer = '';
        this.alarmAudio = null;
        this.alarmInterval = null;
        this.isAlarmRinging = false;
        this.finishedWhileAway = false;
        this.display.setAttribute('tabindex', '0');

        this.display.addEventListener('click', (e) => this.handleUnitClick(e));

        this.display.addEventListener('keydown', (e) => {
            if (this.running || !this.activeUnit) {
                e.preventDefault();
                return;
            }
            if (/[0-9]/.test(e.key)) {
                e.preventDefault();
                this.handleUnitInput(e.key);
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                this.editBuffer = this.editBuffer.slice(0, -1);
                this.applyUnitEdit(this.activeUnit, this.editBuffer ? parseInt(this.editBuffer, 10) : 0);
            } else if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
                this.exitUnitEdit();
            } else {
                e.preventDefault();
            }
        });

        // Bárhova kattintva a kijelzőn KÍVÜL, a begépelt érték commit-olódik,
        // és megszűnik a "melyik szegmens van felfegyverezve" kiemelés.
        document.addEventListener('click', (e) => {
            if (this.activeUnit && !this.display.contains(e.target)) {
                this.exitUnitEdit();
            }
        });

        this.loadState();
        this.updateDisplayFromSeconds();
        this.initAlarm();

        if (this.running) {
            this.resumeCountdown(); // saját maga állítja be a this.running = true-t
        } else if (this.finishedWhileAway) {
            this.display.classList.add('finished');
        }
    }

    // CÉL: A riasztáshoz szükséges Web Audio API kontextus létrehozása
    initAlarm() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.audioContext = new AudioContext();
        }
    }

    /*
        CÉL: A riasztás hangjának lejátszása
         - Két, egymást követő "csippenés"-t hoz létre, hangosabb, jól
           hallható Google-szerű hangzással
    */
    playAlarmSound() {
        if (!this.audioContext) return;

        const duration = 0.15;
        const frequency1 = 880; // A5 hang
        const frequency2 = 1046.5; // C6 hang

        // Első hang lejátszása, hangosabb hangerővel
        const oscillator1 = this.audioContext.createOscillator();
        const gainNode1 = this.audioContext.createGain();

        oscillator1.connect(gainNode1);
        gainNode1.connect(this.audioContext.destination);

        oscillator1.type = 'sine';
        oscillator1.frequency.setValueAtTime(frequency1, this.audioContext.currentTime);

        // A hangerő (gain) megnövelve a hangosabb hatásért
        gainNode1.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode1.gain.linearRampToValueAtTime(3, this.audioContext.currentTime + 0.01);
        gainNode1.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        oscillator1.start(this.audioContext.currentTime);
        oscillator1.stop(this.audioContext.currentTime + duration);

        // A második hang kicsit később, szintén hangosabb hangerővel
        setTimeout(() => {
            if (!this.isAlarmRinging) return;

            const oscillator2 = this.audioContext.createOscillator();
            const gainNode2 = this.audioContext.createGain();

            oscillator2.connect(gainNode2);
            gainNode2.connect(this.audioContext.destination);

            oscillator2.type = 'sine';
            oscillator2.frequency.setValueAtTime(frequency2, this.audioContext.currentTime);

            // A hangerő (gain) megnövelve a hangosabb hatásért
            gainNode2.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode2.gain.linearRampToValueAtTime(0.6, this.audioContext.currentTime + 0.01);
            gainNode2.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

            oscillator2.start(this.audioContext.currentTime);
            oscillator2.stop(this.audioContext.currentTime + duration);
        }, 150);
    }

    // CÉL: A riasztás elindítása (azonnali hang, majd másodpercenként ismétlődik, amíg le nem állítják)
    startAlarm() {
        if (this.isAlarmRinging) return;

        this.isAlarmRinging = true;
        this.display.classList.add('finished');

        // Azonnali hang lejátszása
        this.playAlarmSound();

        // A riasztás folytatása másodpercenként, amíg le nem állítják
        this.alarmInterval = setInterval(() => {
            if (this.isAlarmRinging) {
                this.playAlarmSound();
            }
        }, 1000);
    }

    // CÉL: A riasztás leállítása
    stopAlarm() {
        this.isAlarmRinging = false;
        if (this.alarmInterval) {
            clearInterval(this.alarmInterval);
            this.alarmInterval = null;
        }
        this.display.classList.remove('finished');
    }

    /*
        CÉL: Mentett állapot visszatöltése localStorage-ból
        MEGJEGYZÉS:
         - Ugyanaz az abszolút-horgonyos mentési elv, mint a
           Stopwatch-nál/pomodoro.js-nél: azt az időbélyeget tároljuk,
           AMIKOR a visszaszámlálás véget ér, nem egy élő intervallumot,
           így egy újratöltéskor pontosan kiszámolható, mennyi idő telt el valójában
    */
    loadState() {
        try {
            const raw = localStorage.getItem(TIMER_STATE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            this.totalTime = state.totalTime || 0;
            this.remainingTime = state.remainingTime || 0;
            this.running = !!state.running;

            if (this.running && typeof state.endsAt === 'number') {
                const secondsLeft = Math.ceil((state.endsAt - Date.now()) / 1000);
                if (secondsLeft > 0) {
                    this.remainingTime = secondsLeft;
                } else {
                    // A fül bezárása közben ért véget. Mutassuk a "kész"
                    // állapotot, de ne robbantsuk rá azonnal a riasztást az
                    // oldal megnyitásakor — az egy olyan pillanatból jönne,
                    // amikor a felhasználó nem is volt itt.
                    this.remainingTime = 0;
                    this.running = false;
                    this.finishedWhileAway = true;
                }
            }
        } catch {
            // Sérült/hiányzó állapot — egyszerűen tiszta lappal induljunk.
        }
    }

    // CÉL: Jelenlegi állapot mentése localStorage-ba (a végét jelző abszolút időbélyeggel)
    saveState() {
        localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
            totalTime: this.totalTime,
            remainingTime: this.remainingTime,
            running: this.running,
            endsAt: this.running ? Date.now() + this.remainingTime * 1000 : null
        }));
    }

    // CÉL: A visszaszámlálás (újra)indítása, másodpercenkénti csökkentéssel
    resumeCountdown() {
        this.running = true;
        this.display.classList.add('running');
        this.interval = setInterval(() => {
            if (--this.remainingTime <= 0) {
                this.stop();
                this.remainingTime = 0;
                this.startAlarm();
            }
            this.updateDisplayFromSeconds();
        }, 1000);
    }

    // CÉL: Indítás (csak akkor, ha van hátralévő idő, és még nem fut)
    start() {
        if (this.remainingTime > 0 && !this.running) {
            this.resumeCountdown();
            this.saveState();
        }
    }

    // CÉL: Megállítás (szüneteltetéskor a riasztást is leállítja)
    stop() {
        if (this.running) {
            clearInterval(this.interval);
            this.running = false;
            this.display.classList.remove('running');
            this.saveState();
        }
        // Riasztás leállítása szüneteltetéskor
        this.stopAlarm();
    }

    // CÉL: Teljes nullázás (megállítja, törli a hátralévő/teljes időt és a szerkesztési állapotot)
    reset() {
        this.stop();
        this.remainingTime = 0;
        this.totalTime = 0;
        this.activeUnit = null;
        this.editBuffer = '';
        this.stopAlarm();
        this.saveState();
        this.updateDisplayFromSeconds();
    }

    // CÉL: A visszaszámlálás beállítása egy adott másodpercértékre (pld. beírt idő alapján)
    setTime(seconds) {
        this.remainingTime = seconds;
        this.totalTime = seconds;
        this.saveState();
        this.updateDisplayFromSeconds();
    }

    // CÉL: A kijelző (óó:pp:mm) és a haladás-sáv frissítése a hátralévő másodpercek alapján
    updateDisplayFromSeconds() {
        const hours = Math.floor(this.remainingTime / 3600);
        const minutes = Math.floor((this.remainingTime % 3600) / 60);
        const seconds = this.remainingTime % 60;
        const digitSpan = (unit, value) => {
            const editing = this.activeUnit === unit ? ' editing' : '';
            return `<span class="digit ${unit}${editing}">${String(value).padStart(2, '0')}</span>`;
        };
        this.display.innerHTML =
            digitSpan('hours', hours) +
            '<span class="time-segment">:</span>' +
            digitSpan('minutes', minutes) +
            '<span class="time-segment">:</span>' +
            digitSpan('seconds', seconds);
        if (this.progressFill) {
            const elapsedFraction = this.totalTime > 0 ? 1 - (this.remainingTime / this.totalTime) : 0;
            this.progressFill.style.width = `${elapsedFraction * 100}%`;
        }
    }

    /*
        CÉL: Egy számjegypárra kattintva "felfegyverzi" azt gépelésre —
        pld. kattints a "minutes"-ra és gépeld be, hogy "30", és 00:30:00
        lesz belőle, vagy "80", ami átvisz az órákba (01:20:00), anélkül,
        hogy a nem-kattintott mértékegységekhez hozzányúlna
    */
    handleUnitClick(e) {
        if (this.running) return;
        const digitEl = e.target.closest('.digit');
        const unit = ['hours', 'minutes', 'seconds'].find((u) => digitEl?.classList.contains(u));
        if (!unit) return;
        // Itt meg kell állni, MIELŐTT a lenti updateDisplayFromSeconds()
        // leválasztaná az e.target-et — a dokumentum-szintű "kattintás
        // kívülre" figyelő különben egy már leválasztott target-et látna,
        // és azonnal visszavonná ennek a kattintásnak a felfegyverzését.
        e.stopPropagation();
        this.activeUnit = unit;
        this.editBuffer = '';
        this.updateDisplayFromSeconds();
    }

    // CÉL: Egy begépelt számjegy hozzáfűzése a szerkesztő pufferhez, majd alkalmazása
    handleUnitInput(digit) {
        this.editBuffer = (this.editBuffer + digit).slice(-3);
        this.applyUnitEdit(this.activeUnit, parseInt(this.editBuffer, 10));
    }

    // CÉL: A szerkesztési mód elhagyása (felfegyverzett mértékegység + puffer törlése)
    exitUnitEdit() {
        this.activeUnit = null;
        this.editBuffer = '';
        this.updateDisplayFromSeconds();
    }

    /*
        CÉL: A kattintott mértékegység beállítása `value`-ra, a túlcsordulást
        (pld. 80 perc) átvíve a következő mértékegységbe, ahelyett hogy
        egyszerűen levágná (clamp)
    */
    applyUnitEdit(unit, value) {
        let hours = Math.floor(this.remainingTime / 3600);
        let minutes = Math.floor((this.remainingTime % 3600) / 60);
        let seconds = this.remainingTime % 60;

        if (unit === 'seconds') {
            seconds = value % 60;
            minutes += Math.floor(value / 60);
        } else if (unit === 'minutes') {
            minutes = value % 60;
            hours += Math.floor(value / 60);
        } else {
            hours = value;
        }
        hours += Math.floor(minutes / 60);
        minutes = minutes % 60;
        hours = Math.min(hours, 99);

        this.remainingTime = hours * 3600 + minutes * 60 + seconds;
        this.totalTime = this.remainingTime;
        this.saveState();
        this.updateDisplayFromSeconds();
    }
}

//! ======================== FÜLVÁLTÁS ÉS KÖZÖS VEZÉRLŐK ========================

const ACTIVE_TOOL_KEY = 'activeTimeTool';
const VALID_TOOLS = ['stopwatch', 'timer', 'pomodoro'];

export let stopwatch;
export let timer;
export let activeTool = 'stopwatch';

/*
    CÉL: A Time Tools kártya bekötése
     - Stopwatch/Timer példányosítása, Pomodoro panel inicializálása
     - Fül-váltó gombok (Stopwatch/Timer/Pomodoro) bekötése
     - A közös Start/Pause + Reset gomb az épp aktív eszközre irányítva
     - Az utoljára aktív fül visszaállítása localStorage-ból
*/
export function initializeTimeTools() {
    const stopwatchDisplay = document.querySelector('.stopwatch .display');
    stopwatch = new Stopwatch(stopwatchDisplay);

    const timerDisplay = document.querySelector('.timer .display');
    const timerProgressFill = document.getElementById('timer-progress-fill');
    timer = new Timer(timerDisplay, timerProgressFill);

    initPomodoroPanel();

    const toggleButtons = document.querySelectorAll('.mode-tabs .toggle-btn');
    const startStopBtn = document.querySelector('.controls .start-stop');
    const resetBtn = document.querySelector('.controls .reset');

    // CÉL: Fut-e éppen a megadott eszköz (stopwatch/timer/pomodoro)
    function isRunningFor(tool) {
        if (tool === 'stopwatch') return stopwatch.running;
        if (tool === 'timer') return timer.running;
        return isPomodoroRunning();
    }

    // CÉL: A Start/Pause gomb ikonjának/feliratának szinkronban tartása az aktív eszköz állapotával
    function updateUI() {
        const icon = startStopBtn.querySelector('i');
        const label = startStopBtn.querySelector('span');
        const isRunning = isRunningFor(activeTool);
        icon.classList.toggle('fa-play', !isRunning);
        icon.classList.toggle('fa-pause', isRunning);
        if (label) label.textContent = isRunning ? 'Pause' : 'Start';
        startStopBtn.setAttribute('aria-label', isRunning ? 'Pause' : 'Start');
    }

    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.dataset.target;
            if (activeTool !== target) {
                // Riasztás leállítása, ha timerről váltunk el
                if (activeTool === 'timer' && timer.isAlarmRinging) {
                    timer.stopAlarm();
                }

                activeTool = target;
                localStorage.setItem(ACTIVE_TOOL_KEY, activeTool);
                toggleButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                document.querySelector('.stopwatch').classList.toggle('active', target === 'stopwatch');
                document.querySelector('.timer').classList.toggle('active', target === 'timer');
                document.querySelector('.pomodoro-panel').classList.toggle('active', target === 'pomodoro');
                if (activeTool === 'stopwatch') {
                    stopwatch.updateDisplay();
                } else if (activeTool === 'timer') {
                    timer.updateDisplayFromSeconds();
                }
                updateUI();
            }
        });
    });

    startStopBtn.addEventListener('click', () => {
        if (activeTool === 'stopwatch') {
            if (stopwatch.running) stopwatch.stop();
            else stopwatch.start();
        } else if (activeTool === 'timer') {
            if (timer.running) timer.stop();
            else timer.start();
        } else {
            togglePomodoroRunning();
        }
        updateUI();
    });

    resetBtn.addEventListener('click', () => {
        if (activeTool === 'stopwatch') {
            stopwatch.reset();
        } else if (activeTool === 'timer') {
            timer.reset();
        } else {
            resetPomodoro();
        }
        updateUI();
    });

    // Az újratöltés előtt aktív fül visszaállítása — egy háttérben
    // csendben tovább futó Timer/Pomodoro ne bújjon el egy "Stopwatch,
    // nem fut" felirat mögé, ami mást állítana
    const savedTool = localStorage.getItem(ACTIVE_TOOL_KEY);
    activeTool = VALID_TOOLS.includes(savedTool) ? savedTool : 'stopwatch';

    toggleButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.target === activeTool));
    document.querySelector('.stopwatch').classList.toggle('active', activeTool === 'stopwatch');
    document.querySelector('.timer').classList.toggle('active', activeTool === 'timer');
    document.querySelector('.pomodoro-panel').classList.toggle('active', activeTool === 'pomodoro');
    updateUI();
}
