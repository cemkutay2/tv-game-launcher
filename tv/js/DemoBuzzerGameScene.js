/**
 * DemoBuzzerGameScene
 * Fast-paced party buzzer game demonstrating seamless handoff from Lobby -> Game -> Lobby.
 * Inherits from BaseGameScene.
 */
class DemoBuzzerGameScene extends BaseGameScene {
    constructor() {
        super('DemoBuzzerGameScene');
        this.gameState = 'INTRO'; // 'INTRO' | 'COUNTDOWN' | 'ACTIVE' | 'ROUND_OVER' | 'MATCH_OVER'
        this.currentRound = 1;
        this.totalRounds = 3;
        this.roundStartTime = 0;
        this.buzzedPlayers = [];
        this.roundTimerEvent = null;
    }

    create() {
        this.cameras.main.setBackgroundColor('#0B0D14');

        // Draw background grid styling
        this.bgGraphics = this.add.graphics();
        this.drawBackground();

        // Setup UI Containers
        this.createHeaderUI();
        this.createCenterStageUI();
        this.createPlayerLeaderboardUI();
        this.createControlHelpUI();

        // Listen for keyboard (TV remote navigation: Enter / Space / Esc)
        this.input.keyboard.on('keydown-ENTER', () => this.handleRemoteSelect());
        this.input.keyboard.on('keydown-SPACE', () => this.handleRemoteSelect());
        this.input.keyboard.on('keydown-ESC', () => this.returnToLobby());

        // Start first round after short delay
        this.time.delayedCall(1200, () => {
            this.startNewRound();
        });
    }

    drawBackground() {
        this.bgGraphics.clear();
        // Subtle ambient radial glow in center
        this.bgGraphics.fillGradientStyle(0x161B2E, 0x161B2E, 0x0A0C14, 0x0A0C14, 0.7);
        this.bgGraphics.fillRect(0, 0, 1920, 1080);

        // Tech grid lines
        this.bgGraphics.lineStyle(1, 0x222B45, 0.4);
        for (let x = 0; x < 1920; x += 120) {
            this.bgGraphics.moveTo(x, 0);
            this.bgGraphics.lineTo(x, 1080);
        }
        for (let y = 0; y < 1080; y += 120) {
            this.bgGraphics.moveTo(0, y);
            this.bgGraphics.lineTo(1920, y);
        }
        this.bgGraphics.strokePath();
    }

    createHeaderUI() {
        // Game Title
        this.titleText = this.add.text(960, 60, '⚡ BUZZER BLITZ ⚡', {
            fontSize: '52px',
            fontFamily: 'system-ui, sans-serif',
            color: '#00D2D3',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Round indicator
        this.roundText = this.add.text(960, 120, `ROUND ${this.currentRound} / ${this.totalRounds}`, {
            fontSize: '28px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE',
            letterSpacing: 2
        }).setOrigin(0.5);
    }

    createCenterStageUI() {
        this.centerContainer = this.add.container(960, 480);

        // Central visual ring
        this.centerRing = this.add.circle(0, 0, 170, 0x192033, 0.8);
        this.centerRing.setStrokeStyle(6, 0x00D2D3, 0.8);

        // Countdown / status text inside ring
        this.statusText = this.add.text(0, -20, 'GET READY', {
            fontSize: '56px',
            fontFamily: 'system-ui, sans-serif',
            color: '#FFFFFF',
            fontStyle: 'bold',
            align: 'center'
        }).setOrigin(0.5);

        this.subStatusText = this.add.text(0, 50, 'Watch for GO!', {
            fontSize: '24px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE'
        }).setOrigin(0.5);

        this.centerContainer.add([this.centerRing, this.statusText, this.subStatusText]);

        // Buzz banner announcing fastest buzzer
        this.buzzBanner = this.add.container(960, 740).setVisible(false);
        this.buzzBannerBg = this.add.rectangle(0, 0, 760, 100, 0x1E2746, 0.95);
        this.buzzBannerBg.setStrokeStyle(4, 0x2ED573);

        this.buzzBannerText = this.add.text(0, 0, 'Alice buzzed in 340ms!', {
            fontSize: '36px',
            fontFamily: 'system-ui, sans-serif',
            color: '#2ED573',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.buzzBanner.add([this.buzzBannerBg, this.buzzBannerText]);
    }

    createPlayerLeaderboardUI() {
        this.leaderboardContainer = this.add.container(960, 930);
        this.refreshLeaderboard();
    }

    refreshLeaderboard() {
        this.leaderboardContainer.removeAll(true);
        if (this.players.length === 0) return;

        const count = this.players.length;
        const cardWidth = Math.min(220, 1400 / count);
        const totalWidth = count * cardWidth;
        const startX = -totalWidth / 2 + cardWidth / 2;

        this.players.forEach((player, idx) => {
            const x = startX + (idx * cardWidth);
            const card = this.add.container(x, 0);

            const hexColor = parseInt(player.color.replace('#', '0x'), 16);
            const isBuzzed = this.buzzedPlayers.some(b => b.playerId === player.id);

            // Card background
            const bg = this.add.rectangle(0, 0, cardWidth - 16, 110, 0x131826, 0.9);
            bg.setStrokeStyle(isBuzzed ? 4 : 2, isBuzzed ? 0x2ED573 : hexColor);

            // Color tag
            const tag = this.add.rectangle(-cardWidth / 2 + 16, 0, 8, 110, hexColor);

            // Name
            const name = this.add.text(-cardWidth / 2 + 32, -24, player.name, {
                fontSize: '22px',
                fontFamily: 'system-ui, sans-serif',
                color: '#FFFFFF',
                fontStyle: 'bold'
            });

            // Score
            const score = this.add.text(-cardWidth / 2 + 32, 12, `${player.score || 0} pts`, {
                fontSize: '26px',
                fontFamily: 'system-ui, sans-serif',
                color: '#FFA502',
                fontStyle: 'bold'
            });

            card.add([bg, tag, name, score]);
            this.leaderboardContainer.add(card);
        });
    }

    createControlHelpUI() {
        this.remoteHelpText = this.add.text(960, 1040, 'TV Remote: [ENTER] Next Round / Skip   |   [ESC] Return to Lobby', {
            fontSize: '20px',
            fontFamily: 'system-ui, sans-serif',
            color: '#5C667A'
        }).setOrigin(0.5);
    }

    /**
     * Starts a new round
     */
    startNewRound() {
        this.gameState = 'COUNTDOWN';
        this.buzzedPlayers = [];
        this.buzzBanner.setVisible(false);
        this.refreshLeaderboard();

        this.roundText.setText(`ROUND ${this.currentRound} / ${this.totalRounds}`);

        // Countdown sequence: 3... 2... 1... BUZZ!
        let count = 3;
        this.statusText.setText(count);
        this.statusText.setColor('#FFA502');
        this.subStatusText.setText('Prepare to tap your phone!');
        this.centerRing.setStrokeStyle(6, 0xFFA502);
        if (this.soundFx) this.soundFx.countdownPip(false);

        const countdownInterval = this.time.addEvent({
            delay: 1000,
            repeat: 2,
            callback: () => {
                count--;
                if (count > 0) {
                    this.statusText.setText(count);
                    if (this.soundFx) this.soundFx.countdownPip(false);
                } else {
                    // GO!
                    this.activateBuzzers();
                }
            }
        });
    }

    activateBuzzers() {
        this.gameState = 'ACTIVE';
        this.roundStartTime = Date.now();

        this.statusText.setText('BUZZ!');
        this.statusText.setColor('#2ED573');
        this.subStatusText.setText('TAP NOW!');
        this.centerRing.setStrokeStyle(10, 0x2ED573);

        if (this.soundFx) this.soundFx.countdownPip(true);

        // Pulsing animation
        this.tweens.add({
            targets: this.centerRing,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 200,
            yoyo: true,
            repeat: -1
        });

        // 5-second round timeout
        this.roundTimerEvent = this.time.delayedCall(6000, () => {
            if (this.gameState === 'ACTIVE') {
                this.finishRound();
            }
        });
    }

    /**
     * Handles mobile controller inputs
     */
    onPlayerInput(playerId, inputData) {
        if (this.gameState !== 'ACTIVE') {
            // Early buzz or buzzer pressed outside active window
            return;
        }

        if (inputData.action === 'BUZZ') {
            // Check if player already buzzed this round
            if (this.buzzedPlayers.some(b => b.playerId === playerId)) {
                return;
            }

            const reactionTime = Date.now() - this.roundStartTime;
            const player = this.playersMap.get(playerId);
            if (!player) return;

            const place = this.buzzedPlayers.length + 1;
            this.buzzedPlayers.push({ playerId, place, reactionTime, name: player.name });

            // Award points: 1st gets 100, 2nd gets 50, 3rd gets 25
            const points = place === 1 ? 100 : (place === 2 ? 50 : 25);
            this.awardScore(playerId, points);

            if (this.soundFx) this.soundFx.buzzerHit();

            // Highlight first buzz
            if (place === 1) {
                this.buzzBannerText.setText(`🥇 ${player.name} Buzzed 1st! (${reactionTime}ms) +100pts`);
                this.buzzBannerText.setColor(player.color || '#2ED573');
                this.buzzBanner.setVisible(true);

                // Punchy camera shake
                this.cameras.main.shake(120, 0.005);
            }

            this.refreshLeaderboard();

            // If all players have buzzed, end round immediately
            if (this.buzzedPlayers.length >= this.players.length) {
                this.time.delayedCall(800, () => this.finishRound());
            }
        }
    }

    finishRound() {
        if (this.gameState === 'ROUND_OVER' || this.gameState === 'MATCH_OVER') return;
        this.gameState = 'ROUND_OVER';

        this.tweens.killTweensOf(this.centerRing);
        this.centerRing.setScale(1);
        this.centerRing.setStrokeStyle(6, 0x00D2D3);

        if (this.buzzedPlayers.length === 0) {
            this.statusText.setText('TIME OUT');
            this.statusText.setColor('#FF4757');
            this.subStatusText.setText('Nobody buzzed in time!');
        } else {
            const fastest = this.buzzedPlayers[0];
            this.statusText.setText('ROUND OVER');
            this.statusText.setColor('#FFFFFF');
            this.subStatusText.setText(`Winner: ${fastest.name} (${fastest.reactionTime}ms)`);
        }

        this.refreshLeaderboard();

        // Check if final round
        if (this.currentRound >= this.totalRounds) {
            this.time.delayedCall(2500, () => this.showMatchOver());
        } else {
            this.currentRound++;
            this.time.delayedCall(3000, () => this.startNewRound());
        }
    }

    showMatchOver() {
        this.gameState = 'MATCH_OVER';

        // Sort players by score
        const sorted = [...this.players].sort((a, b) => (b.score || 0) - (a.score || 0));
        const winner = sorted[0];

        // Signal game end to BaseGameScene and server
        this.endGame({ winner, finalScores: sorted });

        // Center victory display
        this.centerContainer.setVisible(false);
        this.buzzBanner.setVisible(false);

        this.victoryCard = this.add.container(960, 480);

        const cardBg = this.add.rectangle(0, 0, 840, 400, 0x131826, 0.95);
        cardBg.setStrokeStyle(4, 0xFFA502);

        const trophy = this.add.text(0, -120, '🏆', { fontSize: '80px' }).setOrigin(0.5);
        const matchTitle = this.add.text(0, -30, 'MATCH WINNER', {
            fontSize: '36px',
            fontFamily: 'system-ui, sans-serif',
            color: '#FFA502',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const winnerText = this.add.text(0, 40, winner ? winner.name : 'Nobody', {
            fontSize: '64px',
            fontFamily: 'system-ui, sans-serif',
            color: winner ? winner.color : '#FFFFFF',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const subText = this.add.text(0, 120, 'Returning to Lobby in 6 seconds...', {
            fontSize: '26px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE'
        }).setOrigin(0.5);

        this.victoryCard.add([cardBg, trophy, matchTitle, winnerText, subText]);

        // Auto-return to lobby after 6 seconds
        this.time.delayedCall(6000, () => {
            this.returnToLobby();
        });
    }

    handleRemoteSelect() {
        if (this.gameState === 'ROUND_OVER') {
            if (this.currentRound >= this.totalRounds) {
                this.showMatchOver();
            } else {
                this.currentRound++;
                this.startNewRound();
            }
        } else if (this.gameState === 'MATCH_OVER') {
            this.returnToLobby();
        }
    }
}

if (typeof window !== 'undefined') {
    window.DemoBuzzerGameScene = DemoBuzzerGameScene;
}

if (typeof module !== 'undefined') {
    module.exports = DemoBuzzerGameScene;
}
