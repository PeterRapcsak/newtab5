/*======================================================================
    bottomBar.js - Alsó eszköztár (szekciókba rendezett tool-linkek)
------------------------------------------------------------------------
    CÉL:
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

export let bottomBarConfig = {
    sections: [
        {
            id: 'section-1',
            name: 'Section 1',
            items: []
        }
    ]
};

export let isBottomBarEditMode = false;

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
                localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
            } else {
                bottomBarConfig = parsed;
            }
        } catch (error) {
            console.error('Error parsing bottomBarConfig:', error);
            setDefaultBottomBarConfig();
        }
    } else {
        setDefaultBottomBarConfig();
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

    bottomSection.innerHTML = '';

    // Minden szekció kirajzolása
    bottomBarConfig.sections.forEach((section, sectionIndex) => {
        const sectionContainer = document.createElement('div');
        sectionContainer.className = 'bottom-bar-section';
        sectionContainer.dataset.sectionIndex = sectionIndex;

        // Az elemek konténere, a törlés gombbal a jobb felső sarokban (absolute pozícióval)
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'section-items';
        itemsContainer.style.position = 'relative';

        // Szekció törlés gomb a jobb felső sarokban (csak szerkesztő módban)
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
            itemsContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                itemsContainer.classList.add('drag-over-section');
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

                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                const targetSectionIndex = parseInt(sectionContainer.dataset.sectionIndex);

                // Az elengedés pozíciójának megállapítása
                const afterElement = getDragAfterElement(itemsContainer, e.clientX);
                let targetIndex;

                if (afterElement == null) {
                    targetIndex = bottomBarConfig.sections[targetSectionIndex].items.length;
                } else {
                    targetIndex = parseInt(afterElement.dataset.itemIndex);
                }

                // Elem áthelyezése ebbe a szekcióba, a megadott pozícióra
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
    const draggableElements = [...container.querySelectorAll('.ai-tool:not(.dragging):not(.add-tool-btn)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;

        // A legközelebbi, még "balra levő" (negatív offset) elemet keressük
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
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
    const toolEl = document.createElement('a');
    toolEl.href = tool.url;
    toolEl.className = 'ai-tool';
    toolEl.style.position = 'relative';
    toolEl.dataset.itemIndex = itemIndex;

    const imgElement = document.createElement('img');
    imgElement.alt = tool.name;
    applyIcon(imgElement, tool.url, tool.name);

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
            e.preventDefault();
            e.stopPropagation();
            deleteBottomBarTool(sectionIndex, itemIndex);
        };
        toolEl.appendChild(deleteBtn);

        // Drag & drop
        toolEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({ sectionIndex, itemIndex }));
            toolEl.style.opacity = '0.5';
            toolEl.classList.add('dragging');
        });

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

    addBtn.onclick = () => {
        const name = prompt('Enter tool name:');
        if (!name) return;

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
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

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
    if (fromIndex === toIndex) return;

    const items = bottomBarConfig.sections[sectionIndex].items;
    const [movedItem] = items.splice(fromIndex, 1);

    // Célindex korrigálása, ha előre mozgattuk (a splice(1) miatt eltolódik a sorszám)
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    items.splice(adjustedToIndex, 0, movedItem);

    localStorage.setItem('bottomBarConfig', JSON.stringify(bottomBarConfig));
    renderBottomBar();
}

// CÉL: Egy tool áthelyezése egyik szekcióból egy MÁSIKBA, adott pozícióra
function moveItemToSectionAtPosition(fromSectionIndex, fromItemIndex, toSectionIndex, toItemIndex) {
    const item = bottomBarConfig.sections[fromSectionIndex].items.splice(fromItemIndex, 1)[0];
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
    let maxSectionNum = 0;
    bottomBarConfig.sections.forEach(section => {
        const match = section.name.match(/Section (\d+)/);
        if (match) {
            const num = parseInt(match[1]);
            if (num > maxSectionNum) {
                maxSectionNum = num;
            }
        }
    });

    const newSectionNum = maxSectionNum + 1;
    const newSection = {
        id: `section-${Date.now()}`,
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
    renderBottomBar();
}

// CÉL: A teljes bottomBarConfig letöltése egy .json fájlba
export function exportBottomBarConfig() {
    const config = localStorage.getItem('bottomBarConfig');
    if (config) {
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
                    if (!importedData.sections) {
                        throw new Error('Invalid config format');
                    }
                    localStorage.setItem('bottomBarConfig', e.target.result);
                    loadBottomBarConfig();
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
