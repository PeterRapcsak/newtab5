import { domElements } from './dom.js';

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
let dragStartIndex = null;
let dragSourceContainerId = null;
let dragGhost = null;
let dropPreview = null;

// Resize state
let isResizing = false;
let resizingContainerId = null;
let startX = 0;
let startWidth = 0;

const BASE_ICON_URL = "https://www.gstatic.com/images/branding/product/1x/";

const GOOGLE_SERVICE_ICONS = {
    "analytics.google.com": "analytics_48dp.png",
    "books.google.com": "books_48dp.png",
    "calendar.google.com": "calendar_2020q4_48dp.png",
    "classroom.google.com": "classroom_48dp.png",
    "docs.google.com": "docs_2020q4_48dp.png",
    "drive.google.com": "drive_2020q4_48dp.png",
    "earth.google.com": "earth_48dp.png",
    "finance.google.com": "finance_48dp.png",
    "groups.google.com": "groups_48dp.png",
    "keep.google.com": "keep_2020q4_48dp.png",
    "mail.google.com": "gmail_2020q4_48dp.png",
    "maps.google.com": "maps_48dp.png",
    "meet.google.com": "meet_2020q4_48dp.png",
    "news.google.com": "news_48dp.png",
    "photos.google.com": "photos_48dp.png",
    "play.google.com": "play_prism_48dp.png",
    "podcasts.google.com": "podcasts_48dp.png",
    "scholar.google.com": "scholar_48dp.png",
    "sheets.google.com": "sheets_2020q4_48dp.png",
    "slides.google.com": "slides_2020q4_48dp.png",
    "translate.google.com": "translate_48dp.png",
    "youtube.com": "youtube_48dp.png",
    "www.youtube.com": "youtube_48dp.png",
    "music.youtube.com": "youtube_music_48dp.png",
    "studio.youtube.com": "youtube_studio_48dp.png",
};

const SPECIAL_ICONS = {
    "chat.deepseek.com": "https://chat.deepseek.com/favicon.ico",
    "deepseek.com": "https://chat.deepseek.com/favicon.ico",
    "chat.openai.com": "https://cdn.oaistatic.com/_next/static/media/apple-touch-icon.59f2e898.png",
    "openai.com": "https://cdn.oaistatic.com/_next/static/media/apple-touch-icon.59f2e898.png",
    "gemini.google.com": "https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg",
    "aistudio.google.com": "https://www.gstatic.com/aistudio/ai_studio_favicon_32x32.png",
};

const FALLBACK_ICON_URL = '/icons/fallback-icon.png';

export function handleShortcutClick(event) {
    if (event.button === 1 || event.ctrlKey || event.metaKey) {
        return true;
    }
    event.preventDefault();
    window.location.href = event.currentTarget.href;
    return false;
}

function getIconUrl(url) {
    let domain = 'unknown.domain';
    try {
        const urlObject = new URL(url);
        domain = urlObject.hostname;
    } catch (e) {
        console.error(`Invalid URL: ${url}`, e);
        return FALLBACK_ICON_URL;
    }

    if (SPECIAL_ICONS[domain]) {
        return SPECIAL_ICONS[domain];
    }

    if (GOOGLE_SERVICE_ICONS[domain]) {
        return BASE_ICON_URL + GOOGLE_SERVICE_ICONS[domain];
    }

    return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
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
        containerEl.dataset.containerId = container.id;
        
        // Container controls wrapper (bottom right)
        const controlsWrapper = document.createElement('div');
        controlsWrapper.className = 'container-controls';
        
        // Delete container button (only if more than 1 container and in edit mode)
        if (isEditMode && shortcutsConfig.containers.length > 1) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-container-btn';
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
            resizeHandle.innerHTML = '<i class="fas fa-grip-lines-vertical"></i>';
            resizeHandle.addEventListener('mousedown', (e) => startResize(e, container.id));
            containerEl.appendChild(resizeHandle);
        }
        
        wrapper.appendChild(containerEl);
        
        // Setup drag and drop for shortcuts within this container
        setupShortcutDragDrop(containerEl, container.id);
    });
    
    // Add "Add Container" button at the end (only in edit mode)
    if (isEditMode) {
        const addContainerBtn = document.createElement('button');
        addContainerBtn.className = 'add-container-btn glass-card';
        addContainerBtn.innerHTML = '<i class="fas fa-plus"></i><span>Add Container</span>';
        addContainerBtn.addEventListener('click', addNewContainer);
        wrapper.appendChild(addContainerBtn);
    }
}

function createShortcutElement(shortcut, index, containerId) {
    const shortcutEl = document.createElement('div');
    shortcutEl.className = 'shortcut';
    shortcutEl.setAttribute('draggable', 'true');
    shortcutEl.dataset.index = index.toString();
    shortcutEl.dataset.containerId = containerId;
    
    const iconSrc = getIconUrl(shortcut.url);
    
    const linkElement = document.createElement('a');
    linkElement.href = shortcut.url;
    
    const imgElement = document.createElement('img');
    imgElement.alt = shortcut.name;
    imgElement.src = iconSrc;
    imgElement.onerror = function() {
        if (this.src !== FALLBACK_ICON_URL) {
            this.onerror = null;
            this.src = FALLBACK_ICON_URL;
        }
    };
    linkElement.appendChild(imgElement);
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'shortcut-name';
    nameSpan.textContent = shortcut.name;
    
    shortcutEl.appendChild(linkElement);
    shortcutEl.appendChild(nameSpan);
    
    if (isEditMode) {
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

function setupShortcutDragDrop(containerEl, containerId) {
    const shortcutEls = containerEl.querySelectorAll('.shortcut');
    const shortcutsGrid = containerEl.querySelector('.shortcuts-grid');
    
    shortcutEls.forEach((shortcutEl, itemIndex) => {
        shortcutEl.addEventListener('dragstart', (e) => {
            dragStartIndex = itemIndex;
            dragSourceContainerId = containerId;
            shortcutEl.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', JSON.stringify({ index: itemIndex, containerId }));
            
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
            removeDropPreview();
            dragStartIndex = null;
            dragSourceContainerId = null;
            
            document.querySelectorAll('.shortcuts-container').forEach(c => {
                c.classList.remove('drag-over');
            });
        });
        
        shortcutEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        
        shortcutEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const targetIndex = parseInt(shortcutEl.dataset.index);
            const targetContainerId = shortcutEl.dataset.containerId;
            
            if (dragSourceContainerId && dragStartIndex !== null) {
                moveShortcut(dragSourceContainerId, dragStartIndex, targetContainerId, targetIndex);
            }
            
            removeDragGhost();
            removeDropPreview();
            dragStartIndex = null;
            dragSourceContainerId = null;
        });
    });
    
    // Allow dropping on the container itself (for moving to empty containers or end)
    shortcutsGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        containerEl.classList.add('drag-over');
    });
    
    shortcutsGrid.addEventListener('dragleave', (e) => {
        if (!shortcutsGrid.contains(e.relatedTarget)) {
            containerEl.classList.remove('drag-over');
        }
    });
    
    shortcutsGrid.addEventListener('drop', (e) => {
        e.preventDefault();
        containerEl.classList.remove('drag-over');
        
        // Only handle if dropped on the grid background, not on a shortcut
        if (e.target === shortcutsGrid || e.target.classList.contains('shortcuts-grid')) {
            const targetContainerId = containerId;
            const container = shortcutsConfig.containers.find(c => c.id === targetContainerId);
            
            if (dragSourceContainerId && dragStartIndex !== null && container) {
                moveShortcut(dragSourceContainerId, dragStartIndex, targetContainerId, container.shortcuts.length);
            }
        }
        
        removeDragGhost();
        removeDropPreview();
        dragStartIndex = null;
        dragSourceContainerId = null;
    });
}

function moveShortcut(fromContainerId, fromIndex, toContainerId, toIndex) {
    const fromContainer = shortcutsConfig.containers.find(c => c.id === fromContainerId);
    const toContainer = shortcutsConfig.containers.find(c => c.id === toContainerId);
    
    if (!fromContainer || !toContainer) return;
    
    const [movedShortcut] = fromContainer.shortcuts.splice(fromIndex, 1);
    
    // Adjust toIndex if moving within same container and removing from before target
    if (fromContainerId === toContainerId && fromIndex < toIndex) {
        toIndex--;
    }
    
    toContainer.shortcuts.splice(toIndex, 0, movedShortcut);
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
    
    const deleteBtn = dragGhost.querySelector('.delete-shortcut-btn');
    if (deleteBtn) deleteBtn.remove();
    
    document.body.appendChild(dragGhost);
}

function removeDragGhost() {
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
}

function removeDropPreview() {
    if (dropPreview) {
        dropPreview.remove();
        dropPreview = null;
    }
}

// Resize functionality
function startResize(e, containerId) {
    e.preventDefault();
    isResizing = true;
    resizingContainerId = containerId;
    startX = e.clientX;
    
    const container = shortcutsConfig.containers.find(c => c.id === containerId);
    startWidth = container ? container.width : 100;
    
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
    
    // Snap to grid: 25%, 33%, 50%, 66%, 75%, 100%
    const snapPoints = [25, 33, 50, 66, 75, 100];
    const snapThreshold = 5;
    
    for (const snap of snapPoints) {
        if (Math.abs(newWidth - snap) < snapThreshold) {
            newWidth = snap;
            break;
        }
    }
    
    // Clamp between 25% and 100%
    newWidth = Math.max(25, Math.min(100, newWidth));
    
    const container = shortcutsConfig.containers.find(c => c.id === resizingContainerId);
    if (container) {
        container.width = Math.round(newWidth);
        const containerEl = document.getElementById(resizingContainerId);
        if (containerEl) {
            containerEl.style.setProperty('--container-width', container.width + '%');
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
        if (!isAddMode) return;
        
        const addForm = domElements.shortcuts.addForm;
        const clickedAddBtn = e.target.closest('.add-shortcut-to-container');
        
        // If clicked outside form and not on an add button, close
        if (addForm && !addForm.contains(e.target) && !clickedAddBtn) {
            closeAddForm();
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
