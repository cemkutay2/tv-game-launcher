/**
 * LobbyScene for TV Host Screen
 * Creates room, renders on-canvas QR code, visualizes joined players, provides game carousel.
 */
class LobbyScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LobbyScene' });

        this.network = null;
        this.soundFx = null;
        this.roomId = null;
        this.controllerUrl = null;
        this.players = [];
        this.networkUnsubscribers = [];

        // Game catalogue available for party play
        this.gamesList = [
            {
                id: 'demo-buzzer',
                title: '⚡ Buzzer Blitz',
                description: 'Fastest finger reaction buzzer party battle!',
                layout: 'BUZZER',
                sceneKey: 'DemoBuzzerGameScene',
                color: 0xFF4757
            },
            {
                id: 'party-quiz',
                title: '🧠 4-Button Trivia',
                description: 'Multiplayer 4-choice trivia showdown.',
                layout: 'FOUR_BUTTONS',
                sceneKey: 'DemoBuzzerGameScene', // Fallback to buzzer demo
                color: 0x1E90FF
            },
            {
                id: 'retro-arcade',
                title: '🕹️ Retro Arcade Duel',
                description: 'Classic D-pad arcade party competition.',
                layout: 'DPAD_ACTION',
                sceneKey: 'DemoBuzzerGameScene', // Fallback to buzzer demo
                color: 0x2ED573
            }
        ];
        this.selectedGameIndex = 0;
    }

    init(data) {
        this.network = data.network || window.tvHostNetwork;
        this.soundFx = data.soundFx || window.soundFx;
        if (data.players) {
            this.players = data.players.map(p => ({ ...p, isReady: false }));
        }

        // Clean-up hook on scene shutdown
        this.events.once('shutdown', this.cleanup, this);
        this.events.once('destroy', this.cleanup, this);
    }

    create() {
        this.cameras.main.setBackgroundColor('#0A0C14');

        // Draw ambient background
        this.drawLobbyBackground();

        // UI sections
        this.createHeader();
        this.createJoinPanel();
        this.createPlayersGrid();
        this.createGameCarousel();
        this.createFooterControls();

        // Connect network & setup listeners
        this.setupNetworking();

        // Setup TV Remote / Keyboard inputs
        this.setupKeyNavigation();
    }

    drawLobbyBackground() {
        const bg = this.add.graphics();
        // Rich subtle dark gradient
        bg.fillGradientStyle(0x131828, 0x131828, 0x080A10, 0x080A10, 1);
        bg.fillRect(0, 0, 1920, 1080);

        // Tech grid lines
        bg.lineStyle(1, 0x1B2338, 0.4);
        for (let x = 0; x < 1920; x += 120) {
            bg.moveTo(x, 0);
            bg.lineTo(x, 1080);
        }
        for (let y = 0; y < 1080; y += 120) {
            bg.moveTo(0, y);
            bg.lineTo(1920, y);
        }
        bg.strokePath();
    }

    createHeader() {
        // App title
        this.add.text(100, 60, 'HOTEL SMART TV PARTY', {
            fontSize: '28px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE',
            letterSpacing: 4,
            fontStyle: 'bold'
        });

        this.add.text(100, 100, 'Party Room & Game Lobby', {
            fontSize: '48px',
            fontFamily: 'system-ui, sans-serif',
            color: '#FFFFFF',
            fontStyle: 'bold'
        });
    }

    createJoinPanel() {
        // Left Column: QR Code & Room Code Card
        const cardX = 100;
        const cardY = 180;
        const cardWidth = 440;
        const cardHeight = 620;

        const cardBg = this.add.graphics();
        cardBg.fillStyle(0x131826, 0.95);
        cardBg.fillRoundedRect(cardX, cardY, cardWidth, cardHeight, 24);
        cardBg.lineStyle(2, 0x00D2D3, 0.4);
        cardBg.strokeRoundedRect(cardX, cardY, cardWidth, cardHeight, 24);

        // Room code display
        this.add.text(cardX + cardWidth / 2, cardY + 36, 'ROOM CODE', {
            fontSize: '18px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE',
            letterSpacing: 3,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.roomCodeText = this.add.text(cardX + cardWidth / 2, cardY + 80, '....', {
            fontSize: '68px',
            fontFamily: 'system-ui, sans-serif',
            color: '#00D2D3',
            fontStyle: 'bold',
            letterSpacing: 8
        }).setOrigin(0.5);

        // QR Code Graphics placeholder
        this.qrGraphics = this.add.graphics();
        this.qrX = cardX + (cardWidth - 280) / 2;
        this.qrY = cardY + 140;

        // Controller URL Text
        this.urlLabel = this.add.text(cardX + cardWidth / 2, cardY + 450, 'SCAN WITH PHONE CAMERA', {
            fontSize: '16px',
            fontFamily: 'system-ui, sans-serif',
            color: '#2ED573',
            letterSpacing: 2,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.urlDetailText = this.add.text(cardX + cardWidth / 2, cardY + 490, 'or visit in browser:\nConnecting to server...', {
            fontSize: '18px',
            fontFamily: 'system-ui, sans-serif',
            color: '#FFFFFF',
            align: 'center',
            wordWrap: { width: cardWidth - 40 }
        }).setOrigin(0.5);

        // Player count pill
        this.playerCountPill = this.add.text(cardX + cardWidth / 2, cardY + 565, '0 / 8 Players Joined', {
            fontSize: '18px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE',
            backgroundColor: '#1E2538',
            padding: { x: 16, y: 8 }
        }).setOrigin(0.5);
    }

    createPlayersGrid() {
        // Center-Right: Player Card Slots
        const gridX = 580;
        const gridY = 180;

        this.add.text(gridX, gridY, 'CONNECTED PLAYERS', {
            fontSize: '22px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE',
            letterSpacing: 2,
            fontStyle: 'bold'
        });

        this.playersContainer = this.add.container(gridX, gridY + 40);
        this.renderPlayerSlots();
    }

    renderPlayerSlots() {
        this.playersContainer.removeAll(true);

        const slotWidth = 300;
        const slotHeight = 110;
        const cols = 4;
        const gapX = 24;
        const gapY = 20;

        for (let i = 0; i < 8; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = col * (slotWidth + gapX);
            const y = row * (slotHeight + gapY);

            const player = this.players[i] || null;
            const slot = this.add.container(x, y);

            const bg = this.add.graphics();
            if (player) {
                const hexColor = parseInt(player.color.replace('#', '0x'), 16);
                bg.fillStyle(0x131826, 0.95);
                bg.fillRoundedRect(0, 0, slotWidth, slotHeight, 16);
                bg.lineStyle(player.isReady ? 3 : 2, player.isReady ? 0x2ED573 : hexColor, 1);
                bg.strokeRoundedRect(0, 0, slotWidth, slotHeight, 16);

                // Avatar circle
                const avatar = this.add.circle(44, slotHeight / 2, 28, hexColor);
                const initial = this.add.text(44, slotHeight / 2, player.name.charAt(0).toUpperCase(), {
                    fontSize: '26px',
                    fontFamily: 'system-ui, sans-serif',
                    color: '#FFFFFF',
                    fontStyle: 'bold'
                }).setOrigin(0.5);

                // Name
                const name = this.add.text(86, slotHeight / 2 - 18, player.name, {
                    fontSize: '22px',
                    fontFamily: 'system-ui, sans-serif',
                    color: '#FFFFFF',
                    fontStyle: 'bold'
                });

                // Status Badge
                const status = this.add.text(86, slotHeight / 2 + 10, player.isReady ? '✓ READY' : '● Waiting', {
                    fontSize: '16px',
                    fontFamily: 'system-ui, sans-serif',
                    color: player.isReady ? '#2ED573' : '#8F9CAE',
                    fontStyle: 'bold'
                });

                slot.add([bg, avatar, initial, name, status]);
            } else {
                // Empty slot placeholder
                bg.lineStyle(2, 0x1E2738, 0.8);
                bg.strokeRoundedRect(0, 0, slotWidth, slotHeight, 16);

                const placeholderText = this.add.text(slotWidth / 2, slotHeight / 2, `Slot ${i + 1}\nWaiting for player...`, {
                    fontSize: '16px',
                    fontFamily: 'system-ui, sans-serif',
                    color: '#344055',
                    align: 'center'
                }).setOrigin(0.5);

                slot.add([bg, placeholderText]);
            }

            this.playersContainer.add(slot);
        }

        // Update count pill
        const count = this.players.length;
        this.playerCountPill.setText(`${count} / 8 Players Joined`);
    }

    createGameCarousel() {
        const carouselX = 580;
        const carouselY = 520;

        this.add.text(carouselX, carouselY, 'SELECT PARTY GAME', {
            fontSize: '22px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE',
            letterSpacing: 2,
            fontStyle: 'bold'
        });

        this.carouselContainer = this.add.container(carouselX, carouselY + 40);
        this.renderGameCards();
    }

    renderGameCards() {
        this.carouselContainer.removeAll(true);

        const cardWidth = 380;
        const cardHeight = 220;
        const gap = 30;

        this.gamesList.forEach((game, idx) => {
            const isSelected = idx === this.selectedGameIndex;
            const x = idx * (cardWidth + gap);
            const card = this.add.container(x, 0);

            const bg = this.add.graphics();
            bg.fillStyle(isSelected ? 0x1B2338 : 0x131826, 0.95);
            bg.fillRoundedRect(0, 0, cardWidth, cardHeight, 18);
            bg.lineStyle(isSelected ? 4 : 2, isSelected ? game.color : 0x243048, 1);
            bg.strokeRoundedRect(0, 0, cardWidth, cardHeight, 18);

            // Title
            const title = this.add.text(24, 24, game.title, {
                fontSize: '28px',
                fontFamily: 'system-ui, sans-serif',
                color: '#FFFFFF',
                fontStyle: 'bold'
            });

            // Description
            const desc = this.add.text(24, 75, game.description, {
                fontSize: '18px',
                fontFamily: 'system-ui, sans-serif',
                color: '#8F9CAE',
                wordWrap: { width: cardWidth - 48 }
            });

            // Controller layout tag
            const layoutTag = this.add.text(24, cardHeight - 48, `Layout: ${game.layout}`, {
                fontSize: '15px',
                fontFamily: 'system-ui, sans-serif',
                color: isSelected ? '#00D2D3' : '#5C667A',
                fontStyle: 'bold',
                backgroundColor: '#0F1420',
                padding: { x: 10, y: 5 }
            });

            card.add([bg, title, desc, layoutTag]);
            this.carouselContainer.add(card);
        });
    }

    createFooterControls() {
        // Start Game Button / Status Banner at bottom
        this.footerContainer = this.add.container(960, 960);

        this.startBtnBg = this.add.rectangle(0, 0, 800, 80, 0x1E2738, 0.95);
        this.startBtnBg.setStrokeStyle(3, 0x5C667A);

        this.startBtnText = this.add.text(0, 0, 'WAITING FOR PLAYERS TO READY UP...', {
            fontSize: '26px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE',
            fontStyle: 'bold',
            letterSpacing: 2
        }).setOrigin(0.5);

        this.footerContainer.add([this.startBtnBg, this.startBtnText]);

        // Remote navigation instructions
        this.add.text(960, 1030, 'TV Remote: [◀ / ▶] Change Game   |   [ENTER / OK] Start Game', {
            fontSize: '18px',
            fontFamily: 'system-ui, sans-serif',
            color: '#5C667A'
        }).setOrigin(0.5);
    }

    async setupNetworking() {
        if (!this.network) return;

        try {
            if (!this.network.isConnected) {
                await this.network.connect();
            }

            // Hook network events
            const unsubCreated = this.network.on('ROOM_CREATED', (payload) => {
                this.handleRoomCreated(payload);
            });
            this.networkUnsubscribers.push(unsubCreated);

            const unsubJoined = this.network.on('PLAYER_JOINED', (payload) => {
                this.handlePlayerJoined(payload);
            });
            this.networkUnsubscribers.push(unsubJoined);

            const unsubLobbyUpdate = this.network.on('LOBBY_STATE_UPDATE', (payload) => {
                this.handleLobbyUpdate(payload);
            });
            this.networkUnsubscribers.push(unsubLobbyUpdate);

            const unsubLeft = this.network.on('PLAYER_LEFT', (payload) => {
                this.handlePlayerLeft(payload);
            });
            this.networkUnsubscribers.push(unsubLeft);

            const unsubGameStarted = this.network.on('GAME_STARTED', (payload) => {
                this.launchSelectedGame();
            });
            this.networkUnsubscribers.push(unsubGameStarted);

            // If already has roomId (e.g. returning from game), display it
            if (this.network.roomId) {
                this.roomCodeText.setText(this.network.roomId);
                if (this.network.controllerUrl) {
                    this.renderQRCode(this.network);
                }
                this.renderPlayerSlots();
                this.checkReadyStatus();
            } else {
                // Request room creation
                this.network.createRoom('TV Host');
            }
        } catch (err) {
            console.error('[Lobby] Networking setup failed:', err);
            this.urlDetailText.setText('Server connection failed.\nCheck that server is running.');
        }
    }

    handleRoomCreated(payload) {
        this.roomId = payload.roomId;
        this.controllerUrl = payload.controllerUrl;

        this.roomCodeText.setText(this.roomId);
        this.urlDetailText.setText(this.controllerUrl);

        // Render QR Code onto Phaser canvas
        this.renderQRCode(payload);

        // Notify server of initial selected game
        const initialGame = this.gamesList[this.selectedGameIndex];
        this.network.selectGame(initialGame.id, initialGame.title);
    }

    renderQRCode(source) {
        this.qrGraphics.clear();
        const qrModules = (source && source.qrModules) ? source.qrModules : (this.network ? this.network.qrModules : null);
        const x = this.qrX;
        const y = this.qrY;
        const sizePx = 280;

        if (qrModules && qrModules.data) {
            const size = qrModules.size;
            const quietZone = 4; // ISO standard 4-module quiet zone
            const totalModules = size + (quietZone * 2);
            const moduleSize = sizePx / totalModules;

            // Sharp white background
            this.qrGraphics.fillStyle(0xFFFFFF, 1);
            this.qrGraphics.fillRect(x, y, sizePx, sizePx);

            // Dark modules
            this.qrGraphics.fillStyle(0x000000, 1);
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (qrModules.data[r * size + c] === 1) {
                        const mx = x + (c + quietZone) * moduleSize;
                        const my = y + (r + quietZone) * moduleSize;
                        this.qrGraphics.fillRect(
                            Math.floor(mx),
                            Math.floor(my),
                            Math.ceil(moduleSize),
                            Math.ceil(moduleSize)
                        );
                    }
                }
            }
            console.log('[Lobby] Spec-compliant on-canvas QR rendered.');
            return;
        }

        if (typeof window.QRCodeGenerator !== 'undefined' && typeof source === 'string') {
            try {
                const qr = window.QRCodeGenerator.create(source);
                qr.renderToGraphics(this.qrGraphics, x, y, sizePx, 0x000000, 0xFFFFFF);
            } catch (err) {
                console.error('[Lobby] Fallback QR rendering failed:', err);
            }
        }
    }

    handlePlayerJoined(payload) {
        const player = payload.player;
        // Check if player already exists
        const existingIdx = this.players.findIndex(p => p.id === player.id);
        if (existingIdx >= 0) {
            this.players[existingIdx] = player;
        } else {
            this.players.push(player);
        }

        if (this.soundFx) this.soundFx.joinChime();
        this.renderPlayerSlots();
        this.checkReadyStatus();
    }

    handleLobbyUpdate(payload) {
        if (payload.players) {
            this.players = payload.players;
            this.renderPlayerSlots();
            this.checkReadyStatus();
            if (payload.player && payload.player.isReady && this.soundFx) {
                this.soundFx.readyBeep();
            }
        }
    }

    handlePlayerLeft(payload) {
        this.players = this.players.filter(p => p.id !== payload.playerId);
        this.renderPlayerSlots();
        this.checkReadyStatus();
    }

    checkReadyStatus() {
        const connectedPlayers = this.players.filter(p => p.connected !== false);
        const allReady = connectedPlayers.length > 0 && connectedPlayers.every(p => p.isReady);

        if (connectedPlayers.length === 0) {
            this.startBtnBg.setFillStyle(0x1E2738, 0.95);
            this.startBtnBg.setStrokeStyle(3, 0x5C667A);
            this.startBtnText.setText('WAITING FOR PLAYERS TO JOIN...');
            this.startBtnText.setColor('#8F9CAE');
            this.canStart = false;
        } else if (!allReady) {
            const readyCount = connectedPlayers.filter(p => p.isReady).length;
            this.startBtnBg.setFillStyle(0x1E2738, 0.95);
            this.startBtnBg.setStrokeStyle(3, 0xFFA502);
            this.startBtnText.setText(`WAITING FOR READY (${readyCount}/${connectedPlayers.length})`);
            this.startBtnText.setColor('#FFA502');
            this.canStart = true; // Host can force start or wait
        } else {
            // ALL READY!
            this.startBtnBg.setFillStyle(0x163826, 0.95);
            this.startBtnBg.setStrokeStyle(4, 0x2ED573);
            this.startBtnText.setText('⚡ ALL PLAYERS READY! PRESS [ENTER] TO START ⚡');
            this.startBtnText.setColor('#2ED573');
            this.canStart = true;

            // Pulse animation
            this.tweens.add({
                targets: this.startBtnBg,
                alpha: 0.8,
                duration: 400,
                yoyo: true,
                repeat: 2
            });
        }
    }

    setupKeyNavigation() {
        this.input.keyboard.on('keydown-LEFT', () => {
            if (this.selectedGameIndex > 0) {
                this.selectedGameIndex--;
                this.onGameSelectionChanged();
            }
        });

        this.input.keyboard.on('keydown-RIGHT', () => {
            if (this.selectedGameIndex < this.gamesList.length - 1) {
                this.selectedGameIndex++;
                this.onGameSelectionChanged();
            }
        });

        this.input.keyboard.on('keydown-ENTER', () => {
            this.requestStartGame();
        });

        this.input.keyboard.on('keydown-SPACE', () => {
            this.requestStartGame();
        });
    }

    onGameSelectionChanged() {
        this.renderGameCards();
        const game = this.gamesList[this.selectedGameIndex];
        if (this.network && this.roomId) {
            this.network.selectGame(game.id, game.title);
        }
    }

    requestStartGame() {
        if (!this.canStart && this.players.length === 0) {
            console.log('[Lobby] Cannot start without players');
            return;
        }

        const selectedGame = this.gamesList[this.selectedGameIndex];
        console.log('[Lobby] Starting game:', selectedGame.id);

        if (this.network) {
            this.network.startGame(selectedGame.id, selectedGame.layout, {});
        } else {
            this.launchSelectedGame();
        }
    }

    launchSelectedGame() {
        const selectedGame = this.gamesList[this.selectedGameIndex];
        this.scene.start(selectedGame.sceneKey, {
            roomId: this.roomId,
            players: this.players,
            network: this.network,
            soundFx: this.soundFx
        });
    }

    cleanup() {
        for (const unsub of this.networkUnsubscribers) {
            if (typeof unsub === 'function') unsub();
        }
        this.networkUnsubscribers = [];
        this.tweens.killAll();
    }
}

if (typeof window !== 'undefined') {
    window.LobbyScene = LobbyScene;
}

if (typeof module !== 'undefined') {
    module.exports = LobbyScene;
}
