export function initializeThemeCustomizer() {
    const toolsRow = document.querySelector('.tools-row');
    if (!toolsRow) return;

    // Create theme customizer panel with organized sections
    const customizerPanel = document.createElement('div');
    customizerPanel.className = 'theme-customizer';
    customizerPanel.innerHTML = `
        <h3>Color Theme</h3>
        
        <div class="theme-section">
            <h4>Deep Blue & Grey</h4>
            <div class="theme-options">
                <div class="theme-option" data-theme="blue-deep" title="Deep Blue"></div>
                <div class="theme-option" data-theme="blue-navy" title="Navy Blue"></div>
                <div class="theme-option" data-theme="blue-midnight" title="Midnight Blue"></div>
                <div class="theme-option" data-theme="grey-deep" title="Deep Grey"></div>
                <div class="theme-option" data-theme="grey-slate" title="Slate Grey"></div>
                <div class="theme-option" data-theme="grey-charcoal" title="Charcoal"></div>
            </div>
        </div>

        <div class="theme-section">
            <h4>Medium Blue & Grey</h4>
            <div class="theme-options">
                <div class="theme-option active" data-theme="blue" title="Blue"></div>
                <div class="theme-option" data-theme="blue-steel" title="Steel Blue"></div>
                <div class="theme-option" data-theme="blue-ocean" title="Ocean Blue"></div>
                <div class="theme-option" data-theme="grey" title="Grey"></div>
                <div class="theme-option" data-theme="grey-chrome" title="Chrome Grey"></div>
                <div class="theme-option" data-theme="grey-silver" title="Silver"></div>
            </div>
        </div>

        <div class="theme-section">
            <h4>Light Blue & Grey</h4>
            <div class="theme-options">
                <div class="theme-option" data-theme="blue-sky" title="Sky Blue"></div>
                <div class="theme-option" data-theme="blue-ice" title="Ice Blue"></div>
                <div class="theme-option" data-theme="blue-frost" title="Frost Blue"></div>
                <div class="theme-option" data-theme="grey-light" title="Light Grey"></div>
                <div class="theme-option" data-theme="grey-mist" title="Mist Grey"></div>
                <div class="theme-option" data-theme="grey-pearl" title="Pearl"></div>
            </div>
        </div>

        <div class="theme-section">
            <h4>Vibrant Colors</h4>
            <div class="theme-options">
                <div class="theme-option" data-theme="purple" title="Purple"></div>
                <div class="theme-option" data-theme="green" title="Green"></div>
                <div class="theme-option" data-theme="red" title="Red"></div>
                <div class="theme-option" data-theme="orange" title="Orange"></div>
                <div class="theme-option" data-theme="pink" title="Pink"></div>
                <div class="theme-option" data-theme="teal" title="Teal"></div>
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

    // Append after tools row
    toolsRow.parentNode.insertBefore(themeWrapper, toolsRow.nextSibling);

    // Get theme options after they're added to DOM
    const themeOptions = customizerPanel.querySelectorAll('.theme-option');

    // Load saved theme
    const savedTheme = localStorage.getItem('selectedTheme') || 'grey';
    applyTheme(savedTheme);

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