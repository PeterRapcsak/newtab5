import { domElements } from './dom.js';
import { initializeTimeTools } from './timeTools.js';
import { loadCurrencies, setupCurrencyInputs } from './currency.js';
import { setupSearch, toggleAdvancedSearch, initializeSearchSettings } from './search.js';
import { loadShortcuts, renderShortcuts, addShortcut, deleteShortcut, toggleEditMode, toggleAddMode, handleAddShortcutKeyPress, getShortcutsConfig, setShortcutsConfig, setupClickOutsideListener } from './shortcuts.js';
import { loadBottomBarConfig, toggleBottomBarEditMode } from './bottomBar.js';
import { initializeThemeCustomizer } from './themeCustomizer.js';

function init() {
    setupSearch();
    loadShortcuts();
    setupClickOutsideListener();
    loadCurrencies();
    setupCurrencyInputs();
    initializeSearchSettings();
    initializeTimeTools();
    loadBottomBarConfig();
    initializeThemeCustomizer();

    if (domElements.shortcuts.addButton) {
        domElements.shortcuts.addButton.addEventListener('click', addShortcut);
    } else {
        console.error('Add shortcut button not found');
    }
    
    if (domElements.shortcuts.newName) {
        domElements.shortcuts.newName.addEventListener('keypress', handleAddShortcutKeyPress);
    }
    if (domElements.shortcuts.newUrl) {
        domElements.shortcuts.newUrl.addEventListener('keypress', handleAddShortcutKeyPress);
    }
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';

    // Single Export button for all settings
    domElements.buttons.export = document.createElement('button');
    domElements.buttons.export.id = 'export-btn';
    domElements.buttons.export.classList.add('action-btn');
    domElements.buttons.export.textContent = 'Export All';
    domElements.buttons.export.style.display = 'none';
    domElements.buttons.export.addEventListener('click', exportAllSettings);

    // Single Import button for all settings
    domElements.buttons.import = document.createElement('button');
    domElements.buttons.import.id = 'import-btn';
    domElements.buttons.import.classList.add('action-btn');
    domElements.buttons.import.textContent = 'Import All';
    domElements.buttons.import.style.display = 'none';
    domElements.buttons.import.addEventListener('click', importAllSettings);

    domElements.buttons.edit = document.createElement('button');
    domElements.buttons.edit.id = 'edit-btn';
    domElements.buttons.edit.textContent = 'Edit';
    domElements.buttons.edit.addEventListener('click', toggleEditMode);

    buttonContainer.appendChild(domElements.buttons.import);
    buttonContainer.appendChild(domElements.buttons.export);
    buttonContainer.appendChild(domElements.buttons.edit);

    const rightHalf = document.querySelector('.right-half');
    if (rightHalf) {
        const addShortcutDiv = rightHalf.querySelector('.add-shortcut');
        rightHalf.insertBefore(buttonContainer, addShortcutDiv);
    }

    if (domElements.search.advancedButton) {
        domElements.search.advancedButton.addEventListener('click', toggleAdvancedSearch);
    }
    
    // Bottom bar controls - only Edit Bar button
    setupBottomBarControls();
}

function exportAllSettings() {
    const allSettings = {
        shortcuts: getShortcutsConfig(), // Now exports the full container structure
        bottomBar: JSON.parse(localStorage.getItem('bottomBarConfig') || '{"langTools":[],"aiTools":[]}'),
        theme: localStorage.getItem('selectedTheme') || 'purple',
        searchEngine: localStorage.getItem('selectedSearchEngine') || 'google',
        currencies: {
            from: localStorage.getItem('fromCurrency') || 'USD',
            to: localStorage.getItem('toCurrency') || 'EUR'
        }
    };
    
    const blob = new Blob([JSON.stringify(allSettings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'newtab-settings.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importAllSettings() {
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
                    
                    // Import shortcuts (supports both old and new format)
                    if (importedData.shortcuts) {
                        setShortcutsConfig(importedData.shortcuts);
                    }
                    
                    // Import bottom bar
                    if (importedData.bottomBar) {
                        localStorage.setItem('bottomBarConfig', JSON.stringify(importedData.bottomBar));
                        loadBottomBarConfig();
                    }
                    
                    // Import theme
                    if (importedData.theme) {
                        localStorage.setItem('selectedTheme', importedData.theme);
                        document.documentElement.setAttribute('data-theme', importedData.theme);
                    }
                    
                    // Import search engine
                    if (importedData.searchEngine) {
                        localStorage.setItem('selectedSearchEngine', importedData.searchEngine);
                        const searchSelect = document.getElementById('search-engine-select');
                        if (searchSelect) {
                            searchSelect.value = importedData.searchEngine;
                        }
                    }
                    
                    // Import currencies
                    if (importedData.currencies) {
                        if (importedData.currencies.from) {
                            localStorage.setItem('fromCurrency', importedData.currencies.from);
                        }
                        if (importedData.currencies.to) {
                            localStorage.setItem('toCurrency', importedData.currencies.to);
                        }
                        loadCurrencies();
                    }
                    
                    alert('All settings imported successfully!');
                    location.reload();
                } catch (error) {
                    console.error('Error importing settings:', error);
                    alert('Invalid file format. Please upload a valid settings JSON file.');
                }
            };
            reader.readAsText(file);
        }
    };
    fileInput.click();
}

function setupBottomBarControls() {
    const bottomSection = document.querySelector('.bottom-section');
    if (!bottomSection) return;
    
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'bottom-bar-controls';
    
    const editBtn = document.createElement('button');
    editBtn.id = 'bottom-bar-edit-btn';
    editBtn.className = 'bottom-bar-edit-btn';
    editBtn.textContent = 'Edit Bar';
    editBtn.addEventListener('click', toggleBottomBarEditMode);
    
    controlsDiv.appendChild(editBtn);
    
    bottomSection.insertBefore(controlsDiv, bottomSection.firstChild);
}

document.addEventListener('DOMContentLoaded', init);