// ========== THEME ENGINE & PATTERNS ==========
// ========== ENHANCED THEME ENGINE & PATTERNS ==========
        var presetPatterns = {
            paw: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><g fill="%236366f1" fill-opacity="0.18"><circle cx="20" cy="15" r="4"/><circle cx="30" cy="10" r="4"/><circle cx="40" cy="15" r="4"/><ellipse cx="30" cy="28" rx="9" ry="8"/><circle cx="50" cy="45" r="3"/><circle cx="55" cy="40" r="3"/><ellipse cx="50" cy="52" rx="6" ry="5"/></g></svg>`,
            grid: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="%2394a3b8" stroke-width="1" stroke-opacity="0.25"/></svg>`,
            mesh: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2" fill="%23a855f7" fill-opacity="0.35"/></svg>`,
            wood: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50"><path d="M0 0 h50 v25 h-50 z M0 25 h50 v25 h-50 z" fill="none" stroke="%23d97706" stroke-width="1" stroke-opacity="0.2" stroke-dasharray="3,3"/></svg>`,
            floral: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="3" fill="%23ec4899" fill-opacity="0.3"/><circle cx="15" cy="9" r="2" fill="%23ec4899" fill-opacity="0.2"/><circle cx="15" cy="21" r="2" fill="%23ec4899" fill-opacity="0.2"/><circle cx="9" cy="15" r="2" fill="%23ec4899" fill-opacity="0.2"/><circle cx="21" cy="15" r="2" fill="%23ec4899" fill-opacity="0.2"/></svg>`,
            none: ''
        };

        var themes = {
            purple: { name: '🟣 Mor & Pembe (Açık)', primary: '#9333ea', secondary: '#ec4899', isGradient: true, background: '#f9f5ff', card: '#ffffff', text: '#1f2937', textLight: '#6b7280', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', cardRadius: '8px', cardGlass: false, bgImage: '', bgOpacity: 0.15, bgBlur: 0, mode: 'light' },
            ocean: { name: '🔵 Okyanus Mavi (Açık)', primary: '#2563eb', secondary: '#06b6d4', isGradient: true, background: '#f0f9ff', card: '#ffffff', text: '#1f2937', textLight: '#6b7280', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', cardRadius: '8px', cardGlass: false, bgImage: '', bgOpacity: 0.15, bgBlur: 0, mode: 'light' },
            emerald: { name: '🟢 Zümrüt Yeşil (Açık)', primary: '#059669', secondary: '#10b981', isGradient: true, background: '#f0fdf4', card: '#ffffff', text: '#1f2937', textLight: '#6b7280', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', cardRadius: '8px', cardGlass: false, bgImage: '', bgOpacity: 0.15, bgBlur: 0, mode: 'light' },
            fire: { name: '🔴 Ateş Kehribar (Açık)', primary: '#dc2626', secondary: '#f97316', isGradient: true, background: '#fff7ed', card: '#ffffff', text: '#1f2937', textLight: '#6b7280', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', cardRadius: '8px', cardGlass: false, bgImage: '', bgOpacity: 0.15, bgBlur: 0, mode: 'light' },
            pawTheme: { name: '🐾 Pet Market Pati (Açık)', primary: '#6366f1', secondary: '#8b5cf6', isGradient: true, background: '#f8fafc', card: '#ffffff', text: '#1e293b', textLight: '#64748b', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', fontFamily: "'Nunito', sans-serif", cardRadius: '12px', cardGlass: false, bgImage: presetPatterns.paw, bgOpacity: 0.35, bgBlur: 0, mode: 'light' },
            dark: { name: '🌙 Gece Koyu Slate (Koyu)', primary: '#6366f1', secondary: '#a855f7', isGradient: true, background: '#0f172a', card: '#1e293b', text: '#f8fafc', textLight: '#94a3b8', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#60a5fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', cardRadius: '10px', cardGlass: true, bgImage: '', bgOpacity: 0.15, bgBlur: 0, mode: 'dark' },
            amoled: { name: '🖤 Saf Siyah (AMOLED Dark)', primary: '#8b5cf6', secondary: '#3b82f6', isGradient: true, background: '#000000', card: '#111827', text: '#ffffff', textLight: '#9ca3af', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#60a5fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', cardRadius: '10px', cardGlass: false, bgImage: '', bgOpacity: 0.15, bgBlur: 0, mode: 'dark' },
            navy: { name: '🌌 Gece Laciverti (Deep Navy)', primary: '#38bdf8', secondary: '#818cf8', isGradient: true, background: '#0b132b', card: '#1c2541', text: '#f1f5f9', textLight: '#94a3b8', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#38bdf8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', cardRadius: '10px', cardGlass: true, bgImage: '', bgOpacity: 0.15, bgBlur: 0, mode: 'dark' },
            luxury: { name: '👑 Şık Altın Gece (Koyu)', primary: '#d97706', secondary: '#f59e0b', isGradient: true, background: '#090d16', card: '#151e30', text: '#fef3c7', textLight: '#d97706', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', fontFamily: "'Playfair Display', Georgia, serif", cardRadius: '12px', cardGlass: true, bgImage: presetPatterns.wood, bgOpacity: 0.25, bgBlur: 0, mode: 'dark' },
            cyberpunk: { name: '🦩 Cyberpunk Neon (Koyu)', primary: '#ec4899', secondary: '#00f2fe', isGradient: true, background: '#080b12', card: '#111827', text: '#f3f4f6', textLight: '#9ca3af', success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#06b6d4', fontFamily: "'Montserrat', sans-serif", cardRadius: '14px', cardGlass: true, bgImage: presetPatterns.grid, bgOpacity: 0.2, bgBlur: 0, mode: 'dark' }
        };

        var theme = themes.purple;
        var currentViewMode = localStorage.getItem('cagdas_view_mode') || 'auto';

        function isDarkMode() {
            if (!theme) return false;
            if (theme.mode === 'dark' || theme.mode === 'amoled' || theme.mode === 'navy') return true;
            if (theme.mode === 'light' || theme.mode === 'pure-white') return false;
            const bg = (theme.background || '').toLowerCase().trim();
            if (bg === '#0f172a' || bg === '#000000' || bg === '#090d16' || bg === '#080b12' || bg === '#111827' || bg === '#0b132b' || bg === '#1e293b' || bg === '#151e30') return true;
            if (bg.startsWith('#') && bg.length >= 7) {
                const r = parseInt(bg.slice(1, 3), 16) || 0;
                const g = parseInt(bg.slice(3, 5), 16) || 0;
                const b = parseInt(bg.slice(5, 7), 16) || 0;
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                return brightness < 128;
            }
            return false;
        }
        window.isDarkMode = isDarkMode;

        function setThemeMode(mode) {
            if (mode === 'light') {
                theme.background = '#f8fafc';
                theme.card = '#ffffff';
                theme.text = '#1f2937';
                theme.textLight = '#6b7280';
                theme.cardGlass = false;
                theme.mode = 'light';
                theme.name = '☀️ Açık Beyaz Tema';
            } else if (mode === 'dark') {
                theme.background = '#0f172a';
                theme.card = '#1e293b';
                theme.text = '#f8fafc';
                theme.textLight = '#94a3b8';
                theme.cardGlass = true;
                theme.mode = 'dark';
                theme.name = '🌙 Koyu Slate Tema';
            } else if (mode === 'amoled') {
                theme.background = '#000000';
                theme.card = '#111827';
                theme.text = '#ffffff';
                theme.textLight = '#9ca3af';
                theme.cardGlass = false;
                theme.mode = 'amoled';
                theme.name = '🖤 AMOLED Saf Siyah';
            } else if (mode === 'navy') {
                theme.background = '#0b132b';
                theme.card = '#1c2541';
                theme.text = '#f1f5f9';
                theme.textLight = '#94a3b8';
                theme.cardGlass = true;
                theme.mode = 'navy';
                theme.name = '🌌 Gece Mavisi';
            } else if (mode === 'pure-white') {
                theme.background = '#ffffff';
                theme.card = '#f8fafc';
                theme.text = '#0f172a';
                theme.textLight = '#64748b';
                theme.cardGlass = false;
                theme.mode = 'pure-white';
                theme.name = '⚪ Saf Beyaz Minimalist';
            }
            if (typeof window.persistCurrentTheme === 'function') {
                window.persistCurrentTheme();
            }
            applyThemeStyles();
            if (typeof render === 'function') {
                render();
            }
        }
        window.setThemeMode = setThemeMode;

        function toggleThemeMode() {
            if (isDarkMode()) {
                setThemeMode('light');
            } else {
                setThemeMode('dark');
            }
        }
        window.toggleThemeMode = toggleThemeMode;

        function getThemeColors() {
            return {
                ...theme,
                border: theme.border || (theme.textLight ? theme.textLight + '30' : 'rgba(150,150,150,0.2)')
            };
        }
        window.getThemeColors = getThemeColors;

        function setViewMode(mode) {
            currentViewMode = mode;
            try {
                localStorage.setItem('cagdas_view_mode', mode);
            } catch(e) {}
            if (document.body) {
                document.body.classList.remove('view-mode-auto', 'view-mode-pc', 'view-mode-mobile');
                document.body.classList.add('view-mode-' + mode);
            }
            applyThemeStyles();
            if (typeof render === 'function') {
                render();
            }
        }

        function getAccountTheme(user) {
            if (!user) return null;
            const uKey = (user.username || user.name || 'user').toLowerCase().trim();
            if (window.state && window.state.userThemes && window.state.userThemes[uKey]) {
                return window.state.userThemes[uKey];
            }
            if (user.userTheme) {
                return user.userTheme;
            }
            try {
                const saved = localStorage.getItem('cagdas_user_theme_' + uKey);
                if (saved) return JSON.parse(saved);
            } catch(e) {}
            return null;
        }

        function loadUserTheme(user) {
            if (!user) {
                theme = Object.assign({}, themes.purple);
                applyThemeStyles();
                return;
            }
            const accTheme = getAccountTheme(user);
            if (accTheme) {
                theme = Object.assign({}, accTheme);
            } else {
                theme = Object.assign({}, themes.purple);
            }
            applyThemeStyles();
        }

        try {
            const savedCustomTheme = localStorage.getItem('cagdas_custom_theme');
            if (savedCustomTheme) {
                theme = JSON.parse(savedCustomTheme);
            } else {
                const savedThemeKey = localStorage.getItem('theme');
                if (savedThemeKey && themes[savedThemeKey]) {
                    theme = themes[savedThemeKey];
                }
            }
        } catch(e) {}

        function applyThemeStyles() {
            let styleTag = document.getElementById('dynamic-theme-css');
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'dynamic-theme-css';
                document.head.appendChild(styleTag);
            }

            const currentPrimary = theme.primary || '#6366f1';
            const currentSecondary = theme.secondary || currentPrimary;
            const currentBg = theme.background || '#f9f5ff';
            const currentCard = theme.card || '#ffffff';
            const currentText = theme.text || '#1f2937';
            const currentTextLight = theme.textLight || '#6b7280';
            const currentSuccess = theme.success || '#10b981';
            const currentError = theme.error || '#ef4444';
            const currentWarning = theme.warning || '#f59e0b';
            const currentInfo = theme.info || '#3b82f6';
            const currentHeader = theme.headerColor || (theme.isGradient !== false ? `linear-gradient(135deg, ${currentPrimary} 0%, ${currentSecondary} 100%)` : currentPrimary);
            const isGrad = theme.isGradient !== false;
            const fontFam = theme.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const radius = theme.cardRadius || '8px';
            const isGlass = theme.cardGlass === true;

            const bgImgUrl = theme.bgImage || '';
            const bgVideoUrl = theme.bgVideo || '';
            const bgOpacity = theme.bgOpacity !== undefined ? Math.max(0.05, Math.min(1, parseFloat(theme.bgOpacity))) : 0.25;
            const bgBlur = theme.bgBlur || 0;

            // Global Background Container Engine (Arka Plan Katmanı)
            let bgContainer = document.getElementById('global-bg-container');
            if (!bgContainer) {
                bgContainer = document.createElement('div');
                bgContainer.id = 'global-bg-container';
                bgContainer.style.position = 'fixed';
                bgContainer.style.top = '0';
                bgContainer.style.left = '0';
                bgContainer.style.width = '100vw';
                bgContainer.style.height = '100vh';
                bgContainer.style.pointerEvents = 'none';
                bgContainer.style.zIndex = '0';
                bgContainer.style.overflow = 'hidden';
                document.body.prepend(bgContainer);
            }

            // Global Background Image Element Engine (Görsel / Duvar Kağıdı / Desen)
            let bgImgElem = document.getElementById('global-bg-image');
            if (bgImgUrl && !bgVideoUrl) {
                if (!bgImgElem) {
                    bgImgElem = document.createElement('div');
                    bgImgElem.id = 'global-bg-image';
                    bgContainer.appendChild(bgImgElem);
                }
                bgImgElem.style.display = 'block';
                bgImgElem.style.position = 'absolute';
                bgImgElem.style.top = '0';
                bgImgElem.style.left = '0';
                bgImgElem.style.width = '100%';
                bgImgElem.style.height = '100%';
                bgImgElem.style.backgroundImage = 'url(' + JSON.stringify(bgImgUrl) + ')';
                bgImgElem.style.backgroundSize = bgImgUrl.startsWith('data:image/svg') ? 'auto' : 'cover';
                bgImgElem.style.backgroundPosition = 'center';
                bgImgElem.style.backgroundRepeat = bgImgUrl.startsWith('data:image/svg') ? 'repeat' : 'no-repeat';
                bgImgElem.style.opacity = bgOpacity;
                bgImgElem.style.filter = bgBlur > 0 ? `blur(${bgBlur}px)` : 'none';
            } else {
                if (bgImgElem) {
                    bgImgElem.style.display = 'none';
                }
            }

            // Global Background Video Engine (Sürekli Sessiz Döngü Video Katmanı)
            let bgVideoElem = document.getElementById('global-bg-video');
            if (bgVideoUrl) {
                if (!bgVideoElem) {
                    bgVideoElem = document.createElement('video');
                    bgVideoElem.id = 'global-bg-video';
                    bgVideoElem.autoplay = true;
                    bgVideoElem.loop = true;
                    bgVideoElem.muted = true;
                    bgVideoElem.playsInline = true;
                    bgVideoElem.setAttribute('muted', '');
                    bgVideoElem.setAttribute('playsinline', '');
                    bgVideoElem.setAttribute('webkit-playsinline', '');
                    bgVideoElem.setAttribute('autoplay', '');
                    bgVideoElem.setAttribute('loop', '');
                    bgContainer.appendChild(bgVideoElem);
                }
                bgVideoElem.style.display = 'block';
                bgVideoElem.style.position = 'absolute';
                bgVideoElem.style.top = '0';
                bgVideoElem.style.left = '0';
                bgVideoElem.style.width = '100%';
                bgVideoElem.style.height = '100%';
                bgVideoElem.style.objectFit = 'cover';
                bgVideoElem.style.opacity = bgOpacity;
                bgVideoElem.style.filter = bgBlur > 0 ? `blur(${bgBlur}px)` : 'none';

                if (bgVideoElem.src !== bgVideoUrl) {
                    bgVideoElem.src = bgVideoUrl;
                    const playPromise = bgVideoElem.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(err => {
                            console.log('Video bg autoplay bekliyor:', err);
                        });
                    }
                }
            } else {
                if (bgVideoElem) {
                    bgVideoElem.style.display = 'none';
                }
            }

            const headerGradient = theme.headerColor ? theme.headerColor : (isGrad 
                ? `linear-gradient(135deg, ${currentPrimary} 0%, ${currentSecondary} 100%)`
                : currentPrimary);

            const glassStyleRule = isGlass ? `
                .card, .drawer {
                    backdrop-filter: blur(14px) !important;
                    -webkit-backdrop-filter: blur(14px) !important;
                    background-color: ${currentCard}e6 !important;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1) !important;
                    border: 1px solid rgba(255, 255, 255, 0.15) !important;
                }
            ` : '';

            if (document.body) {
                document.body.classList.remove('view-mode-auto', 'view-mode-pc', 'view-mode-mobile');
                document.body.classList.add('view-mode-' + currentViewMode);
            }

            let viewModeCss = '';
            if (currentViewMode === 'pc') {
                viewModeCss = `
                    body {
                        overflow-x: auto !important;
                    }
                    #app {
                        min-width: 1024px !important;
                        max-width: 1440px !important;
                        margin: 0 auto !important;
                        box-shadow: 0 0 40px rgba(0, 0, 0, 0.12) !important;
                    }
                    .pos-layout-wrapper {
                        grid-template-columns: 1.6fr 1fr !important;
                        align-items: start !important;
                    }
                    .pos-products-grid {
                        grid-template-columns: repeat(4, 1fr) !important;
                        gap: 8px !important;
                    }
                    .pos-product-card {
                        padding: 8px 6px !important;
                    }
                    .pos-products-scroll-wrapper {
                        max-height: 480px !important;
                    }
                    .grid-2 { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
                    .grid-3 { grid-template-columns: repeat(3, 1fr) !important; gap: 12px !important; }
                    .grid-4 { grid-template-columns: repeat(4, 1fr) !important; gap: 12px !important; }
                    .card { padding: 12px 16px !important; margin-bottom: 12px !important; }
                `;
            } else if (currentViewMode === 'mobile') {
                viewModeCss = `
                    body {
                        background-color: ${theme.background ? theme.background : '#0f172a'} !important;
                        display: flex !important;
                        justify-content: center !important;
                        padding: 0 !important;
                    }
                    #app {
                        width: 100% !important;
                        max-width: 440px !important;
                        min-height: 100vh !important;
                        margin: 0 auto !important;
                        box-shadow: 0 0 50px rgba(0, 0, 0, 0.3) !important;
                        border-left: 1px solid rgba(255, 255, 255, 0.1);
                        border-right: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    .pos-layout-wrapper {
                        grid-template-columns: 1fr !important;
                        gap: 10px !important;
                    }
                    .pos-products-grid {
                        grid-template-columns: repeat(3, 1fr) !important;
                        gap: 4px !important;
                    }
                    .pos-product-card {
                        padding: 6px 4px !important;
                    }
                    .pos-products-scroll-wrapper {
                        max-height: 220px !important;
                    }
                    .grid-2 { grid-template-columns: repeat(2, 1fr) !important; gap: 6px !important; }
                    .grid-3 { grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
                    .grid-4 { grid-template-columns: repeat(2, 1fr) !important; gap: 6px !important; }
                    .card { padding: 8px 10px !important; margin-bottom: 8px !important; border-radius: 10px !important; }
                `;
            }

            const isDark = isDarkMode();

            styleTag.textContent = `
                html {
                    background-color: ${theme.background || '#f9f5ff'} !important;
                }
                body {
                    font-family: ${fontFam} !important;
                    background-color: ${theme.background || '#f9f5ff'} !important;
                    color: ${theme.text || '#1f2937'} !important;
                    position: relative;
                    min-height: 100vh;
                }
                #global-bg-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    z-index: 0;
                    pointer-events: none;
                    overflow: hidden;
                }
                #app {
                    position: relative;
                    z-index: 1;
                    background: transparent !important;
                }
                .header {
                    background: ${headerGradient} !important;
                    box-shadow: 0 4px 15px ${currentPrimary}35 !important;
                }
                .card {
                    border-radius: ${radius} !important;
                    background-color: ${theme.card || '#ffffff'};
                    color: ${theme.text || '#1f2937'};
                    box-shadow: ${isDark ? '0 2px 10px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.05)'};
                    border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'};
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .card:hover {
                    box-shadow: ${isDark ? '0 6px 22px rgba(0, 0, 0, 0.6)' : '0 6px 20px rgba(0, 0, 0, 0.08)'};
                }
                .modal-content {
                    background-color: ${currentCard} !important;
                    color: ${currentText} !important;
                    border: 1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'} !important;
                }
                .modal-header {
                    border-bottom-color: ${isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb'} !important;
                    color: ${currentText} !important;
                }
                .drawer {
                    background-color: ${currentCard} !important;
                    color: ${currentText} !important;
                }
                .table th {
                    border-bottom-color: ${currentPrimary}40 !important;
                    color: ${currentText} !important;
                }
                .table td {
                    border-bottom-color: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} !important;
                    color: ${currentText} !important;
                }
                .drawer-nav-item.active {
                    background: ${headerGradient} !important;
                    box-shadow: 0 4px 12px ${currentPrimary}40 !important;
                }
                ${glassStyleRule}

                /* Mobile & PC Layout Refinement */
                .pos-layout-wrapper {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 12px;
                }
                @media (min-width: 900px) {
                    .pos-layout-wrapper {
                        grid-template-columns: 1.6fr 1fr;
                        align-items: start;
                    }
                }
                .pos-products-scroll-wrapper {
                    max-height: 320px;
                    min-height: 180px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding-right: 4px;
                    scroll-behavior: smooth;
                }
                .pos-products-scroll-wrapper::-webkit-scrollbar {
                    width: 5px;
                }
                .pos-products-scroll-wrapper::-webkit-scrollbar-track {
                    background: transparent;
                }
                .pos-products-scroll-wrapper::-webkit-scrollbar-thumb {
                    background: rgba(140, 140, 140, 0.3);
                    border-radius: 10px;
                }
                .pos-products-scroll-wrapper::-webkit-scrollbar-thumb:hover {
                    background: rgba(140, 140, 140, 0.6);
                }
                .pos-products-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 8px;
                }
                .pos-product-card {
                    background: ${theme.card || '#ffffff'};
                    padding: 8px 6px;
                    border-radius: 8px;
                    cursor: pointer;
                    text-align: center;
                    border: 1px solid ${theme.primary}20;
                    transition: all 0.15s ease;
                }
                .pos-product-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                    border-color: ${theme.primary};
                }
                @media (max-width: 768px) {
                    .grid-2 {
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 6px !important;
                    }
                    .grid-3 {
                        grid-template-columns: repeat(3, 1fr) !important;
                        gap: 6px !important;
                    }
                    .grid-4 {
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 6px !important;
                    }
                    .card {
                        padding: 8px 10px !important;
                        margin-bottom: 6px !important;
                        border-radius: 8px !important;
                    }
                    button {
                        min-height: unset !important;
                    }
                    .pos-products-grid {
                        grid-template-columns: repeat(3, 1fr) !important;
                        gap: 4px !important;
                    }
                    .pos-product-card {
                        padding: 6px 4px !important;
                    }
                    .pos-products-scroll-wrapper {
                        max-height: 200px !important;
                    }
                }
                @media (min-width: 1200px) {
                    .pos-products-grid {
                        grid-template-columns: repeat(4, 1fr);
                    }
                }
                @media (min-width: 769px) {
                    .container, #app {
                        max-width: 1280px;
                        margin: 0 auto;
                    }
                }
                .pos-mobile-checkout-bar {
                    display: none;
                }
                @media (max-width: 900px) {
                    .pos-mobile-checkout-bar {
                        display: flex !important;
                        position: fixed !important;
                        bottom: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        z-index: 9990 !important;
                        background: ${theme.card || '#ffffff'} !important;
                        border-top: 2px solid ${theme.primary || '#8b5cf6'} !important;
                        padding: 10px 14px !important;
                        box-shadow: 0 -8px 25px rgba(0,0,0,0.25) !important;
                        align-items: center !important;
                        justify-content: space-between !important;
                        gap: 8px !important;
                        backdrop-filter: blur(8px);
                    }
                    body {
                        padding-bottom: 85px !important;
                    }
                    .pos-right-section {
                        margin-bottom: 90px !important;
                    }
                }
                @keyframes toastIn {
                    from { opacity: 0; transform: translateY(-20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.92); }
                    to { opacity: 1; transform: scale(1); }
                }
                ${viewModeCss}
            `;
        }

        applyThemeStyles();

        // ========== ENHANCED GLOBAL CAMERA & SCANNER ENGINE ==========

// Export Theme globals
if (typeof window !== 'undefined') {
    window.presetPatterns = presetPatterns;
    window.themes = themes;
    window.theme = theme;
    window.currentViewMode = currentViewMode;
    window.isDarkMode = isDarkMode;
    window.setThemeMode = setThemeMode;
    window.toggleThemeMode = toggleThemeMode;
    window.setViewMode = setViewMode;
    window.getThemeColors = getThemeColors;
    window.getAccountTheme = getAccountTheme;
    window.loadUserTheme = loadUserTheme;
    window.applyThemeStyles = applyThemeStyles;
}
