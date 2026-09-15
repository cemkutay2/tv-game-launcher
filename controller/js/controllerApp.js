/**
 * Mobile Controller State Machine & UI Manager
 */
class ControllerApp {
    constructor() {
        this.network = window.controllerNetwork;
        this.wakeLock = window.wakeLockManager;
        this.haptics = window.haptics;

        this.currentView = 'JOIN_VIEW';
        this.player = null;
        this.roomId = null;
        this.selectedColor = '#FF4757';
        this.isReady = false;
        this.activeGameId = null;
        this.activeLayout = null;

        this.initDOMElements();
        this.initTouchSafety();
        this.bindEvents();
        this.parseUrlParams();
    }

    initDOMElements() {
        // Views
        this.views = {
            JOIN_VIEW: document.getElementById('view-join'),
            LOBBY_VIEW: document.getElementById('view-lobby'),
            GAME_VIEW: document.getElementById('view-game'),
            GAMEOVER_VIEW: document.getElementById('view-gameover')
        };

        // Header
        this.topBar = document.getElementById('top-bar');
        this.roomBadge = document.getElementById('room-badge');
        this.playerChip = document.getElementById('player-chip');
        this.playerAvatarDot = document.getElementById('player-avatar-dot');
        this.playerNameDisplay = document.getElementById('player-name-display');

        // Join View inputs
        this.roomInput = document.getElementById('input-room-code');
        this.nameInput = document.getElementById('input-player-name');
        this.btnJoin = document.getElementById('btn-join');
        this.colorSwatchesContainer = document.getElementById('color-swatches');

        // Lobby View elements
        this.lobbyAvatar = document.getElementById('lobby-avatar');
        this.lobbyPlayerName = document.getElementById('lobby-player-name');
        this.btnReady = document.getElementById('btn-ready');
        this.lobbyStatusPill = document.getElementById('lobby-status-pill');
        this.gamePreviewTitle = document.getElementById('game-preview-title');

        // Game View container
        this.gameContainer = document.getElementById('game-container');

        // Game Over View
        this.winnerNameText = document.getElementById('winner-name-text');
        this.toast = document.getElementById('toast');
    }

    /**
     * Prevents pull-to-refresh, double-tap zoom, and pinch gestures
     */
    initTouchSafety() {
        document.addEventListener('touchmove', (e) => {
            // Prevent bounce and pull-to-refresh when dragging outside scrollable areas
            if (this.currentView === 'GAME_VIEW') {
                e.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('dblclick', (e) => {
            e.preventDefault();
        }, { passive: false });
    }

    parseUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room && this.roomInput) {
            this.roomInput.value = room.toUpperCase().trim();
        }

        // Auto-generate a fun random name if empty
        const defaultNames = ['NeonFox', 'CyberPanda', 'LaserTiger', 'PixelEagle', 'StarFalcon', 'TurboKoala', 'NovaLynx', 'SonicOtter'];
        if (this.nameInput && !this.nameInput.value) {
            this.nameInput.placeholder = defaultNames[Math.floor(Math.random() * defaultNames.length)];
        }

        // Check if returning from previous session
        const cachedRoom = sessionStorage.getItem('tv_room_id');
        const cachedPlayerId = sessionStorage.getItem('tv_player_id');
        const cachedToken = sessionStorage.getItem('tv_player_token');

        if (cachedRoom && cachedPlayerId && (!room || room.toUpperCase() === cachedRoom)) {
            console.log('[App] Found existing session, attempting fast re-join...');
            this.attemptAutoRejoin(cachedRoom, cachedPlayerId, cachedToken);
        }
    }

    bindEvents() {
        // Color swatches selection
        const swatches = this.colorSwatchesContainer.querySelectorAll('.color-swatch');
        swatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                swatches.forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                this.selectedColor = swatch.dataset.color;
                this.haptics.tap();
            });
        });

        // Join button
        this.btnJoin.addEventListener('click', () => {
            this.haptics.tap();
            this.handleJoin();
        });

        // Ready toggle
        this.btnReady.addEventListener('click', () => {
            this.toggleReady();
        });

        // Network event listeners
        this.network.on('PLAYER_JOINED', (payload) => {
            this.player = payload.player;
            this.roomId = payload.roomState.roomId;

            // Cache credentials
            sessionStorage.setItem('tv_room_id', this.roomId);
            sessionStorage.setItem('tv_player_id', this.player.id);
            if (payload.playerToken) {
                sessionStorage.setItem('tv_player_token', payload.playerToken);
            }

            this.updateHeader();
            this.setupLobbyView(payload.roomState);
            this.switchView('LOBBY_VIEW');
            this.wakeLock.requestLock();
            this.haptics.success();
        });

        this.network.on('JOIN_ERROR', (payload) => {
            this.showToast(`Error: ${payload.code}`);
        });

        this.network.on('LOBBY_STATE_UPDATE', (payload) => {
            if (payload.player && this.player && payload.player.id === this.player.id) {
                this.player.isReady = payload.player.isReady;
                this.updateReadyUI(this.player.isReady);
            }
        });

        this.network.on('GAME_SELECT', (payload) => {
            if (this.gamePreviewTitle) {
                this.gamePreviewTitle.textContent = payload.gameTitle || payload.gameId;
            }
        });

        this.network.on('GAME_START', (payload) => {
            console.log('[App] Game started, mounting layout:', payload.controllerLayoutType);
            this.activeGameId = payload.gameId;
            this.activeLayout = payload.controllerLayoutType;
            this.mountGameLayout(payload.controllerLayoutType);
            this.switchView('GAME_VIEW');
            this.haptics.buzz();
        });

        this.network.on('GAME_OVER', (payload) => {
            console.log('[App] Game over received');
            if (payload.winner) {
                this.winnerNameText.textContent = payload.winner.name + ' Won!';
            } else {
                this.winnerNameText.textContent = 'Round Complete!';
            }
            this.switchView('GAMEOVER_VIEW');
        });

        this.network.on('RETURN_TO_LOBBY', (payload) => {
            console.log('[App] Returned to lobby');
            this.isReady = false;
            if (this.player) this.player.isReady = false;
            this.updateReadyUI(false);
            this.switchView('LOBBY_VIEW');
        });
    }

    async handleJoin() {
        const roomCode = (this.roomInput.value || '').toUpperCase().trim();
        const playerName = (this.nameInput.value || '').trim() || this.nameInput.placeholder;

        if (roomCode.length !== 4) {
            this.showToast('Please enter a 4-letter room code');
            return;
        }

        this.btnJoin.disabled = true;
        this.btnJoin.textContent = 'Connecting...';

        try {
            if (!this.network.isConnected) {
                await this.network.connect();
            }

            this.network.roomId = roomCode;
            this.network.send('PLAYER_JOIN', {
                roomId: roomCode,
                name: playerName,
                color: this.selectedColor
            });
        } catch (err) {
            console.error('[App] Join error:', err);
            this.showToast('Connection failed. Retrying...');
            this.btnJoin.disabled = false;
            this.btnJoin.textContent = 'Join Room';
        }
    }

    async attemptAutoRejoin(roomCode, playerId, playerToken) {
        try {
            if (!this.network.isConnected) {
                await this.network.connect();
            }
            this.network.roomId = roomCode;
            this.network.send('PLAYER_JOIN', {
                roomId: roomCode,
                playerId,
                playerToken
            });
        } catch (e) {
            console.warn('[App] Auto rejoin failed, fallback to manual join');
        }
    }

    toggleReady() {
        this.isReady = !this.isReady;
        this.haptics.tap();
        this.network.send('PLAYER_READY', {
            isReady: this.isReady
        });
        this.updateReadyUI(this.isReady);
    }

    updateReadyUI(ready) {
        this.isReady = ready;
        if (ready) {
            this.btnReady.className = 'btn-ready is-ready';
            this.btnReady.textContent = 'I AM READY! (TAP TO CANCEL)';
            this.lobbyStatusPill.className = 'status-pill ready';
            this.lobbyStatusPill.textContent = 'Status: READY';
        } else {
            this.btnReady.className = 'btn-ready not-ready';
            this.btnReady.textContent = 'READY UP!';
            this.lobbyStatusPill.className = 'status-pill';
            this.lobbyStatusPill.textContent = 'Status: Waiting...';
        }
    }

    setupLobbyView(roomState) {
        if (!this.player) return;

        this.lobbyAvatar.style.backgroundColor = this.player.color;
        this.lobbyAvatar.style.color = '#fff';
        this.lobbyAvatar.textContent = this.player.name.charAt(0).toUpperCase();
        this.lobbyPlayerName.textContent = this.player.name;

        if (roomState && roomState.activeGameTitle) {
            this.gamePreviewTitle.textContent = roomState.activeGameTitle;
        }

        this.updateReadyUI(this.player.isReady);
    }

    updateHeader() {
        if (!this.player) return;
        this.topBar.style.display = 'flex';
        this.roomBadge.textContent = 'ROOM ' + (this.roomId || '');
        this.playerNameDisplay.textContent = this.player.name;
        this.playerAvatarDot.style.backgroundColor = this.player.color;
        this.playerAvatarDot.style.color = this.player.color;
    }

    switchView(viewName) {
        this.currentView = viewName;
        const appElem = document.getElementById('app');
        if (viewName !== 'GAME_VIEW' && appElem) {
            appElem.classList.remove('layout-gamepad');
        }
        for (const [key, element] of Object.entries(this.views)) {
            if (key === viewName) {
                element.classList.add('active');
            } else {
                element.classList.remove('active');
            }
        }
    }

    /**
     * Dynamically mounts controller skins based on layout requested by server/game
     */
    mountGameLayout(layoutType) {
        this.gameContainer.innerHTML = '';
        const appElem = document.getElementById('app');

        if (layoutType === 'DPAD_ACTION') {
            if (appElem) appElem.classList.add('layout-gamepad');
            this.mountDpadSkin();
        } else {
            if (appElem) appElem.classList.remove('layout-gamepad');
            if (layoutType === 'FOUR_BUTTONS') {
                this.mountFourButtonsSkin();
            } else {
                this.mountBuzzerSkin();
            }
        }
    }

    /**
     * Skin: BUZZER
     */
    mountBuzzerSkin() {
        const wrapper = document.createElement('div');
        wrapper.className = 'buzzer-skin';

        const hint = document.createElement('div');
        hint.className = 'buzzer-hint';
        hint.textContent = 'Tap First!';

        const buzzerBtn = document.createElement('button');
        buzzerBtn.className = 'giant-buzzer';
        buzzerBtn.textContent = 'BUZZ!';

        const status = document.createElement('div');
        status.className = 'buzzer-status';
        status.textContent = 'Ready to buzz!';

        let hasBuzzed = false;

        const handleBuzz = (e) => {
            e.preventDefault();
            if (hasBuzzed) return;
            hasBuzzed = true;

            this.haptics.buzz();
            buzzerBtn.classList.add('pressed');
            status.textContent = '⚡ BUZZ SENT!';
            status.style.color = '#2ed573';

            // Send instantaneous input
            this.network.sendInput('BUZZ', 'button_down', 1);

            setTimeout(() => {
                buzzerBtn.classList.remove('pressed');
            }, 200);

            // Allow re-buzzing after 800ms
            setTimeout(() => {
                hasBuzzed = false;
                status.textContent = 'Ready to buzz!';
                status.style.color = 'var(--accent)';
            }, 800);
        };

        buzzerBtn.addEventListener('touchstart', handleBuzz, { passive: false });
        buzzerBtn.addEventListener('mousedown', handleBuzz);

        wrapper.appendChild(hint);
        wrapper.appendChild(buzzerBtn);
        wrapper.appendChild(status);
        this.gameContainer.appendChild(wrapper);
    }

    /**
     * Skin: FOUR_BUTTONS (Quiz / Choice / Party layout)
     */
    mountFourButtonsSkin() {
        const grid = document.createElement('div');
        grid.className = 'four-buttons-skin';

        const buttons = [
            { label: 'Red', class: 'btn-red', action: 'CHOICE_0', text: '▲' },
            { label: 'Blue', class: 'btn-blue', action: 'CHOICE_1', text: '◆' },
            { label: 'Yellow', class: 'btn-yellow', action: 'CHOICE_2', text: '●' },
            { label: 'Green', class: 'btn-green', action: 'CHOICE_3', text: '■' }
        ];

        buttons.forEach(btnConfig => {
            const btn = document.createElement('button');
            btn.className = `party-btn ${btnConfig.class}`;
            btn.innerHTML = `${btnConfig.text}<span class="party-btn-label">${btnConfig.label}</span>`;

            const handlePress = (e) => {
                e.preventDefault();
                this.haptics.tap();
                btn.classList.add('pressed');
                this.network.sendInput(btnConfig.action, 'choice', btnConfig.label);
                setTimeout(() => btn.classList.remove('pressed'), 150);
            };

            btn.addEventListener('touchstart', handlePress, { passive: false });
            btn.addEventListener('mousedown', handlePress);

            grid.appendChild(btn);
        });

        this.gameContainer.appendChild(grid);
    }

    /**
     * Skin: DPAD_ACTION - Landscape Gamepad with touch-sliding D-Pad
     */
    mountDpadSkin() {
        // Attempt orientation lock to landscape if browser permits
        if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.lock === 'function') {
            screen.orientation.lock('landscape').catch(() => {});
        }

        const dpadContainer = document.createElement('div');
        dpadContainer.className = 'dpad-skin';

        // 1. Portrait Rotation Notice
        const hintBanner = document.createElement('div');
        hintBanner.className = 'rotate-hint-banner';
        hintBanner.innerHTML = '<span>🔄</span><span>Rotate phone for console gamepad</span>';
        dpadContainer.appendChild(hintBanner);

        // 2. D-Pad cluster with center hub & smooth sliding touch detection
        const dpadCluster = document.createElement('div');
        dpadCluster.className = 'dpad-cluster';

        const dpadCenter = document.createElement('div');
        dpadCenter.className = 'dpad-center';
        dpadCluster.appendChild(dpadCenter);

        const dirMap = {};
        const directions = [
            { dir: 'UP', class: 'dpad-up', text: '▲' },
            { dir: 'DOWN', class: 'dpad-down', text: '▼' },
            { dir: 'LEFT', class: 'dpad-left', text: '◀' },
            { dir: 'RIGHT', class: 'dpad-right', text: '▶' }
        ];

        directions.forEach(d => {
            const btn = document.createElement('div');
            btn.className = `dpad-btn ${d.class}`;
            btn.textContent = d.text;
            btn.dataset.dir = d.dir;
            dpadCluster.appendChild(btn);
            dirMap[d.dir] = btn;
        });

        // Direction pointer tracking (allows sliding thumb between directions smoothly)
        let activeDir = null;

        const setActiveDir = (newDir) => {
            if (activeDir === newDir) return;
            if (activeDir) {
                if (dirMap[activeDir]) dirMap[activeDir].classList.remove('pressed');
                this.network.sendInput(activeDir, 'button_up');
            }
            activeDir = newDir;
            if (activeDir) {
                if (dirMap[activeDir]) dirMap[activeDir].classList.add('pressed');
                this.haptics.tap();
                this.network.sendInput(activeDir, 'button_down');
            }
        };

        const handlePointer = (e) => {
            e.preventDefault();
            const rect = dpadCluster.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            const dist = Math.hypot(dx, dy);

            // Inner deadzone threshold
            if (dist < 18) {
                setActiveDir(null);
                return;
            }

            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle >= -135 && angle < -45) {
                setActiveDir('UP');
            } else if (angle >= -45 && angle < 45) {
                setActiveDir('RIGHT');
            } else if (angle >= 45 && angle < 135) {
                setActiveDir('DOWN');
            } else {
                setActiveDir('LEFT');
            }
        };

        const clearPointer = (e) => {
            if (e) e.preventDefault();
            setActiveDir(null);
        };

        dpadCluster.addEventListener('pointerdown', (e) => {
            try { dpadCluster.setPointerCapture(e.pointerId); } catch (err) {}
            handlePointer(e);
        });
        dpadCluster.addEventListener('pointermove', (e) => {
            if (e.buttons > 0) handlePointer(e);
        });
        dpadCluster.addEventListener('pointerup', clearPointer);
        dpadCluster.addEventListener('pointercancel', clearPointer);

        // 3. Center HUD Display
        const centerHud = document.createElement('div');
        centerHud.className = 'gamepad-center-hud';

        const tankDot = document.createElement('div');
        tankDot.className = 'hud-tank-icon';
        const playerColor = this.player ? this.player.color : '#00d2d3';
        tankDot.style.backgroundColor = playerColor;
        tankDot.style.color = playerColor;

        const playerName = document.createElement('div');
        playerName.className = 'hud-player-name';
        playerName.textContent = this.player ? this.player.name : 'Player';

        const helpText = document.createElement('div');
        helpText.className = 'hud-help-text';
        helpText.textContent = 'A: FIRE  |  B: BOOST';

        centerHud.appendChild(tankDot);
        centerHud.appendChild(playerName);
        centerHud.appendChild(helpText);

        // 4. Action buttons cluster (A & B)
        const actionCluster = document.createElement('div');
        actionCluster.className = 'action-buttons-cluster';

        const actions = [
            { action: 'B', class: 'btn-b', letter: 'B', sublabel: 'BOOST' },
            { action: 'A', class: 'btn-a', letter: 'A', sublabel: 'FIRE' }
        ];

        actions.forEach(act => {
            const btn = document.createElement('button');
            btn.className = `action-round-btn ${act.class}`;
            btn.innerHTML = `<span class="btn-letter">${act.letter}</span><span class="btn-sublabel">${act.sublabel}</span>`;

            const startPress = (e) => {
                e.preventDefault();
                this.haptics.buzz();
                btn.classList.add('pressed');
                this.network.sendInput(act.action, 'button_down');
            };

            const endPress = (e) => {
                e.preventDefault();
                btn.classList.remove('pressed');
                this.network.sendInput(act.action, 'button_up');
            };

            btn.addEventListener('pointerdown', startPress);
            btn.addEventListener('pointerup', endPress);
            btn.addEventListener('pointercancel', endPress);

            actionCluster.appendChild(btn);
        });

        dpadContainer.appendChild(dpadCluster);
        dpadContainer.appendChild(centerHud);
        dpadContainer.appendChild(actionCluster);
        this.gameContainer.appendChild(dpadContainer);
    }

    showToast(message) {
        if (!this.toast) return;
        this.toast.textContent = message;
        this.toast.classList.add('visible');
        setTimeout(() => {
            this.toast.classList.remove('visible');
        }, 3000);
    }
}

// Auto-boot when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.controllerApp = new ControllerApp();
});
