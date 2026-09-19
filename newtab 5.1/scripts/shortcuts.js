/*======================================================================
    shortcuts.js - Shortcut-ok (jobb oldali linkgyűjtemény)
----------------------------------------------------------------------
    FELADAT:
     - A shortcut-konténerek (linkcsoportok) állapotának kezelése:
       betöltés/mentés localStorage-ba, kirajzolás, hozzáadás/törlés
     - Szerkesztő mód: konténerek átrendezése/átméretezése és a benne
       lévő shortcut-ok átrendezése egérrel húzva (drag & drop, élő
       előnézettel), illetve popoverből való átnevezés/URL-csere
    ADATSZERKEZET:
     - shortcutsConfig.containers = [ { id, name, width, shortcuts:
       [ {name, url}, ... ] }, ... ]  -> TÖBB konténer is lehet
       egymás mellett, mindegyiknek saját (%-os) szélessége van
======================================================================*/

import { domElements } from './dom.js';
import { applyIcon } from './icons.js';

//! ---------- ÁLLAPOT (state) ----------

// Új adatszerkezet, ami már több konténert is támogat
export let shortcutsConfig = {
    containers: [
        {
            id: 'container-1',
            name: 'Shortcuts',
            width: 100, // Százalékos szélesség (100 = teljes sor, 50 = fél, stb.)
            shortcuts: []
        }
    ]
};

export let isEditMode = false;       // szerkesztő módban vagyunk-e
export let isAddMode = false;        // nyitva van-e a "hozzáadás" form
export let activeContainerId = null; // melyik konténerhez adunk éppen hozzá

//? Shortcut-ok húzása
let draggingShortcut = null; // az éppen húzott .shortcut elem
let dropWasHandled = false;  // sikerült-e érvényes helyre ejteni
let dragGhost = null;        // az egeret követő lebegő másolat

// Konténerek átrendezése (ugyanaz az élő-előnézetes mechanika, mint a shortcut drag & drop-nál)
let draggingContainer = null;
let containerDropWasHandled = false;

// Átméretezés állapota
let isResizing = false;
let resizingContainerId = null;
let startX = 0;      // az egér X-e a húzás KEZDETÉN
let startWidth = 0;  // a konténer szélessége a húzás kezdetén

// Edit-shortcut popover állapota
let editPopoverEl = null;
let editingShortcut = null; // { containerId, index }, vagy null ha nincs szerkesztés

/*
    CÉL: Shortcut-ra kattintás kezelése
     - Középső gombbal / Ctrl+kattintás / Cmd+kattintás esetén hagyja,
       hogy a böngésző alap-viselkedése érvényesüljön (pld. új fülön nyit)
     - Egyébként megelőzi az alapértelmezett működést, és MAGA navigál
       (ugyanoda, ahova a link mutat)
    KI: true, ha hagyta az alap-viselkedést; false, ha maga navigált
*/
export function handleShortcutClick(event) {
    // Középső gomb / Ctrl (Windows, Linux) / Cmd (macOS) -> a böngésző
    // nyissa meg új fülön, ahogy azt a felhasználó elvárja
    if (event.button === 1 || event.ctrlKey || event.metaKey) {
        return true;
    }

    event.preventDefault();
    window.location.href = event.currentTarget.href;
    return false;
}

// CÉL: Egyedi, időbélyeg + random rész alapú azonosító generálása egy új konténerhez
function generateContainerId() {
    // Csak az időbélyeg nem lenne elég: két, ugyanabban az ezredmásodpercben
    // létrehozott konténer ütközne. A toString(36) a 0-9 és a-z jegyeket
    // használja, a substr(2, 9) pedig levágja a "0." előtagot
    return 'container-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

//! ---------- KIRAJZOLÁS ----------

/*
    CÉL: A teljes shortcuts-wrapper újrarajzolása a shortcutsConfig alapján
     - Minden konténerhez: kártya + benne a shortcut-rács, "hozzáadás"
       gomb, (szerkesztő módban) törlés gomb és átméretező fogantyú
     - Szerkesztő módban a végére kerül egy "Add Container" gomb is
    MEGJEGYZÉS:
     - Ez a függvény hívódik újra szinte minden állapotváltozás után
       (hozzáadás, törlés, drag & drop vége, mód váltás, stb.) — a
       teljes wrapper.innerHTML-t nullázza, majd újraépíti
*/
export function renderShortcuts() {
    const wrapper = document.getElementById('shortcuts-wrapper');
    if (!wrapper) {
        console.error('Shortcuts wrapper not found');
        return;
    }

    // Teljes újraépítés - lásd a fenti MEGJEGYZÉS-t
    wrapper.innerHTML = '';
    wrapper.className = `shortcuts-wrapper ${isEditMode ? 'edit-mode' : ''}`;

    shortcutsConfig.containers.forEach((container, containerIndex) => {
        const containerEl = document.createElement('div');
        containerEl.className = `shortcuts-container glass-card ${isEditMode ? 'editable' : ''}`;
        containerEl.id = container.id;
        // Két CSS változó ugyanabból az értékből: az egyik a flex-basis-t
        // (%-os szélesség), a másik a flex-grow arányt adja meg
        containerEl.style.setProperty('--container-width', container.width + '%');
        containerEl.style.setProperty('--container-grow', container.width);

        containerEl.dataset.containerId = container.id;
        containerEl.draggable = isEditMode; // csak szerkesztéskor mozgatható

        // Konténer-vezérlők wrapper-je (jobb alsó sarok)
        const controlsWrapper = document.createElement('div');
        controlsWrapper.className = 'container-controls';

        // Konténer törlése gomb (csak ha 1-nél több konténer van, és szerkesztő módban)
        if (isEditMode && shortcutsConfig.containers.length > 1) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-container-btn';
            deleteBtn.draggable = false;
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'Delete container';
            deleteBtn.addEventListener('click', () => deleteContainer(container.id));
            controlsWrapper.appendChild(deleteBtn);
        }

        // Shortcut-rács (a tényleges csempék konténere)
        const shortcutsGrid = document.createElement('div');
        shortcutsGrid.className = 'shortcuts-grid';

        container.shortcuts.forEach((shortcut, index) => {
            const shortcutEl = createShortcutElement(shortcut, index, container.id);
            shortcutsGrid.appendChild(shortcutEl);
        });

        containerEl.appendChild(shortcutsGrid);

        // "Shortcut hozzáadása" gomb
        const addBtn = document.createElement('button');
        addBtn.className = 'add-shortcut-to-container';
        addBtn.draggable = false;
        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addBtn.title = 'Add shortcut';
        addBtn.dataset.containerId = container.id;
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // különben a "kattintás kívülre" egyből bezárná a formot
            toggleAddFormForContainer(container.id, addBtn);
        });
        controlsWrapper.appendChild(addBtn);
        containerEl.appendChild(controlsWrapper);

        // Átméretező fogantyú (csak szerkesztő módban)
        if (isEditMode) {
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.draggable = false;
            resizeHandle.innerHTML = '<i class="fas fa-grip-lines-vertical"></i>';
            resizeHandle.addEventListener('mousedown', (e) => startResize(e, container.id));
            containerEl.appendChild(resizeHandle);
        }

        wrapper.appendChild(containerEl);

        // Drag & drop bekötése az EBBEN a konténerben lévő shortcut-okhoz
        //? Fontos, hogy a DOM-ba illesztés UTÁN hívjuk: a függvény
        //? querySelector-ral keresi meg a rácsot és a csempéket
        setupShortcutDragDrop(containerEl);
    });

    // "Add Container" gomb hozzáadása a végére (csak szerkesztő módban)
    if (isEditMode) {
        const addContainerBtn = document.createElement('button');
        addContainerBtn.className = 'add-container-btn glass-card';
        addContainerBtn.innerHTML = '<i class="fas fa-plus"></i><span>Add Container</span>';
        addContainerBtn.addEventListener('click', addNewContainer);
        wrapper.appendChild(addContainerBtn);

        // Konténerek átrendezése — ugyanaz az élő-előnézetes drag
        // mechanika, mint a shortcut-oknál, csak szerkesztéskor van bekötve.
        setupContainerDragDrop(wrapper);
    }
}

/*
    CÉL: Egyetlen shortcut DOM elemének felépítése (ikon + link + név,
    szerkesztő módban törlés gombbal is)
    BE:
     - shortcut: { name, url }
     - index: pozíciója a saját konténerén belül
     - containerId: melyik konténerhez tartozik
    KI: a felépített .shortcut elem
*/
function createShortcutElement(shortcut, index, containerId) {
    const shortcutEl = document.createElement('div');
    shortcutEl.className = 'shortcut';
    shortcutEl.setAttribute('draggable', 'true');

    // A dataset MINDIG stringet tárol, ezért a kifejezett toString()
    shortcutEl.dataset.index = index.toString();
    shortcutEl.dataset.containerId = containerId;
    shortcutEl.__shortcut = shortcut; // stabil visszahivatkozás az adatobjektumra, túléli az élő drag-átrendezést is

    const linkElement = document.createElement('a');
    linkElement.href = shortcut.url;

    // Az ikon feloldása (cache -> favicon -> aggregátor -> avatar) az icons.js dolga
    const imgElement = document.createElement('img');
    imgElement.alt = shortcut.name;
    applyIcon(imgElement, shortcut.url, shortcut.name);
    linkElement.appendChild(imgElement);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'shortcut-name';
    nameSpan.textContent = shortcut.name;

    shortcutEl.appendChild(linkElement);
    shortcutEl.appendChild(nameSpan);

    if (isEditMode) {
        // Szerkesztő módban a kattintás NEM navigál, hanem megnyitja a szerkesztő popovert
        linkElement.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openEditShortcutPopover(shortcut, containerId, index, e);
        });

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-shortcut-btn';
        deleteButton.textContent = '×';
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation(); // ne nyissa meg mellette a szerkesztő popovert is
            deleteShortcut(containerId, index);
        });
        shortcutEl.appendChild(deleteButton);
    }

    return shortcutEl;
}

//! ---------- SHORTCUT DRAG & DROP ----------

/*
    CÉL: Egy adott konténer shortcut-jaihoz tartozó drag & drop bekötése
    BE: containerEl - a konténer DOM eleme
    LOGIKA (élő előnézet):
     - Ahogy a húzott elem elhalad egy másik csempe (vagy az üres rács-
       terület) felett, azonnal, TÉNYLEGESEN átmozgatjuk a DOM-ban, így a
       rács mindig pontosan azt mutatja, amit az adott pillanatban való
       elengedés eredményezne
     - A mögöttes konfiguráció csak a drop VÉGÉN épül újra (az élő DOM-
       sorrendből); egy megszakított húzás egyszerűen visszarajzol a
       még érintetlen mentett konfigurációból
*/
function setupShortcutDragDrop(containerEl) {
    const shortcutsGrid = containerEl.querySelector('.shortcuts-grid');

    containerEl.querySelectorAll('.shortcut').forEach((shortcutEl) => {
        shortcutEl.addEventListener('dragstart', (e) => {
            draggingShortcut = shortcutEl;
            dropWasHandled = false; // amíg nem bizonyítjuk az ellenkezőjét
            shortcutEl.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';

            // A setData() nélkül egyes böngészők el sem indítanák a húzást,
            // magát az értéket viszont nem használjuk (a draggingShortcut elég)
            e.dataTransfer.setData('text/plain', shortcutEl.__shortcut?.name || '');

            createDragGhost(shortcutEl);

            // 1x1 pixeles átlátszó GIF -> a böngésző natív "húzás" képe
            // helyett a saját dragGhost elemünk látszik
            const emptyImg = new Image();
            emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            e.dataTransfer.setDragImage(emptyImg, 0, 0);
        });

        // A ghost mozgatása az egérrel. Az e.pageX > 0 szűrő az utolsó,
        // (0,0) koordinátás drag eseményt zárja ki, ami elengedéskor jön
        shortcutEl.addEventListener('drag', (e) => {
            if (dragGhost && e.pageX > 0) {
                dragGhost.style.left = e.pageX + 10 + 'px';
                dragGhost.style.top = e.pageY + 10 + 'px';
            }
        });

        shortcutEl.addEventListener('dragend', () => {
            shortcutEl.classList.remove('dragging');
            removeDragGhost();
            document.querySelectorAll('.shortcuts-container').forEach(c => {
                c.classList.remove('drag-over');
            });

            if (!dropWasHandled) {
                // Érvényes célponton kívül engedte el -> az élő előnézet visszaugrik
                renderShortcuts();
            }
            draggingShortcut = null;
        });

        shortcutEl.addEventListener('dragover', (e) => {
            e.preventDefault(); // enélkül nem lenne érvényes ejtési célpont
            e.dataTransfer.dropEffect = 'move';

            // Önmaga fölött nincs mit átrendezni
            if (!draggingShortcut || draggingShortcut === shortcutEl) return;

            // Az elem melyik felén (bal/jobb) van a kurzor -> elé vagy mögé kerüljön
            const box = shortcutEl.getBoundingClientRect();
            const isAfter = e.clientX - box.left > box.width / 2;

            // A nextSibling lehet null -> az insertBefore ilyenkor a végére szúr
            const target = isAfter ? shortcutEl.nextSibling : shortcutEl;

            // A második feltétel a felesleges DOM-mozgatást előzi meg:
            // ha már pontosan ott van, ahova tennénk, hagyjuk békén
            if (target !== draggingShortcut && draggingShortcut.nextSibling !== target) {
                shortcutEl.parentNode.insertBefore(draggingShortcut, target);
            }
        });

        shortcutEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            finalizeShortcutDrop();
        });
    });

    // Elengedés üres területen (üres konténer, vagy az utolsó shortcut mögött)
    shortcutsGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        containerEl.classList.add('drag-over');

        // Az e.target === shortcutsGrid feltétel kulcsfontosságú: csak akkor
        // tesszük a végére, ha tényleg a RÁCS üres részén vagyunk, és nem
        // egy csempe fölött (arról a fenti kezelő gondoskodik)
        if (draggingShortcut && e.target === shortcutsGrid && shortcutsGrid.lastElementChild !== draggingShortcut) {
            shortcutsGrid.appendChild(draggingShortcut);
        }
    });

    shortcutsGrid.addEventListener('dragleave', (e) => {
        // A relatedTarget az az elem, AHOVA átléptünk. Ha az még mindig a
        // rácson belül van, akkor csak gyerekelemek között mozogtunk -
        // ilyenkor nem szabad levenni a kiemelést
        if (!shortcutsGrid.contains(e.relatedTarget)) {
            containerEl.classList.remove('drag-over');
        }
    });

    shortcutsGrid.addEventListener('drop', (e) => {
        e.preventDefault();
        containerEl.classList.remove('drag-over');
        finalizeShortcutDrop();
    });
}

/*
    CÉL: A shortcut-húzás lezárása: az élő DOM-sorrend visszaírása az
    adatmodellbe, majd mentés és újrarajzolás
    MEGJEGYZÉS:
     - A DOM-sorrend MÁR pontosan az, amit a felhasználó az előnézetben
       látott -> konténerenként egyszerűen csak visszaolvassuk
*/
function finalizeShortcutDrop() {
    if (!draggingShortcut) return;
    dropWasHandled = true;
    removeDragGhost();

    // MINDEN konténert újraolvasunk, nem csak a forrást és a célt: egy
    // húzás során az elem konténerek között is vándorolhatott
    shortcutsConfig.containers.forEach(container => {
        const containerEl = document.getElementById(container.id);
        if (!containerEl) return;

        container.shortcuts = Array.from(containerEl.querySelectorAll('.shortcut'))
            .map(el => el.__shortcut)  // a DOM elemre akasztott adatobjektum
            .filter(Boolean);          // a biztonság kedvéért kiszűrjük a hiányzókat
    });

    saveConfig();
    renderShortcuts();
}

//! ---------- KONTÉNER DRAG & DROP (átrendezés) ----------

/*
    CÉL: A konténerek (mint egész kártyák) átrendezésének bekötése
    BE: wrapper - a #shortcuts-wrapper elem
    MEGJEGYZÉS:
     - Ugyanaz az élő-előnézetes mechanika, mint a shortcut drag &
       drop-nál: a húzott kártya ténylegesen átmozog a DOM-ban, ahogy
       elhalad egy szomszédja felett, így a wrapper mindig pontosan
       azt mutatja, amit az adott pillanatban való elengedés eredményezne
*/
function setupContainerDragDrop(wrapper) {
    // A :scope > azt jelenti, hogy CSAK a wrapper közvetlen gyerekeit
    // nézzük - egy esetleges beágyazott konténer nem kerülne bele
    wrapper.querySelectorAll(':scope > .shortcuts-container').forEach((containerEl) => {
        containerEl.addEventListener('dragstart', (e) => {
            // Ha a húzás egy belső shortcut-ról/vezérlőről buborékolt fel,
            // azt itt figyelmen kívül hagyjuk — konténert csak a kártyán
            // magán elindított húzás rendez át.
            if (e.target !== containerEl) return;

            draggingContainer = containerEl;
            containerDropWasHandled = false;
            containerEl.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', containerEl.dataset.containerId || '');

            createDragGhost(containerEl);

            const emptyImg = new Image();
            emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            e.dataTransfer.setDragImage(emptyImg, 0, 0);
        });

        containerEl.addEventListener('drag', (e) => {
            if (dragGhost && e.pageX > 0) {
                dragGhost.style.left = e.pageX + 10 + 'px';
                dragGhost.style.top = e.pageY + 10 + 'px';
            }
        });

        containerEl.addEventListener('dragend', () => {
            containerEl.classList.remove('dragging');
            removeDragGhost();

            if (!containerDropWasHandled) {
                // Érvényes célponton kívül engedte el -> az élő előnézet visszaugrik
                renderShortcuts();
            }
            draggingContainer = null;
        });

        containerEl.addEventListener('dragover', (e) => {
            if (!draggingContainer) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            if (draggingContainer === containerEl) return;

            // Ugyanaz a "melyik felén vagyunk" logika, mint a shortcut-oknál
            const box = containerEl.getBoundingClientRect();
            const isAfter = e.clientX - box.left > box.width / 2;
            const target = isAfter ? containerEl.nextSibling : containerEl;

            if (target !== draggingContainer && draggingContainer.nextSibling !== target) {
                wrapper.insertBefore(draggingContainer, target);
            }
        });

        containerEl.addEventListener('drop', (e) => {
            if (!draggingContainer) return;
            e.preventDefault();
            e.stopPropagation();
            finalizeContainerDrop(wrapper);
        });
    });

    wrapper.addEventListener('drop', (e) => {
        if (!draggingContainer) return;
        e.preventDefault();
        finalizeContainerDrop(wrapper);
    });
}

/*
    CÉL: A konténer-húzás lezárása: az élő DOM-sorrend visszaírása
    (containers tömb újrarendezése), majd mentés és újrarajzolás
*/
function finalizeContainerDrop(wrapper) {
    if (!draggingContainer) return;
    containerDropWasHandled = true;
    removeDragGhost();

    // A DOM-sorrend már pontosan az, amit a felhasználó az előnézetben látott
    const orderedIds = Array.from(wrapper.querySelectorAll(':scope > .shortcuts-container'))
        .map(el => el.dataset.containerId);

    // A containers tömböt a DOM-beli sorrend szerint rendezzük: minden
    // elem "kulcsa" az, hányadik helyen áll az orderedIds listában
    shortcutsConfig.containers.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));

    saveConfig();
    renderShortcuts();
}

//! ---------- HÚZÁS KÖZBENI "SZELLEM" (GHOST) ELŐNÉZET ----------

/*
    CÉL: A húzott elem egy lebegő másolatának ("ghost") létrehozása,
    ami az egérmutatót követi húzás közben
     - A törlés/hozzáadás/átméretező gombokat eltávolítja a másolatból
       (ne legyenek rajta kattintható vezérlők)
*/
function createDragGhost(element) {
    removeDragGhost(); // ha valamiért maradt egy korábbi, azt előbb takarítsuk el

    // A true paraméter = mély másolat, a gyerekelemekkel együtt
    dragGhost = element.cloneNode(true);

    dragGhost.style.position = 'fixed';
    dragGhost.style.pointerEvents = 'none'; // ne fogja el az egéreseményeket az alatta lévő elemektől
    dragGhost.style.zIndex = '10000';       // mindenki fölött
    dragGhost.style.opacity = '0.6';
    dragGhost.style.transform = 'scale(0.9)';
    dragGhost.style.transition = 'none';    // az egeret késleltetés nélkül kövesse

    dragGhost.querySelectorAll('.delete-shortcut-btn, .delete-container-btn, .add-shortcut-to-container, .resize-handle')
        .forEach(el => el.remove());

    document.body.appendChild(dragGhost);
}

// CÉL: A ghost-előnézet eltávolítása, ha épp létezik
function removeDragGhost() {
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
}

//! ---------- KONTÉNER ÁTMÉRETEZÉSE ----------

/*
    CÉL: Átméretezés indítása (a fogantyún mousedown-ra)
    BE:
     - e: a mousedown esemény
     - containerId: melyik konténert méretezzük
    MEGJEGYZÉS:
     - A 110px-es minimum-szélesség csak MOST, aktív fogantyú-húzáskor
       kerül rá a konténerre — így önmagában a szerkesztő módba lépés
       sosem méretez át semmit
*/
function startResize(e, containerId) {
    e.preventDefault();
    e.stopPropagation(); // nehogy húzásnak (drag) értelmezze a böngésző

    isResizing = true;
    resizingContainerId = containerId;
    startX = e.clientX; // ehhez képest mérjük majd az elmozdulást

    const container = shortcutsConfig.containers.find(c => c.id === containerId);
    startWidth = container ? container.width : 100;

    const containerEl = document.getElementById(containerId);
    if (containerEl) containerEl.style.minWidth = '110px';

    // A figyelők a DOKUMENTUMRA kerülnek, nem a fogantyúra: így akkor
    // sem szakad meg a húzás, ha az egér lecsúszik a fogantyúról
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);

    document.body.style.cursor = 'col-resize';  // a kurzor végig "átméretezős" maradjon
    document.body.style.userSelect = 'none';    // húzás közben ne jelöljön ki szöveget
}

/*
    CÉL: Az egér mozgása közben a konténer szélességének élő frissítése
    LOGIKA:
     - Az egér elmozdulásából (deltaX) %-os szélességváltozást számol
     - Előbb 10-100% közé szorítja (clamp), utána egy gyenge "mágneses"
       húzást alkalmaz a gyakori törtrészek (1/4, 1/3, 1/2, stb.) felé
       — a húzás csak a hozzájuk MÁR közeli értékeket mozdítja rájuk,
       így az érték egyébként 1:1 arányban követi az egeret, nem
       ugrál távoli rácspontok között
*/
function handleResize(e) {
    if (!isResizing || !resizingContainerId) return;

    const wrapper = document.getElementById('shortcuts-wrapper');
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();

    // A pixelben mért elmozdulást a wrapper szélességéhez viszonyítva
    // váltjuk át százalékra - így minden képernyőméreten ugyanúgy viselkedik
    const deltaX = e.clientX - startX;
    const deltaPercent = (deltaX / wrapperRect.width) * 100;

    let newWidth = startWidth + deltaPercent;

    // Előbb a határok közé szorítás (clamp): 10% és 100% között
    newWidth = Math.max(10, Math.min(100, newWidth));

    //? "Mágneses" igazodás a gyakori törtrészekhez
    const snapPoints = [25, 33.33, 50, 66.67, 75, 100]; // 1/4, 1/3, 1/2, 2/3, 3/4, egész
    const snapThreshold = 1.5; // csak ennél közelebbről ugrik rá

    // A legközelebbi rácspont megkeresése
    let closest = null;
    let closestDist = Infinity;
    for (const snap of snapPoints) {
        const dist = Math.abs(newWidth - snap);
        if (dist < closestDist) {
            closest = snap;
            closestDist = dist;
        }
    }

    // ...és rá is ugrunk, DE csak ha tényleg közel van (lásd a fenti LOGIKA-t)
    if (closest !== null && closestDist < snapThreshold) {
        newWidth = closest;
    }

    // Csak a DOM-ot és a memóriabeli értéket frissítjük - a mentés a
    // húzás VÉGÉN, egyszer történik (lásd stopResize)
    const container = shortcutsConfig.containers.find(c => c.id === resizingContainerId);
    if (container) {
        container.width = Math.round(newWidth); // egész százalékokat tárolunk
        const containerEl = document.getElementById(resizingContainerId);
        if (containerEl) {
            containerEl.style.setProperty('--container-width', container.width + '%');
            containerEl.style.setProperty('--container-grow', container.width);
        }
    }
}

// CÉL: Átméretezés lezárása (mouseup-ra): mentés, majd a globális listenerek levétele
function stopResize() {
    // Csak akkor mentünk, ha tényleg volt átméretezés (ez a kezelő
    // minden mouseup-ra lefuthat, amíg fel van iratkozva)
    if (isResizing) {
        saveConfig();
    }

    isResizing = false;
    resizingContainerId = null;

    // FONTOS: a globális figyelők levétele, különben minden átméretezés
    // után egy újabb réteg maradna a dokumentumon
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);

    // Üres string = "vissza a stíluslapból jövő értékre"
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
}

//! ---------- KONTÉNEREK KEZELÉSE ----------

// CÉL: Új, üres konténer felvétele fél szélességgel
function addNewContainer() {
    const newContainer = {
        id: generateContainerId(),
        name: 'New Container',
        width: 50, // fél szélességgel induljon
        shortcuts: []
    };

    shortcutsConfig.containers.push(newContainer);
    saveConfig();
    renderShortcuts();
}

/*
    CÉL: Egy konténer törlése (megerősítés után), a benne lévő
    összes shortcut-tal együtt
     - Az utolsó konténer nem törölhető
*/
function deleteContainer(containerId) {
    // Elvileg ide nem is jutunk el (a törlés gomb meg sem jelenik az
    // utolsón), de a biztonság kedvéért itt is ellenőrizzük
    if (shortcutsConfig.containers.length <= 1) {
        alert('Cannot delete the last container');
        return;
    }

    if (confirm('Delete this container and all its shortcuts?')) {
        shortcutsConfig.containers = shortcutsConfig.containers.filter(c => c.id !== containerId);
        saveConfig();
        renderShortcuts();
    }
}

//! ---------- "SHORTCUT HOZZÁADÁSA" FORM ----------

/*
    CÉL: A hozzáadás-form megnyitása/zárása egy adott konténerhez
    BE:
     - containerId: melyik konténerhez nyíljon a form
     - buttonEl: a rá kattintott "+" gomb (erre kerül az "active" osztály)
    LOGIKA:
     - Ha ugyanannak a konténernek a gombjára kattintottak, és a form
       már nyitva van -> csak bezárja
     - Egyébként előbb minden nyitott állapotot bezár, majd megnyitja
       EZ a konténer számára
*/
function toggleAddFormForContainer(containerId, buttonEl) {
    const addForm = domElements.shortcuts.addForm;
    if (!addForm) return;

    // Ugyanarra a "+"-ra kattintott másodszor -> kapcsoljuk ki
    if (isAddMode && activeContainerId === containerId) {
        closeAddForm();
        return;
    }

    // Egy MÁSIK konténer gombja: előbb a régit zárjuk be rendesen
    closeAddForm();

    activeContainerId = containerId;
    isAddMode = true;
    addForm.style.display = 'flex';

    buttonEl.classList.add('active'); // "+" -> "×" elforgatás (CSS-ben)

    // Egyből lehessen gépelni, ne kelljen a mezőbe kattintani
    if (domElements.shortcuts.newName) {
        domElements.shortcuts.newName.focus();
    }
}

// CÉL: A hozzáadás-form bezárása, és minden "+" gomb visszaállítása alap állapotba
function closeAddForm() {
    const addForm = domElements.shortcuts.addForm;
    if (addForm) {
        addForm.style.display = 'none';
    }

    // Mindegyikről levesszük, nem csak az aktívról: így egy elcsúszott
    // állapot (két "×"-re forgatott gomb) magától helyreáll
    document.querySelectorAll('.add-shortcut-to-container').forEach(btn => {
        btn.classList.remove('active');
    });

    activeContainerId = null;
    isAddMode = false;
}

//! ---------- SHORTCUT SZERKESZTŐ POPOVER ----------

/*
    CÉL: A szerkesztő popover létrehozása (csak első hívásra), vagy a
    már meglévő visszaadása
     - A kattintott ikon melletti helyen nyílik meg, helyben engedve
       átnevezni / URL-t cserélni, elnavigálás nélkül
*/
function getEditPopover() {
    if (editPopoverEl) return editPopoverEl;

    editPopoverEl = document.createElement('div');
    editPopoverEl.className = 'edit-shortcut-popover glass-card';
    editPopoverEl.innerHTML = `
        <input type="text" class="edit-shortcut-name" placeholder="New name">
        <input type="text" class="edit-shortcut-url" placeholder="New address">
        <div class="edit-shortcut-actions">
            <button type="button" class="edit-shortcut-cancel action-btn">Cancel</button>
            <button type="button" class="edit-shortcut-save">Save</button>
        </div>
    `;
    document.body.appendChild(editPopoverEl);

    // A popoveren belüli kattintás ne jusson el a "kattintás kívülre"
    // kezelőhöz (lásd setupClickOutsideListener)
    editPopoverEl.addEventListener('click', (e) => e.stopPropagation());
    editPopoverEl.querySelector('.edit-shortcut-save').addEventListener('click', saveEditShortcutPopover);
    editPopoverEl.querySelector('.edit-shortcut-cancel').addEventListener('click', closeEditShortcutPopover);
    editPopoverEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEditShortcutPopover();
        } else if (e.key === 'Escape') {
            closeEditShortcutPopover();
        }
    });

    return editPopoverEl;
}

/*
    CÉL: A szerkesztő popover pozicionálása a kattintás helyéhez, a
    képernyő szélein túllógás elkerülésével
    BE:
     - popover: a popover DOM eleme
     - clickEvent: a kattintás esemény (ebből jön a kezdő pozíció)
*/
function positionEditPopover(popover, clickEvent) {
    const margin = 12; // ennyi hely maradjon a képernyő széléig
    const left = clickEvent.clientX;
    const top = clickEvent.clientY;

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    // Csak azután tudjuk lemérni a tényleges méretét, hogy kirajzolódott
    requestAnimationFrame(() => {
        const rect = popover.getBoundingClientRect();
        let adjustedLeft = left;
        let adjustedTop = top;

        // Ha kilóg, pontosan annyival toljuk vissza, amennyivel kilógott
        const overflowRight = rect.right - (window.innerWidth - margin);
        if (overflowRight > 0) adjustedLeft -= overflowRight;

        const overflowBottom = rect.bottom - (window.innerHeight - margin);
        if (overflowBottom > 0) adjustedTop -= overflowBottom;

        // A Math.max a bal/felső szélen való kilógást zárja ki
        popover.style.left = `${Math.max(margin, adjustedLeft)}px`;
        popover.style.top = `${Math.max(margin, adjustedTop)}px`;
    });
}

/*
    CÉL: A szerkesztő popover megnyitása egy adott shortcut-hoz,
    a mezők előre feltöltésével
    BE: shortcut, containerId, index - melyik shortcut-ot szerkesztjük
        clickEvent - a pozicionáláshoz
*/
function openEditShortcutPopover(shortcut, containerId, index, clickEvent) {
    const popover = getEditPopover();
    editingShortcut = { containerId, index };

    popover.querySelector('.edit-shortcut-name').value = shortcut.name;
    popover.querySelector('.edit-shortcut-url').value = shortcut.url;

    popover.classList.add('open');          // előbb láthatóvá tesszük...
    positionEditPopover(popover, clickEvent); // ...hogy meg lehessen mérni
    popover.querySelector('.edit-shortcut-name').focus();
}

// CÉL: A szerkesztő popover bezárása, szerkesztett shortcut jelző törlése
function closeEditShortcutPopover() {
    if (editPopoverEl) {
        editPopoverEl.classList.remove('open');
    }
    editingShortcut = null;
}

/*
    CÉL: A popoverben szerkesztett név/URL mentése a shortcut-ra
     - Validálja mindkét mezőt (kötelező), a hiányzó "https://"-t pótolja
     - Érvénytelen URL esetén hibaüzenetet ad és nem menti
*/
function saveEditShortcutPopover() {
    if (!editingShortcut) return; // nincs mit menteni

    const popover = getEditPopover();
    const name = popover.querySelector('.edit-shortcut-name').value.trim();
    let url = popover.querySelector('.edit-shortcut-url').value.trim();

    if (!name || !url) {
        alert('Please enter both a name and URL');
        return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    try {
        new URL(url);
    } catch {
        alert('Please enter a valid URL (e.g., https://example.com)');
        return;
    }

    // A dupla ellenőrzés azért kell, mert a popover nyitva léte alatt
    // elvileg megváltozhatott alatta a konfiguráció
    const container = shortcutsConfig.containers.find(c => c.id === editingShortcut.containerId);
    if (container && container.shortcuts[editingShortcut.index]) {
        container.shortcuts[editingShortcut.index] = { name, url };
        saveConfig();
    }

    closeEditShortcutPopover();
    renderShortcuts();
}

//! ---------- MENTÉS / BETÖLTÉS / MIGRÁCIÓ ----------

// CÉL: A shortcutsConfig kimentése localStorage-ba
function saveConfig() {
    localStorage.setItem('shortcutsConfig', JSON.stringify(shortcutsConfig));
}

/*
    CÉL: Régi (konténer nélküli) konfigurációs formátum átalakítása
    az új, konténeres formátumra
    BE: oldConfig - a localStorage-ból beolvasott, nyers objektum
    KI: mindig "containers"-t tartalmazó objektum
*/
function migrateOldConfig(oldConfig) {
    if (oldConfig.containers) {
        return oldConfig; // már az új formátum, nincs teendő
    }

    // Régi formátum: { shortcuts: [...] }
    return {
        containers: [
            {
                id: 'container-1',
                name: 'Shortcuts',
                width: 100,
                shortcuts: oldConfig.shortcuts || []
            }
        ]
    };
}

/*
    CÉL: A shortcut-konfiguráció betöltése localStorage-ból (induláskor)
     - Hiba/hiányzó adat esetén visszaáll az alapértelmezett konfigurációra
     - A végén mindig kirajzol
*/
export function loadShortcuts() {
    const storedConfig = localStorage.getItem('shortcutsConfig');
    if (storedConfig) {
        try {
            const parsed = JSON.parse(storedConfig);
            shortcutsConfig = migrateOldConfig(parsed);
            saveConfig(); // migrált konfiguráció visszamentése
        } catch (error) {
            // Sérült JSON -> inkább a gyári lista, mint egy üres oldal
            console.error('Error parsing stored shortcutsConfig:', error);
            setDefaultConfig();
        }
    } else {
        setDefaultConfig(); // első indítás
    }

    renderShortcuts();
}

// CÉL: Gyári alapértelmezett shortcut-lista beállítása és mentése
function setDefaultConfig() {
    shortcutsConfig = {
        containers: [
            {
                id: 'container-1',
                name: 'Shortcuts',
                width: 100,
                shortcuts: [
                    { name: "YouTube", url: "https://www.youtube.com/" },
                    { name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
                    { name: "Drive", url: "https://drive.google.com/drive/starred" },
                    { name: "Facebook", url: "https://www.facebook.com/" },
                    { name: "Netflix", url: "https://www.netflix.com/browse" },
                    { name: "Soundcloud", url: "https://soundcloud.com/you/likes" }
                ]
            }
        ]
    };
    saveConfig();
}

//! ---------- SHORTCUT HOZZÁADÁSA / TÖRLÉSE ----------

/*
    CÉL: Új shortcut felvétele a "hozzáadás" form mezői alapján
     - Validálja mindkét mezőt, pótolja a hiányzó "https://"-t
     - A célkonténer: activeContainerId, vagy ha az nincs, az első konténer
*/
export function addShortcut() {
    const name = domElements.shortcuts.newName?.value.trim();
    let url = domElements.shortcuts.newUrl?.value.trim();

    if (!name || !url) {
        alert('Please enter both a name and URL');
        return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    try {
        new URL(url);
    } catch {
        alert('Please enter a valid URL (e.g., https://example.com)');
        return;
    }

    // Célkonténer megkeresése, vagy az első konténer használata
    //? Az activeContainerId akkor null, ha a formot nem egy konkrét
    //? konténer "+" gombjával nyitották meg
    let targetContainer = shortcutsConfig.containers.find(c => c.id === activeContainerId);
    if (!targetContainer && shortcutsConfig.containers.length > 0) {
        targetContainer = shortcutsConfig.containers[0];
    }

    if (targetContainer) {
        targetContainer.shortcuts.push({ name, url });
        saveConfig();
    }

    // Mezők ürítése, hogy a következő hozzáadás tiszta lappal induljon
    if (domElements.shortcuts.newName && domElements.shortcuts.newUrl) {
        domElements.shortcuts.newName.value = '';
        domElements.shortcuts.newUrl.value = '';
    }

    closeAddForm();
    renderShortcuts();
}

// CÉL: Egy shortcut törlése a saját konténeréből, index alapján
export function deleteShortcut(containerId, index) {
    const container = shortcutsConfig.containers.find(c => c.id === containerId);

    // Határellenőrzés: egy elavult indexszel érkező hívás ne csináljon kárt
    if (!container || index < 0 || index >= container.shortcuts.length) {
        console.error('Invalid delete parameters');
        return;
    }

    container.shortcuts.splice(index, 1);
    saveConfig();
    renderShortcuts();
}

//! ---------- MÓDVÁLTÁS / BILLENTYŰZET ----------

/*
    CÉL: Szerkesztő mód be/kikapcsolása
     - Bezárja az esetlegesen nyitott szerkesztő popovert
     - Frissíti az Edit gomb feliratát ("Edit"/"Done"), illetve az
       Import/Export gombok láthatóságát (csak szerkesztéskor látszanak)
*/
export function toggleEditMode() {
    isEditMode = !isEditMode;
    closeEditShortcutPopover(); // egy nyitva maradt popover zavaró lenne

    // Ugyanaz a gomb szolgál a be- és kikapcsolásra, csak a felirata változik
    if (domElements.buttons.edit) {
        domElements.buttons.edit.textContent = isEditMode ? 'Done' : 'Edit';
    }

    // Az Import/Export csak szerkesztő módban látszik. Az üres string
    // (nem a 'block') azért jó, mert visszaadja a CSS-beli alapértéket
    if (domElements.buttons.import) {
        domElements.buttons.import.style.display = isEditMode ? '' : 'none';
    }
    if (domElements.buttons.export) {
        domElements.buttons.export.style.display = isEditMode ? '' : 'none';
    }

    renderShortcuts(); // más mód = más gombok -> teljes újrarajzolás
}

// CÉL: Ha épp nyitva van a hozzáadás-form, bezárja
export function toggleAddMode() {
    if (isAddMode) {
        closeAddForm();
    }
}

/*
    CÉL: Enter/Escape kezelése a "hozzáadás" form név/URL mezőiben
     - Ha mindkét mező ki van töltve -> Enterre hozzáadja a shortcut-ot
     - Ha csak az egyik van kitöltve -> Enterre a másik mezőre ugrik
     - Escape -> form bezárása
*/
export function handleAddShortcutKeyPress(e) {
    if (e.key === 'Enter') {
        const name = domElements.shortcuts.newName?.value.trim();
        const url = domElements.shortcuts.newUrl?.value.trim();

        if (name && url) {
            addShortcut(); // minden megvan -> mehet
        } else if (name && !url && e.target === domElements.shortcuts.newName) {
            domElements.shortcuts.newUrl?.focus();  // a névből az URL-re ugrunk
        } else if (!name && url && e.target === domElements.shortcuts.newUrl) {
            domElements.shortcuts.newName?.focus(); // és fordítva
        }
    } else if (e.key === 'Escape') {
        closeAddForm();
    }
}

/*
    CÉL: Globális "kattintás/Escape kívülre" figyelők bekötése
     - Szerkesztő popover kívülre kattintásra / Escape-re záródik
     - "Hozzáadás" form kívülre kattintásra záródik (kivéve, ha épp
       egy "+" gombra kattintottak, ami újranyitná)
*/
export function setupClickOutsideListener() {
    document.addEventListener('click', (e) => {

        //? Szerkesztő popover
        if (editingShortcut && editPopoverEl && !editPopoverEl.contains(e.target)) {
            closeEditShortcutPopover();
        }

        //? "Hozzáadás" form - csak ha egyáltalán nyitva van
        if (!isAddMode) return;

        const addForm = domElements.shortcuts.addForm;
        const clickedAddBtn = e.target.closest('.add-shortcut-to-container');

        // Ha a form-on kívülre kattintott, és nem egy "+" gombra -> zárás
        if (addForm && !addForm.contains(e.target) && !clickedAddBtn) {
            closeAddForm();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editingShortcut) {
            closeEditShortcutPopover();
        }
    });
}

//! ---------- KONFIGURÁCIÓ EXPORT/IMPORT (main.js számára) ----------

// CÉL: A jelenlegi teljes konfiguráció visszaadása (main.js Export All-jához)
export function getShortcutsConfig() {
    // Itt SZÁNDÉKOSAN nincs másolás: a hívó (main.js) csak kiolvassa és
    // JSON-ba írja, nem módosítja
    return shortcutsConfig;
}

// CÉL: Konfiguráció beállítása kívülről (main.js Import All-jához), mentéssel és újrarajzolással
export function setShortcutsConfig(config) {
    // A migráción keresztül megy, hogy egy régi formátumú mentésfájlt
    // is be lehessen importálni
    shortcutsConfig = migrateOldConfig(config);
    saveConfig();
    renderShortcuts();
}
