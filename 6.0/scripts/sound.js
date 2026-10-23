/*======================================================================
    sound.js - Közös hangjelzés (Timer riasztás + Pomodoro fázisváltás)
----------------------------------------------------------------------
     - Egyetlen, LUSTÁN létrehozott AudioContext az egész laphoz: az 5.1
       minden új fülön azonnal nyitott egyet (külön audio-szál, CPU/RAM),
       akkor is, ha soha nem szólalt meg semmi
======================================================================*/

// Négyzetes hangerő-skála: 100%-nál MAX_GAIN-szeres (kompresszorral
// megfogva, hogy ne torzuljon), 50% körül nagyjából a sima gain=1 szint
const MAX_GAIN = 5;

let audioCtx = null;

/*
    CÉL: Rövid "csippenés"-sorozat lejátszása
    BE:
     - volumePercent: 0-100 (0 vagy NaN -> néma)
     - freqs: hangonként egy frekvencia (Hz)
     - gap: két hang kezdete közti idő (mp); duration: egy hang hossza (mp)
*/
export function playChime(volumePercent, freqs = [880, 880], gap = 0.45, duration = 0.4) {
    if (!(volumePercent > 0)) return;

    try {
        audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const peak = MAX_GAIN * (volumePercent / 100) ** 2;
        const now = audioCtx.currentTime;
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.connect(audioCtx.destination);

        freqs.forEach((freq, i) => {
            const start = now + i * gap;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(compressor);

            // 0.0001 és nem 0: az exponenciális rámpa 0-val értelmezhetetlen
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            osc.start(start);
            osc.stop(start + duration);
        });
    } catch {
        // A hang nem létfontosságú — hang nélkül is működik minden
    }
}
