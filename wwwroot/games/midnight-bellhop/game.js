window.launchGame = function(containerId) {
    const TILE_SIZE = 120;
    // How long (ms) to hold the player at the very start of a fall, waiting
    // for a dash key that hasn't arrived yet, before committing to falling
    // straight down. Gives remote-control input extra time to register.
    const AIR_DASH_GRACE_MS = 200;

    const KEY_COLORS = { 1: 0x8a4dff, 2: 0xff8800, 3: 0x00e5ff };

    // ---------------------------------------------------------------
    // Level data. Terrain is a simple grid of 'W' (wall) / '.' (floor);
    // every other system (luggage, keys, doors, moving platforms,
    // one-way floors, teleporters, checkpoints, hazard carts) is a list
    // of {x,y,...} entities layered on top of the terrain. Coordinates
    // are grid cells, not pixels. Levels can be wider/taller than one
    // screen — the camera follows the player and scrolls to fit.
    // ---------------------------------------------------------------
    function bordered(width, interiorRows) {
        const rows = ['W'.repeat(width)];
        for (const r of interiorRows) rows.push('W' + r + 'W');
        rows.push('W'.repeat(width));
        return rows;
    }
    function rowWithWalls(interiorWidth, wallCols) {
        const chars = new Array(interiorWidth).fill('.');
        for (const c of wallCols) chars[c - 1] = 'W';
        return chars.join('');
    }
    function oneWayRun(fromX, toX, y) {
        const list = [];
        for (let x = fromX; x <= toX; x++) list.push({ x, y });
        return list;
    }

    const LEVELS = [
        // Floor 1 - Night Shift: a bigger, calmer intro. Same rules as before, more room to walk.
        {
            name: 'Night Shift',
            terrain: bordered(22, [
                '....................',
                '....................',
                '....................',
                '....................',
                '....................',
                '....................',
                rowWithWalls(20, [5]),
            ]),
            player: { x: 1, y: 7 },
            exit: { x: 20, y: 7 },
            luggage: [{ x: 9, y: 7 }, { x: 15, y: 7 }],
        },

        // Floor 2 - Key Wing: two keys, two locked doors, a patrol cart.
        {
            name: 'Key Wing',
            terrain: bordered(24, [
                '......................',
                '......................',
                '......................',
                '......................',
                '......................',
                '......................',
                rowWithWalls(22, [3, 13]),
            ]),
            player: { x: 1, y: 7 },
            exit: { x: 21, y: 7 },
            luggage: [{ x: 10, y: 7 }, { x: 20, y: 7 }],
            keys: [{ id: 1, x: 3, y: 6 }, { id: 2, x: 13, y: 6 }],
            doors: [{ id: 1, x: 8, y: 7 }, { id: 2, x: 19, y: 7 }],
            carts: [{ x: 15, y: 7, dir: 1 }],
        },

        // Floor 3 - Freight Lift: a vertical moving platform carries you up to a stashed bag.
        {
            name: 'Freight Lift',
            terrain: bordered(26, [
                rowWithWalls(24, [13]),
                rowWithWalls(24, [14]),
                '........................',
                '........................',
                '........................',
                '........................',
                '........................',
            ]),
            player: { x: 1, y: 7 },
            exit: { x: 22, y: 7 },
            luggage: [{ x: 6, y: 7 }, { x: 14, y: 1 }],
            platforms: [{ x: 13, y: 7, axis: 'v', dir: -1 }],
            carts: [{ x: 18, y: 7, dir: -1 }],
        },

        // Floor 4 - Skylight Catwalk: a one-way catwalk lets you cross above a cart hazard,
        // with a checkpoint waiting on the far side.
        {
            name: 'Skylight Catwalk',
            terrain: bordered(24, [
                '......................',
                '......................',
                '......................',
                '......................',
                '......................',
                rowWithWalls(22, [10]),
                rowWithWalls(22, [9, 18]),
            ]),
            player: { x: 1, y: 7 },
            exit: { x: 22, y: 7 },
            luggage: [{ x: 5, y: 7 }, { x: 13, y: 7 }],
            carts: [{ x: 11, y: 7, dir: 1 }, { x: 15, y: 7, dir: -1 }],
            oneWays: oneWayRun(11, 17, 6),
            checkpoints: [{ x: 19, y: 7 }],
        },

        // Floor 5 - Service Warp: three rooms sealed off floor-to-ceiling, linked only by
        // teleporter pads.
        {
            name: 'Service Warp',
            terrain: bordered(24, [
                rowWithWalls(22, [7, 14]),
                rowWithWalls(22, [7, 14]),
                rowWithWalls(22, [7, 14]),
                rowWithWalls(22, [7, 14]),
                rowWithWalls(22, [7, 14]),
                rowWithWalls(22, [7, 14]),
                rowWithWalls(22, [7, 14]),
            ]),
            player: { x: 1, y: 7 },
            exit: { x: 21, y: 7 },
            luggage: [{ x: 3, y: 7 }, { x: 10, y: 7 }],
            teleporters: [
                { id: 1, x: 5, y: 7 }, { id: 1, x: 9, y: 7 },
                { id: 2, x: 12, y: 7 }, { id: 2, x: 17, y: 7 },
            ],
            carts: [{ x: 19, y: 7, dir: -1 }],
        },

        // Floor 6 - The Penthouse Gauntlet: every system in one long run.
        {
            name: 'The Penthouse Gauntlet',
            terrain: (() => {
                const SEPARATORS = [32, 36];
                const row = (extra) => rowWithWalls(44, [...SEPARATORS, ...extra]);
                return bordered(46, [
                    row([16]),
                    row([17]),
                    row([]),
                    row([]),
                    row([]),
                    row([22]),
                    row([7, 21, 29]),
                ]);
            })(),
            player: { x: 1, y: 7 },
            exit: { x: 43, y: 7 },
            luggage: [{ x: 4, y: 7 }, { x: 17, y: 1 }, { x: 25, y: 7 }, { x: 41, y: 7 }],
            keys: [{ id: 1, x: 7, y: 6 }, { id: 2, x: 34, y: 7 }],
            doors: [{ id: 1, x: 10, y: 7 }, { id: 2, x: 39, y: 7 }],
            platforms: [{ x: 16, y: 7, axis: 'v', dir: -1 }],
            oneWays: oneWayRun(23, 28, 6),
            carts: [{ x: 23, y: 7, dir: 1 }, { x: 27, y: 7, dir: -1 }, { x: 38, y: 7, dir: 1 }],
            teleporters: [
                { id: 1, x: 31, y: 7 }, { id: 1, x: 33, y: 7 },
                { id: 2, x: 35, y: 7 }, { id: 2, x: 37, y: 7 },
            ],
            checkpoints: [{ x: 30, y: 7 }],
        },
    ];

    class BootScene extends Phaser.Scene {
        constructor() {
            super('BootScene');
        }

        preload() {
            // Generate graphics programmatically
            const g = this.make.graphics({ x: 0, y: 0, add: false });

            // Wall (Mahogany style)
            g.fillStyle(0x2a1012, 1);
            g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.lineStyle(4, 0x471d21, 1);
            g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.lineStyle(2, 0x5c2b2f, 1);
            g.strokeRect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
            g.generateTexture('wall', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Player (Bellhop - Neon Blue). Feet sit flush with the tile's
            // bottom edge so the sprite doesn't visually hover above whatever
            // it's standing on.
            g.fillStyle(0x00f3ff, 1);
            g.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2 + 10, TILE_SIZE / 4);
            g.fillStyle(0xffffff, 1);
            g.fillRect(TILE_SIZE / 2 - 15, TILE_SIZE / 2 + 20, 30, 40);
            g.fillStyle(0x00f3ff, 1);
            g.fillRect(TILE_SIZE / 2 - 20, TILE_SIZE / 2 + 5, 40, 10); // hat
            g.generateTexture('player', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Luggage (Neon Gold)
            g.fillStyle(0xffd700, 1);
            g.fillRect(TILE_SIZE / 2 - 25, TILE_SIZE / 2 - 10, 50, 35);
            g.fillStyle(0xffa500, 1);
            g.fillRect(TILE_SIZE / 2 - 10, TILE_SIZE / 2 - 25, 20, 15); // handle
            g.fillStyle(0x000000, 1);
            g.fillRect(TILE_SIZE / 2 - 5, TILE_SIZE / 2 - 20, 10, 10); // handle cutout
            g.generateTexture('luggage', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Hazard Cart (Neon Red)
            g.fillStyle(0xff003c, 1);
            g.fillRect(10, TILE_SIZE - 45, TILE_SIZE - 20, 25);
            g.fillStyle(0xaaaaaa, 1);
            g.fillCircle(25, TILE_SIZE - 10, 10);
            g.fillCircle(TILE_SIZE - 25, TILE_SIZE - 10, 10);
            g.fillStyle(0xffffff, 1);
            g.fillRect(TILE_SIZE - 25, TILE_SIZE - 65, 5, 20); // handle
            g.generateTexture('cart_right', TILE_SIZE, TILE_SIZE);
            g.clear();

            g.fillStyle(0xff003c, 1);
            g.fillRect(10, TILE_SIZE - 45, TILE_SIZE - 20, 25);
            g.fillStyle(0xaaaaaa, 1);
            g.fillCircle(25, TILE_SIZE - 10, 10);
            g.fillCircle(TILE_SIZE - 25, TILE_SIZE - 10, 10);
            g.fillStyle(0xffffff, 1);
            g.fillRect(20, TILE_SIZE - 65, 5, 20); // handle
            g.generateTexture('cart_left', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Elevator Closed
            g.fillStyle(0x333333, 1);
            g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.lineStyle(4, 0x111111, 1);
            g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.lineStyle(2, 0x000000, 1);
            g.beginPath();
            g.moveTo(TILE_SIZE / 2, 0);
            g.lineTo(TILE_SIZE / 2, TILE_SIZE);
            g.strokePath();
            g.generateTexture('door_closed', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Elevator Open
            g.fillStyle(0x111111, 1);
            g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x00ffaa, 0.3); // Neon Green Glow
            g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.lineStyle(4, 0x333333, 1);
            g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.generateTexture('door_open', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Key (diamond, tinted per color at runtime)
            g.fillStyle(0xffffff, 1);
            g.beginPath();
            g.moveTo(TILE_SIZE / 2, TILE_SIZE / 2 - 30);
            g.lineTo(TILE_SIZE / 2 + 22, TILE_SIZE / 2);
            g.lineTo(TILE_SIZE / 2, TILE_SIZE / 2 + 30);
            g.lineTo(TILE_SIZE / 2 - 22, TILE_SIZE / 2);
            g.closePath();
            g.fillPath();
            g.fillStyle(0x000000, 1);
            g.fillRect(TILE_SIZE / 2 - 4, TILE_SIZE / 2 + 8, 8, 18);
            g.generateTexture('key', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Locked door (tinted per color at runtime)
            g.fillStyle(0x241014, 1);
            g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.lineStyle(6, 0xffffff, 1);
            g.strokeRect(6, 6, TILE_SIZE - 12, TILE_SIZE - 12);
            g.fillStyle(0xffffff, 1);
            g.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2, 14);
            g.generateTexture('door_locked', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Moving platform (rideable, safe). The rider stands in the cell
            // above it, so the deck sits at the TOP of this tile — not
            // centered — or the player would appear to float above it.
            g.fillStyle(0x123227, 1);
            g.fillRect(4, 0, TILE_SIZE - 8, 36);
            g.lineStyle(4, 0x39ff14, 1);
            g.strokeRect(4, 0, TILE_SIZE - 8, 36);
            g.fillStyle(0x39ff14, 1);
            g.fillRect(14, 14, TILE_SIZE - 28, 6);
            g.generateTexture('platform', TILE_SIZE, TILE_SIZE);
            g.clear();

            // One-way catwalk floor (solid; drop through with Down). Same
            // deal as the moving platform: the walkable surface has to sit
            // at the TOP of this tile, flush with the cell the player
            // actually stands in above it.
            g.fillStyle(0x0c2b2e, 1);
            g.fillRect(0, 0, TILE_SIZE, 26);
            for (let sx = 0; sx < TILE_SIZE; sx += 20) {
                g.fillStyle(0x00e5c8, 0.6);
                g.fillTriangle(sx, 20, sx + 10, 6, sx + 20, 20);
            }
            g.generateTexture('oneway', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Checkpoint beacon (off / on)
            g.fillStyle(0x333333, 1);
            g.fillRect(TILE_SIZE / 2 - 4, 20, 8, TILE_SIZE - 40);
            g.fillStyle(0x555555, 1);
            g.fillTriangle(TILE_SIZE / 2 + 4, 24, TILE_SIZE / 2 + 40, 36, TILE_SIZE / 2 + 4, 48);
            g.generateTexture('checkpoint_off', TILE_SIZE, TILE_SIZE);
            g.clear();

            g.fillStyle(0x00ffaa, 1);
            g.fillRect(TILE_SIZE / 2 - 4, 20, 8, TILE_SIZE - 40);
            g.fillStyle(0x00ffaa, 1);
            g.fillTriangle(TILE_SIZE / 2 + 4, 20, TILE_SIZE / 2 + 46, 34, TILE_SIZE / 2 + 4, 48);
            g.generateTexture('checkpoint_on', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Teleporter pad (tinted per id at runtime)
            g.fillStyle(0xffffff, 1);
            g.fillEllipse(TILE_SIZE / 2, TILE_SIZE / 2 + 20, TILE_SIZE - 24, 30);
            g.lineStyle(5, 0xffffff, 1);
            g.strokeCircle(TILE_SIZE / 2, TILE_SIZE / 2, 30);
            g.strokeCircle(TILE_SIZE / 2, TILE_SIZE / 2, 44);
            g.generateTexture('teleporter', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Dummy thumbnail for JSON (just to not fail if loaded)
            g.fillStyle(0x00f3ff, 1);
            g.fillRect(0, 0, 200, 200);
            g.generateTexture('thumb', 200, 200);
            g.clear();
        }

        create() {
            this.scene.start('PlayScene', { level: 0 });
        }
    }

    class PlayScene extends Phaser.Scene {
        constructor() {
            super('PlayScene');
        }

        init(data) {
            this.levelIndex = data.level || 0;
            this.isAnimating = false;
            this.isDead = false;
            this.levelComplete = false;
            this.inputBuffer = [];
            this.airDashCount = 0;
            this.airGraceDeadline = null;
            this.wasGrounded = true;

            this.carts = [];
            this.platforms = [];
            this.luggages = [];
            this.keysList = [];
            this.doors = [];
            this.oneWaySet = new Set();
            this.teleporters = [];
            this.checkpoints = [];
            this.collected = 0;
            this.collectedKeys = {};
            this.lastCheckpoint = null;
            this.nextMoverTime = 0;
        }

        create() {
            this.cameras.main.setBackgroundColor('#140809');

            if (this.levelIndex >= LEVELS.length) {
                // Game Beat!
                this.add.text(1920 / 2, 1080 / 2 - 60, 'YOU WIN!', { font: '100px Arial', fill: '#00f3ff' }).setOrigin(0.5);
                this.add.text(1920 / 2, 1080 / 2 + 60, 'Press any key to play again', { font: '40px Arial', fill: '#ffffff' }).setOrigin(0.5);
                this.input.keyboard.once('keydown', () => {
                    this.scene.start('PlayScene', { level: 0 });
                });
                return;
            }

            const level = LEVELS[this.levelIndex];
            this.gridH = level.terrain.length;
            this.gridW = level.terrain[0].length;
            this.wallSet = new Set();

            for (let y = 0; y < this.gridH; y++) {
                for (let x = 0; x < this.gridW; x++) {
                    if (level.terrain[y][x] === 'W') {
                        this.wallSet.add(x + ',' + y);
                        this.add.image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 'wall');
                    }
                }
            }

            this.playerGridX = level.player.x;
            this.playerGridY = level.player.y;
            this.playerSprite = this.add.image(
                this.playerGridX * TILE_SIZE + TILE_SIZE / 2,
                this.playerGridY * TILE_SIZE + TILE_SIZE / 2,
                'player'
            ).setDepth(10);

            this.elevatorGridX = level.exit.x;
            this.elevatorGridY = level.exit.y;
            this.elevatorSprite = this.add.image(
                this.elevatorGridX * TILE_SIZE + TILE_SIZE / 2,
                this.elevatorGridY * TILE_SIZE + TILE_SIZE / 2,
                'door_closed'
            );

            this.totalLuggage = (level.luggage || []).length;
            for (const l of (level.luggage || [])) {
                const sprite = this.add.image(l.x * TILE_SIZE + TILE_SIZE / 2, l.y * TILE_SIZE + TILE_SIZE / 2, 'luggage');
                this.luggages.push({ x: l.x, y: l.y, sprite });
            }

            for (const c of (level.carts || [])) {
                const tex = c.dir === -1 ? 'cart_left' : 'cart_right';
                const sprite = this.add.image(c.x * TILE_SIZE + TILE_SIZE / 2, c.y * TILE_SIZE + TILE_SIZE / 2, tex).setDepth(5);
                this.carts.push({ gridX: c.x, gridY: c.y, prevX: c.x, prevY: c.y, dir: c.dir, startX: c.x, startY: c.y, startDir: c.dir, sprite });
            }

            for (const p of (level.platforms || [])) {
                const sprite = this.add.image(p.x * TILE_SIZE + TILE_SIZE / 2, p.y * TILE_SIZE + TILE_SIZE / 2, 'platform').setDepth(4);
                this.platforms.push({ gridX: p.x, gridY: p.y, prevX: p.x, prevY: p.y, axis: p.axis, dir: p.dir, startX: p.x, startY: p.y, startDir: p.dir, sprite });
            }

            for (const k of (level.keys || [])) {
                const sprite = this.add.image(k.x * TILE_SIZE + TILE_SIZE / 2, k.y * TILE_SIZE + TILE_SIZE / 2, 'key');
                sprite.setTint(KEY_COLORS[k.id] || 0xffffff);
                this.keysList.push({ id: k.id, x: k.x, y: k.y, sprite });
            }

            for (const d of (level.doors || [])) {
                const sprite = this.add.image(d.x * TILE_SIZE + TILE_SIZE / 2, d.y * TILE_SIZE + TILE_SIZE / 2, 'door_locked');
                sprite.setTint(KEY_COLORS[d.id] || 0xffffff);
                this.doors.push({ id: d.id, x: d.x, y: d.y, sprite, open: false });
            }

            for (const o of (level.oneWays || [])) {
                this.oneWaySet.add(o.x + ',' + o.y);
                this.add.image(o.x * TILE_SIZE + TILE_SIZE / 2, o.y * TILE_SIZE + TILE_SIZE / 2, 'oneway');
            }

            const teleporterTints = { 1: 0xb388ff, 2: 0xffa726, 3: 0x40e0ff };
            for (const t of (level.teleporters || [])) {
                const sprite = this.add.image(t.x * TILE_SIZE + TILE_SIZE / 2, t.y * TILE_SIZE + TILE_SIZE / 2, 'teleporter');
                sprite.setTint(teleporterTints[t.id] || 0xffffff);
                this.teleporters.push({ id: t.id, x: t.x, y: t.y, sprite });
            }

            for (const c of (level.checkpoints || [])) {
                const sprite = this.add.image(c.x * TILE_SIZE + TILE_SIZE / 2, c.y * TILE_SIZE + TILE_SIZE / 2, 'checkpoint_off');
                this.checkpoints.push({ x: c.x, y: c.y, sprite, activated: false });
            }

            // A level with no luggage to collect starts already "cleared"
            if (this.totalLuggage === 0) {
                this.elevatorSprite.setTexture('door_open');
            }

            // Camera follows the player across levels bigger than one screen
            const worldW = this.gridW * TILE_SIZE;
            const worldH = this.gridH * TILE_SIZE;
            this.cameras.main.setBounds(0, 0, worldW, worldH);
            this.cameras.main.startFollow(this.playerSprite, true, 0.12, 0.12);

            // HUD stays fixed on screen regardless of camera scroll
            this.add.text(20, 20, `FLOOR ${this.levelIndex + 1} — ${level.name}`, { font: '40px Arial', fill: '#ffffff' }).setScrollFactor(0);
            this.hudText = this.add.text(20, 70, '', { font: '30px Arial', fill: '#ffd700' }).setScrollFactor(0);
            this.updateHud();

            this.input.keyboard.on('keydown', (e) => {
                if (this.isDead || this.levelComplete) return;
                const actionByKey = { ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN' };
                const action = actionByKey[e.key];
                if (action) {
                    e.preventDefault(); // don't let arrow keys scroll the page
                    if (this.inputBuffer.length < 3) {
                        this.inputBuffer.push(action);
                    }
                }
            });

            this.particles = this.add.particles(0, 0, 'player', {
                speed: 100,
                scale: { start: 0.1, end: 0 },
                alpha: { start: 0.5, end: 0 },
                blendMode: 'ADD',
                lifespan: 300,
                emitting: false
            });
            this.particles.startFollow(this.playerSprite);
        }

        updateHud() {
            if (!this.hudText) return;
            const keyIds = Object.keys(this.collectedKeys);
            const keysStr = keyIds.length ? `  KEYS: ${keyIds.length}` : '';
            this.hudText.setText(`LUGGAGE: ${this.collected}/${this.totalLuggage}${keysStr}`);
        }

        isSolid(x, y) {
            if (x < 0 || x >= this.gridW || y < 0 || y >= this.gridH) return true;
            const key = x + ',' + y;
            if (this.wallSet.has(key)) return true;
            if (this.oneWaySet.has(key)) return true;
            for (const d of this.doors) {
                if (!d.open && d.x === x && d.y === y) return true;
            }
            for (const p of this.platforms) {
                if (p.gridX === x && p.gridY === y) return true;
            }
            return false;
        }

        isGrounded(x, y) {
            return this.isSolid(x, y + 1);
        }

        canMove(x, y) {
            return !this.isSolid(x, y);
        }

        moveTo(newX, newY, type) {
            this.isAnimating = true;
            this.prevPlayerX = this.playerGridX;
            this.prevPlayerY = this.playerGridY;
            this.playerGridX = newX;
            this.playerGridY = newY;

            let duration = 200;
            let ease = 'Linear';

            if (type === 'jump') {
                ease = 'Sine.easeOut';
                this.particles.emitting = true;
            } else if (type === 'fall') {
                ease = 'Quad.easeIn';
                duration = 150;
            } else {
                ease = 'Sine.easeInOut';
            }

            this.tweens.add({
                targets: this.playerSprite,
                x: newX * TILE_SIZE + TILE_SIZE / 2,
                y: newY * TILE_SIZE + TILE_SIZE / 2,
                duration: duration,
                ease: ease,
                onComplete: () => {
                    this.isAnimating = false;
                    this.particles.emitting = false;
                    this.checkPickups();
                    this.checkElevator();
                    this.checkCollisions();
                    this.checkTeleport();
                    this.checkCheckpoint();
                }
            });
        }

        checkPickups() {
            for (let i = this.luggages.length - 1; i >= 0; i--) {
                const l = this.luggages[i];
                if (l.x === this.playerGridX && l.y === this.playerGridY) {
                    l.sprite.destroy();
                    this.luggages.splice(i, 1);
                    this.collected++;

                    this.cameras.main.flash(200, 255, 215, 0);

                    if (this.collected >= this.totalLuggage) {
                        this.elevatorSprite.setTexture('door_open');
                    }
                    this.updateHud();
                }
            }

            for (let i = this.keysList.length - 1; i >= 0; i--) {
                const k = this.keysList[i];
                if (k.x === this.playerGridX && k.y === this.playerGridY) {
                    k.sprite.destroy();
                    this.keysList.splice(i, 1);
                    this.collectedKeys[k.id] = true;

                    this.cameras.main.flash(200, 180, 120, 255);

                    for (const d of this.doors) {
                        if (d.id === k.id && !d.open) {
                            d.open = true;
                            this.tweens.add({
                                targets: d.sprite,
                                alpha: 0,
                                scale: 0,
                                duration: 300,
                                onComplete: () => d.sprite.destroy()
                            });
                        }
                    }
                    this.updateHud();
                }
            }
        }

        checkElevator() {
            if (this.collected >= this.totalLuggage && this.playerGridX === this.elevatorGridX && this.playerGridY === this.elevatorGridY) {
                this.levelComplete = true;

                this.tweens.add({
                    targets: this.playerSprite,
                    alpha: 0,
                    scale: 0,
                    duration: 500,
                    onComplete: () => {
                        this.scene.start('PlayScene', { level: this.levelIndex + 1 });
                    }
                });
            }
        }

        checkTeleport() {
            const here = this.teleporters.find(t => t.x === this.playerGridX && t.y === this.playerGridY);
            if (!here) return;
            const dest = this.teleporters.find(t => t.id === here.id && t !== here);
            if (!dest) return;

            this.playerGridX = dest.x;
            this.playerGridY = dest.y;
            this.playerSprite.x = dest.x * TILE_SIZE + TILE_SIZE / 2;
            this.playerSprite.y = dest.y * TILE_SIZE + TILE_SIZE / 2;
            this.cameras.main.flash(150, 180, 80, 255);
            this.cameras.main.centerOn(this.playerSprite.x, this.playerSprite.y);
        }

        checkCheckpoint() {
            const cp = this.checkpoints.find(c => c.x === this.playerGridX && c.y === this.playerGridY);
            if (!cp || cp.activated) return;
            cp.activated = true;
            cp.sprite.setTexture('checkpoint_on');
            this.lastCheckpoint = { x: cp.x, y: cp.y };
            this.cameras.main.flash(150, 0, 255, 170);
        }

        die() {
            if (this.isDead || this.levelComplete) return;
            this.isDead = true;
            this.cameras.main.shake(300, 0.02);
            this.playerSprite.setTint(0xff0000);

            this.time.delayedCall(800, () => {
                if (this.lastCheckpoint) {
                    this.respawnAtCheckpoint();
                } else {
                    this.scene.start('PlayScene', { level: this.levelIndex });
                }
            });
        }

        respawnAtCheckpoint() {
            this.isDead = false;
            this.isAnimating = false;
            this.inputBuffer = [];
            this.airDashCount = 0;
            this.airGraceDeadline = null;
            this.wasGrounded = true;

            this.playerGridX = this.lastCheckpoint.x;
            this.playerGridY = this.lastCheckpoint.y;
            this.playerSprite.clearTint();
            this.playerSprite.setAlpha(1).setScale(1);
            this.playerSprite.x = this.playerGridX * TILE_SIZE + TILE_SIZE / 2;
            this.playerSprite.y = this.playerGridY * TILE_SIZE + TILE_SIZE / 2;

            // Hazards/movers reset to their level-start layout so respawning
            // doesn't drop the player into an unavoidable second death.
            for (const c of this.carts) {
                c.gridX = c.startX; c.gridY = c.startY; c.dir = c.startDir;
                c.prevX = c.gridX; c.prevY = c.gridY;
                c.sprite.setTexture(c.dir === -1 ? 'cart_left' : 'cart_right');
                c.sprite.x = c.gridX * TILE_SIZE + TILE_SIZE / 2;
                c.sprite.y = c.gridY * TILE_SIZE + TILE_SIZE / 2;
            }
            for (const p of this.platforms) {
                p.gridX = p.startX; p.gridY = p.startY; p.dir = p.startDir;
                p.prevX = p.gridX; p.prevY = p.gridY;
                p.sprite.x = p.gridX * TILE_SIZE + TILE_SIZE / 2;
                p.sprite.y = p.gridY * TILE_SIZE + TILE_SIZE / 2;
            }
            this.nextMoverTime = this.time.now + 600;
            this.cameras.main.centerOn(this.playerSprite.x, this.playerSprite.y);
        }

        checkCollisions() {
            for (const c of this.carts) {
                if (c.gridX === this.playerGridX && c.gridY === this.playerGridY) {
                    this.die();
                }
                // Swapped places check
                if (c.gridX === this.prevPlayerX && c.gridY === this.prevPlayerY &&
                    c.prevX === this.playerGridX && c.prevY === this.playerGridY) {
                    this.die();
                }
            }
        }

        moveCarts() {
            for (const c of this.carts) {
                c.prevX = c.gridX;
                c.prevY = c.gridY;
                let nextX = c.gridX + c.dir;

                if (this.canMove(nextX, c.gridY) && this.isGrounded(nextX, c.gridY)) {
                    c.gridX = nextX;
                } else {
                    c.dir *= -1;
                    c.gridX += c.dir;
                    c.sprite.setTexture(c.dir === -1 ? 'cart_left' : 'cart_right');

                    if (!this.canMove(c.gridX, c.gridY) || !this.isGrounded(c.gridX, c.gridY)) {
                        c.gridX = c.prevX; // stuck
                    }
                }

                this.tweens.add({
                    targets: c.sprite,
                    x: c.gridX * TILE_SIZE + TILE_SIZE / 2,
                    duration: 200,
                    ease: 'Linear',
                    onComplete: () => {
                        this.checkCollisions();
                    }
                });
            }
        }

        movePlatforms() {
            for (const p of this.platforms) {
                p.prevX = p.gridX;
                p.prevY = p.gridY;
                const dx = p.axis === 'h' ? p.dir : 0;
                const dy = p.axis === 'v' ? p.dir : 0;

                // A rider standing on top of this platform occupies the cell directly
                // above it — which, for a platform moving straight up, is exactly its
                // own next target cell. Waive just the "player is standing there"
                // check for that rider (they're being carried into it, not collided
                // with) — terrain solidity always still blocks, rider or not.
                const riderHere = this.playerGridX === p.gridX && this.playerGridY === p.gridY - 1;
                const blocked = (x, y) => {
                    if (this.isSolid(x, y)) return true;
                    const playerIsThere = x === this.playerGridX && y === this.playerGridY;
                    return playerIsThere && !riderHere;
                };

                let nextX = p.gridX + dx, nextY = p.gridY + dy;
                let moved = false;
                if (!blocked(nextX, nextY)) {
                    p.gridX = nextX; p.gridY = nextY; moved = true;
                } else {
                    p.dir *= -1;
                    const dx2 = p.axis === 'h' ? p.dir : 0, dy2 = p.axis === 'v' ? p.dir : 0;
                    const bx = p.gridX + dx2, by = p.gridY + dy2;
                    if (!blocked(bx, by)) { p.gridX = bx; p.gridY = by; moved = true; }
                    // else: pinned between two obstacles this tick, stays put
                }

                this.tweens.add({
                    targets: p.sprite,
                    x: p.gridX * TILE_SIZE + TILE_SIZE / 2,
                    y: p.gridY * TILE_SIZE + TILE_SIZE / 2,
                    duration: 200,
                    ease: 'Linear',
                });

                // Carry the rider in lockstep with the platform's own (synchronous)
                // position update — not later, in the tween's onComplete. The
                // platform's logical cell (what isSolid/isGrounded check) already
                // moved the instant this ran; if the player's reposition waited for
                // the ~200ms visual tween to finish, there'd be a window where the
                // player reads as standing over empty space and their own gravity
                // yanks them off before the carry ever gets a chance to apply.
                if (moved && riderHere && !this.isAnimating) {
                    const ndx = p.gridX - p.prevX, ndy = p.gridY - p.prevY;
                    if (ndx !== 0 || ndy !== 0) {
                        this.moveTo(this.playerGridX + ndx, this.playerGridY + ndy, 'ride');
                    }
                }
            }
        }

        update(time, delta) {
            if (this.isDead || this.levelComplete || !this.playerSprite) return;

            if (!this.isAnimating) {
                if (!this.isGrounded(this.playerGridX, this.playerGridY)) {
                    let airMoved = false;
                    if (this.inputBuffer.length > 0) {
                        let action = this.inputBuffer[0];
                        if (action === 'LEFT' || action === 'RIGHT') {
                            this.inputBuffer.shift(); // consume it
                            if (this.airDashCount < 2) {
                                let dx = (action === 'LEFT') ? -1 : 1;
                                if (this.canMove(this.playerGridX + dx, this.playerGridY)) {
                                    this.airDashCount++;
                                    airMoved = true;
                                    this.airGraceDeadline = null;
                                    this.moveTo(this.playerGridX + dx, this.playerGridY, 'jump');
                                }
                            }
                        } else {
                            this.inputBuffer.shift(); // UP/DOWN do nothing in air, consume it
                        }
                    }
                    if (!airMoved) {
                        // Just left the ground with no dash queued yet: hold here briefly
                        // instead of instantly committing to a straight fall, so a dash
                        // press that's still in flight (remote latency) has time to arrive.
                        if (this.wasGrounded && this.airGraceDeadline === null) {
                            this.airGraceDeadline = time + AIR_DASH_GRACE_MS;
                        }

                        if (this.airGraceDeadline !== null && time < this.airGraceDeadline) {
                            // waiting out the grace window; try again next tick
                        } else {
                            this.airGraceDeadline = null;
                            this.moveTo(this.playerGridX, this.playerGridY + 1, 'fall');
                        }
                    }
                    this.wasGrounded = false;
                } else {
                    this.airDashCount = 0;
                    this.airGraceDeadline = null;
                    this.wasGrounded = true;

                    if (this.inputBuffer.length > 0) {
                        let action = this.inputBuffer.shift();

                        if (action === 'DOWN') {
                            if (this.oneWaySet.has(this.playerGridX + ',' + (this.playerGridY + 1))) {
                                this.moveTo(this.playerGridX, this.playerGridY + 1, 'fall');
                            }
                        } else {
                            let dx = 0;
                            let dy = 0;

                            if (action === 'LEFT') {
                                dx = -1;
                                if (this.inputBuffer.length > 0 && this.inputBuffer[0] === 'UP') {
                                    this.inputBuffer.shift();
                                    dy = -1;
                                }
                            } else if (action === 'RIGHT') {
                                dx = 1;
                                if (this.inputBuffer.length > 0 && this.inputBuffer[0] === 'UP') {
                                    this.inputBuffer.shift();
                                    dy = -1;
                                }
                            } else if (action === 'UP') {
                                dy = -1;
                                if (this.inputBuffer.length > 0) {
                                    if (this.inputBuffer[0] === 'LEFT') {
                                        this.inputBuffer.shift(); dx = -1;
                                    } else if (this.inputBuffer[0] === 'RIGHT') {
                                        this.inputBuffer.shift(); dx = 1;
                                    }
                                }
                            }

                            let targetX = this.playerGridX + dx;
                            let targetY = this.playerGridY + dy;

                            // For a diagonal jump, require at least one of the two orthogonal
                            // tiles to be open, so the player can't cut through a solid corner
                            // pinched between two walls.
                            let cornerClear = dx === 0 || dy === 0 ||
                                this.canMove(this.playerGridX + dx, this.playerGridY) ||
                                this.canMove(this.playerGridX, targetY);

                            if (this.canMove(targetX, targetY) && cornerClear) {
                                this.moveTo(targetX, targetY, dy === -1 ? 'jump' : 'walk');
                            } else {
                                // If diagonal blocked, try fallback
                                if (dy === -1 && dx !== 0) {
                                    if (this.canMove(this.playerGridX + dx, this.playerGridY)) {
                                        this.moveTo(this.playerGridX + dx, this.playerGridY, 'walk');
                                    } else if (this.canMove(this.playerGridX, this.playerGridY + dy)) {
                                        this.moveTo(this.playerGridX, this.playerGridY + dy, 'jump');
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (time > this.nextMoverTime) {
                this.nextMoverTime = time + 600;
                this.moveCarts();
                this.movePlatforms();
            }
        }
    }

    const config = {
        type: Phaser.AUTO,
        width: 1920,
        height: 1080,
        parent: containerId,
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: [BootScene, PlayScene],
        physics: { default: 'none' }
    };

    return new Phaser.Game(config);
};
