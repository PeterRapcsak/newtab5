import { domElements } from './dom.js';

export let shortcutsConfig = { shortcuts: [] };
export let isEditMode = false;
export let isAddMode = false;
export let dragStartIndex = null;
let dragGhost = null;
let dropPreview = null;

const BASE_ICON_URL = "https://www.gstatic.com/images/branding/product/1x/";

// Enhanced Google service icons mapping with proper icon names
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

// Special icons for common services
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

    // Check for special icons first
    if (SPECIAL_ICONS[domain]) {
        return SPECIAL_ICONS[domain];
    }

    // Check for Google service icons
    if (GOOGLE_SERVICE_ICONS[domain]) {
        return BASE_ICON_URL + GOOGLE_SERVICE_ICONS[domain];
    }

    // Use DuckDuckGo favicon service as fallback
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

export function renderShortcuts() {
    if (!domElements.shortcuts.container) {
        console.error('Shortcuts container not found');
        return;
    }
    domElements.shortcuts.container.innerHTML = '';
    
    let shortcuts = [];
    try {
        const storedConfig = localStorage.getItem('shortcutsConfig');
        if (storedConfig) {
            const parsedConfig = JSON.parse(storedConfig);
            if (parsedConfig && Array.isArray(parsedConfig.shortcuts)) {
                shortcuts = parsedConfig.shortcuts;
            }
        }
    } catch (error) {
        console.error('Error parsing shortcutsConfig from localStorage:', error);
        shortcutsConfig.shortcuts = [];
        shortcuts = shortcutsConfig.shortcuts;
    }

    shortcuts.forEach((shortcut, index) => {
        const shortcutEl = document.createElement('div');
        shortcutEl.className = 'shortcut';
        shortcutEl.setAttribute('draggable', 'true');
        shortcutEl.dataset.index = index.toString();
        
        const iconSrc = getIconUrl(shortcut.url);

        const linkElement = document.createElement('a');
        linkElement.href = shortcut.url;

        const imgElement = document.createElement('img');
        imgElement.alt = shortcut.name;
        imgElement.src = iconSrc; 

        imgElement.onerror = function() {
            if (this.src !== FALLBACK_ICON_URL) {
                const attemptedSrc = this.src;
                this.onerror = null;
                this.src = FALLBACK_ICON_URL; 
                console.warn(`Failed to load icon for "${shortcut.name}" (attempted src: ${attemptedSrc}). Using fallback.`);
            } else if (!this.dataset.fallbackAttempted) {
                this.dataset.fallbackAttempted = "true";
                this.onerror = null;
                console.error(`Fallback icon itself (${FALLBACK_ICON_URL}) failed to load for "${shortcut.name}".`);
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
            deleteButton.setAttribute('data-index', index.toString());
            deleteButton.textContent = '×';
            shortcutEl.appendChild(deleteButton);
        }
        
        domElements.shortcuts.container.appendChild(shortcutEl);
    });

    if (isEditMode) {
        document.querySelectorAll('.delete-shortcut-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const indexToDelete = parseInt(e.target.dataset.index);
                deleteShortcut(indexToDelete);
            });
        });
    }

    const shortcutEls = domElements.shortcuts.container.querySelectorAll('.shortcut');
    shortcutEls.forEach((shortcutElItem, itemIndex) => { 
        shortcutElItem.addEventListener('dragstart', (e) => {
            dragStartIndex = itemIndex;
            shortcutElItem.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', itemIndex.toString());
            
            // Create drag ghost
            createDragGhost(shortcutElItem);
            
            // Hide default drag image
            const emptyImg = new Image();
            emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            e.dataTransfer.setDragImage(emptyImg, 0, 0);
        });

        shortcutElItem.addEventListener('drag', (e) => {
            if (dragGhost) {
                dragGhost.style.left = e.pageX + 10 + 'px';
                dragGhost.style.top = e.pageY + 10 + 'px';
            }
        });

        shortcutElItem.addEventListener('dragend', () => {
            shortcutElItem.classList.remove('dragging');
            removeDragGhost();
            removeDropPreview();
            dragStartIndex = null;
        });

        shortcutElItem.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (dragStartIndex !== null && dragStartIndex !== itemIndex) {
                showDropPreview(shortcutElItem, itemIndex);
            }
        });

        shortcutElItem.addEventListener('dragleave', (e) => {
            // Only remove if leaving to non-child element
            if (!shortcutElItem.contains(e.relatedTarget)) {
                removeDropPreview();
            }
        });

        shortcutElItem.addEventListener('drop', (e) => {
            e.preventDefault();
            removeDropPreview();
            
            const dragEndIndex = parseInt(shortcutElItem.dataset.index);
            if (dragStartIndex !== null && dragStartIndex !== dragEndIndex) {
                reorderShortcuts(dragStartIndex, dragEndIndex);
            }
            dragStartIndex = null;
        });
    });
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
    
    // Remove delete button from ghost
    const deleteBtn = dragGhost.querySelector('.delete-shortcut-btn');
    if (deleteBtn) {
        deleteBtn.remove();
    }
    
    document.body.appendChild(dragGhost);
}

function removeDragGhost() {
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
}

function showDropPreview(targetElement, targetIndex) {
    removeDropPreview();
    
    if (dragStartIndex === null) return;
    
    // Create preview element
    dropPreview = document.createElement('div');
    dropPreview.className = 'drop-preview';
    dropPreview.style.cssText = `
        position: absolute;
        width: 80px;
        height: 80px;
        border: 2px dashed var(--accent-primary);
        border-radius: var(--border-radius);
        background: rgba(99, 102, 241, 0.1);
        pointer-events: none;
        z-index: 1;
        animation: pulse-preview 1s infinite;
    `;
    
    // Position the preview
    const rect = targetElement.getBoundingClientRect();
    const container = domElements.shortcuts.container;
    const containerRect = container.getBoundingClientRect();
    
    dropPreview.style.left = (rect.left - containerRect.left) + 'px';
    dropPreview.style.top = (rect.top - containerRect.top) + 'px';
    
    container.style.position = 'relative';
    container.appendChild(dropPreview);
}

function removeDropPreview() {
    if (dropPreview) {
        dropPreview.remove();
        dropPreview = null;
    }
}

export function reorderShortcuts(fromIndex, toIndex) {
    const [movedShortcut] = shortcutsConfig.shortcuts.splice(fromIndex, 1);
    shortcutsConfig.shortcuts.splice(toIndex, 0, movedShortcut);
    localStorage.setItem('shortcutsConfig', JSON.stringify(shortcutsConfig));
    renderShortcuts();
}

export function loadShortcuts() {
    const storedConfig = localStorage.getItem('shortcutsConfig');
    if (storedConfig) {
        try {
            const parsed = JSON.parse(storedConfig);
            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.shortcuts)) {
                 shortcutsConfig = parsed;
            } else {
                console.warn('Stored shortcutsConfig has invalid structure. Resetting to default.');
                throw new Error('Invalid structure');
            }
        } catch (error) {
            console.error('Error parsing stored shortcutsConfig or invalid structure:', error);
            shortcutsConfig = {
                shortcuts: [
                    { name: "YouTube", url: "https://www.youtube.com/" },
                    { name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
                    { name: "Drive", url: "https://drive.google.com/drive/starred" },
                    { name: "Facebook", url: "https://www.facebook.com/" },
                    { name: "Netflix", url: "hhttps://www.netflix.com/browse" },
                    { name: "Soundcloud", url: "https://soundcloud.com/you/likes" }
                ]
            };
            localStorage.setItem('shortcutsConfig', JSON.stringify(shortcutsConfig));
        }
    } else {
        shortcutsConfig = {
            shortcuts: [
                    { name: "YouTube", url: "https://www.youtube.com/" },
                    { name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
                    { name: "Drive", url: "https://drive.google.com/drive/starred" },
                    { name: "Facebook", url: "https://www.facebook.com/" },
                    { name: "Netflix", url: "hhttps://www.netflix.com/browse" },
                    { name: "Soundcloud", url: "https://soundcloud.com/you/likes" }
                ]
        };
        localStorage.setItem('shortcutsConfig', JSON.stringify(shortcutsConfig));
        console.log('Default shortcuts saved');
    }
    renderShortcuts();
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
    
    shortcutsConfig.shortcuts.push({ name, url });
    
    localStorage.setItem('shortcutsConfig', JSON.stringify(shortcutsConfig));
    if (domElements.shortcuts.newName && domElements.shortcuts.newUrl) {
        domElements.shortcuts.newName.value = '';
        domElements.shortcuts.newUrl.value = '';
    }
    toggleAddMode();
    renderShortcuts();
}

export function deleteShortcut(index) {
    if (index === null || index < 0 || index >= shortcutsConfig.shortcuts.length) {
        console.error('Invalid delete index:', index);
        return;
    }
    
    shortcutsConfig.shortcuts.splice(index, 1);
    localStorage.setItem('shortcutsConfig', JSON.stringify(shortcutsConfig));
    console.log('Shortcut deleted at index:', index);
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
    isAddMode = !isAddMode;
    if (domElements.shortcuts.addForm && domElements.buttons.new) {
        domElements.shortcuts.addForm.style.display = isAddMode ? 'flex' : 'none';
        domElements.buttons.new.textContent = isAddMode ? 'Cancel' : 'New';
        if (isAddMode && domElements.shortcuts.newName) {
            domElements.shortcuts.newName.focus();
        }
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
    }
}