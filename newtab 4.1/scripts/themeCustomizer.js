import { refreshAllIcons } from './iconRefresh.js';
import { renderShortcuts } from './shortcuts.js';
import { renderBottomBar } from './bottomBar.js';

export function initializeThemeCustomizer() {
    const pageControls = document.getElementById('page-controls');
    if (!pageControls) return;

    // Create theme customizer panel with organized sections
    const customizerPanel = document.createElement('div');
    customizerPanel.className = 'theme-customizer';
    customizerPanel.innerHTML = `
        <div class="theme-customizer-columns">
            <div class="theme-customizer-col theme-settings-col">
                <h3>Settings</h3>

                <div class="theme-section settings-section">
                    <label class="toggle-setting">
                        <input type="checkbox" id="low-detail-toggle">
                        <span class="toggle-slider"></span>
                        <span class="toggle-label">Low Detail Mode</span>
                    </label>
                    <p class="setting-description">Reduces animations and effects for better performance</p>
                </div>

                <div class="theme-section settings-section">
                    <button type="button" id="refresh-icons-btn" class="action-btn">Refresh Icons</button>
                    <p class="setting-description" id="refresh-icons-status">Fetches each shortcut and tool's real icon and caches it permanently. Asks for one-time permission to read those sites.</p>
                </div>
            </div>

            <div class="theme-customizer-col theme-colors-col">
                <h3>Color Theme</h3>

                <!-- One family per hue, one tier per depth/character — pick a
                     family, then how dark/light/vivid you want it. Grouping by
                     family (instead of mixing Blue+Grey together by depth) is
                     what actually makes 33 options easy to scan. -->
                <div class="theme-section">
                    <h4>Blue</h4>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Deep</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="blue-deep" title="Deep Blue"></div>
                            <div class="theme-option" data-theme="blue-navy" title="Navy Blue"></div>
                            <div class="theme-option" data-theme="blue-midnight" title="Midnight Blue"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Medium</span>
                        <div class="theme-options">
                            <div class="theme-option active" data-theme="blue" title="Blue"></div>
                            <div class="theme-option" data-theme="blue-steel" title="Steel Blue"></div>
                            <div class="theme-option" data-theme="blue-ocean" title="Ocean Blue"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Light</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="blue-sky" title="Sky Blue"></div>
                            <div class="theme-option" data-theme="blue-ice" title="Ice Blue"></div>
                            <div class="theme-option" data-theme="blue-frost" title="Frost Blue"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Vivid</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="blue-royal" title="Royal Blue"></div>
                            <div class="theme-option" data-theme="blue-cobalt" title="Cobalt Blue"></div>
                            <div class="theme-option" data-theme="blue-azure" title="Azure Blue"></div>
                        </div>
                    </div>
                </div>

                <div class="theme-section">
                    <h4>Grey</h4>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Deep</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="grey-deep" title="Deep Grey"></div>
                            <div class="theme-option" data-theme="grey-slate" title="Slate Grey"></div>
                            <div class="theme-option" data-theme="grey-charcoal" title="Charcoal"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Medium</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="grey" title="Grey"></div>
                            <div class="theme-option" data-theme="grey-chrome" title="Chrome Grey"></div>
                            <div class="theme-option" data-theme="grey-silver" title="Silver"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Light</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="grey-light" title="Light Grey"></div>
                            <div class="theme-option" data-theme="grey-mist" title="Mist Grey"></div>
                            <div class="theme-option" data-theme="grey-pearl" title="Pearl"></div>
                        </div>
                    </div>
                    <div class="theme-tier">
                        <span class="theme-tier-label">Tinted</span>
                        <div class="theme-options">
                            <div class="theme-option" data-theme="grey-graphite" title="Graphite"></div>
                            <div class="theme-option" data-theme="grey-fog" title="Fog Grey"></div>
                            <div class="theme-option" data-theme="grey-taupe" title="Taupe Grey"></div>
                        </div>
                    </div>
                </div>

                <div class="theme-section">
                    <h4>Vibrant</h4>
                    <div class="theme-options">
                        <div class="theme-option" data-theme="purple" title="Purple"></div>
                        <div class="theme-option" data-theme="green" title="Green"></div>
                        <div class="theme-option" data-theme="red" title="Red"></div>
                        <div class="theme-option" data-theme="orange" title="Orange"></div>
                        <div class="theme-option" data-theme="pink" title="Pink"></div>
                        <div class="theme-option" data-theme="teal" title="Teal"></div>
                        <div class="theme-option" data-theme="cyan" title="Cyan"></div>
                        <div class="theme-option" data-theme="amber" title="Amber"></div>
                        <div class="theme-option" data-theme="indigo" title="Indigo"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Create gear icon button
    const gearButton = document.createElement('button');
    gearButton.className = 'theme-toggle-btn';
    gearButton.innerHTML = '<i class="fas fa-cog"></i>';
    gearButton.title = 'Customize Theme';

    // Create wrapper for positioning
    const themeWrapper = document.createElement('div');
    themeWrapper.className = 'theme-wrapper';
    themeWrapper.appendChild(customizerPanel);
    themeWrapper.appendChild(gearButton);

    // Lives in the fixed bottom-right control cluster, next to the edit button
    pageControls.appendChild(themeWrapper);

    // Get theme options after they're added to DOM
    const themeOptions = customizerPanel.querySelectorAll('.theme-option');

    // Load saved theme
    const savedTheme = localStorage.getItem('selectedTheme') || 'grey';
    applyTheme(savedTheme);

    // Load and apply Low Detail Mode setting
    const lowDetailToggle = customizerPanel.querySelector('#low-detail-toggle');
    const savedLowDetail = localStorage.getItem('lowDetailMode') === 'true';
    lowDetailToggle.checked = savedLowDetail;
    applyLowDetailMode(savedLowDetail);

    lowDetailToggle.addEventListener('change', () => {
        const isEnabled = lowDetailToggle.checked;
        localStorage.setItem('lowDetailMode', isEnabled);
        applyLowDetailMode(isEnabled);
    });

    // Refresh Icons: fetch each shortcut/tool's real favicon and cache it
    const refreshIconsBtn = customizerPanel.querySelector('#refresh-icons-btn');
    const refreshIconsStatus = customizerPanel.querySelector('#refresh-icons-status');
    const refreshIconsDefaultStatus = refreshIconsStatus.textContent;

    refreshIconsBtn.addEventListener('click', () => {
        refreshIconsBtn.disabled = true;
        refreshIconsBtn.textContent = 'Refreshing...';

        refreshAllIcons({
            onProgress: ({ done, total, current }) => {
                refreshIconsStatus.textContent = `Checking ${done}/${total}: ${current}`;
            }
        }).then(({ granted, total, cached }) => {
            if (!granted) {
                refreshIconsStatus.textContent = 'Permission was not granted, so icons were not refreshed.';
                return;
            }
            renderShortcuts();
            renderBottomBar();
            refreshIconsStatus.textContent = `Cached real icons for ${cached}/${total} shortcuts and tools.`;
        }).catch((error) => {
            console.error('Icon refresh failed:', error);
            refreshIconsStatus.textContent = 'Something went wrong refreshing icons — check the console.';
        }).finally(() => {
            refreshIconsBtn.disabled = false;
            refreshIconsBtn.textContent = 'Refresh Icons';
            setTimeout(() => {
                refreshIconsStatus.textContent = refreshIconsDefaultStatus;
            }, 6000);
        });
    });

    function applyLowDetailMode(enabled) {
        document.documentElement.classList.toggle('low-detail', enabled);
    }

    // Toggle panel visibility
    gearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        customizerPanel.classList.toggle('active');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!customizerPanel.contains(e.target) && e.target !== gearButton) {
            customizerPanel.classList.remove('active');
        }
    });

    // Theme selection
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.dataset.theme;
            applyTheme(theme);
            localStorage.setItem('selectedTheme', theme);
            
            // Update active state
            themeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
        });
    });

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        
        // Update active option
        themeOptions.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === theme);
        });
    }
}