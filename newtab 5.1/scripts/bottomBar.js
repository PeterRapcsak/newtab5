/*======================================================================
    bottomBar.js - Alsó eszköztár (szekciókba rendezett tool-linkek)
----------------------------------------------------------------------
    FELADAT:
     - A bottomBarConfig (szekciókra bontott linkgyűjtemény) betöltése/
       mentése localStorage-ba, kirajzolása, szerkesztése
     - Szerkesztő módban: tool-ok hozzáadása/törlése/átrendezése (drag &
       drop, akár szekciók KÖZÖTT is), illetve új szekció létrehozása/törlése
    ADATSZERKEZET:
     - bottomBarConfig.sections = [ { id, name, items: [ {name, url},
       ... ] }, ... ]
    MEGJEGYZÉS:
     - Az exportBottomBarConfig()/importBottomBarConfig() függvények
       készen állnak, de jelenleg nincs gomb bekötve hozzájuk — a
       main.js-beli "Export All"/"Import All" a bottomBarConfig-ot
       közvetlenül, a localStorage-on keresztül kezeli
======================================================================*/

import { domElements } from './dom.js';
import { applyIcon } from './icons.js';

//! ---------- ÁLLAPOT (state) ----------

// A teljes eszköztár tartalma. Ez csak a KIINDULÓ érték - a
// loadBottomBarConfig() indításkor úgyis felülírja a mentettel
export let bottomBarConfig = {
    sections: [
        {
            id: 'section-1',    // egyedi azonosító (a nevétől függetlenül állandó)
            name: 'Section 1',  // a szekció megjelenő neve
            items: []           // [{ name, url }, ...]
        }
    ]
};

export let isBottomBarEditMode = false; // szerkesztő módban vagyunk-e
// FONTOS: ezt a jelzőt a main.js-beli közös Edit gomb billenti át, a
// shortcuts.js szerkesztő módjával EGYSZERRE (lásd toggleBottomBarEditMode)

//! ---------- BETÖLTÉS ----------

/*
    CÉL: A bottomBarConfig betöltése localStorage-ból (induláskor)
    LOGIKA:
     - Ha a mentett adat a RÉGI formátumban van (langTools/aiTools
       tömbök, szekciók nélkül), egyetlen szekcióba olvasztva átalakítja
       az új (sections) formátumra, és rögtön vissza is menti így
     - Hiba esetén, vagy ha nincs még mentett adat -> gyári alapértelmezett
     - A végén mindig kirajzol
*/
export function loadBottomBarConfig() {
    const stored = localStorage.getItem('bottomBarConfig');

    if (stored) {
        try {
            const parsed = JSON.parse(stored);

            // Régi formátum átalakítása az új formátumra
            // (a 4.x-ben még két fix tömb volt, szekciók helyett)
            if (parsed.langTools || parsed.aiTools) {
                bottomBarConfig = {
                    sections: [
                        {
                            id: 'section-1',
                            name: 'Section 1',
                            items: [...(parsed.langTools || []), ...(parsed.aiTools || [])]
                        }
                    ]
                };
                // Rögtön vissza is mentjük az új formátumban, hogy a
                // konverzió csak EGYSZER fusson le
                localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
            } else {
                bottomBarConfig = parsed; // már az új formátum
            }
        } catch (error) {
            // Sérült JSON -> inkább a gyári tartalom, mint egy üres sáv
            console.error('Error parsing bottomBarConfig:', error);
            setDefaultBottomBarConfig();
        }
    } else {
        setDefaultBottomBarConfig(); // első indítás
    }

    renderBottomBar();
}

/*
    CÉL: Gyári alapértelmezett bottom bar-tartalom beállítása és mentése
    MEGJEGYZÉS:
     - Ez a projekt szerzőjének saját, alapból szállított linkgyűjteménye
       (Google-szolgáltatások, AI eszközök, fordítók szekciónként) —
       csak adat, nincs benne logika, ezért elemenként nincs kommentelve
     - A záró "},"  utáni localStorage.setItem(...) hívás emiatt NEM
       külön utasítás, hanem a vessző-operátor miatt UGYANANNAK az
       értékadó kifejezésnek a folytatása (érvényes JS -> előbb fut le
       az értékadás, utána a mentés, pontosan úgy, mintha két külön,
       pontosvesszővel lezárt sor lenne) — szándékosan nem nyúltunk hozzá
*/
function setDefaultBottomBarConfig() {
    bottomBarConfig = {
        sections: [
            {
                "id": "section-1761226485837",
                "name": "Section 5",
                "items": [
                    {
                        "name": "Earth",
                        "url": "https://earth.google.com/web/@47.04592194,16.20642682,-763.5078726a,3083269.01714981d,35y,0h,0t,0r/data=CgRCAggBOgMKATBCAggASg0I____________ARAA?authuser=0"
                    },
                    {
                        "name": "Maps",
                        "url": "https://www.google.com/maps/@47.4735991,19.0548695,15.75z?entry=ttu&g_ep=EgoyMDI1MTAyMC4wIKXMDSoASAFQAw%3D%3D"
                    },
                    {
                        "name": "Calendar",
                        "url": "https://calendar.google.com/calendar/u/0/r"
                    },
                    {
                        "name": "Photos",
                        "url": "https://photos.google.com/"
                    }
                ]
            },
            {
                "id": "section-1761228949885",
                "name": "Section 6",
                "items": [
                    {
                        "name": "ChatGPT",
                        "url": "https://chatgpt.com/"
                    },
                    {
                        "name": "Gemini",
                        "url": "https://gemini.google.com/app"
                    },
                    {
                        "name": "AI studio",
                        "url": "https://aistudio.google.com/prompts/new_chat?model=gemini-2.5-pro"
                    },
                    {
                        "name": "MGX",
                        "url": "https://mgx.dev/"
                    },
                    {
                        "name": "Grok",
                        "url": "https://grok.com/"
                    },
                    {
                        "name": "Blackbox",
                        "url": "https://www.blackbox.ai/"
                    },
                    {
                        "name": "Perplexity",
                        "url": "https://www.perplexity.ai/"
                    }
                ]
            },
            {
                "id": "section-1761229476710",
                "name": "Section 7",
                "items": [
                    {
                        "name": "DeepL",
                        "url": "https://www.deepl.com/en/translator/q/en/litigate/de/prozessieren/products/api?utm_term=&utm_campaign=HU%7CPMAX%7CC%7CEnglish&utm_source=google&utm_medium=paid&hsa_acc=1083354268&hsa_cam=21569274213&hsa_grp=&hsa_ad=&hsa_src=x&hsa_tgt=&hsa_kw=&hsa_mt=&hsa_net=adwords&hsa_ver=3&gad_source=1&gad_campaignid=21575949062&gbraid=0AAAAABbqoWDXnt7BK9xrINXFxyNO5vvCq&gclid=CjwKCAjwpOfHBhAxEiwAm1SwEkNvRVNoapiK8CRj5V8zDMQmsgpOAO5KMTfMJ4YsVzw3ZAR7aBSRKBoCmDUQAvD_BwE"
                    },
                    {
                        "name": "Quillbot",
                        "url": "https://quillbot.com/paraphrasing-tool"
                    }
                ]
            }
        ]
    },
    localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
}

//! ---------- KIRAJZOLÁS ----------

/*
    CÉL: A teljes alsó eszköztár (.bottom-section) újrarajzolása a
    bottomBarConfig alapján
     - Szekciónként: tool-elemek + (szerkesztő módban) "+ Add" gomb és
       szekció-törlés gomb, illetve a teljes szekció mint "ejtési zóna"
     - Szerkesztő módban a végére kerül egy "+ New Section" gomb is
*/
export function renderBottomBar() {
    const bottomSection = document.querySelector('.bottom-section');
    if (!bottomSection) return;

    // Teljes újraépítés: minden állapotváltozásnál a nulláról rajzolunk.
    // Ennyi elemnél ez bőven elég gyors, cserébe nem kell külön
    // "frissítsd ezt az egy elemet" ágakat karbantartani
    bottomSection.innerHTML = '';

    // Minden szekció kirajzolása
    bottomBarConfig.sections.forEach((section, sectionIndex) => {
        const sectionContainer = document.createElement('div');
        sectionContainer.className = 'bottom-bar-section';
        // Az indexet a DOM-ra is rátesszük, hogy az eseménykezelők
        // vissza tudják olvasni (a drag & drop-nál kell)
        sectionContainer.dataset.sectionIndex = sectionIndex;

        // Az elemek konténere, a törlés gombbal a jobb felső sarokban (absolute pozícióval)
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'section-items';
        itemsContainer.style.position = 'relative';

        // Szekció törlés gomb a jobb felső sarokban (csak szerkesztő módban)
        //? A > 1 feltétel miatt az utolsó szekción meg sem jelenik a gomb
        if (isBottomBarEditMode && bottomBarConfig.sections.length > 1) {
            const deleteSectionBtn = document.createElement('button');
            deleteSectionBtn.className = 'delete-section-btn-corner';
            deleteSectionBtn.innerHTML = '×';
            deleteSectionBtn.title = `Delete ${section.name} section`;
            deleteSectionBtn.onclick = () => deleteSection(sectionIndex);
            itemsContainer.appendChild(deleteSectionBtn);
        }

        section.items.forEach((item, itemIndex) => {
            const itemEl = createToolElement(item, sectionIndex, itemIndex);
            itemsContainer.appendChild(itemEl);
        });

        // "+ Add" gomb hozzáadása szerkesztő módban
        if (isBottomBarEditMode) {
            const addBtn = createAddButton(sectionIndex);
            itemsContainer.appendChild(addBtn);
        }

        // A teljes szekció ejthetővé tétele, beszúrási pozíció-logikával
        if (isBottomBarEditMode) {

            // A preventDefault() NÉLKÜL a böngésző nem is engedné az ejtést -
            // alapból minden elem "nem ejthető rá"
            itemsContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                itemsContainer.classList.add('drag-over-section'); // vizuális visszajelzés
            });

            itemsContainer.addEventListener('dragleave', (e) => {
                // Csak akkor vegyük le a kiemelést, ha magát a konténert hagyjuk el
                if (!itemsContainer.contains(e.relatedTarget)) {
                    itemsContainer.classList.remove('drag-over-section');
                }
            });

            itemsContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                itemsContainer.classList.remove('drag-over-section');

                // A dragstart-nál elrakott { sectionIndex, itemIndex } páros
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                const targetSectionIndex = parseInt(sectionContainer.dataset.sectionIndex);

                // Az elengedés pozíciójának megállapítása
                const afterElement = getDragAfterElement(itemsContainer, e.clientX);
                let targetIndex;

                if (afterElement == null) {
                    targetIndex = bottomBarConfig.sections[targetSectionIndex].items.length; // a sor végére
                } else {
                    targetIndex = parseInt(afterElement.dataset.itemIndex); // ez elé
                }

                // Elem áthelyezése ebbe a szekcióba, a megadott pozícióra
                //? Az AZONOS szekción belüli átrendezést nem itt, hanem
                //? magán a tool-elemen lévő drop kezelő végzi
                if (data.sectionIndex !== targetSectionIndex) {
                    moveItemToSectionAtPosition(data.sectionIndex, data.itemIndex, targetSectionIndex, targetIndex);
                }
            });
        }

        sectionContainer.appendChild(itemsContainer);
        bottomSection.appendChild(sectionContainer);
    });

    // "+ New Section" gomb hozzáadása a végére, szerkesztő módban - a szekciókkal egy sorban
    if (isBottomBarEditMode) {
        const newSectionBtn = document.createElement('button');
        newSectionBtn.className = 'new-section-btn';
        newSectionBtn.innerHTML = '<span>+ New Section</span>';
        newSectionBtn.onclick = addNewSection;
        bottomSection.appendChild(newSectionBtn);
    }

    syncBottomBarHeight(bottomSection);
}

// A .page-controls fixen 16px-re ül az alsó eszköztár fölött, de az alsó
// eszköztár tényleges magassága NEM fix — több sorba törik, ha egy
// szekcióban túl sok tool van (a régi langTools + aiTools egymásra
// pakolása, a "New Section" gomb, szerkesztő módban a plusz add/delete
// gombok mind megváltoztatják a magasságát). Egy hardkódolt eltolás
// idővel szinkronból csúszna, és a kettő átfedné egymást. Egy
// ResizeObserver a saron egy CSS változót pin-el a valós, kirajzolt
// magasságra, így a .page-controls ehhez tud igazodni találgatás
// helyett — egyszer figyeljük meg, magán a .bottom-section node-on,
// amit az innerHTML-es újraépítések nem cserélnek le.
let bottomBarResizeObserver = null;

// CÉL: A --bottom-bar-actual-height CSS változó szinkronban tartása a tényleges, kirajzolt magassággal
function syncBottomBarHeight(bottomSection) {
    document.documentElement.style.setProperty('--bottom-bar-actual-height', `${bottomSection.offsetHeight}px`);

    if (!bottomBarResizeObserver) {
        bottomBarResizeObserver = new ResizeObserver(([entry]) => {
            document.documentElement.style.setProperty('--bottom-bar-actual-height', `${entry.target.offsetHeight}px`);
        });
        bottomBarResizeObserver.observe(bottomSection);
    }
}

/*
    CÉL: Megállapítani, MELYIK elem elé kerülne a húzott elem, az egér
    X-koordinátája alapján (drag & drop pozicionáláshoz)
    BE:
     - container: az elemeket tartalmazó DOM konténer
     - x: az egér aktuális X-koordinátája
    KI: az az elem, ami elé az elengetés beszúrná (vagy null, a végére kerülne)
*/
function getDragAfterElement(container, x) {
    // A :not() szűrők fontosak: sem az épp húzott elemet, sem a "+ Add"
    // gombot nem szabad lehetséges beszúrási pontnak tekinteni
    const draggableElements = [...container.querySelectorAll('.ai-tool:not(.dragging):not(.add-tool-btn)')];

    // Végigfuttatunk egy "eddigi legjobb" keresést az összes jelölten
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();

        // Az elem KÖZEPÉHEZ képest hol van a kurzor?
        // negatív = a kurzor még az elem közepe előtt (balra) van
        const offset = x - box.left - box.width / 2;

        // A legközelebbi, még "balra levő" (negatív offset) elemet keressük
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
        // A kezdőérték -végtelen, hogy az első jelölt biztosan jobb legyen nála.
        // Ha egyetlen elem sincs a kurzortól jobbra, az .element undefined
        // marad -> a hívó ebből tudja, hogy a sor VÉGÉRE kell szúrni
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

//! ---------- TOOL-ELEMEK ----------

/*
    CÉL: Egyetlen tool DOM elemének felépítése (ikon + link + név,
    szerkesztő módban törlés gombbal és drag & drop-pal is)
    BE: tool - {name, url}; sectionIndex, itemIndex - pozíciója
    KI: a felépített .ai-tool elem
*/
function createToolElement(tool, sectionIndex, itemIndex) {
    // Igazi <a> elem, nem div: így működik rajta a középső gombos
    // megnyitás, a "link címének másolása", stb.
    const toolEl = document.createElement('a');
    toolEl.href = tool.url;
    toolEl.className = 'ai-tool';
    toolEl.style.position = 'relative'; // a törlés gomb ehhez képest pozicionálódik
    toolEl.dataset.itemIndex = itemIndex;

    // Az ikon feloldását teljesen az icons.js-re bízzuk (cache -> favicon
    // -> aggregátor -> betűs avatar)
    const imgElement = document.createElement('img');
    imgElement.alt = tool.name;
    applyIcon(imgElement, tool.url, tool.name);

    // textContent és nem innerHTML: a név a felhasználótól jön
    const nameSpan = document.createElement('span');
    nameSpan.textContent = tool.name;

    toolEl.appendChild(imgElement);
    toolEl.appendChild(nameSpan);

    if (isBottomBarEditMode) {
        toolEl.setAttribute('draggable', 'true');
        toolEl.style.cursor = 'move';
        toolEl.classList.add('editable');

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-tool-btn';
        deleteBtn.textContent = '×';
        deleteBtn.onclick = (e) => {
            e.preventDefault();   // ne navigáljon el a körbeölelő <a> miatt
            e.stopPropagation();  // és ne is buborékoljon feljebb
            deleteBottomBarTool(sectionIndex, itemIndex);
        };
        toolEl.appendChild(deleteBtn);

        // Drag & drop
        // Húzás indulása: elrakjuk, honnan jött az elem. A dataTransfer
        // csak stringet tud vinni, ezért JSON-ként
        toolEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({ sectionIndex, itemIndex }));
            toolEl.style.opacity = '0.5';      // az eredeti hely elhalványul
            toolEl.classList.add('dragging');  // ezt szűri ki a getDragAfterElement()
        });

        // Húzás vége (akár sikerült ejteni, akár nem) -> vissza az alapállapot
        toolEl.addEventListener('dragend', () => {
            toolEl.style.opacity = '1';
            toolEl.classList.remove('dragging');
        });

        toolEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        toolEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));

            // Átrendezés, ha ugyanazon a szekción belül történt az elengedés
            //? A szekciók KÖZÖTTI mozgatást a konténer drop kezelője intézi
            if (data.sectionIndex === sectionIndex) {
                reorderItemsInSection(sectionIndex, data.itemIndex, itemIndex);
            }
        });
    }

    return toolEl;
}

// CÉL: A "+ Add" gomb felépítése egy adott szekcióhoz (kattintásra prompt()-tal kér nevet/URL-t)
function createAddButton(sectionIndex) {
    const addBtn = document.createElement('button');
    addBtn.className = 'ai-tool add-tool-btn';
    addBtn.innerHTML = '<span style="font-size: 1.2rem;">+ Add</span>';

    // Egyszerű prompt()-os bekérés - a bottom barnál nincs külön
    // szerkesztő popover, mint a shortcut-oknál
    addBtn.onclick = () => {
        const name = prompt('Enter tool name:');
        if (!name) return; // Mégse / üres -> nem csinálunk semmit

        const url = prompt('Enter tool URL:');
        if (!url) return;

        addBottomBarTool(sectionIndex, name, url);
    };

    return addBtn;
}

//! ---------- TOOL-OK HOZZÁADÁSA / TÖRLÉSE / ÁTRENDEZÉSE ----------

/*
    CÉL: Új tool felvétele egy adott szekcióba
     - A hiányzó "https://"-t pótolja, érvénytelen URL esetén hibát jelez
*/
function addBottomBarTool(sectionIndex, name, url) {
    // A protokoll nélkül beírt cím (pld. "github.com") relatív útvonalként
    // viselkedne -> kiegészítjük
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    // Érvényesség-ellenőrzés: ha a URL konstruktor dob, nem jó a cím
    try {
        new URL(url);
    } catch {
        alert('Please enter a valid URL');
        return;
    }

    const tool = { name, url };
    bottomBarConfig.sections[sectionIndex].items.push(tool);

    localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
    renderBottomBar();
}

// CÉL: Egy tool törlése a saját szekciójából, index alapján
function deleteBottomBarTool(sectionIndex, itemIndex) {
    bottomBarConfig.sections[sectionIndex].items.splice(itemIndex, 1);
    localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
    renderBottomBar();
}

// CÉL: Egy tool átrendezése EGYETLEN szekción belül (fromIndex -> toIndex)
function reorderItemsInSection(sectionIndex, fromIndex, toIndex) {
    if (fromIndex === toIndex) return; // önmagára ejtette -> nincs teendő

    const items = bottomBarConfig.sections[sectionIndex].items;

    // A splice tömböt ad vissza, ezért a destrukturálás
    const [movedItem] = items.splice(fromIndex, 1);

    // Célindex korrigálása, ha előre mozgattuk (a splice(1) miatt eltolódik a sorszám)
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    items.splice(adjustedToIndex, 0, movedItem);

    localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
    renderBottomBar();
}

// CÉL: Egy tool áthelyezése egyik szekcióból egy MÁSIKBA, adott pozícióra
function moveItemToSectionAtPosition(fromSectionIndex, fromItemIndex, toSectionIndex, toItemIndex) {
    // Kivesszük a régi helyéről... ([0], mert a splice tömböt ad vissza)
    const item = bottomBarConfig.sections[fromSectionIndex].items.splice(fromItemIndex, 1)[0];

    // ...és beszúrjuk az újra. Itt nem kell indexet korrigálni, mint az
    // azonos szekción belüli átrendezésnél - két külön tömbről van szó
    bottomBarConfig.sections[toSectionIndex].items.splice(toItemIndex, 0, item);

    localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
    renderBottomBar();
}

//! ---------- SZEKCIÓK KEZELÉSE ----------

/*
    CÉL: Új, üres szekció létrehozása
     - A nevét a jelenlegi legnagyobb "Section N" sorszám + 1 adja
*/
function addNewSection() {
    // A legnagyobb szekció-sorszám megkeresése
    // (nem a sections.length + 1, mert a köztes törlések miatt abból
    //  könnyen lehetne két azonos nevű szekció)
    let maxSectionNum = 0;
    bottomBarConfig.sections.forEach(section => {
        const match = section.name.match(/Section (\d+)/);
        if (match) {
            const num = parseInt(match[1]); // match[1] = az első zárójeles csoport
            if (num > maxSectionNum) {
                maxSectionNum = num;
            }
        }
        // Az átnevezett szekciók egyszerűen kimaradnak a számolásból
    });

    const newSectionNum = maxSectionNum + 1;
    const newSection = {
        id: `section-${Date.now()}`,   // az időbélyeg elég egyedi azonosítónak
        name: `Section ${newSectionNum}`,
        items: []
    };

    bottomBarConfig.sections.push(newSection);
    localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
    renderBottomBar();
}

/*
    CÉL: Egy szekció törlése (megerősítés után), a benne lévő
    összes tool-lal együtt
     - Az utolsó szekció nem törölhető
*/
function deleteSection(sectionIndex) {
    // Ez elvileg nem fordulhat elő (az utolsó szekción meg sem jelenik a
    // törlés gomb), de a biztonság kedvéért itt is ellenőrizzük
    if (bottomBarConfig.sections.length <= 1) {
        alert('Cannot delete the last section');
        return;
    }

    if (confirm(`Delete section "${bottomBarConfig.sections[sectionIndex].name}"?`)) {
        bottomBarConfig.sections.splice(sectionIndex, 1);
        localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
        renderBottomBar();
    }
}

//! ---------- MÓDVÁLTÁS ÉS EXPORT/IMPORT ----------

// A kapcsoló szövege/aktív állapota mostantól az egyetlen, közös Edit
// gombon él (lásd main.js), ami ezt a függvényt hívja meg a
// shortcuts.js-beli toggleEditMode()-dal együtt — ennek itt csak a
// jelzőt kell átbillentenie, és újrarajzolnia.
export function toggleBottomBarEditMode() {
    isBottomBarEditMode = !isBottomBarEditMode;
    renderBottomBar(); // a mód váltása teljesen más gombokat jelent -> újrarajzolás
}

// CÉL: A teljes bottomBarConfig letöltése egy .json fájlba
export function exportBottomBarConfig() {
    const config = localStorage.getItem('bottomBarConfig');

    if (config) {
        // A nyers, mentett stringet visszük ki, nem a bottomBarConfig
        // objektumot - így garantáltan az van a fájlban, ami a tárolóban
        const blob = new Blob([config], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bottom-bar-config.json';
        a.click();
        URL.revokeObjectURL(url);
    } else {
        alert('No bottom bar configuration to export.');
    }
}

// CÉL: Korábban exportált .json fájl visszatöltése, és alkalmazása
export function importBottomBarConfig() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);

                    // Minimális formátum-ellenőrzés: legyen benne sections
                    if (!importedData.sections) {
                        throw new Error('Invalid config format');
                    }

                    localStorage.setItem('bottomBarConfig', e.target.result);
                    loadBottomBarConfig(); // ez be is olvassa és ki is rajzolja
                    alert('Bottom bar configuration imported successfully!');
                } catch (error) {
                    console.error('Error importing config:', error);
                    alert('Invalid file format. Please upload a valid JSON file.');
                }
            };
            reader.readAsText(file);
        }
    };
    fileInput.click();
}
