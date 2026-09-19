/*======================================================================
    timeTools.js - Stopper és Visszaszámláló (Time Tools kártya)
----------------------------------------------------------------------
    FELADAT:
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

// A két eszköz külön localStorage kulcson él, hogy egymástól függetlenül
// lehessen menteni/visszatölteni őket (a Pomodoro a saját kulcsát viszi)
const STOPWATCH_STATE_KEY = 'stopwatchState';
const TIMER_STATE_KEY = 'timerState';

//! ======================== STOPWATCH (stopper) ========================

// CÉL: Egyszerű, felfelé számláló stopper, századmásodperc pontossággal
export class Stopwatch {

    /*
        CÉL: Stopper létrehozása és azonnali "életre keltése"
        BE: displayElement - a kijelző DOM eleme
        MEGJEGYZÉS:
            A konstruktor már be is tölti a mentett állapotot, és ha az
            azt mondja, hogy futott, akkor tovább is indítja
    */
    constructor(displayElement) {
        this.display = displayElement;
        this.running = false;   // fut-e épp
        this.time = 0;          // eltelt idő ms-ben
        this.interval = null;   // a setInterval azonosítója

        // A Timerrel ellentétben a stoppert nem lehet kézzel átírni
        this.display.contentEditable = false;

        this.loadState();
        this.updateDisplay();

        if (this.running) this.resumeInterval(); // a fül bezárása alatt is ment tovább
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
            if (!raw) return; // még sosem futott -> maradnak a konstruktor alapértékei

            const state = JSON.parse(raw);
            this.time = state.time || 0;
            this.running = !!state.running; // a !! bármit rendes logikai értékké tesz

            // Ha futott, a mentett this.time már elavult -> a horgonyból
            // számoljuk újra a TÉNYLEGESEN eltelt időt
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
            // A horgony: "mintha ekkor indult volna" - visszafelé számolva
            // az eddig eltelt időből. Megállított állapotban nincs értelme
            startedAt: this.running ? Date.now() - this.time : null
        }));
    }

    // CÉL: A számláló-intervallum (újra)indítása egy kiszámolt kezdő időponttól
    resumeInterval() {
        this.display.classList.add('running');

        // Ugyanaz a horgony-elv, mint a mentésnél: nem gyűjtögetjük az
        // eltelt időt lépésenként (az elcsúszna), hanem minden tick-nél
        // a fix kezdőponthoz képest számolunk
        const startTime = Date.now() - this.time;

        this.interval = setInterval(() => {
            this.time = Date.now() - startTime;
            this.updateDisplay();
        }, 10); // 10ms = századmásodperces felbontás
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

        // Maradékos osztásokkal bontjuk szét: minden szint a NÁLA nagyobb
        // egység maradékából számol (3600000ms = 1 óra, 60000ms = 1 perc)
        const hours = Math.floor(totalMilliseconds / 3600000);
        const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
        const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
        const centiseconds = Math.floor((totalMilliseconds % 1000) / 10);

        // A századmásodperc mindig látszik, ezért kívül van az if-eken
        const formattedCentiseconds = `<span class="digit">${String(centiseconds).padStart(2, '0')}</span>`;
        let mainDisplayHtml = '';

        // Csak annyi egységet mutatunk, amennyi tényleg kell - a "0:00:05"
        // sokkal zsúfoltabb, mint egy sima "5"

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

        // A .time-segment-ek (":" és ".") külön span-ban vannak, mert a CSS
        // halványabbra színezi őket, mint magukat a számjegyeket
        this.display.innerHTML = `${mainDisplayHtml}<span class="time-segment">.</span>${formattedCentiseconds}`;
    }
}

//! ======================== TIMER (visszaszámláló) ========================

// CÉL: Visszaszámláló, kattintással/gépeléssel átírható számjegyekkel
export class Timer {

    /*
        CÉL: Visszaszámláló létrehozása és bekötése
        BE: displayElement       - a számjegyek konténere
            progressFillElement  - a haladás-sáv kitöltő eleme
    */
    constructor(displayElement, progressFillElement) {
        this.display = displayElement;
        this.progressFill = progressFillElement;
        this.running = false;
        this.remainingTime = 0; // hátralévő MÁSODPERC (nem ms, mint a stoppernél!)
        this.totalTime = 0;     // a beállított teljes hossz - ehhez képest telik a sáv
        this.interval = null;
        // Melyik szegmens (óra/perc/mp) van "felfegyverezve" gépelésre egy
        // kattintás után, és az az óta begépelt nyers számjegyek — lásd
        // handleUnitClick()/handleUnitInput() lentebb.
        this.activeUnit = null;  // 'hours' | 'minutes' | 'seconds' | null
        this.editBuffer = '';    // az eddig begépelt nyers számjegyek

        //? Riasztás-állapot
        this.alarmAudio = null;
        this.alarmInterval = null;
        this.isAlarmRinging = false;
        this.finishedWhileAway = false; // csukott fül mellett járt-e le

        // tabindex="0" nélkül egy <div> nem kaphatna fókuszt, és nem
        // kapnánk meg rajta a keydown eseményeket
        this.display.setAttribute('tabindex', '0');

        this.display.addEventListener('click', (e) => this.handleUnitClick(e));

        this.display.addEventListener('keydown', (e) => {

            // Futás közben, vagy ha nincs kijelölt szegmens, semmit nem engedünk
            if (this.running || !this.activeUnit) {
                e.preventDefault();
                return;
            }

            if (/[0-9]/.test(e.key)) {
                //? Számjegy -> hozzáfűzés a pufferhez
                e.preventDefault();
                this.handleUnitInput(e.key);
            } else if (e.key === 'Backspace') {
                //? Visszatörlés -> az utolsó számjegy levágása
                e.preventDefault();
                this.editBuffer = this.editBuffer.slice(0, -1);
                // Üres pufferből 0 lesz, nem NaN
                this.applyUnitEdit(this.activeUnit, this.editBuffer ? parseInt(this.editBuffer, 10) : 0);
            } else if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
                //? Kilépés a szerkesztésből (a Tabot is elkapjuk, hogy ne ugorjon tovább)
                e.preventDefault();
                this.exitUnitEdit();
            } else {
                // Minden egyéb billentyű elnyelve - a kijelzőbe ne lehessen
                // betűt vagy bármi mást belegépelni
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
            // Csak a vizuális "kész" állapot, hang NÉLKÜL - lásd loadState()
            this.display.classList.add('finished');
        }
    }

    // CÉL: A riasztáshoz szükséges Web Audio API kontextus létrehozása
    initAlarm() {
        // A webkit- előtag a régebbi Safari kedvéért kell
        const AudioContext = window.AudioContext || window.webkitAudioContext;

        // Ha a böngésző nem ismeri, a this.audioContext undefined marad,
        // és a playAlarmSound() csendben nem csinál semmit
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
        if (!this.audioContext) return; // nincs hangtámogatás -> néma marad

        const duration = 0.15;     // egy csippenés hossza másodpercben
        const frequency1 = 880;    // A5 hang
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
            // Közben lehet, hogy leállították a riasztást -> ne szóljon bele
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
        }, 150); // 150ms késleltetés -> a két hang "csip-csip"-ként hallatszik
    }

    // CÉL: A riasztás elindítása (azonnali hang, majd másodpercenként ismétlődik, amíg le nem állítják)
    startAlarm() {
        if (this.isAlarmRinging) return; // már szól -> ne indítsunk másodikat

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
        this.isAlarmRinging = false; // ezt látja a playAlarmSound() késleltetett fele is

        if (this.alarmInterval) {
            clearInterval(this.alarmInterval);
            this.alarmInterval = null;
        }

        this.display.classList.remove('finished'); // a piros kiemelés is eltűnik
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
                // A végidőpontból számoljuk vissza, mennyi maradt VALÓJÁBAN
                const secondsLeft = Math.ceil((state.endsAt - Date.now()) / 1000);

                if (secondsLeft > 0) {
                    // Még van hátra -> egyszerűen folytatjuk
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
            // A horgony itt a VÉGE (a stoppernél az eleje volt) - *1000,
            // mert a remainingTime másodpercben van, a Date.now() ms-ben
            endsAt: this.running ? Date.now() + this.remainingTime * 1000 : null
        }));
    }

    // CÉL: A visszaszámlálás (újra)indítása, másodpercenkénti csökkentéssel
    resumeCountdown() {
        this.running = true;
        this.display.classList.add('running');

        this.interval = setInterval(() => {
            // Elő-dekrementálás: előbb csökkent, és a MÁR csökkentett
            // értéket hasonlítja össze - így pontosan a 0-nál csenget
            if (--this.remainingTime <= 0) {
                this.stop();            // ez a saveState()-et is elvégzi
                this.remainingTime = 0; // negatívba ne csússzon
                this.startAlarm();
            }
            this.updateDisplayFromSeconds();
        }, 1000);
    }

    // CÉL: Indítás (csak akkor, ha van hátralévő idő, és még nem fut)
    start() {
        // 0-ról nem indulunk el: előbb be kell állítani valamennyi időt
        if (this.remainingTime > 0 && !this.running) {
            this.resumeCountdown(); // ez állítja be a running-ot...
            this.saveState();       // ...ezért csak UTÁNA mentünk
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
        this.totalTime = seconds; // az új érték lesz a 100% a haladás-sávon
        this.saveState();
        this.updateDisplayFromSeconds();
    }

    // CÉL: A kijelző (óó:pp:mm) és a haladás-sáv frissítése a hátralévő másodpercek alapján
    updateDisplayFromSeconds() {
        // Itt másodpercből bontunk (3600 = 1 óra), nem ms-ből, mint a stoppernél
        const hours = Math.floor(this.remainingTime / 3600);
        const minutes = Math.floor((this.remainingTime % 3600) / 60);
        const seconds = this.remainingTime % 60;

        // CÉL: Egy számjegypár markupja. Az .editing osztály jelöli, melyik
        // szegmens van épp "felfegyverezve" gépelésre
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
        //? Haladás-sáv: az ELTELT részt mutatja, a totalTime-hoz viszonyítva
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
        if (this.running) return; // menet közben nem lehet átírni

        // A .closest() felfelé keres a DOM-fában: akkor is megtalálja a
        // .digit-et, ha a kattintás egy azon belüli elemre esett
        const digitEl = e.target.closest('.digit');

        // Melyik a három közül? (a kettőspontokra kattintva egyik sem)
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
        // A slice(-3) az UTOLSÓ 3 karaktert tartja meg: így folyamatosan
        // gépelve a régi számjegyek szépen "kicsordulnak" balra
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
        // Kiindulunk a jelenlegi értékekből, és csak a szerkesztettet írjuk át
        let hours = Math.floor(this.remainingTime / 3600);
        let minutes = Math.floor((this.remainingTime % 3600) / 60);
        let seconds = this.remainingTime % 60;

        // A túlcsordulást nem levágjuk, hanem ÁTVISSZÜK a nagyobb egységbe:
        // pld. 90 másodpercből 1 perc 30 másodperc lesz
        if (unit === 'seconds') {
            seconds = value % 60;
            minutes += Math.floor(value / 60);
        } else if (unit === 'minutes') {
            minutes = value % 60;
            hours += Math.floor(value / 60);
        } else {
            hours = value; // az óra fölött már nincs nagyobb egység
        }

        // Második átvitel: a fenti lépés a perceket is túlcsordíthatta
        hours += Math.floor(minutes / 60);
        minutes = minutes % 60;

        hours = Math.min(hours, 99); // itt viszont már tényleg vágunk (2 számjegy fér ki)

        this.remainingTime = hours * 3600 + minutes * 60 + seconds;
        this.totalTime = this.remainingTime; // az új idő lesz a 100%
        this.saveState();
        this.updateDisplayFromSeconds();
    }
}

//! ======================== FÜLVÁLTÁS ÉS KÖZÖS VEZÉRLŐK ========================

const ACTIVE_TOOL_KEY = 'activeTimeTool';                  // localStorage kulcs az aktív fülnek
const VALID_TOOLS = ['stopwatch', 'timer', 'pomodoro'];    // csak ezeket fogadjuk el visszatöltéskor

export let stopwatch;                   // a Stopwatch példány
export let timer;                       // a Timer példány
export let activeTool = 'stopwatch';    // melyik fül aktív épp

/*
    CÉL: A Time Tools kártya bekötése
     - Stopwatch/Timer példányosítása, Pomodoro panel inicializálása
     - Fül-váltó gombok (Stopwatch/Timer/Pomodoro) bekötése
     - A közös Start/Pause + Reset gomb az épp aktív eszközre irányítva
     - Az utoljára aktív fül visszaállítása localStorage-ból
*/
export function initializeTimeTools() {

    //! ---------- PÉLDÁNYOSÍTÁS ----------

    const stopwatchDisplay = document.querySelector('.stopwatch .display');
    stopwatch = new Stopwatch(stopwatchDisplay);

    const timerDisplay = document.querySelector('.timer .display');
    const timerProgressFill = document.getElementById('timer-progress-fill');
    timer = new Timer(timerDisplay, timerProgressFill);

    // A Pomodorónak nincs osztálya, ő modul-szinten tartja az állapotát
    initPomodoroPanel();

    //! ---------- KÖZÖS VEZÉRLŐK ----------

    // Mindhárom fül EGY Start/Pause és EGY Reset gombon osztozik - az
    // activeTool dönti el, melyiknek szól épp a kattintás
    const toggleButtons = document.querySelectorAll('.mode-tabs .toggle-btn');
    const startStopBtn = document.querySelector('.controls .start-stop');
    const resetBtn = document.querySelector('.controls .reset');

    // CÉL: Fut-e éppen a megadott eszköz (stopwatch/timer/pomodoro)
    function isRunningFor(tool) {
        if (tool === 'stopwatch') return stopwatch.running;
        if (tool === 'timer') return timer.running;
        return isPomodoroRunning(); // ami maradt: a Pomodoro
    }

    // CÉL: A Start/Pause gomb ikonjának/feliratának szinkronban tartása az aktív eszköz állapotával
    function updateUI() {
        const icon = startStopBtn.querySelector('i');
        const label = startStopBtn.querySelector('span');
        const isRunning = isRunningFor(activeTool);

        // Fut -> pause ikon, áll -> play ikon
        icon.classList.toggle('fa-play', !isRunning);
        icon.classList.toggle('fa-pause', isRunning);

        if (label) label.textContent = isRunning ? 'Pause' : 'Start';

        // A képernyőolvasók az aria-label-t mondják be, nem az ikont
        startStopBtn.setAttribute('aria-label', isRunning ? 'Pause' : 'Start');
    }

    //! ---------- FÜLVÁLTÁS ----------

    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.dataset.target;

            // Ugyanarra a fülre kattintva nincs teendő
            if (activeTool !== target) {
                // Riasztás leállítása, ha timerről váltunk el
                if (activeTool === 'timer' && timer.isAlarmRinging) {
                    timer.stopAlarm();
                }

                activeTool = target;
                localStorage.setItem(ACTIVE_TOOL_KEY, activeTool); // jegyezzük meg a következő indulásra

                //? Fülgombok: mindenkiről le, a kattintottra rá
                toggleButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                //? És ugyanez a három panelre
                document.querySelector('.stopwatch').classList.toggle('active', target === 'stopwatch');
                document.querySelector('.timer').classList.toggle('active', target === 'timer');
                document.querySelector('.pomodoro-panel').classList.toggle('active', target === 'pomodoro');

                // Egy azonnali újrarajzolás, hogy ne egy elavult érték
                // villanjon fel a most előhúzott panelen
                if (activeTool === 'stopwatch') {
                    stopwatch.updateDisplay();
                } else if (activeTool === 'timer') {
                    timer.updateDisplayFromSeconds();
                }
                // A Pomodoro magától tickel, neki nem kell külön lökés

                updateUI();
            }
        });
    });

    //! ---------- START/PAUSE ÉS RESET ----------

    // Mindkét gomb ugyanaz a minta: az activeTool alapján irányítjuk
    // tovább a hívást a megfelelő eszközre
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

    // A VALID_TOOLS ellenőrzés véd attól, hogy egy kézzel elrontott
    // localStorage érték nem létező panelt próbáljon megnyitni
    activeTool = VALID_TOOLS.includes(savedTool) ? savedTool : 'stopwatch';

    // Ugyanaz a négy sor, mint a fülváltásnál - itt a mentett fülre alkalmazva
    toggleButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.target === activeTool));
    document.querySelector('.stopwatch').classList.toggle('active', activeTool === 'stopwatch');
    document.querySelector('.timer').classList.toggle('active', activeTool === 'timer');
    document.querySelector('.pomodoro-panel').classList.toggle('active', activeTool === 'pomodoro');
    updateUI();
}
