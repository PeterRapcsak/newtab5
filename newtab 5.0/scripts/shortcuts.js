import { domElements } from './dom.js';
import { applyIcon } from './icons.js';

// New data structure supporting multiple containers
export let shortcutsConfig = { 
    containers: [
        {
            id: 'container-1',
            name: 'Shortcuts',
            width: 100, // Percentage width (100 = full row, 50 = half, etc.)
            shortcuts: []
        }
    ]
};

export let isEditMode = false;
export let isAddMode = false;
export let activeContainerId = null; // Which container we're adding to
let draggingShortcut = null; // the .shortcut element currently being dragged
let dropWasHandled = false;
let dragGhost = null;

// Container reordering (same live-preview mechanic as shortcut drag & drop)
let draggingContainer = null;
let containerDropWasHandled = false;

// Resize state
let isResizing = false;
let resizingContainerId = null;
let startX = 0;
let startWidth = 0;

// Edit-shortcut popover state
let editPopoverEl = null;
let editingShortcut = null; // { containerId, index }

export function handleShortcutClick(event) {
    if (event.button === 1 || event.ctrlKey || event.metaKey) {
        return true;
    }
    event.preventDefault();
    window.location.href = event.currentTarget.href;
    return false;
}

function generateContainerId() {
    return 'container-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export function renderShortcuts() {
    const wrapper = document.getElementById('shortcuts-wrapper');
    if (!wrapper) {
        console.error('Shortcuts wrapper not found');
        return;
    }
    
    wrapper.innerHTML = '';
    wrapper.className = `shortcuts-wrapper ${isEditMode ? 'edit-mode' : ''}`;
    
    shortcutsConfig.containers.forEach((container, containerIndex) => {
        const containerEl = document.createElement('div');
        containerEl.className = `shortcuts-container glass-card ${isEditMode ? 'editable' : ''}`;
        containerEl.id = container.id;
        containerEl.style.setProperty('--container-width', container.width + '%');
        containerEl.style.setProperty('--container-grow', container.width);
        containerEl.dataset.containerId = container.id;
        containerEl.draggable = isEditMode;

        // Container controls wrapper (bottom right)
        const controlsWrapper = document.createElement('div');
        controlsWrapper.className = 'container-controls';

        // Delete container button (only if more than 1 container and in edit mode)
        if (isEditMode && shortcutsConfig.containers.length > 1) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-container-btn';
            deleteBtn.draggable = false;
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'Delete container';
            deleteBtn.addEventListener('click', () => deleteContainer(container.id));
            controlsWrapper.appendChild(deleteBtn);
        }

        // Shortcuts grid
        const shortcutsGrid = document.createElement('div');
        shortcutsGrid.className = 'shortcuts-grid';

        container.shortcuts.forEach((shortcut, index) => {
            const shortcutEl = createShortcutElement(shortcut, index, container.id);
            shortcutsGrid.appendChild(shortcutEl);
        });

        containerEl.appendChild(shortcutsGrid);

        // Add shortcut button
        const addBtn = document.createElement('button');
        addBtn.className = 'add-shortcut-to-container';
        addBtn.draggable = false;
        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addBtn.title = 'Add shortcut';
        addBtn.dataset.containerId = container.id;
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleAddFormForContainer(container.id, addBtn);
        });
        controlsWrapper.appendChild(addBtn);
        containerEl.appendChild(controlsWrapper);

        // Resize handle (only in edit mode)
        if (isEditMode) {
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.draggable = false;
            resizeHandle.innerHTML = '<i class="fas fa-grip-lines-vertical"></i>';
            resizeHandle.addEventListener('mousedown', (e) => startResize(e, container.id));
            containerEl.appendChild(resizeHandle);
        }

        wrapper.appendChild(containerEl);

        // Setup drag and drop for shortcuts within this container
        setupShortcutDragDrop(containerEl);
    });

    // Add "Add Container" button at the end (only in edit mode)
    if (isEditMode) {
        const addContainerBtn = document.createElement('button');
        addContainerBtn.className = 'add-container-btn glass-card';
        addContainerBtn.innerHTML = '<i class="fas fa-plus"></i><span>Add Container</span>';
        addContainerBtn.addEventListener('click', addNewContainer);
        wrapper.appendChild(addContainerBtn);

        // Container reordering — same live-preview drag mechanic as shortcuts,
        // only wired up while editing.
        setupContainerDragDrop(wrapper);
    }
}

function createShortcutElement(shortcut, index, containerId) {
    const shortcutEl = document.createElement('div');
    shortcutEl.className = 'shortcut';
    shortcutEl.setAttribute('draggable', 'true');
    shortcutEl.dataset.index = index.toString();
    shortcutEl.dataset.containerId = containerId;
    shortcutEl.__shortcut = shortcut; // stable reference back to the data object, survives live drag reordering

    const linkElement = document.createElement('a');
    linkElement.href = shortcut.url;

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
        linkElement.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openEditShortcutPopover(shortcut, containerId, index, e);
        });

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-shortcut-btn';
        deleteButton.textContent = '×';
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteShortcut(containerId, index);
        });
        shortcutEl.appendChild(deleteButton);
    }

    return shortcutEl;
}

// Live-preview drag & drop: as the dragged tile passes over another tile (or
// empty grid space), it is actually moved in the DOM right then, so the grid
// always shows exactly what dropping right now would produce. The underlying
// config is only rebuilt (from the live DOM order) once the drop completes;
// a cancelled drag just re-renders from the untouched saved config instead.
function setupShortcutDragDrop(containerEl) {
    const shortcutsGrid = containerEl.querySelector('.shortcuts-grid');

    containerEl.querySelectorAll('.shortcut').forEach((shortcutEl) => {
        shortcutEl.addEventListener('dragstart', (e) => {
            draggingShortcut = shortcutEl;
            dropWasHandled = false;
            shortcutEl.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', shortcutEl.__shortcut?.name || '');

            createDragGhost(shortcutEl);

            const emptyImg = new Image();
            emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            e.dataTransfer.setDragImage(emptyImg, 0, 0);
        });

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
                // Dropped outside any valid target — snap the live preview back.
                renderShortcuts();
            }
            draggingShortcut = null;
        });

        shortcutEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            if (!draggingShortcut || draggingShortcut === shortcutEl) return;

            const box = shortcutEl.getBoundingClientRect();
            const isAfter = e.clientX - box.left > box.width / 2;
            const target = isAfter ? shortcutEl.nextSibling : shortcutEl;

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

    // Dropping on empty space (empty container, or past the last shortcut)
    shortcutsGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        containerEl.classList.add('drag-over');

        if (draggingShortcut && e.target === shortcutsGrid && shortcutsGrid.lastElementChild !== draggingShortcut) {
            shortcutsGrid.appendChild(draggingShortcut);
        }
    });

    shortcutsGrid.addEventListener('dragleave', (e) => {
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

function finalizeShortcutDrop() {
    if (!draggingShortcut) return;
    dropWasHandled = true;
    removeDragGhost();

    // The DOM order is already the live preview the user was looking at —
    // just read it back into the data model, per container.
    shortcutsConfig.containers.forEach(container => {
        const containerEl = document.getElementById(container.id);
        if (!containerEl) return;
        container.shortcuts = Array.from(containerEl.querySelectorAll('.shortcut'))
            .map(el => el.__shortcut)
            .filter(Boolean);
    });

    saveConfig();
    renderShortcuts();
}

// Container reordering — same live-preview mechanic as shortcut drag & drop:
// the dragged card is actually moved in the DOM as it passes over a sibling,
// so the wrapper always shows exactly what dropping right now would produce.
function setupContainerDragDrop(wrapper) {
    wrapper.querySelectorAll(':scope > .shortcuts-container').forEach((containerEl) => {
        containerEl.addEventListener('dragstart', (e) => {
            // Ignore drags that bubbled up from a shortcut/control inside —
            // only a drag that started on the card itself reorders containers.
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
                // Dropped outside any valid target — snap the live preview back.
                renderShortcuts();
            }
            draggingContainer = null;
        });

        containerEl.addEventListener('dragover', (e) => {
            if (!draggingContainer) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            if (draggingContainer === containerEl) return;

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

function finalizeContainerDrop(wrapper) {
    if (!draggingContainer) return;
    containerDropWasHandled = true;
    removeDragGhost();

    // The DOM order is already the live preview the user was looking at —
    // just read it back into the data model.
    const orderedIds = Array.from(wrapper.querySelectorAll(':scope > .shortcuts-container'))
        .map(el => el.dataset.containerId);

    shortcutsConfig.containers.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));

    saveConfig();
    renderShortcuts();
}

function createDragGhost(element) {
    removeDragGhost();

    dragGhost = element.cloneNode(true);
    dragGhost.style.position = 'fixed';
    dragGhost.style.pointerEvents = 'none';
    dragGhost.style.zIndex = '10000';
    dragGhost.style.opacity = '0.6';
    dragGhost.style.transform = 'scale(0.9)';
    dragGhost.style.transition = 'none';

    dragGhost.querySelectorAll('.delete-shortcut-btn, .delete-container-btn, .add-shortcut-to-container, .resize-handle')
        .forEach(el => el.remove());

    document.body.appendChild(dragGhost);
}

function removeDragGhost() {
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
}

// Resize functionality
function startResize(e, containerId) {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    resizingContainerId = containerId;
    startX = e.clientX;

    const container = shortcutsConfig.containers.find(c => c.id === containerId);
    startWidth = container ? container.width : 100;

    // The 280px floor keeps containers readable in normal browsing; only
    // drop it once the user actively grabs the handle to go smaller, so
    // simply entering edit mode never resizes anything on its own.
    const containerEl = document.getElementById(containerId);
    if (containerEl) containerEl.style.minWidth = '110px';

    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
}

function handleResize(e) {
    if (!isResizing || !resizingContainerId) return;

    const wrapper = document.getElementById('shortcuts-wrapper');
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const deltaX = e.clientX - startX;
    const deltaPercent = (deltaX / wrapperRect.width) * 100;

    let newWidth = startWidth + deltaPercent;

    // Clamp first, then apply a small magnetic pull toward common fractions —
    // the pull only nudges values already close by, so the width otherwise
    // tracks the mouse 1:1 instead of leaping between far-apart grid points.
    newWidth = Math.max(10, Math.min(100, newWidth));

    const snapPoints = [25, 33.33, 50, 66.67, 75, 100];
    const snapThreshold = 1.5;
    let closest = null;
    let closestDist = Infinity;
    for (const snap of snapPoints) {
        const dist = Math.abs(newWidth - snap);
        if (dist < closestDist) {
            closest = snap;
            closestDist = dist;
        }
    }
    if (closest !== null && closestDist < snapThreshold) {
        newWidth = closest;
    }

    const container = shortcutsConfig.containers.find(c => c.id === resizingContainerId);
    if (container) {
        container.width = Math.round(newWidth);
        const containerEl = document.getElementById(resizingContainerId);
        if (containerEl) {
            containerEl.style.setProperty('--container-width', container.width + '%');
            containerEl.style.setProperty('--container-grow', container.width);
        }
    }
}

function stopResize() {
    if (isResizing) {
        saveConfig();
    }
    isResizing = false;
    resizingContainerId = null;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
}

// Container management
function addNewContainer() {
    const newContainer = {
        id: generateContainerId(),
        name: 'New Container',
        width: 50, // Start at half width
        shortcuts: []
    };
    
    shortcutsConfig.containers.push(newContainer);
    saveConfig();
    renderShortcuts();
}

function deleteContainer(containerId) {
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

function toggleAddFormForContainer(containerId, buttonEl) {
    const addForm = domElements.shortcuts.addForm;
    if (!addForm) return;
    
    // If clicking same container's button and form is open, close it
    if (isAddMode && activeContainerId === containerId) {
        closeAddForm();
        return;
    }
    
    // Close any existing open state first
    closeAddForm();
    
    // Open for this container
    activeContainerId = containerId;
    isAddMode = true;
    addForm.style.display = 'flex';
    
    // Rotate the + to X
    buttonEl.classList.add('active');
    
    if (domElements.shortcuts.newName) {
        domElements.shortcuts.newName.focus();
    }
}

function closeAddForm() {
    const addForm = domElements.shortcuts.addForm;
    if (addForm) {
        addForm.style.display = 'none';
    }
    
    // Reset all + buttons
    document.querySelectorAll('.add-shortcut-to-container').forEach(btn => {
        btn.classList.remove('active');
    });
    
    activeContainerId = null;
    isAddMode = false;
}

// Edit-shortcut popover: opens next to the clicked icon, letting the user
// rename it / change its URL in place instead of navigating away.
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

function positionEditPopover(popover, clickEvent) {
    const margin = 12;
    const left = clickEvent.clientX;
    const top = clickEvent.clientY;

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    requestAnimationFrame(() => {
        const rect = popover.getBoundingClientRect();
        let adjustedLeft = left;
        let adjustedTop = top;

        const overflowRight = rect.right - (window.innerWidth - margin);
        if (overflowRight > 0) adjustedLeft -= overflowRight;

        const overflowBottom = rect.bottom - (window.innerHeight - margin);
        if (overflowBottom > 0) adjustedTop -= overflowBottom;

        popover.style.left = `${Math.max(margin, adjustedLeft)}px`;
        popover.style.top = `${Math.max(margin, adjustedTop)}px`;
    });
}

function openEditShortcutPopover(shortcut, containerId, index, clickEvent) {
    const popover = getEditPopover();
    editingShortcut = { containerId, index };

    popover.querySelector('.edit-shortcut-name').value = shortcut.name;
    popover.querySelector('.edit-shortcut-url').value = shortcut.url;

    popover.classList.add('open');
    positionEditPopover(popover, clickEvent);
    popover.querySelector('.edit-shortcut-name').focus();
}

function closeEditShortcutPopover() {
    if (editPopoverEl) {
        editPopoverEl.classList.remove('open');
    }
    editingShortcut = null;
}

function saveEditShortcutPopover() {
    if (!editingShortcut) return;

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

    const container = shortcutsConfig.containers.find(c => c.id === editingShortcut.containerId);
    if (container && container.shortcuts[editingShortcut.index]) {
        container.shortcuts[editingShortcut.index] = { name, url };
        saveConfig();
    }

    closeEditShortcutPopover();
    renderShortcuts();
}

// Helper to save config
function saveConfig() {
    localStorage.setItem('shortcutsConfig', JSON.stringify(shortcutsConfig));
}

// Migration function for old config format
function migrateOldConfig(oldConfig) {
    if (oldConfig.containers) {
        return oldConfig; // Already new format
    }
    
    // Old format: { shortcuts: [...] }
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

export function loadShortcuts() {
    const storedConfig = localStorage.getItem('shortcutsConfig');
    if (storedConfig) {
        try {
            const parsed = JSON.parse(storedConfig);
            shortcutsConfig = migrateOldConfig(parsed);
            saveConfig(); // Save migrated config
        } catch (error) {
            console.error('Error parsing stored shortcutsConfig:', error);
            setDefaultConfig();
        }
    } else {
        setDefaultConfig();
    }
    renderShortcuts();
}

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
    
    // Find the target container or use first one
    let targetContainer = shortcutsConfig.containers.find(c => c.id === activeContainerId);
    if (!targetContainer && shortcutsConfig.containers.length > 0) {
        targetContainer = shortcutsConfig.containers[0];
    }
    
    if (targetContainer) {
        targetContainer.shortcuts.push({ name, url });
        saveConfig();
    }
    
    if (domElements.shortcuts.newName && domElements.shortcuts.newUrl) {
        domElements.shortcuts.newName.value = '';
        domElements.shortcuts.newUrl.value = '';
    }
    
    closeAddForm();
    renderShortcuts();
}

export function deleteShortcut(containerId, index) {
    const container = shortcutsConfig.containers.find(c => c.id === containerId);
    if (!container || index < 0 || index >= container.shortcuts.length) {
        console.error('Invalid delete parameters');
        return;
    }
    
    container.shortcuts.splice(index, 1);
    saveConfig();
    renderShortcuts();
}

export function toggleEditMode() {
    isEditMode = !isEditMode;
    closeEditShortcutPopover();
    if (domElements.buttons.edit) {
        domElements.buttons.edit.textContent = isEditMode ? 'Done' : 'Edit';
    }
    if (domElements.buttons.import) {
        domElements.buttons.import.style.display = isEditMode ? '' : 'none';
    }
    if (domElements.buttons.export) {
        domElements.buttons.export.style.display = isEditMode ? '' : 'none';
    }
    renderShortcuts();
}

export function toggleAddMode() {
    if (isAddMode) {
        closeAddForm();
    }
}

export function handleAddShortcutKeyPress(e) {
    if (e.key === 'Enter') {
        const name = domElements.shortcuts.newName?.value.trim();
        const url = domElements.shortcuts.newUrl?.value.trim();
        
        if (name && url) {
            addShortcut();
        } else if (name && !url && e.target === domElements.shortcuts.newName) {
            domElements.shortcuts.newUrl?.focus();
        } else if (!name && url && e.target === domElements.shortcuts.newUrl) {
            domElements.shortcuts.newName?.focus();
        }
    } else if (e.key === 'Escape') {
        closeAddForm();
    }
}

// Setup click outside listener
export function setupClickOutsideListener() {
    document.addEventListener('click', (e) => {
        if (editingShortcut && editPopoverEl && !editPopoverEl.contains(e.target)) {
            closeEditShortcutPopover();
        }

        if (!isAddMode) return;

        const addForm = domElements.shortcuts.addForm;
        const clickedAddBtn = e.target.closest('.add-shortcut-to-container');

        // If clicked outside form and not on an add button, close
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

// Export config getter for main.js
export function getShortcutsConfig() {
    return shortcutsConfig;
}

// Import setter for main.js
export function setShortcutsConfig(config) {
    shortcutsConfig = migrateOldConfig(config);
    saveConfig();
    renderShortcuts();
}
