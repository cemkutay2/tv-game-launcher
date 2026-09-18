window.launchGame = function(containerId) {
    // ---------------------------------------------------------
    // MAZE DATA & GRID CONSTANTS
    // ---------------------------------------------------------
    // Hand-authored, left-right symmetric, fully connected (validated offline
    // with a BFS from the player spawn before this was written). Legend:
    // '#' wall, '.' dot, 'o' power pellet, ' ' open path w/ no dot (tunnel
    // row + house exterior), '-' ghost-house door (player wall, ghost door),
    // 'G' ghost-house interior, 'P' player spawn.
    const MAZE_ROWS = [
        '##########################',
        '#o......................o#',
        '#.###.##.##....##.##.###.#',
        '#.###.##.##....##.##.###.#',
        '#........................#',
        '#.##.###.##....##.###.##.#',
        '#.##.###.##....##.###.##.#',
        '#.##.....##....##.....##.#',
        ' ........................ ',
        '#........................#',
        '#..........#--#..........#',
        '#..........#GG#..........#',
        '#..........#GG#..........#',
        '#..........####..........#',
        '#.###.##.##....##.##.###.#',
        '#.###.##.##....##.##.###.#',
        '#...........P............#',
        '#.##.###.##....##.###.##.#',
        '#.##.###.##....##.###.##.#',
        '#.##.....##....##.....##.#',
        '#....###..........###....#',
        '#o......................o#',
        '##########################'
    ];

    const COLS = MAZE_ROWS[0].length;
    const ROWS = MAZE_ROWS.length;
    const CELL = 42;
    const MAZE_W = COLS * CELL;
    const MAZE_H = ROWS * CELL;
    const OFFSET_X = (1920 - MAZE_W) / 2;
    const OFFSET_Y = (1080 - MAZE_H) / 2;
    const TUNNEL_ROW = 8;
    const FRUIT_TILE = { row: 14, col: 12 };
    const HOUSE_DOOR_ROW = 10;

    const DIRS = {
        UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 },
        LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 },
        NONE: { x: 0, y: 0 }
    };
    const DIR_LIST = [DIRS.UP, DIRS.LEFT, DIRS.DOWN, DIRS.RIGHT];

    const HIGH_SCORE_KEY = 'mazeChomperHighScore';
    const EXTRA_LIFE_SCORE = 10000;
    const STARTING_LIVES = 3;

    const PLAYER_BASE_SPEED = 232; // px/sec
    const GHOST_BASE_SPEED = 200;
    const FRIGHTENED_SPEED_FACTOR = 0.6;
    const EATEN_SPEED = 460;

    const MODE_SCHEDULE = [
        { mode: 'scatter', dur: 7000 },
        { mode: 'chase', dur: 20000 },
        { mode: 'scatter', dur: 7000 },
        { mode: 'chase', dur: 20000 },
        { mode: 'scatter', dur: 5000 },
        { mode: 'chase', dur: 999999999 }
    ];

    const GHOST_DEFS = [
        {
            id: 'chaser', color: 0xff2020,
            startRow: 9, startCol: 12, startsOutside: true, baseRelease: 0,
            scatter: { row: -3, col: COLS - 2 }
        },
        {
            id: 'ambusher', color: 0xffaef2,
            startRow: 11, startCol: 12, startsOutside: false, baseRelease: 3000,
            scatter: { row: -3, col: 1 }
        },
        {
            id: 'flanker', color: 0x2ff2ff,
            startRow: 11, startCol: 13, startsOutside: false, baseRelease: 8000,
            scatter: { row: ROWS + 2, col: COLS - 1 }
        },
        {
            id: 'shy', color: 0xffa93d,
            startRow: 12, startCol: 12, startsOutside: false, baseRelease: 14000,
            scatter: { row: ROWS + 2, col: 0 }
        }
    ];

    function frightenedDuration(level) {
        return Math.max(2000, 8000 - (level - 1) * 700);
    }
    function ghostSpeedMultiplier(level) {
        return Math.min(1.5, 1 + (level - 1) * 0.045);
    }
    function playerSpeedMultiplier(level) {
        return Math.min(1.25, 1 + (level - 1) * 0.02);
    }
    function releaseDelay(baseRelease, level) {
        if (baseRelease === 0) return 0;
        return Math.max(baseRelease * 0.35, baseRelease - (level - 1) * 400);
    }
    const FRUIT_SCORES = [100, 300, 500, 500, 700, 700, 1000, 1000, 2000, 2000, 3000, 3000, 5000];
    function fruitScore(level) {
        return FRUIT_SCORES[Math.min(level - 1, FRUIT_SCORES.length - 1)];
    }

    // ---------------------------------------------------------
    // MAZE HELPERS
    // ---------------------------------------------------------
    function mazeChar(row, col) {
        if (row < 0 || row >= ROWS) return '#';
        let c = col;
        if (c < 0) c = COLS - 1;
        if (c >= COLS) c = 0;
        return MAZE_ROWS[row][c];
    }
    function isOpenForPlayer(row, col) {
        const ch = mazeChar(row, col);
        return ch !== '#' && ch !== '-' && ch !== 'G';
    }
    function isOpenForGhost(row, col, allowDoor) {
        const ch = mazeChar(row, col);
        if (ch === '#') return false;
        if (ch === '-') return !!allowDoor;
        return true;
    }
    function cellCenterX(col) { return OFFSET_X + col * CELL + CELL / 2; }
    function cellCenterY(row) { return OFFSET_Y + row * CELL + CELL / 2; }

    // A ghost's row/col track the cell it is currently HEADING INTO, with its
    // pixel position sitting somewhere between the previous cell's center and
    // that one. Flipping only `dir` (e.g. on a scatter/chase mode switch or a
    // power pellet triggering frightened) left row/col out of sync with the
    // new direction of travel: the "reached the center, decide next move"
    // check kept measuring distance to the cell the ghost was now moving
    // AWAY from, a distance that only grows, so it never re-triggered and the
    // ghost sailed straight through the maze — walls included — forever.
    // Stepping row/col back to the cell behind it keeps them consistent.
    function reverseGhostDirection(g) {
        if (g.dir === DIRS.NONE) return;
        const newDir = { x: -g.dir.x, y: -g.dir.y };
        g.row += newDir.y;
        let nc = g.col + newDir.x;
        if (nc < 0) nc = COLS - 1;
        else if (nc >= COLS) nc = 0;
        g.col = nc;
        g.dir = newDir;
    }

    let spawnRow = 16, spawnCol = 12;
    for (let r = 0; r < ROWS; r++) {
        const c = MAZE_ROWS[r].indexOf('P');
        if (c !== -1) { spawnRow = r; spawnCol = c; }
    }

    function buildDots() {
        const dots = [];
        const pellets = [];
        let total = 0;
        for (let r = 0; r < ROWS; r++) {
            const dRow = []; const pRow = [];
            for (let c = 0; c < COLS; c++) {
                const ch = MAZE_ROWS[r][c];
                const isDot = ch === '.';
                const isPellet = ch === 'o';
                dRow.push(isDot);
                pRow.push(isPellet);
                if (isDot || isPellet) total++;
            }
            dots.push(dRow); pellets.push(pRow);
        }
        return { dots, pellets, total };
    }

    // ---------------------------------------------------------
    // SOUND SYNTHESIZER (Web Audio API) - no external assets needed
    // ---------------------------------------------------------
    class SoundFx {
        constructor() { this.ctx = null; this.chompToggle = false; }
        init() {
            if (!this.ctx && typeof window !== 'undefined') {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        }
        tone(freq, dur, type = 'sine', gain = 0.18, delay = 0) {
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
                osc.connect(g); g.connect(this.ctx.destination);
                osc.start(t0); osc.stop(t0 + dur);
            } catch (e) {}
        }
        chomp() {
            this.chompToggle = !this.chompToggle;
            this.tone(this.chompToggle ? 260 : 190, 0.05, 'square', 0.07);
        }
        power() {
            [220, 180, 220, 180].forEach((f, i) => this.tone(f, 0.12, 'sawtooth', 0.15, i * 0.09));
        }
        eatGhost(combo) {
            const base = 300 + combo * 140;
            this.tone(base, 0.1, 'square', 0.2);
            this.tone(base * 1.6, 0.12, 'square', 0.15, 0.05);
        }
        death() {
            [500, 420, 340, 260, 180, 120].forEach((f, i) => this.tone(f, 0.16, 'sawtooth', 0.2, i * 0.09));
        }
        extraLife() {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.2, i * 0.07));
        }
        levelClear() {
            [440, 554.37, 659.25, 880, 1108.7].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.2, i * 0.08));
        }
        fruit() { this.tone(700, 0.1, 'triangle', 0.18); this.tone(900, 0.1, 'triangle', 0.14, 0.06); }
        menuMove() { this.tone(392, 0.05, 'triangle', 0.1); }
        menuConfirm() {
            this.tone(523.25, 0.08, 'triangle', 0.18);
            this.tone(783.99, 0.12, 'triangle', 0.15, 0.06);
        }
        pause() { this.tone(300, 0.08, 'sine', 0.1); }
    }
    const soundFx = new SoundFx();

    function loadHighScore() {
        try {
            const v = window.localStorage ? window.localStorage.getItem(HIGH_SCORE_KEY) : null;
            return v ? parseInt(v, 10) || 0 : 0;
        } catch (e) { return 0; }
    }
    function saveHighScore(value) {
        try { if (window.localStorage) window.localStorage.setItem(HIGH_SCORE_KEY, String(value)); } catch (e) {}
    }

    // ---------------------------------------------------------
    // SHARED DRAWING HELPERS
    // ---------------------------------------------------------
    function drawPacShape(g, cx, cy, r, facing, mouthOpen, color) {
        g.fillStyle(color, 1);
        if (!mouthOpen) { g.fillCircle(cx, cy, r); return; }
        const angleMap = { RIGHT: 0, DOWN: 90, LEFT: 180, UP: 270 };
        const centerDeg = angleMap[facing] !== undefined ? angleMap[facing] : 0;
        const half = 35;
        const startRad = Phaser.Math.DegToRad(centerDeg + half);
        const endRad = Phaser.Math.DegToRad(centerDeg - half + 360);
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, startRad, endRad, false);
        g.closePath();
        g.fillPath();
    }

    function drawGhostShape(g, cx, cy, r, color, dir, alpha) {
        const w = r * 1.85, h = r * 2;
        const left = cx - w / 2, top = cy - h / 2;
        const domeH = h * 0.72;
        g.fillStyle(color, alpha !== undefined ? alpha : 1);
        g.fillRoundedRect(left, top, w, domeH, { tl: r, tr: r, bl: 0, br: 0 });
        const teeth = 4;
        const toothW = w / teeth;
        const bottomY = top + domeH;
        for (let i = 0; i < teeth; i++) {
            const x0 = left + i * toothW;
            const dip = (i % 2 === 0) ? h * 0.14 : h * 0.03;
            g.fillTriangle(x0, bottomY, x0 + toothW / 2, bottomY + dip, x0 + toothW, bottomY);
        }
        const eyeOffsetX = w * 0.22, eyeY = top + domeH * 0.42, eyeR = r * 0.26;
        g.fillStyle(0xffffff, alpha !== undefined ? alpha : 1);
        g.fillCircle(cx - eyeOffsetX, eyeY, eyeR);
        g.fillCircle(cx + eyeOffsetX, eyeY, eyeR);
        const pupilOffset = eyeR * 0.5;
        const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0;
        g.fillStyle(0x161650, alpha !== undefined ? alpha : 1);
        g.fillCircle(cx - eyeOffsetX + dx * pupilOffset, eyeY + dy * pupilOffset, eyeR * 0.5);
        g.fillCircle(cx + eyeOffsetX + dx * pupilOffset, eyeY + dy * pupilOffset, eyeR * 0.5);
    }

    function drawEyesOnly(g, cx, cy, r, dir) {
        const eyeOffsetX = r * 0.42, eyeR = r * 0.26;
        g.fillStyle(0xffffff, 1);
        g.fillCircle(cx - eyeOffsetX, cy, eyeR);
        g.fillCircle(cx + eyeOffsetX, cy, eyeR);
        const pupilOffset = eyeR * 0.5;
        const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0;
        g.fillStyle(0x161650, 1);
        g.fillCircle(cx - eyeOffsetX + dx * pupilOffset, cy + dy * pupilOffset, eyeR * 0.5);
        g.fillCircle(cx + eyeOffsetX + dx * pupilOffset, cy + dy * pupilOffset, eyeR * 0.5);
    }

    function drawCherry(g, cx, cy, scale) {
        const s = scale || 1;
        g.lineStyle(3 * s, 0x3aa832, 1);
        g.beginPath();
        g.moveTo(cx - 2 * s, cy - 4 * s);
        g.lineTo(cx - 10 * s, cy - 16 * s);
        g.moveTo(cx + 6 * s, cy - 4 * s);
        g.lineTo(cx + 10 * s, cy - 16 * s);
        g.strokePath();
        g.fillStyle(0xe8322a, 1);
        g.fillCircle(cx - 7 * s, cy + 3 * s, 8 * s);
        g.fillCircle(cx + 7 * s, cy + 3 * s, 8 * s);
        g.fillStyle(0xffffff, 0.35);
        g.fillCircle(cx - 10 * s, cy, 2.4 * s);
        g.fillCircle(cx + 4 * s, cy, 2.4 * s);
    }

    // Decorative drifting dots behind the menu/tutorial screens.
    function createBackdrop(scene) {
        if (!scene.textures.exists('mcBgDot')) {
            const g = scene.make.graphics({ x: 0, y: 0, add: false });
            g.fillStyle(0xffffff, 1);
            g.fillCircle(10, 10, 10);
            g.generateTexture('mcBgDot', 20, 20);
            g.destroy();
        }
        const palette = [0xffe600, 0xff2020, 0xffaef2, 0x2ff2ff, 0xffa93d];
        for (let i = 0; i < 16; i++) {
            const size = Phaser.Math.Between(14, 30);
            const img = scene.add.image(
                Phaser.Math.Between(40, 1880), Phaser.Math.Between(-900, 1080), 'mcBgDot'
            ).setTint(palette[Phaser.Math.Between(0, palette.length - 1)])
                .setAlpha(Phaser.Math.FloatBetween(0.06, 0.16))
                .setDisplaySize(size, size).setDepth(-1);
            scene.tweens.add({
                targets: img, y: 1150,
                duration: Phaser.Math.Between(9000, 16000), repeat: -1,
                delay: Phaser.Math.Between(0, 5000),
                onRepeat: () => { img.x = Phaser.Math.Between(40, 1880); }
            });
        }
    }

    // ---------------------------------------------------------
    // MAIN MENU SCENE
    // ---------------------------------------------------------
    class MenuScene extends Phaser.Scene {
        constructor() { super({ key: 'MenuScene' }); }

        create() {
            createBackdrop(this);
            this.cameras.main.fadeIn(300, 0, 0, 0);

            this.add.text(960, 250, 'MAZE', {
                fontSize: '110px', fontFamily: 'Arial, sans-serif', color: '#ffe600', fontStyle: 'bold'
            }).setOrigin(0.5);
            this.add.text(960, 350, 'CHOMPER', {
                fontSize: '110px', fontFamily: 'Arial, sans-serif', color: '#ffffff', fontStyle: 'bold'
            }).setOrigin(0.5);
            this.add.text(960, 430, 'GOBBLE EVERY DOT. DODGE EVERY GHOST.', {
                fontSize: '26px', fontFamily: 'Arial, sans-serif', color: '#888899', letterSpacing: 3
            }).setOrigin(0.5);

            const highScore = loadHighScore();
            this.add.text(960, 490, `BEST SCORE: ${highScore}`, {
                fontSize: '30px', fontFamily: 'Arial, sans-serif', color: '#FFD34D', fontStyle: 'bold'
            }).setOrigin(0.5);

            this.menuItems = [
                { label: 'PLAY', target: 'GameScene' },
                { label: 'TUTORIAL', target: 'TutorialScene' }
            ];
            this.selectedIndex = 0;

            const buttonWidth = 480, buttonHeight = 100, gap = 30, startY = 650;
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
            bg.fillStyle(selected ? 0x3a3a12 : 0x14141c, selected ? 0.95 : 0.7);
            bg.fillRoundedRect(-width / 2, -height / 2, width, height, 16);
            bg.lineStyle(selected ? 4 : 2, selected ? 0xffe600 : 0x33333f, 1);
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
                } else entry.container.setScale(1);
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
        constructor() { super({ key: 'TutorialScene' }); }

        create() {
            createBackdrop(this);
            this.cameras.main.fadeIn(250, 0, 0, 0);

            this.pageIndex = 0;
            this.pages = [
                {
                    title: 'CONTROLS',
                    body: 'Arrow Keys  —  Move (turns can be queued\nslightly early at a junction)\nOK  —  Confirm / Restart\nP  —  Pause'
                },
                {
                    title: 'DOTS & POWER PELLETS',
                    body: 'Eat every dot to clear the level.\nDots  —  10 pts\nPower Pellets (glowing, corners)  —  50 pts\n\nA power pellet turns every ghost blue and\nedible for a few seconds — chomp them for\n200, 400, 800, then 1600 points in a row!'
                },
                {
                    title: 'THE GHOSTS',
                    body: 'RED hunts you down directly.\nPINK ambushes the path ahead of you.\nCYAN swoops in from odd angles.\nORANGE is bold at range, but shy up close.\n\nEaten ghosts become a pair of eyes and\nrace back home to regroup — watch for a\nbonus cherry to appear mid-level!'
                }
            ];

            this.add.text(960, 100, 'TUTORIAL', {
                fontSize: '60px', fontFamily: 'Arial, sans-serif', color: '#ffe600', fontStyle: 'bold'
            }).setOrigin(0.5);

            this.pageTitleText = this.add.text(960, 260, '', {
                fontSize: '40px', fontFamily: 'Arial, sans-serif', color: '#ffffff', fontStyle: 'bold'
            }).setOrigin(0.5);

            this.pageBodyText = this.add.text(960, 350, '', {
                fontSize: '32px', fontFamily: 'Arial, sans-serif', color: '#CCCCCC',
                align: 'center', lineSpacing: 14
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

            const dots = this.pages.length, spacing = 34;
            const startX = 960 - ((dots - 1) * spacing) / 2;
            this.dotsGraphics.clear();
            for (let i = 0; i < dots; i++) {
                this.dotsGraphics.fillStyle(i === this.pageIndex ? 0xffe600 : 0x333344, 1);
                this.dotsGraphics.fillCircle(startX + i * spacing, 940, 8);
            }
        }

        goToPage(index) {
            const clamped = Phaser.Math.Clamp(index, 0, this.pages.length - 1);
            if (clamped === this.pageIndex) return;
            this.pageIndex = clamped;
            soundFx.menuMove();
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
    class GameScene extends Phaser.Scene {
        constructor() { super({ key: 'GameScene' }); }

        create() {
            this.boardGraphics = this.add.graphics();
            this.entityGraphics = this.add.graphics();
            this.highScore = loadHighScore();
            this.extraLifeAwarded = false;

            this.setupUI();
            this.setupInputs();
            this.startNewGame();

            this.cameras.main.fadeIn(300, 0, 0, 0);
        }

        // -------------------------------------------------------
        // UI
        // -------------------------------------------------------
        setupUI() {
            const labelStyle = { fontSize: '24px', fontFamily: 'Arial, sans-serif', color: '#888899', fontStyle: 'bold' };
            const textStyle = { fontSize: '38px', fontFamily: 'Arial, sans-serif', color: '#FFFFFF' };
            const titleStyle = { fontSize: '46px', fontFamily: 'Arial, sans-serif', color: '#ffe600', fontStyle: 'bold' };

            this.add.text(70, OFFSET_Y, 'MAZE\nCHOMPER', titleStyle);
            this.add.text(70, OFFSET_Y + 150, 'CONTROLS', labelStyle);
            this.add.text(70, OFFSET_Y + 182, 'Arrows : Move\nP : Pause', {
                fontSize: '28px', fontFamily: 'Arial, sans-serif', color: '#CCCCCC', lineSpacing: 10
            });

            const rightX = OFFSET_X + MAZE_W + 90;
            this.add.text(rightX, OFFSET_Y, 'SCORE', labelStyle);
            this.scoreText = this.add.text(rightX, OFFSET_Y + 32, '0', textStyle);

            this.add.text(rightX, OFFSET_Y + 110, 'HIGH', labelStyle);
            this.highScoreText = this.add.text(rightX, OFFSET_Y + 142, '0', { ...textStyle, color: '#FFD34D' });

            this.add.text(rightX, OFFSET_Y + 220, 'LEVEL', labelStyle);
            this.levelText = this.add.text(rightX, OFFSET_Y + 252, '1', textStyle);

            this.add.text(rightX, OFFSET_Y + 330, 'LIVES', labelStyle);
            this.livesGraphics = this.add.graphics();

            this.readyText = this.add.text(1920 / 2, OFFSET_Y + MAZE_H / 2 + 40, 'READY!', {
                fontSize: '50px', fontFamily: 'Arial, sans-serif', color: '#ffe600', fontStyle: 'bold'
            }).setOrigin(0.5).setVisible(false).setDepth(20);

            this.pauseText = this.add.text(1920 / 2, 1080 / 2, 'PAUSED\n\nPress OK or P to Resume', {
                fontSize: '58px', fontFamily: 'Arial, sans-serif', color: '#FFFFFF', fontStyle: 'bold',
                align: 'center', backgroundColor: '#000000AA', padding: { x: 30, y: 24 }
            }).setOrigin(0.5).setVisible(false).setDepth(20);

            this.gameOverText = this.add.text(1920 / 2, 1080 / 2, '', {
                fontSize: '54px', fontFamily: 'Arial, sans-serif', color: '#FF4B5C', fontStyle: 'bold',
                align: 'center', backgroundColor: '#000000CC', padding: { x: 36, y: 28 }, lineSpacing: 10
            }).setOrigin(0.5).setVisible(false).setDepth(20);
        }

        updateUI() {
            this.scoreText.setText(`${this.score}`);
            this.highScoreText.setText(`${this.highScore}`);
            this.levelText.setText(`${this.level}`);
            const lg = this.livesGraphics;
            lg.clear();
            const rightX = OFFSET_X + MAZE_W + 90;
            for (let i = 0; i < Math.max(this.lives, 0); i++) {
                drawPacShape(lg, rightX + 22 + i * 52, OFFSET_Y + 380, 18, 'RIGHT', true, 0xffe600);
            }
        }

        // -------------------------------------------------------
        // INPUT
        // -------------------------------------------------------
        setupInputs() {
            this.cursors = this.input.keyboard.addKeys({
                left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN',
                enter: 'ENTER', space: 'SPACE', esc: 'ESC', p: 'P'
            });

            const buffer = (dir) => { soundFx.init(); if (this.gameState === 'playing' || this.gameState === 'ready') this.player.nextDir = dir; };
            this.cursors.up.on('down', () => buffer(DIRS.UP));
            this.cursors.down.on('down', () => buffer(DIRS.DOWN));
            this.cursors.left.on('down', () => buffer(DIRS.LEFT));
            this.cursors.right.on('down', () => buffer(DIRS.RIGHT));

            const handleAction = () => {
                soundFx.init();
                if (this.gameState === 'gameover') this.startNewGame();
                else if (this.gameState === 'paused') this.togglePause();
            };
            this.cursors.enter.on('down', handleAction);
            this.cursors.space.on('down', handleAction);

            const handlePauseOrMenu = () => {
                soundFx.init();
                if (this.gameState === 'gameover') this.goToMenu();
                else this.togglePause();
            };
            this.cursors.esc.on('down', handlePauseOrMenu);
            this.cursors.p.on('down', handlePauseOrMenu);
        }

        goToMenu() {
            this.cameras.main.fadeOut(200, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
        }

        togglePause() {
            if (this.gameState === 'playing') {
                this.prePauseState = this.gameState;
                this.gameState = 'paused';
                this.pauseText.setVisible(true);
                soundFx.pause();
            } else if (this.gameState === 'paused') {
                this.gameState = this.prePauseState || 'playing';
                this.pauseText.setVisible(false);
                soundFx.pause();
            }
        }

        // -------------------------------------------------------
        // GAME / LEVEL LIFECYCLE
        // -------------------------------------------------------
        startNewGame() {
            this.score = 0;
            this.level = 1;
            this.lives = STARTING_LIVES;
            this.extraLifeAwarded = false;
            this.comboCount = 0;
            this.gameOverText.setVisible(false);
            this.pauseText.setVisible(false);
            this.startLevel(false);
        }

        startLevel(keepScore) {
            const board = buildDots();
            this.dots = board.dots;
            this.pellets = board.pellets;
            this.dotsRemaining = board.total;
            this.totalDots = board.total;
            this.fruitSpawned = [false, false];
            this.fruitActive = null;

            this.modeIndex = 0;
            this.modeTimer = 0;
            this.globalMode = MODE_SCHEDULE[0].mode;

            this.player = {
                x: cellCenterX(spawnCol), y: cellCenterY(spawnRow),
                row: spawnRow, col: spawnCol,
                dir: DIRS.NONE, nextDir: DIRS.NONE, facing: 'RIGHT',
                mouthOpen: true, mouthTimer: 0
            };

            this.ghosts = GHOST_DEFS.map(def => this.makeGhost(def));

            this.updateUI();
            this.enterReady();
        }

        makeGhost(def) {
            const startsOutside = !!def.startsOutside;
            return {
                def,
                row: def.startRow, col: def.startCol,
                x: cellCenterX(def.startCol), y: cellCenterY(def.startRow),
                dir: startsOutside ? DIRS.LEFT : DIRS.NONE,
                state: startsOutside ? 'scatter' : 'inhouse',
                releaseAt: startsOutside ? 0 : releaseDelay(def.baseRelease, this.level || 1),
                bobPhase: Math.random() * Math.PI * 2,
                frightenedTimer: 0
            };
        }

        resetPositions() {
            this.player.x = cellCenterX(spawnCol); this.player.y = cellCenterY(spawnRow);
            this.player.row = spawnRow; this.player.col = spawnCol;
            this.player.dir = DIRS.NONE; this.player.nextDir = DIRS.NONE;

            this.ghosts.forEach(g => {
                const def = g.def;
                g.row = def.startRow; g.col = def.startCol;
                g.x = cellCenterX(def.startCol); g.y = cellCenterY(def.startRow);
                g.dir = def.startsOutside ? DIRS.LEFT : DIRS.NONE;
                g.state = def.startsOutside ? this.globalMode : 'inhouse';
                g.frightenedTimer = 0;
                // releaseAt is recomputed against the fresh levelClock in enterReady(),
                // which always runs right after this.
            });
        }

        enterReady() {
            this.gameState = 'ready';
            this.levelClock = 0;
            this.readyText.setText('READY!').setVisible(true);
            this.readyTimer = 1400;
            this.ghosts.forEach(g => {
                if (g.def.startsOutside) g.releaseAt = 0;
                else g.releaseAt = releaseDelay(g.def.baseRelease, this.level);
            });
            this.draw();
        }

        triggerDeath() {
            this.gameState = 'dying';
            this.deathTimer = 0;
            soundFx.death();
        }

        finishDeath() {
            this.lives--;
            this.updateUI();
            if (this.lives < 0) {
                this.triggerGameOver();
            } else {
                this.resetPositions();
                this.enterReady();
            }
        }

        triggerGameOver() {
            this.gameState = 'gameover';
            let isNewHigh = false;
            if (this.score > this.highScore) {
                this.highScore = this.score; saveHighScore(this.highScore); isNewHigh = true;
            }
            this.gameOverText.setText(
                'GAME OVER' + (isNewHigh ? '\nNEW BEST SCORE!' : '') +
                `\n\nScore: ${this.score}   Level: ${this.level}\n\nOK : Restart      P : Menu`
            );
            this.gameOverText.setVisible(true);
            this.updateUI();
        }

        triggerLevelClear() {
            this.gameState = 'levelclear';
            this.levelClearTimer = 0;
            soundFx.levelClear();
        }

        finishLevelClear() {
            this.level++;
            this.startLevel(true);
        }

        // -------------------------------------------------------
        // UPDATE LOOP
        // -------------------------------------------------------
        update(time, delta) {
            // Clamp EVERY time-based update to this, not just pixel movement.
            // A backgrounded/unfocused tab throttles requestAnimationFrame and
            // can hand back one huge `delta` (or a burst of queued frames) once
            // it regains attention. Left unclamped, a single such frame could
            // blow straight through the scatter/chase schedule, the frightened
            // countdown, or the ghost-house release clock — flipping ghosts
            // between modes (and reversing their direction each flip) many
            // times in what looks like one instant, which reads as "ghosts
            // wandering / not really chasing".
            const cappedDelta = Math.min(delta, 50);
            const dt = cappedDelta / 1000;

            if (this.gameState === 'ready') {
                this.readyTimer -= cappedDelta;
                this.animatePlayerMouth(cappedDelta, false);
                if (this.readyTimer <= 0) { this.readyText.setVisible(false); this.gameState = 'playing'; }
                this.draw();
                return;
            }
            if (this.gameState === 'dying') {
                this.deathTimer += cappedDelta;
                if (this.deathTimer >= 900) this.finishDeath();
                this.draw();
                return;
            }
            if (this.gameState === 'levelclear') {
                this.levelClearTimer += cappedDelta;
                this.flashOn = Math.floor(this.levelClearTimer / 180) % 2 === 0;
                if (this.levelClearTimer >= 1600) this.finishLevelClear();
                this.draw();
                return;
            }
            if (this.gameState !== 'playing') { this.draw(); return; }

            this.levelClock += cappedDelta;

            const anyFrightened = this.ghosts.some(g => g.state === 'frightened');
            if (!anyFrightened) {
                this.modeTimer += cappedDelta;
                const cur = MODE_SCHEDULE[this.modeIndex];
                if (this.modeTimer >= cur.dur && this.modeIndex < MODE_SCHEDULE.length - 1) {
                    this.modeTimer = 0;
                    this.modeIndex++;
                    this.globalMode = MODE_SCHEDULE[this.modeIndex].mode;
                    this.ghosts.forEach(g => {
                        if (g.state === 'scatter' || g.state === 'chase') {
                            g.state = this.globalMode;
                            reverseGhostDirection(g);
                        }
                    });
                }
            }

            this.updatePlayer(dt, cappedDelta);
            this.ghosts.forEach(g => this.updateGhost(g, dt, cappedDelta));
            this.checkCollisions();
            this.checkFruit();
            this.animatePlayerMouth(cappedDelta, this.player.dir !== DIRS.NONE);

            if (this.dotsRemaining <= 0) this.triggerLevelClear();

            this.draw();
        }

        animatePlayerMouth(delta, moving) {
            this.player.mouthTimer += delta;
            const interval = moving ? 110 : 500;
            if (this.player.mouthTimer >= interval) {
                this.player.mouthTimer = 0;
                this.player.mouthOpen = !this.player.mouthOpen;
            }
        }

        // -------------------------------------------------------
        // PLAYER MOVEMENT
        // -------------------------------------------------------
        updatePlayer(dt, deltaMs) {
            const p = this.player;
            const speed = PLAYER_BASE_SPEED * playerSpeedMultiplier(this.level);
            const moveAmount = speed * dt;

            const cx = cellCenterX(p.col), cy = cellCenterY(p.row);
            const distX = Math.abs(cx - p.x), distY = Math.abs(cy - p.y);

            if (distX <= moveAmount + 0.01 && distY <= moveAmount + 0.01) {
                p.x = cx; p.y = cy;
                let dir = p.dir;
                if (p.nextDir !== DIRS.NONE && isOpenForPlayer(p.row + p.nextDir.y, p.col + p.nextDir.x)) {
                    dir = p.nextDir;
                } else if (dir === DIRS.NONE || !isOpenForPlayer(p.row + dir.y, p.col + dir.x)) {
                    dir = isOpenForPlayer(p.row + dir.y, p.col + dir.x) ? dir : DIRS.NONE;
                }
                p.dir = dir;
                if (dir !== DIRS.NONE) {
                    p.facing = dir === DIRS.UP ? 'UP' : dir === DIRS.DOWN ? 'DOWN' : dir === DIRS.LEFT ? 'LEFT' : 'RIGHT';
                    p.row += dir.y;
                    let wrapped = false;
                    if (p.col + dir.x < 0) { p.col = COLS - 1; wrapped = true; }
                    else if (p.col + dir.x >= COLS) { p.col = 0; wrapped = true; }
                    else p.col += dir.x;
                    // Normally keep gliding on from the old cell's center (cx,cy,
                    // already in p.x/p.y) rather than snapping to the new cell's
                    // center — snapping unconditionally here made the player jump
                    // a full cell every single frame instead of covering CELL px
                    // over ~CELL/moveAmount frames. Only a tunnel wrap needs an
                    // actual position snap, since the new cell isn't adjacent in
                    // pixel space.
                    if (wrapped) { p.x = cellCenterX(p.col); p.y = cellCenterY(p.row); }
                    this.onPlayerEnterTile(p.row, p.col);
                    p.x += dir.x * moveAmount; p.y += dir.y * moveAmount;
                }
            } else {
                p.x += p.dir.x * moveAmount; p.y += p.dir.y * moveAmount;
            }
        }

        onPlayerEnterTile(row, col) {
            if (this.dots[row][col]) {
                this.dots[row][col] = false;
                this.score += 10;
                this.dotsRemaining--;
                soundFx.chomp();
                this.checkExtraLife();
                this.updateUI();
            } else if (this.pellets[row][col]) {
                this.pellets[row][col] = false;
                this.score += 50;
                this.dotsRemaining--;
                soundFx.power();
                this.checkExtraLife();
                this.comboCount = 0;
                const dur = frightenedDuration(this.level);
                this.ghosts.forEach(g => {
                    if (g.state === 'chase' || g.state === 'scatter') {
                        g.state = 'frightened';
                        reverseGhostDirection(g);
                    }
                    if (g.state === 'frightened') g.frightenedTimer = dur;
                });
                this.updateUI();
            }
        }

        checkExtraLife() {
            if (!this.extraLifeAwarded && this.score >= EXTRA_LIFE_SCORE) {
                this.extraLifeAwarded = true;
                this.lives++;
                soundFx.extraLife();
                this.updateUI();
            }
        }

        checkFruit() {
            const eatenSoFar = this.totalDots - this.dotsRemaining;
            if (!this.fruitSpawned[0] && eatenSoFar >= 60) {
                this.fruitSpawned[0] = true;
                this.spawnFruit();
            } else if (!this.fruitSpawned[1] && eatenSoFar >= 170) {
                this.fruitSpawned[1] = true;
                this.spawnFruit();
            }

            if (this.fruitActive) {
                this.fruitActive.timer -= this._lastDeltaMs || 16;
                if (this.fruitActive.timer <= 0) this.fruitActive = null;
                else {
                    const p = this.player;
                    if (p.row === FRUIT_TILE.row && p.col === FRUIT_TILE.col) {
                        this.score += fruitScore(this.level);
                        soundFx.fruit();
                        this.fruitActive = null;
                        this.updateUI();
                    }
                }
            }
        }

        spawnFruit() {
            this.fruitActive = { timer: 9000 };
        }

        // -------------------------------------------------------
        // GHOST AI
        // -------------------------------------------------------
        updateGhost(g, dt, deltaMs) {
            this._lastDeltaMs = deltaMs;

            if (g.state === 'inhouse') {
                g.bobPhase += deltaMs * 0.004;
                g.y = cellCenterY(g.row) + Math.sin(g.bobPhase) * 6;
                if (this.levelClock >= g.releaseAt) {
                    g.state = 'exiting';
                    g.dir = DIRS.UP;
                }
                return;
            }

            if (g.state === 'exiting') {
                const speed = GHOST_BASE_SPEED * ghostSpeedMultiplier(this.level);
                const moveAmount = speed * dt;
                const targetY = cellCenterY(HOUSE_DOOR_ROW - 1);
                g.x = cellCenterX(g.col);
                g.y -= moveAmount;
                if (g.y <= targetY) {
                    g.y = targetY;
                    g.row = HOUSE_DOOR_ROW - 1;
                    g.state = this.globalMode;
                    g.dir = DIRS.NONE;
                }
                return;
            }

            if (g.state === 'frightened') {
                g.frightenedTimer -= deltaMs;
                if (g.frightenedTimer <= 0) { g.state = this.globalMode; }
            }

            if (g.state === 'eaten') {
                const targetX = cellCenterX(12), targetY = cellCenterY(11);
                const dx = targetX - g.x, dy = targetY - g.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const moveAmount = EATEN_SPEED * dt;
                if (dist <= moveAmount || dist < 4) {
                    g.x = cellCenterX(g.def.startCol); g.y = cellCenterY(g.def.startRow);
                    g.row = g.def.startRow; g.col = g.def.startCol;
                    g.state = 'inhouse';
                    g.dir = DIRS.NONE;
                    g.releaseAt = this.levelClock + 1500;
                } else {
                    g.dir = { x: dx / dist, y: dy / dist };
                    g.x += (dx / dist) * moveAmount;
                    g.y += (dy / dist) * moveAmount;
                }
                return;
            }

            // Grid-based movement for scatter / chase / frightened.
            const baseSpeed = g.state === 'frightened'
                ? GHOST_BASE_SPEED * FRIGHTENED_SPEED_FACTOR
                : GHOST_BASE_SPEED * ghostSpeedMultiplier(this.level);
            const moveAmount = baseSpeed * dt;
            const cx = cellCenterX(g.col), cy = cellCenterY(g.row);
            const distX = Math.abs(cx - g.x), distY = Math.abs(cy - g.y);

            if (distX <= moveAmount + 0.01 && distY <= moveAmount + 0.01) {
                g.x = cx; g.y = cy;
                const target = this.getGhostTarget(g);
                const newDir = this.chooseGhostDirection(g, target);
                g.dir = newDir;
                if (newDir !== DIRS.NONE) {
                    g.row += newDir.y;
                    let wrapped = false;
                    if (g.col + newDir.x < 0) { g.col = COLS - 1; wrapped = true; }
                    else if (g.col + newDir.x >= COLS) { g.col = 0; wrapped = true; }
                    else g.col += newDir.x;
                    // See the matching comment in updatePlayer: only a tunnel wrap
                    // needs a position snap, otherwise keep gliding from (cx,cy).
                    if (wrapped) { g.x = cellCenterX(g.col); g.y = cellCenterY(g.row); }
                    g.x += newDir.x * moveAmount; g.y += newDir.y * moveAmount;
                }
            } else {
                g.x += g.dir.x * moveAmount; g.y += g.dir.y * moveAmount;
            }
        }

        getGhostTarget(g) {
            if (g.state === 'scatter') return g.def.scatter;
            const p = this.player;
            const pDir = p.dir !== DIRS.NONE ? p.dir : DIRS.RIGHT;
            switch (g.def.id) {
                case 'chaser':
                    return { row: p.row, col: p.col };
                case 'ambusher':
                    return { row: p.row + pDir.y * 4, col: p.col + pDir.x * 4 };
                case 'flanker': {
                    const pivot = { row: p.row + pDir.y * 2, col: p.col + pDir.x * 2 };
                    const chaser = this.ghosts.find(x => x.def.id === 'chaser');
                    const cRow = chaser ? chaser.row : p.row, cCol = chaser ? chaser.col : p.col;
                    return { row: pivot.row + (pivot.row - cRow), col: pivot.col + (pivot.col - cCol) };
                }
                case 'shy': {
                    const dist = Math.hypot(g.row - p.row, g.col - p.col);
                    return dist > 8 ? { row: p.row, col: p.col } : g.def.scatter;
                }
                default:
                    return { row: p.row, col: p.col };
            }
        }

        chooseGhostDirection(g, target) {
            const allowDoor = false;
            const reverse = { x: -g.dir.x, y: -g.dir.y };
            const canReverse = g.dir === DIRS.NONE;
            let candidates = DIR_LIST.filter(d => {
                if (!canReverse && d.x === reverse.x && d.y === reverse.y) return false;
                return isOpenForGhost(g.row + d.y, g.col + d.x, allowDoor);
            });
            if (candidates.length === 0) {
                candidates = DIR_LIST.filter(d => isOpenForGhost(g.row + d.y, g.col + d.x, allowDoor));
            }
            if (candidates.length === 0) return DIRS.NONE;

            if (g.state === 'frightened') {
                return Phaser.Utils.Array.GetRandom(candidates);
            }

            let best = candidates[0], bestDist = Infinity;
            candidates.forEach(d => {
                let nc = g.col + d.x;
                if (nc < 0) nc = COLS - 1; if (nc >= COLS) nc = 0;
                const nr = g.row + d.y;
                const dist = (nr - target.row) * (nr - target.row) + (nc - target.col) * (nc - target.col);
                if (dist < bestDist) { bestDist = dist; best = d; }
            });
            return best;
        }

        // -------------------------------------------------------
        // COLLISIONS
        // -------------------------------------------------------
        checkCollisions() {
            const p = this.player;
            for (const g of this.ghosts) {
                if (g.state === 'inhouse' || g.state === 'eaten') continue;
                const dist = Math.hypot(p.x - g.x, p.y - g.y);
                if (dist < CELL * 0.6) {
                    if (g.state === 'frightened') {
                        g.state = 'eaten';
                        this.comboCount++;
                        const points = 200 * Math.pow(2, Math.min(this.comboCount - 1, 3));
                        this.score += points;
                        soundFx.eatGhost(this.comboCount - 1);
                        this.showFloatingScore(g.x, g.y, points);
                        this.updateUI();
                    } else if (g.state !== 'exiting') {
                        this.triggerDeath();
                        return;
                    }
                }
            }
        }

        showFloatingScore(x, y, points) {
            const t = this.add.text(x, y, `+${points}`, {
                fontSize: '30px', fontFamily: 'Arial, sans-serif', color: '#5fe0ff', fontStyle: 'bold',
                stroke: '#000000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(18);
            this.tweens.add({
                targets: t, y: y - 50, alpha: 0, duration: 700, ease: 'Cubic.easeOut',
                onComplete: () => t.destroy()
            });
        }

        // -------------------------------------------------------
        // RENDERING
        // -------------------------------------------------------
        draw() {
            this.drawBoard();
            this.drawEntities();
        }

        drawBoard() {
            const g = this.boardGraphics;
            g.clear();
            g.fillStyle(0x05050f, 1);
            g.fillRect(OFFSET_X, OFFSET_Y, MAZE_W, MAZE_H);

            const wallColor = (this.gameState === 'levelclear' && this.flashOn) ? 0xffffff : 0x2222dd;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const ch = MAZE_ROWS[r][c];
                    if (ch === '#') {
                        const x = OFFSET_X + c * CELL, y = OFFSET_Y + r * CELL;
                        g.fillStyle(wallColor, 1);
                        g.fillRoundedRect(x + 2, y + 2, CELL - 4, CELL - 4, 6);
                    } else if (ch === '-') {
                        const x = OFFSET_X + c * CELL, y = OFFSET_Y + r * CELL + CELL / 2 - 2;
                        g.fillStyle(0xffaef2, 1);
                        g.fillRect(x + 4, y, CELL - 8, 4);
                    }
                }
            }

            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (this.dots && this.dots[r][c]) {
                        g.fillStyle(0xffe6a8, 1);
                        g.fillCircle(cellCenterX(c), cellCenterY(r), 3.4);
                    } else if (this.pellets && this.pellets[r][c]) {
                        const pulse = 6.5 + Math.sin(this.time ? this.time.now * 0.006 : 0) * 2;
                        g.fillStyle(0xffe6a8, 1);
                        g.fillCircle(cellCenterX(c), cellCenterY(r), pulse);
                    }
                }
            }

            if (this.fruitActive) {
                drawCherry(g, cellCenterX(FRUIT_TILE.col), cellCenterY(FRUIT_TILE.row), 1.1);
            }

            g.lineStyle(4, 0x4444ff, 1);
            g.strokeRoundedRect(OFFSET_X, OFFSET_Y, MAZE_W, MAZE_H, 12);
        }

        drawEntities() {
            const g = this.entityGraphics;
            g.clear();
            if (!this.player) return;

            const p = this.player;
            const showPlayer = this.gameState !== 'dying' || this.deathTimer < 900;
            if (this.gameState === 'dying') {
                const shrink = 1 - Math.min(1, this.deathTimer / 900);
                if (shrink > 0.02) drawPacShape(g, p.x, p.y, CELL * 0.42 * shrink, p.facing, true, 0xffe600);
            } else if (showPlayer) {
                drawPacShape(g, p.x, p.y, CELL * 0.42, p.facing, p.mouthOpen, 0xffe600);
            }

            if (this.gameState === 'dying') return;

            this.ghosts.forEach(gh => {
                if (gh.state === 'eaten') {
                    drawEyesOnly(g, gh.x, gh.y, CELL * 0.4, gh.dir);
                    return;
                }
                let color = gh.def.color;
                let alpha = 1;
                if (gh.state === 'frightened') {
                    const flashing = gh.frightenedTimer < 2000;
                    const blink = flashing && Math.floor(gh.frightenedTimer / 150) % 2 === 0;
                    color = blink ? 0xffffff : 0x2244ff;
                }
                drawGhostShape(g, gh.x, gh.y, CELL * 0.4, color, gh.dir, alpha);
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
        backgroundColor: '#000000',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: [MenuScene, GameScene, TutorialScene]
    };

    const game = new Phaser.Game(config);

    // Auto-pause when the tab/window loses focus (dev-testing in a desktop
    // browser can background the tab; a throttled/hidden rAF loop is what
    // produced the "ghosts wander instead of chasing" bug — see the comment
    // in GameScene.update). Pausing outright avoids relying on delta-clamping
    // alone to survive an arbitrarily long gap. Left paused on return; the
    // player resumes deliberately via P/OK, same as a manual pause.
    const autoPauseIfPlaying = () => {
        const scene = game.scene.getScene('GameScene');
        if (scene && scene.scene.isActive() && scene.gameState === 'playing') scene.togglePause();
    };
    game.events.on('blur', autoPauseIfPlaying);
    game.events.on('hidden', autoPauseIfPlaying);

    // Called by the launcher when the TV remote's hardware back button is
    // pressed (that event never reaches Phaser's own keyboard input — the
    // host app intercepts it natively before it can become a DOM keydown).
    // Returns true if the game consumed it (opened/closed the pause menu),
    // false to let the launcher exit to the grid.
    game.handleBackButton = function() {
        if (!game.scene.isActive('GameScene')) return false;
        const scene = game.scene.getScene('GameScene');
        if (!scene || scene.gameState === 'gameover') return false;

        if (scene.gameState === 'paused') { scene.togglePause(); return true; }
        if (scene.gameState === 'playing') { scene.togglePause(); return true; }
        return false;
    };

    return game;
};
