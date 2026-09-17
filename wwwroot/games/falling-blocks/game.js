window.launchGame = function(containerId) {
    // ---------------------------------------------------------
    // ENCAPSULATED GAME CONSTANTS & DATA
    // ---------------------------------------------------------

    // Tetromino definitions (1 = block, 0 = empty)
    const SHAPES = [
        [], // 0 index acts as empty
        // 1: I (Cyan)
        [[0,0,0,0],
        [1,1,1,1],
        [0,0,0,0],
        [0,0,0,0]],
        // 2: J (Blue)
        [[1,0,0],
        [1,1,1],
        [0,0,0]],
        // 3: L (Orange)
        [[0,0,1],
        [1,1,1],
        [0,0,0]],
        // 4: O (Yellow)
        [[1,1],
        [1,1]],
        // 5: S (Green)
        [[0,1,1],
        [1,1,0],
        [0,0,0]],
        // 6: T (Purple)
        [[0,1,0],
        [1,1,1],
        [0,0,0]],
        // 7: Z (Red)
        [[1,1,0],
        [0,1,1],
        [0,0,0]]
    ];

    const COLORS = [
        0x000000, // 0: Empty
        0x00e5ff, // 1: Cyan
        0x3b6bff, // 2: Blue
        0xff9d1f, // 3: Orange
        0xffe14d, // 4: Yellow
        0x36e04a, // 5: Green
        0xc24bff, // 6: Purple
        0xff3b4e  // 7: Red
    ];

    // Grid configuration
    const COLS = 10;
    const ROWS = 20;
    const BLOCK_SIZE = 48;
    const GRID_WIDTH = COLS * BLOCK_SIZE;
    const GRID_HEIGHT = ROWS * BLOCK_SIZE;
    const OFFSET_X = (1920 - GRID_WIDTH) / 2; // Center horizontally
    const OFFSET_Y = (1080 - GRID_HEIGHT) / 2; // Center vertically

    const HIGH_SCORE_KEY = 'fallingBlocksHighScore';
    const LOCK_DELAY = 500;
    const MAX_LOCK_RESETS = 15;
    const DAS_DELAY = 170;
    const DAS_REPEAT = 45;
    const SOFT_DROP_REPEAT = 40;

    // ---------------------------------------------------------
    // SOUND SYNTHESIZER (Web Audio API) - no external assets needed
    // ---------------------------------------------------------
    class SoundFx {
        constructor() { this.ctx = null; }
        init() {
            if (!this.ctx && typeof window !== 'undefined') {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        }
        tone(freq, dur, type = 'sine', gain = 0.2, delay = 0) {
            this.init();
            if (!this.ctx) return;
            try {
                const t0 = this.ctx.currentTime + delay;
                const osc = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, t0);
                g.gain.setValueAtTime(gain, t0);
                g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
                osc.connect(g);
                g.connect(this.ctx.destination);
                osc.start(t0);
                osc.stop(t0 + dur);
            } catch (e) {}
        }
        move() { this.tone(220, 0.03, 'square', 0.05); }
        rotate() { this.tone(440, 0.06, 'triangle', 0.12); }
        lock() { this.tone(150, 0.08, 'square', 0.15); }
        hardDrop() {
            this.tone(100, 0.12, 'sawtooth', 0.2);
            this.tone(60, 0.15, 'square', 0.15, 0.02);
        }
        lineClear(n) {
            const freqs = [0, 660, 740, 880, 1046.5];
            const f = freqs[n] || 880;
            this.tone(f, 0.18, 'sine', 0.22);
            this.tone(f * 1.5, 0.18, 'sine', 0.15, 0.05);
        }
        tetrisClear() {
            [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, i * 0.06));
        }
        combo() { this.tone(880, 0.08, 'triangle', 0.15); }
        levelUp() {
            [440, 554.37, 659.25, 880].forEach((f, i) => this.tone(f, 0.15, 'square', 0.15, i * 0.07));
        }
        gameOver() {
            [400, 320, 240, 160].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.2, i * 0.15));
        }
        pause() { this.tone(300, 0.08, 'sine', 0.1); }
        menuMove() { this.tone(392, 0.05, 'triangle', 0.1); }
        menuConfirm() {
            this.tone(523.25, 0.08, 'triangle', 0.18);
            this.tone(783.99, 0.12, 'triangle', 0.15, 0.06);
        }
        pageTurn() { this.tone(300, 0.05, 'sine', 0.12); }
    }

    // Shared across every scene so audio/high-score state stays consistent
    // whether the player is on the menu, in a game, or reading the tutorial.
    const soundFx = new SoundFx();

    function loadHighScore() {
        try {
            const v = window.localStorage ? window.localStorage.getItem(HIGH_SCORE_KEY) : null;
            return v ? parseInt(v, 10) || 0 : 0;
        } catch (e) { return 0; }
    }

    function saveHighScore(value) {
        try {
            if (window.localStorage) window.localStorage.setItem(HIGH_SCORE_KEY, String(value));
        } catch (e) {}
    }

    // Decorative, non-interactive drifting blocks used behind the menu/tutorial
    // screens to tie them visually to the game without costing much on TV hardware.
    function createBackdrop(scene) {
        if (!scene.textures.exists('bgBlock')) {
            const g = scene.make.graphics({ x: 0, y: 0, add: false });
            g.fillStyle(0xffffff, 1);
            g.fillRoundedRect(0, 0, 40, 40, 8);
            g.generateTexture('bgBlock', 40, 40);
            g.destroy();
        }

        const palette = COLORS.slice(1);
        for (let i = 0; i < 14; i++) {
            const size = Phaser.Math.Between(28, 56);
            const img = scene.add.image(
                Phaser.Math.Between(40, 1880),
                Phaser.Math.Between(-900, 1080),
                'bgBlock'
            )
                .setTint(palette[Phaser.Math.Between(0, palette.length - 1)])
                .setAlpha(Phaser.Math.FloatBetween(0.05, 0.14))
                .setDisplaySize(size, size)
                .setDepth(-1);

            scene.tweens.add({
                targets: img,
                y: 1150,
                duration: Phaser.Math.Between(9000, 16000),
                repeat: -1,
                delay: Phaser.Math.Between(0, 5000),
                onRepeat: () => { img.x = Phaser.Math.Between(40, 1880); }
            });
        }
    }

    // ---------------------------------------------------------
    // MAIN MENU SCENE
    // ---------------------------------------------------------
    class MenuScene extends Phaser.Scene {
        constructor() {
            super({ key: 'MenuScene' });
        }

        create() {
            createBackdrop(this);
            this.cameras.main.fadeIn(300, 0, 0, 0);

            this.add.text(960, 260, 'FALLING', {
                fontSize: '110px', fontFamily: 'Arial, sans-serif', color: '#00e5ff', fontStyle: 'bold'
            }).setOrigin(0.5);
            this.add.text(960, 360, 'BLOCKS', {
                fontSize: '110px', fontFamily: 'Arial, sans-serif', color: '#ffffff', fontStyle: 'bold'
            }).setOrigin(0.5);
            this.add.text(960, 440, 'A CLASSIC BLOCK-STACKING PUZZLE', {
                fontSize: '26px', fontFamily: 'Arial, sans-serif', color: '#888899', letterSpacing: 4
            }).setOrigin(0.5);

            const highScore = loadHighScore();
            this.add.text(960, 500, `BEST SCORE: ${highScore}`, {
                fontSize: '30px', fontFamily: 'Arial, sans-serif', color: '#FFD34D', fontStyle: 'bold'
            }).setOrigin(0.5);

            this.menuItems = [
                { label: 'PLAY', target: 'FallingBlocksScene' },
                { label: 'TUTORIAL', target: 'TutorialScene' }
            ];
            this.selectedIndex = 0;

            const buttonWidth = 480;
            const buttonHeight = 100;
            const gap = 30;
            const startY = 660;

            this.buttons = this.menuItems.map((item, i) => {
                const y = startY + i * (buttonHeight + gap);
                const container = this.add.container(960, y);
                const bg = this.add.graphics();
                const label = this.add.text(0, 0, item.label, {
                    fontSize: '44px', fontFamily: 'Arial, sans-serif', color: '#888899', fontStyle: 'bold'
                }).setOrigin(0.5);
                container.add([bg, label]);
                container.setSize(buttonWidth, buttonHeight);
                container.setInteractive({ useHandCursor: true });
                container.on('pointerover', () => this.setSelected(i));
                container.on('pointerdown', () => { this.setSelected(i, true); this.activateSelected(); });
                return { container, bg, label, width: buttonWidth, height: buttonHeight };
            });

            this.add.text(960, 1010, 'Up / Down : Select      OK : Confirm', {
                fontSize: '26px', fontFamily: 'Arial, sans-serif', color: '#666677'
            }).setOrigin(0.5);

            this.setSelected(0, true);
            this.setupInputs();
        }

        drawButton(entry, selected) {
            const { bg, label, width, height } = entry;
            bg.clear();
            bg.fillStyle(selected ? 0x123a4a : 0x14141c, selected ? 0.95 : 0.7);
            bg.fillRoundedRect(-width / 2, -height / 2, width, height, 16);
            bg.lineStyle(selected ? 4 : 2, selected ? 0x00e5ff : 0x33333f, 1);
            bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 16);
            label.setColor(selected ? '#ffffff' : '#888899');
        }

        setSelected(index, silent) {
            if (!silent && index !== this.selectedIndex) soundFx.menuMove();
            this.selectedIndex = index;
            this.buttons.forEach((entry, i) => {
                const selected = i === index;
                this.drawButton(entry, selected);
                this.tweens.killTweensOf(entry.container);
                if (selected) {
                    this.tweens.add({
                        targets: entry.container, scale: 1.04, duration: 500,
                        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                    });
                } else {
                    entry.container.setScale(1);
                }
            });
        }

        activateSelected() {
            soundFx.menuConfirm();
            const target = this.menuItems[this.selectedIndex].target;
            this.cameras.main.fadeOut(200, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(target));
        }

        setupInputs() {
            const n = this.menuItems.length;
            this.input.keyboard.on('keydown-UP', () => this.setSelected((this.selectedIndex - 1 + n) % n));
            this.input.keyboard.on('keydown-DOWN', () => this.setSelected((this.selectedIndex + 1) % n));
            this.input.keyboard.on('keydown-ENTER', () => this.activateSelected());
            this.input.keyboard.on('keydown-SPACE', () => this.activateSelected());
        }
    }

    // ---------------------------------------------------------
    // TUTORIAL SCENE
    // ---------------------------------------------------------
    class TutorialScene extends Phaser.Scene {
        constructor() {
            super({ key: 'TutorialScene' });
        }

        create() {
            createBackdrop(this);
            this.cameras.main.fadeIn(250, 0, 0, 0);

            this.pageIndex = 0;
            this.pages = [
                {
                    title: 'CONTROLS',
                    body: 'Left / Right  —  Move\nUp  —  Rotate\nDown  —  Hold to Soft Drop\nOK  —  Hard Drop (instant slam)\nP  —  Pause'
                },
                {
                    title: 'SCORING & TIPS',
                    body: 'Clear rows to score points:\nSingle 100   Double 300   Triple 500   TETRIS 800\n(multiplied by your current Level)\n\nThe outlined piece is your GHOST — it shows\nexactly where the piece will land.\n\nCheck the NEXT queue to plan ahead, and\nchain clears back-to-back for COMBO bonuses!'
                }
            ];

            this.add.text(960, 110, 'TUTORIAL', {
                fontSize: '64px', fontFamily: 'Arial, sans-serif', color: '#00e5ff', fontStyle: 'bold'
            }).setOrigin(0.5);

            this.pageTitleText = this.add.text(960, 280, '', {
                fontSize: '42px', fontFamily: 'Arial, sans-serif', color: '#ffffff', fontStyle: 'bold'
            }).setOrigin(0.5);

            this.pageBodyText = this.add.text(960, 380, '', {
                fontSize: '34px', fontFamily: 'Arial, sans-serif', color: '#CCCCCC',
                align: 'center', lineSpacing: 16
            }).setOrigin(0.5, 0);

            this.dotsGraphics = this.add.graphics();

            this.add.text(960, 1010, 'Left / Right : Page      OK or P : Back to Menu', {
                fontSize: '26px', fontFamily: 'Arial, sans-serif', color: '#666677'
            }).setOrigin(0.5);

            this.renderPage();
            this.setupInputs();
        }

        renderPage() {
            const page = this.pages[this.pageIndex];
            this.pageTitleText.setText(page.title);
            this.pageBodyText.setText(page.body);

            const dots = this.pages.length;
            const spacing = 34;
            const startX = 960 - ((dots - 1) * spacing) / 2;
            this.dotsGraphics.clear();
            for (let i = 0; i < dots; i++) {
                this.dotsGraphics.fillStyle(i === this.pageIndex ? 0x00e5ff : 0x333344, 1);
                this.dotsGraphics.fillCircle(startX + i * spacing, 940, 8);
            }
        }

        goToPage(index) {
            const clamped = Phaser.Math.Clamp(index, 0, this.pages.length - 1);
            if (clamped === this.pageIndex) return;
            this.pageIndex = clamped;
            soundFx.pageTurn();
            this.renderPage();
        }

        goToMenu() {
            soundFx.menuConfirm();
            this.cameras.main.fadeOut(200, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
        }

        setupInputs() {
            this.input.keyboard.on('keydown-LEFT', () => this.goToPage(this.pageIndex - 1));
            this.input.keyboard.on('keydown-RIGHT', () => this.goToPage(this.pageIndex + 1));
            this.input.keyboard.on('keydown-ENTER', () => this.goToMenu());
            this.input.keyboard.on('keydown-SPACE', () => this.goToMenu());
            this.input.keyboard.on('keydown-ESC', () => this.goToMenu());
            this.input.keyboard.on('keydown-P', () => this.goToMenu());
        }
    }

    // ---------------------------------------------------------
    // MAIN GAME SCENE
    // ---------------------------------------------------------
    class FallingBlocksScene extends Phaser.Scene {
        constructor() {
            super({ key: 'FallingBlocksScene' });
            this.moveTimers = {};
        }

        create() {
            // Two Graphics layers: the board (redrawn often) and the side panels (redrawn rarely)
            this.graphics = this.add.graphics();
            this.sideGraphics = this.add.graphics();

            this.highScore = loadHighScore();

            this.setupUI();
            this.setupInputs();
            this.resetGame();

            this.cameras.main.fadeIn(300, 0, 0, 0);
        }

        // -------------------------------------------------------
        // UI SETUP
        // -------------------------------------------------------
        setupUI() {
            const textStyle = { fontSize: '40px', fontFamily: 'Arial, sans-serif', color: '#FFFFFF' };
            const labelStyle = { fontSize: '26px', fontFamily: 'Arial, sans-serif', color: '#888899', fontStyle: 'bold' };
            const titleStyle = { fontSize: '52px', fontFamily: 'Arial, sans-serif', color: '#00e5ff', fontStyle: 'bold' };

            // Left panel (Title + Controls)
            this.add.text(150, OFFSET_Y, 'FALLING\nBLOCKS', titleStyle);
            this.add.text(150, OFFSET_Y + 170, 'CONTROLS', labelStyle);
            this.add.text(150, OFFSET_Y + 205, 'Left / Right : Move\nUp : Rotate\nDown : Soft Drop\nOK : Hard Drop\nP : Pause', {
                fontSize: '32px', fontFamily: 'Arial, sans-serif', color: '#CCCCCC', lineSpacing: 12
            });

            // Right panel (Next queue label + stats)
            const rightX = OFFSET_X + GRID_WIDTH + 130;
            this.add.text(rightX, OFFSET_Y, 'NEXT', labelStyle);

            const statsY = OFFSET_Y + 545;
            this.add.text(rightX, statsY, 'SCORE', labelStyle);
            this.scoreText = this.add.text(rightX, statsY + 32, '0', textStyle);

            this.add.text(rightX, statsY + 100, 'LEVEL', labelStyle);
            this.levelText = this.add.text(rightX, statsY + 132, '1', textStyle);

            this.add.text(rightX, statsY + 200, 'LINES', labelStyle);
            this.linesText = this.add.text(rightX, statsY + 232, '0', textStyle);

            this.add.text(rightX, statsY + 300, 'BEST', labelStyle);
            this.highScoreText = this.add.text(rightX, statsY + 332, '0', { ...textStyle, color: '#FFD34D' });

            // Pause overlay
            this.pauseText = this.add.text(1920 / 2, 1080 / 2, 'PAUSED\n\nPress OK or P to Resume', {
                fontSize: '60px', fontFamily: 'Arial, sans-serif', color: '#FFFFFF', fontStyle: 'bold',
                align: 'center', backgroundColor: '#000000AA', padding: { x: 30, y: 24 }
            }).setOrigin(0.5).setVisible(false).setDepth(20);

            // Game Over overlay
            this.gameOverText = this.add.text(1920 / 2, 1080 / 2, '', {
                fontSize: '58px', fontFamily: 'Arial, sans-serif', color: '#FF4B5C', fontStyle: 'bold',
                align: 'center', backgroundColor: '#000000CC', padding: { x: 36, y: 28 }, lineSpacing: 10
            }).setOrigin(0.5).setVisible(false).setDepth(20);
        }

        // -------------------------------------------------------
        // INPUT SETUP (DAS-style auto-repeat for a smooth held feel)
        // -------------------------------------------------------
        setupInputs() {
            this.cursors = this.input.keyboard.addKeys({
                left: 'LEFT', right: 'RIGHT', down: 'DOWN', up: 'UP',
                enter: 'ENTER', space: 'SPACE', esc: 'ESC', p: 'P'
            });

            const bindHoldable = (key, dir, action, opts = {}) => {
                const initialDelay = opts.initialDelay !== undefined ? opts.initialDelay : DAS_DELAY;
                const repeatDelay = opts.repeatDelay !== undefined ? opts.repeatDelay : DAS_REPEAT;
                const fire = () => { if (this.gameState === 'playing') action(); };

                key.on('down', () => {
                    soundFx.init();
                    if (this.gameState !== 'playing') return;
                    action();
                    if (opts.sound) opts.sound();
                    this.clearHoldTimer(dir);
                    this.moveTimers[dir] = this.time.addEvent({
                        delay: initialDelay,
                        callback: () => {
                            fire();
                            this.moveTimers[dir] = this.time.addEvent({ delay: repeatDelay, loop: true, callback: fire });
                        }
                    });
                });
                key.on('up', () => this.clearHoldTimer(dir));
            };

            bindHoldable(this.cursors.left, 'left', () => this.attemptMove(-1), { sound: () => soundFx.move() });
            bindHoldable(this.cursors.right, 'right', () => this.attemptMove(1), { sound: () => soundFx.move() });
            bindHoldable(this.cursors.down, 'down', () => this.attemptSoftDrop(), { initialDelay: 0, repeatDelay: SOFT_DROP_REPEAT });

            this.cursors.up.on('down', () => {
                soundFx.init();
                if (this.gameState === 'playing') this.handleRotate();
            });

            const handleAction = () => {
                soundFx.init();
                if (this.gameState === 'gameover') this.resetGame();
                else if (this.gameState === 'playing') this.hardDrop();
                else if (this.gameState === 'paused') this.togglePause();
            };
            this.cursors.enter.on('down', handleAction);
            this.cursors.space.on('down', handleAction); // Kept for easy PC testing

            const handlePauseOrMenu = () => {
                soundFx.init();
                if (this.gameState === 'gameover') this.goToMenu();
                else this.togglePause();
            };
            this.cursors.esc.on('down', handlePauseOrMenu);
            this.cursors.p.on('down', handlePauseOrMenu);
        }

        clearHoldTimer(dir) {
            if (this.moveTimers[dir]) {
                this.moveTimers[dir].remove();
                this.moveTimers[dir] = null;
            }
        }

        clearAllHoldTimers() {
            Object.keys(this.moveTimers).forEach(dir => this.clearHoldTimer(dir));
        }

        goToMenu() {
            this.clearAllHoldTimers();
            this.cameras.main.fadeOut(200, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
        }

        // -------------------------------------------------------
        // GAME LIFECYCLE
        // -------------------------------------------------------
        resetGame() {
            this.clearAllHoldTimers();
            this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
            this.score = 0;
            this.level = 1;
            this.lines = 0;
            this.combo = 0;
            this.fallDelay = 1000;
            this.fallTimer = 0;
            this.lockTimer = 0;
            this.lockResets = 0;
            this.gameState = 'playing';
            this.piece = null;
            this.clearingRows = null;

            this.bag = [];
            this.nextQueue = [this.getNextFromBag(), this.getNextFromBag(), this.getNextFromBag()];

            this.gameOverText.setVisible(false);
            this.pauseText.setVisible(false);
            this.updateUI();
            this.spawnPiece();
            this.draw();
        }

        getNextFromBag() {
            if (!this.bag || this.bag.length === 0) {
                this.bag = Phaser.Utils.Array.Shuffle([1, 2, 3, 4, 5, 6, 7]);
            }
            return this.bag.pop();
        }

        spawnPiece() {
            const shapeIdx = this.nextQueue.shift();
            this.nextQueue.push(this.getNextFromBag());

            const matrix = SHAPES[shapeIdx];
            const width = matrix[0].length;
            this.piece = {
                matrix,
                x: Math.floor((COLS - width) / 2),
                y: -1,
                color: shapeIdx
            };
            this.fallTimer = 0;
            this.lockTimer = 0;
            this.lockResets = 0;

            this.drawNextQueue();

            if (!this.isValidMove(this.piece.matrix, this.piece.x, this.piece.y)) {
                this.triggerGameOver();
            }
        }

        triggerGameOver() {
            this.gameState = 'gameover';
            this.piece = null;
            this.clearAllHoldTimers();
            soundFx.gameOver();

            let isNewHigh = false;
            if (this.score > this.highScore) {
                this.highScore = this.score;
                saveHighScore(this.highScore);
                isNewHigh = true;
            }

            this.gameOverText.setText(
                'GAME OVER' + (isNewHigh ? '\nNEW BEST SCORE!' : '') +
                `\n\nScore: ${this.score}   Level: ${this.level}   Lines: ${this.lines}\n\nOK : Restart      P : Menu`
            );
            this.gameOverText.setVisible(true);
            this.updateUI();
            this.draw();
        }

        togglePause() {
            if (this.gameState === 'playing') {
                this.gameState = 'paused';
                this.clearAllHoldTimers();
                this.pauseText.setVisible(true);
                soundFx.pause();
            } else if (this.gameState === 'paused') {
                this.gameState = 'playing';
                this.pauseText.setVisible(false);
                soundFx.pause();
            }
        }

        // -------------------------------------------------------
        // MOVEMENT / ROTATION
        // -------------------------------------------------------
        rotateMatrix(matrix) {
            const N = matrix.length;
            const result = Array.from({ length: N }, () => Array(N).fill(0));
            for (let r = 0; r < N; r++) {
                for (let c = 0; c < N; c++) {
                    result[c][N - 1 - r] = matrix[r][c];
                }
            }
            return result;
        }

        isValidMove(matrix, cellX, cellY) {
            for (let r = 0; r < matrix.length; r++) {
                for (let c = 0; c < matrix[r].length; c++) {
                    if (matrix[r][c]) {
                        const newX = cellX + c;
                        const newY = cellY + r;

                        if (newX < 0 || newX >= COLS || newY >= ROWS) return false;
                        if (newY >= 0 && this.board[newY][newX]) return false;
                    }
                }
            }
            return true;
        }

        // Called after any successful in-place adjustment (move/rotate) so a piece
        // resting on the stack gets a brief grace window before it locks, without
        // letting it stall forever if the player keeps wiggling it.
        onSuccessfulAdjust() {
            if (!this.piece) return;
            const grounded = !this.isValidMove(this.piece.matrix, this.piece.x, this.piece.y + 1);
            if (grounded && this.lockResets < MAX_LOCK_RESETS) {
                this.lockTimer = 0;
                this.lockResets++;
            }
        }

        attemptMove(dx) {
            if (!this.piece) return;
            if (this.isValidMove(this.piece.matrix, this.piece.x + dx, this.piece.y)) {
                this.piece.x += dx;
                this.onSuccessfulAdjust();
                this.draw();
            }
        }

        attemptSoftDrop() {
            if (!this.piece) return;
            if (this.isValidMove(this.piece.matrix, this.piece.x, this.piece.y + 1)) {
                this.piece.y++;
                this.score += 1;
                this.lockTimer = 0;
                this.updateUI();
                this.draw();
            }
        }

        handleRotate() {
            if (!this.piece) return;
            const rotated = this.rotateMatrix(this.piece.matrix);

            // Simple wall-kick table: try the natural spot, then nudge left/right,
            // then finally try nudging up (helps rotations near the floor).
            const kicksX = [0, -1, 1, -2, 2];
            for (const dx of kicksX) {
                if (this.isValidMove(rotated, this.piece.x + dx, this.piece.y)) {
                    this.piece.matrix = rotated;
                    this.piece.x += dx;
                    this.onSuccessfulAdjust();
                    soundFx.rotate();
                    this.draw();
                    return;
                }
            }
            if (this.isValidMove(rotated, this.piece.x, this.piece.y - 1)) {
                this.piece.matrix = rotated;
                this.piece.y -= 1;
                this.onSuccessfulAdjust();
                soundFx.rotate();
                this.draw();
            }
        }

        computeGhostY() {
            let gy = this.piece.y;
            while (this.isValidMove(this.piece.matrix, this.piece.x, gy + 1)) gy++;
            return gy;
        }

        hardDrop() {
            if (!this.piece) return;
            let dist = 0;
            while (this.isValidMove(this.piece.matrix, this.piece.x, this.piece.y + 1)) {
                this.piece.y++;
                dist++;
            }
            this.score += dist * 2;
            soundFx.hardDrop();
            this.cameras.main.shake(60, 0.002);
            this.updateUI();
            this.lockPiece();
        }

        // -------------------------------------------------------
        // LOCKING & LINE CLEARING
        // -------------------------------------------------------
        lockPiece() {
            if (!this.piece) return;
            for (let r = 0; r < this.piece.matrix.length; r++) {
                for (let c = 0; c < this.piece.matrix[r].length; c++) {
                    if (this.piece.matrix[r][c]) {
                        if (this.piece.y + r < 0) {
                            this.triggerGameOver();
                            return;
                        }
                        this.board[this.piece.y + r][this.piece.x + c] = this.piece.color;
                    }
                }
            }

            soundFx.lock();
            const fullRows = this.findFullRows();
            this.piece = null;
            this.fallTimer = 0;
            this.lockTimer = 0;
            this.lockResets = 0;

            if (fullRows.length > 0) {
                this.gameState = 'clearing';
                this.clearingRows = fullRows;
                if (fullRows.length === 4) soundFx.tetrisClear();
                else soundFx.lineClear(fullRows.length);

                this.clearFlash = { value: 0 };
                this.tweens.add({
                    targets: this.clearFlash,
                    value: 1,
                    duration: 90,
                    yoyo: true,
                    repeat: 1,
                    onUpdate: () => this.draw(),
                    onComplete: () => this.finishClearingLines(fullRows.length)
                });
            } else {
                this.combo = 0;
                this.spawnPiece();
            }

            this.draw();
        }

        findFullRows() {
            const rows = [];
            for (let r = 0; r < ROWS; r++) {
                if (this.board[r].every(cell => cell !== 0)) rows.push(r);
            }
            return rows;
        }

        finishClearingLines(expectedCount) {
            let cleared = 0;
            for (let r = ROWS - 1; r >= 0; r--) {
                if (this.board[r].every(cell => cell !== 0)) {
                    this.board.splice(r, 1);
                    this.board.unshift(Array(COLS).fill(0));
                    cleared++;
                    r++;
                }
            }

            if (cleared > 0) {
                this.lines += cleared;
                const baseScores = [0, 100, 300, 500, 800];
                let gained = baseScores[cleared] * this.level;

                this.combo++;
                if (this.combo > 1) {
                    const comboBonus = 50 * (this.combo - 1) * this.level;
                    gained += comboBonus;
                    soundFx.combo();
                    this.showFloatingText(`COMBO x${this.combo - 1}  +${comboBonus}`, '#FFD34D');
                }

                this.score += gained;

                const newLevel = Math.floor(this.lines / 10) + 1;
                if (newLevel > this.level) {
                    this.level = newLevel;
                    this.fallDelay = Math.max(100, 1000 - ((this.level - 1) * 80));
                    soundFx.levelUp();
                    this.showFloatingText(`LEVEL ${this.level}!`, '#00e5ff');
                }

                if (cleared === 4) {
                    this.showFloatingText('TETRIS!', '#FF3B4E');
                    this.cameras.main.flash(150, 255, 255, 255, false);
                }

                this.updateUI();
            }

            this.gameState = 'playing';
            this.clearingRows = null;
            this.spawnPiece();
            this.draw();
        }

        showFloatingText(msg, color) {
            const t = this.add.text(OFFSET_X + GRID_WIDTH / 2, OFFSET_Y + GRID_HEIGHT / 2, msg, {
                fontSize: '48px', fontFamily: 'Arial, sans-serif', color, fontStyle: 'bold',
                align: 'center', stroke: '#000000', strokeThickness: 6
            }).setOrigin(0.5).setDepth(15);

            this.tweens.add({
                targets: t,
                y: t.y - 80,
                alpha: 0,
                duration: 900,
                ease: 'Cubic.easeOut',
                onComplete: () => t.destroy()
            });
        }

        updateUI() {
            this.scoreText.setText(`${this.score}`);
            this.levelText.setText(`${this.level}`);
            this.linesText.setText(`${this.lines}`);
            this.highScoreText.setText(`${this.highScore}`);
        }

        update(time, delta) {
            if (this.gameState !== 'playing' || !this.piece) return;

            const canFall = this.isValidMove(this.piece.matrix, this.piece.x, this.piece.y + 1);
            if (canFall) {
                this.lockTimer = 0;
                this.fallTimer += delta;
                if (this.fallTimer >= this.fallDelay) {
                    this.fallTimer = 0;
                    this.piece.y++;
                    this.draw();
                }
            } else {
                this.fallTimer = 0;
                this.lockTimer += delta;
                if (this.lockTimer >= LOCK_DELAY) {
                    this.lockPiece();
                }
            }
        }

        // ---------------------------------------------------------
        // RENDERING
        // ---------------------------------------------------------
        draw() {
            const g = this.graphics;
            g.clear();

            // Board background
            g.fillStyle(0x111118, 1);
            g.fillRoundedRect(OFFSET_X, OFFSET_Y, GRID_WIDTH, GRID_HEIGHT, 12);

            // Grid lines
            g.lineStyle(1, 0x2a2a3a, 1);
            for (let r = 0; r <= ROWS; r++) {
                g.moveTo(OFFSET_X, OFFSET_Y + r * BLOCK_SIZE);
                g.lineTo(OFFSET_X + GRID_WIDTH, OFFSET_Y + r * BLOCK_SIZE);
            }
            for (let c = 0; c <= COLS; c++) {
                g.moveTo(OFFSET_X + c * BLOCK_SIZE, OFFSET_Y);
                g.lineTo(OFFSET_X + c * BLOCK_SIZE, OFFSET_Y + GRID_HEIGHT);
            }
            g.strokePath();

            // Locked board pieces
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (this.board[r][c] !== 0) {
                        this.drawBlock(c, r, COLORS[this.board[r][c]]);
                    }
                }
            }

            // Ghost piece (landing preview) + falling piece
            if (this.piece) {
                const ghostY = this.computeGhostY();
                if (ghostY !== this.piece.y) {
                    for (let r = 0; r < this.piece.matrix.length; r++) {
                        for (let c = 0; c < this.piece.matrix[r].length; c++) {
                            if (this.piece.matrix[r][c]) {
                                this.drawGhostBlock(this.piece.x + c, ghostY + r);
                            }
                        }
                    }
                }

                for (let r = 0; r < this.piece.matrix.length; r++) {
                    for (let c = 0; c < this.piece.matrix[r].length; c++) {
                        if (this.piece.matrix[r][c]) {
                            this.drawBlock(this.piece.x + c, this.piece.y + r, COLORS[this.piece.color]);
                        }
                    }
                }
            }

            // Line-clear flash overlay
            if (this.gameState === 'clearing' && this.clearingRows && this.clearFlash) {
                const alpha = this.clearFlash.value * 0.9;
                g.fillStyle(0xffffff, alpha);
                this.clearingRows.forEach(r => {
                    g.fillRect(OFFSET_X, OFFSET_Y + r * BLOCK_SIZE, GRID_WIDTH, BLOCK_SIZE);
                });
            }

            // Border
            g.lineStyle(4, 0x555566, 1);
            g.strokeRoundedRect(OFFSET_X, OFFSET_Y, GRID_WIDTH, GRID_HEIGHT, 12);
        }

        drawBlock(x, y, color, alpha = 1) {
            if (y < 0) return;
            const px = OFFSET_X + (x * BLOCK_SIZE);
            const py = OFFSET_Y + (y * BLOCK_SIZE);
            const pad = 2;

            this.graphics.fillStyle(color, alpha);
            this.graphics.fillRoundedRect(px + pad, py + pad, BLOCK_SIZE - pad * 2, BLOCK_SIZE - pad * 2, 6);

            this.graphics.lineStyle(2, 0xffffff, 0.35 * alpha);
            this.graphics.strokeRoundedRect(px + pad + 1, py + pad + 1, BLOCK_SIZE - pad * 2 - 2, BLOCK_SIZE - pad * 2 - 2, 5);
        }

        drawGhostBlock(x, y) {
            if (y < 0) return;
            const px = OFFSET_X + (x * BLOCK_SIZE);
            const py = OFFSET_Y + (y * BLOCK_SIZE);
            this.graphics.lineStyle(2, 0xffffff, 0.35);
            this.graphics.strokeRoundedRect(px + 5, py + 5, BLOCK_SIZE - 10, BLOCK_SIZE - 10, 6);
        }

        drawNextQueue() {
            const sg = this.sideGraphics;
            sg.clear();

            const boxX = OFFSET_X + GRID_WIDTH + 130;
            const boxSize = 170;
            const boxHeight = 120;
            const boxGap = 20;
            const cell = 26;
            let boxY = OFFSET_Y + 50;

            this.nextQueue.forEach(shapeIdx => {
                sg.fillStyle(0x1a1a2e, 0.85);
                sg.fillRoundedRect(boxX, boxY, boxSize, boxHeight, 10);
                sg.lineStyle(2, 0x444466, 1);
                sg.strokeRoundedRect(boxX, boxY, boxSize, boxHeight, 10);

                const matrix = SHAPES[shapeIdx];
                const w = matrix[0].length;
                const h = matrix.length;
                const startX = boxX + (boxSize - w * cell) / 2;
                const startY = boxY + (boxHeight - h * cell) / 2;

                for (let r = 0; r < h; r++) {
                    for (let c = 0; c < w; c++) {
                        if (matrix[r][c]) {
                            sg.fillStyle(COLORS[shapeIdx], 1);
                            sg.fillRoundedRect(startX + c * cell + 2, startY + r * cell + 2, cell - 4, cell - 4, 4);
                        }
                    }
                }

                boxY += boxHeight + boxGap;
            });
        }
    }

    // ---------------------------------------------------------
    // PHASER CONFIGURATION & BOOT
    // ---------------------------------------------------------
    const config = {
        type: Phaser.AUTO,
        width: 1920,
        height: 1080,
        parent: containerId,
        backgroundColor: '#0a0a0a',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: [MenuScene, FallingBlocksScene, TutorialScene]
    };

    return new Phaser.Game(config);
};
