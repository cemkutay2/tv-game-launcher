window.launchGame = function(containerId) {
    const TILE_SIZE = 120;
    // How long (ms) to hold the player at the very start of a fall, waiting
    // for a dash key that hasn't arrived yet, before committing to falling
    // straight down. Gives remote-control input extra time to register.
    const AIR_DASH_GRACE_MS = 200;
    // How many extra mover ticks a moving platform pauses for once it hits
    // either end of its patrol, before turning around. Without this it only
    // sits still for a single ~600ms tick, which isn't much time to react
    // and hop on with a remote.
    const PLATFORM_ENDPOINT_DWELL_TICKS = 2;

    const KEY_COLORS = { 1: 0x8a4dff, 2: 0xff8800, 3: 0x00e5ff };

    // ---------------------------------------------------------------
    // Save data: furthest floor reached + audio preferences. Wrapped in
    // try/catch since localStorage can throw (private browsing, a locked
    // down WebView, etc.) — progress just won't persist in that case.
    // Old saves only had a single "muted" field covering both channels —
    // migrated by applying it to both on first read.
    // ---------------------------------------------------------------
    const SAVE_KEY = 'midnightBellhop:save';
    function loadSave() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return { furthestFloor: 0, sfxMuted: false, musicMuted: false };
            const parsed = JSON.parse(raw);
            const legacyMuted = !!parsed.muted;
            return {
                furthestFloor: Number.isInteger(parsed.furthestFloor) ? parsed.furthestFloor : 0,
                sfxMuted: typeof parsed.sfxMuted === 'boolean' ? parsed.sfxMuted : legacyMuted,
                musicMuted: typeof parsed.musicMuted === 'boolean' ? parsed.musicMuted : legacyMuted,
            };
        } catch (e) {
            return { furthestFloor: 0, sfxMuted: false, musicMuted: false };
        }
    }
    function writeSave(patch) {
        try {
            const current = loadSave();
            localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign(current, patch)));
        } catch (e) { /* no persistence available — not fatal */ }
    }
    function saveProgress(furthestFloor) {
        const current = loadSave();
        writeSave({ furthestFloor: Math.max(current.furthestFloor, furthestFloor) });
    }
    function saveSfxMuted(muted) { writeSave({ sfxMuted: muted }); }
    function saveMusicMuted(muted) { writeSave({ musicMuted: muted }); }

    // ---------------------------------------------------------------
    // Tiny procedural sound engine — short synthesized tones, no audio
    // asset files. Browsers block audio until a user gesture, so the
    // AudioContext is created lazily and resumed on first keypress
    // (TitleScene calls unlock() on its first keydown).
    // ---------------------------------------------------------------
    function createSfx() {
        let ctx = null;
        let sfxMuted = loadSave().sfxMuted;
        let musicMuted = loadSave().musicMuted;
        let musicTimer = null;

        function ensureCtx() {
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                ctx = new AC();
            }
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        }

        function tone({ freq, endFreq, duration, type = 'square', volume = 0.18, delay = 0, channel = 'sfx' }) {
            if (channel === 'music' ? musicMuted : sfxMuted) return;
            const c = ensureCtx();
            if (!c) return;
            const t0 = c.currentTime + delay;
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t0);
            if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
            osc.connect(gain).connect(c.destination);
            osc.start(t0);
            osc.stop(t0 + duration + 0.02);
        }

        function startMusic() {
            if (musicTimer) return;
            // Slow, quiet two-voice loop — a bassline plus an occasional pad
            // note. Deliberately understated background ambience, not a
            // melody that fights with the sound effects.
            const bass = [110, 110, 146.83, 130.81];
            const pad = [220, 293.66, 261.63, 220];
            let step = 0;
            musicTimer = setInterval(() => {
                tone({ freq: bass[step % bass.length], duration: 0.5, type: 'sine', volume: 0.05, channel: 'music' });
                if (step % 2 === 0) {
                    tone({ freq: pad[(step / 2) % pad.length], duration: 0.9, delay: 0.05, type: 'sine', volume: 0.03, channel: 'music' });
                }
                step++;
            }, 900);
        }
        function stopMusic() {
            if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
        }

        return {
            unlock() {
                ensureCtx();
                startMusic();
            },
            setSfxMuted(v) { sfxMuted = v; },
            isSfxMuted() { return sfxMuted; },
            setMusicMuted(v) { musicMuted = v; },
            isMusicMuted() { return musicMuted; },
            stopMusic,
            jump() { tone({ freq: 440, endFreq: 660, duration: 0.12, type: 'square', volume: 0.15 }); },
            land() { tone({ freq: 150, endFreq: 80, duration: 0.08, type: 'sine', volume: 0.12 }); },
            collect() {
                tone({ freq: 660, duration: 0.08, type: 'square', volume: 0.16 });
                tone({ freq: 990, duration: 0.12, delay: 0.06, type: 'square', volume: 0.14 });
            },
            key() {
                tone({ freq: 523, duration: 0.09, type: 'triangle', volume: 0.16 });
                tone({ freq: 784, duration: 0.14, delay: 0.07, type: 'triangle', volume: 0.14 });
            },
            door() { tone({ freq: 220, endFreq: 440, duration: 0.3, type: 'sawtooth', volume: 0.09 }); },
            death() { tone({ freq: 300, endFreq: 60, duration: 0.4, type: 'sawtooth', volume: 0.18 }); },
            teleport() {
                tone({ freq: 880, endFreq: 1760, duration: 0.2, type: 'sine', volume: 0.14 });
                tone({ freq: 1760, endFreq: 440, duration: 0.15, delay: 0.15, type: 'sine', volume: 0.1 });
            },
            checkpoint() {
                tone({ freq: 523, duration: 0.1, type: 'sine', volume: 0.14 });
                tone({ freq: 659, duration: 0.15, delay: 0.08, type: 'sine', volume: 0.14 });
            },
            select() { tone({ freq: 400, duration: 0.05, type: 'square', volume: 0.08 }); },
            confirm() { tone({ freq: 500, endFreq: 900, duration: 0.15, type: 'square', volume: 0.14 }); },
            levelComplete() {
                tone({ freq: 659, duration: 0.12, type: 'square', volume: 0.17 });
                tone({ freq: 880, duration: 0.18, delay: 0.1, type: 'square', volume: 0.17 });
            },
            winFanfare() {
                [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, duration: 0.25, delay: i * 0.15, type: 'square', volume: 0.18 }));
            },
        };
    }
    const sfx = createSfx();

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

    // Purely decorative wall sconces along the ceiling row, so the wide
    // dark void above the play area isn't completely empty. No gameplay
    // effect — just something for the eye while walking a long corridor.
    function addAmbience(scene, gridW) {
        for (let x = 2; x < gridW - 1; x += 4) {
            const sconce = scene.add.image(x * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE - 25, 'sconce').setDepth(1);
            // Dip low enough to actually read as "dim" rather than just a
            // slightly-softer glow, and stagger start/duration per sconce so
            // they flicker independently instead of breathing in lockstep.
            sconce.setAlpha(0.15 + Math.random() * 0.85);
            scene.tweens.add({
                targets: sconce,
                alpha: { from: 0.15, to: 1 },
                duration: 900 + Math.random() * 900,
                delay: Math.random() * 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    // A static row of wall panels topped with an open elevator door, the
    // bellhop, and a couple of suitcases — built from the same in-game
    // textures, used to dress up the title screen and the win screen. Pops
    // in with a staggered scale/fade rather than just appearing.
    function addHeroRow(scene, cx, floorY) {
        const items = [];
        for (let i = -3; i <= 3; i++) {
            items.push(scene.add.image(cx + i * TILE_SIZE, floorY, 'wall'));
        }
        items.push(scene.add.image(cx - 190, floorY - TILE_SIZE, 'door_open').setScale(1.05));
        items.push(scene.add.image(cx + 70, floorY - TILE_SIZE, 'player').setScale(1.6));
        items.push(scene.add.image(cx + 220, floorY - 92, 'luggage').setScale(0.9));
        items.push(scene.add.image(cx - 60, floorY - 88, 'luggage').setScale(0.7));

        items.forEach((item, i) => {
            const targetScale = item.scaleX;
            item.setAlpha(0).setScale(targetScale * 0.6);
            scene.tweens.add({
                targets: item,
                alpha: 1,
                scaleX: targetScale,
                scaleY: targetScale,
                duration: 350,
                delay: 250 + i * 30,
                ease: 'Back.easeOut'
            });
        });
    }

    // A faint, static row of wall panels along the very top of the screen —
    // just the corridor's paneling motif, not lit sconces — so menu/end
    // screens aren't a flat void without reintroducing the flickering
    // ambience that's meant to be an in-level-only thing.
    function addCeilingStrip(scene) {
        for (let x = -1; x < 17; x++) {
            scene.add.image(x * TILE_SIZE + 60, 40, 'wall').setAlpha(0.35);
        }
        scene.add.rectangle(960, 40, 1920, 90, 0x140809, 0.55);
    }

    // Fade the camera to black, then swap scenes — used for every menu
    // navigation / level transition so scenes cross-fade instead of
    // snapping. Background-colored fade so it blends with the scene behind.
    function fadeToScene(scene, key, data) {
        scene.cameras.main.fadeOut(250, 0x14, 0x08, 0x09);
        scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data));
    }

    class BootScene extends Phaser.Scene {
        constructor() {
            super('BootScene');
        }

        preload() {
            // Generate graphics programmatically
            const g = this.make.graphics({ x: 0, y: 0, add: false });

            // Wall (mahogany paneled door look)
            g.fillStyle(0x2a1012, 1);
            g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.lineStyle(4, 0x471d21, 1);
            g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x33161a, 1);
            g.fillRect(14, 14, TILE_SIZE - 28, TILE_SIZE - 28);
            g.lineStyle(2, 0x180a0b, 1);
            g.strokeRect(14, 14, TILE_SIZE - 28, TILE_SIZE - 28);
            g.lineStyle(1, 0x5c2b2f, 0.9);
            g.strokeRect(19, 19, TILE_SIZE - 38, TILE_SIZE - 38);
            g.lineStyle(1, 0x1c0b0d, 0.5);
            for (let gx = 26; gx < TILE_SIZE - 20; gx += 13) {
                g.beginPath();
                g.moveTo(gx, 22);
                g.lineTo(gx + 3, TILE_SIZE - 22);
                g.strokePath();
            }
            g.fillStyle(0x6b4423, 1);
            [[9, 9], [TILE_SIZE - 9, 9], [9, TILE_SIZE - 9], [TILE_SIZE - 9, TILE_SIZE - 9]].forEach(([cx, cy]) => {
                g.fillCircle(cx, cy, 3.5);
            });
            g.generateTexture('wall', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Player (Bellhop - Neon Blue). Feet sit flush with the tile's
            // bottom edge so the sprite doesn't visually hover above whatever
            // it's standing on.
            g.fillStyle(0x0090a0, 1);
            g.fillRect(TILE_SIZE / 2 - 15, TILE_SIZE / 2 + 45, 12, 15); // legs
            g.fillRect(TILE_SIZE / 2 + 3, TILE_SIZE / 2 + 45, 12, 15);
            g.fillStyle(0x062a30, 1);
            g.fillRect(TILE_SIZE / 2 - 15, TILE_SIZE / 2 + 56, 12, 4); // shoes
            g.fillRect(TILE_SIZE / 2 + 3, TILE_SIZE / 2 + 56, 12, 4);
            g.fillStyle(0xffffff, 1);
            g.fillRect(TILE_SIZE / 2 - 15, TILE_SIZE / 2 + 20, 30, 25); // torso
            g.fillStyle(0x00cddc, 1);
            g.fillRect(TILE_SIZE / 2 - 19, TILE_SIZE / 2 + 19, 9, 6); // epaulettes
            g.fillRect(TILE_SIZE / 2 + 10, TILE_SIZE / 2 + 19, 9, 6);
            g.fillStyle(0x00b8c9, 1);
            g.fillRect(TILE_SIZE / 2 - 10, TILE_SIZE / 2 + 20, 20, 5); // collar
            g.fillStyle(0x143a40, 1);
            g.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2 + 32, 2); // buttons
            g.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2 + 40, 2);
            g.fillStyle(0x00f3ff, 1);
            g.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2 + 12, 24); // head
            g.fillStyle(0x06272b, 1);
            g.fillCircle(TILE_SIZE / 2 - 8, TILE_SIZE / 2 + 9, 3); // eyes
            g.fillCircle(TILE_SIZE / 2 + 8, TILE_SIZE / 2 + 9, 3);
            g.fillStyle(0x00f3ff, 1);
            g.fillRect(TILE_SIZE / 2 - 18, TILE_SIZE / 2 - 12, 36, 14); // pillbox hat
            g.fillStyle(0xffffff, 1);
            g.fillRect(TILE_SIZE / 2 - 20, TILE_SIZE / 2, 40, 4); // hat trim band
            g.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2 - 14, 3); // hat button
            g.generateTexture('player', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Luggage (Neon Gold)
            {
                const lx = TILE_SIZE / 2 - 25, ly = TILE_SIZE / 2 - 10;
                g.fillStyle(0xa66f00, 1);
                g.fillRect(lx, ly, 50, 35); // shadow base
                g.fillStyle(0xffd700, 1);
                g.fillRect(lx, ly, 50, 30);
                g.fillStyle(0xfff2b0, 0.7);
                g.fillRect(lx + 3, ly + 2, 44, 4); // top sheen
                g.fillStyle(0x8a5a00, 0.8);
                g.fillRect(lx, ly + 15, 50, 4); // strap
                g.fillStyle(0x5c3c00, 1);
                g.fillRect(lx + 22, ly + 13, 6, 8); // buckle
                g.fillStyle(0x8a5a00, 0.9);
                g.fillTriangle(lx, ly + 30, lx + 9, ly + 30, lx, ly + 21); // corner accents
                g.fillTriangle(lx + 50, ly + 30, lx + 41, ly + 30, lx + 50, ly + 21);
                g.fillStyle(0xffa500, 1);
                g.fillRect(TILE_SIZE / 2 - 10, TILE_SIZE / 2 - 25, 20, 15); // handle
                g.fillStyle(0x000000, 1);
                g.fillRect(TILE_SIZE / 2 - 5, TILE_SIZE / 2 - 20, 10, 10); // handle cutout
                g.lineStyle(1, 0x5c3c00, 1);
                g.beginPath();
                g.moveTo(lx + 42, ly);
                g.lineTo(lx + 46, ly - 8);
                g.strokePath();
                g.fillStyle(0xffffff, 1);
                g.fillRect(lx + 41, ly - 14, 10, 7); // tag
            }
            g.generateTexture('luggage', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Hazard Cart (Neon Red, with warning stripes)
            const drawCart = (mirror) => {
                const bx = 10, by = TILE_SIZE - 45, bw = TILE_SIZE - 20, bh = 25;
                g.fillStyle(0x8f0026, 1);
                g.fillRect(bx, by, bw, bh);
                g.fillStyle(0xff003c, 1);
                g.fillRect(bx, by, bw, bh - 6);
                g.fillStyle(0xffcc00, 0.85);
                for (let sx = bx - bh; sx < bx + bw; sx += 14) {
                    g.fillTriangle(sx, by + bh, sx + 7, by, sx + 14, by + bh);
                }
                g.fillStyle(0x1a1a1a, 0.55);
                for (let sx = bx - bh + 7; sx < bx + bw; sx += 14) {
                    g.fillTriangle(sx, by + bh, sx + 7, by, sx + 14, by + bh);
                }
                g.lineStyle(3, 0x1a1a1a, 1);
                g.strokeRect(bx, by, bw, bh);
                g.fillStyle(0x222222, 1);
                g.fillCircle(25, TILE_SIZE - 10, 11);
                g.fillCircle(TILE_SIZE - 25, TILE_SIZE - 10, 11);
                g.fillStyle(0xaaaaaa, 1);
                g.fillCircle(25, TILE_SIZE - 10, 7);
                g.fillCircle(TILE_SIZE - 25, TILE_SIZE - 10, 7);
                g.fillStyle(0x555555, 1);
                g.fillCircle(25, TILE_SIZE - 10, 2.5);
                g.fillCircle(TILE_SIZE - 25, TILE_SIZE - 10, 2.5);
                const hx = mirror ? 20 : TILE_SIZE - 25;
                g.fillStyle(0xdddddd, 1);
                g.fillRect(hx, TILE_SIZE - 65, 5, 20); // handle
                g.fillStyle(0xff003c, 1);
                g.fillCircle(hx + 2, TILE_SIZE - 65, 4); // reflector
            };
            drawCart(false);
            g.generateTexture('cart_right', TILE_SIZE, TILE_SIZE);
            g.clear();
            drawCart(true);
            g.generateTexture('cart_left', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Elevator Closed (paneled, with a dim indicator light)
            const drawDoorFrame = () => {
                g.fillStyle(0x333333, 1);
                g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
                g.lineStyle(4, 0x111111, 1);
                g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
                g.lineStyle(2, 0x222222, 1);
                [0, TILE_SIZE / 2].forEach(hx => {
                    g.strokeRect(hx + 10, 14, TILE_SIZE / 2 - 20, TILE_SIZE - 28);
                    g.beginPath();
                    g.moveTo(hx + 10, TILE_SIZE * 0.42);
                    g.lineTo(hx + TILE_SIZE / 2 - 10, TILE_SIZE * 0.42);
                    g.strokePath();
                });
                g.fillStyle(0x111111, 1);
                [[8, 8], [TILE_SIZE - 8, 8], [8, TILE_SIZE - 8], [TILE_SIZE - 8, TILE_SIZE - 8]].forEach(([cx, cy]) => g.fillCircle(cx, cy, 2.5));
            };
            drawDoorFrame();
            g.lineStyle(2, 0x000000, 1);
            g.beginPath();
            g.moveTo(TILE_SIZE / 2, 0);
            g.lineTo(TILE_SIZE / 2, TILE_SIZE);
            g.strokePath();
            g.fillStyle(0x552222, 1);
            g.fillCircle(TILE_SIZE / 2, 12, 4); // indicator, dim/unlit
            g.generateTexture('door_closed', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Elevator Open (soft glow bloom, lit indicator)
            g.fillStyle(0x111111, 1);
            g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x00ffaa, 0.35);
            g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x00ffaa, 0.25);
            g.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE * 0.42);
            g.lineStyle(4, 0x333333, 1);
            g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x00ffaa, 1);
            g.fillCircle(TILE_SIZE / 2, 12, 4); // indicator, lit
            g.generateTexture('door_open', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Key (faceted gem, tinted per color at runtime)
            {
                const kx = TILE_SIZE / 2, ky = TILE_SIZE / 2;
                g.fillStyle(0xffffff, 0.9);
                g.beginPath();
                g.moveTo(kx, ky - 30);
                g.lineTo(kx + 22, ky);
                g.lineTo(kx, ky + 30);
                g.lineTo(kx - 22, ky);
                g.closePath();
                g.fillPath();
                g.fillStyle(0xffffff, 0.55);
                g.fillTriangle(kx, ky - 30, kx + 22, ky, kx, ky); // facet
                g.fillStyle(0xffffff, 0.3);
                g.fillTriangle(kx, ky, kx + 22, ky, kx, ky + 30); // facet
                g.fillStyle(0xffffff, 1);
                g.fillTriangle(kx - 8, ky - 14, kx - 2, ky - 18, kx - 4, ky - 8); // glint
                g.fillStyle(0x000000, 1);
                g.fillRect(kx - 4, ky + 8, 8, 18); // notch
            }
            g.generateTexture('key', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Locked door (keyhole + hinges, tinted per color at runtime)
            g.fillStyle(0x241014, 1);
            g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
            g.lineStyle(6, 0xffffff, 1);
            g.strokeRect(6, 6, TILE_SIZE - 12, TILE_SIZE - 12);
            g.lineStyle(2, 0xffffff, 0.5);
            g.strokeRect(14, 14, TILE_SIZE - 28, TILE_SIZE - 28);
            g.fillStyle(0xffffff, 0.8);
            g.fillRect(4, 20, 6, 14); // hinges
            g.fillRect(4, TILE_SIZE - 34, 6, 14);
            g.fillRect(TILE_SIZE - 10, 20, 6, 14);
            g.fillRect(TILE_SIZE - 10, TILE_SIZE - 34, 6, 14);
            g.fillStyle(0xffffff, 1);
            g.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2 - 6, 12); // keyhole
            g.fillTriangle(TILE_SIZE / 2 - 7, TILE_SIZE / 2 + 2, TILE_SIZE / 2 + 7, TILE_SIZE / 2 + 2, TILE_SIZE / 2, TILE_SIZE / 2 + 20);
            g.generateTexture('door_locked', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Moving platform (rideable, safe). The rider stands in the cell
            // above it, so the deck sits at the TOP of this tile — not
            // centered — or the player would appear to float above it.
            g.fillStyle(0x0a1f18, 1);
            g.fillRect(4, 0, TILE_SIZE - 8, 36);
            g.fillStyle(0x123227, 1);
            g.fillRect(4, 0, TILE_SIZE - 8, 30);
            g.lineStyle(4, 0x39ff14, 1);
            g.strokeRect(4, 0, TILE_SIZE - 8, 36);
            for (let sx = 4; sx < TILE_SIZE - 4; sx += 12) {
                g.fillStyle(0xffcc00, 0.8);
                g.fillTriangle(sx, 36, sx + 6, 30, sx + 12, 36); // hazard edge
            }
            g.fillStyle(0x39ff14, 0.8);
            [10, TILE_SIZE - 10].forEach(cx => { g.fillCircle(cx, 8, 2.5); g.fillCircle(cx, 22, 2.5); }); // rivets
            g.fillStyle(0x39ff14, 1);
            g.fillRect(14, 14, TILE_SIZE - 28, 6); // center light stripe
            g.generateTexture('platform', TILE_SIZE, TILE_SIZE);
            g.clear();

            // One-way catwalk floor (solid; drop through with Down). Same
            // deal as the moving platform: the walkable surface has to sit
            // at the TOP of this tile, flush with the cell the player
            // actually stands in above it.
            g.fillStyle(0x0c2b2e, 1);
            g.fillRect(0, 0, TILE_SIZE, 26);
            g.lineStyle(1, 0x0a2124, 0.8);
            for (let gx = 6; gx < TILE_SIZE; gx += 10) {
                g.beginPath();
                g.moveTo(gx, 0);
                g.lineTo(gx, 26);
                g.strokePath();
            }
            for (let sx = 0; sx < TILE_SIZE; sx += 20) {
                g.fillStyle(0x00e5c8, 0.6);
                g.fillTriangle(sx, 20, sx + 10, 6, sx + 20, 20);
            }
            g.fillStyle(0x00e5c8, 0.9);
            g.fillRect(0, 0, 4, 26); // side rails
            g.fillRect(TILE_SIZE - 4, 0, 4, 26);
            g.generateTexture('oneway', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Checkpoint lantern post (off / on)
            const drawBeacon = (lit) => {
                g.fillStyle(0x333333, 1);
                g.fillRect(TILE_SIZE / 2 - 12, TILE_SIZE - 12, 24, 6); // base
                g.fillStyle(lit ? 0x1c6653 : 0x333333, 1);
                g.fillRect(TILE_SIZE / 2 - 4, 30, 8, TILE_SIZE - 42); // pole
                g.lineStyle(3, lit ? 0x00ffaa : 0x555555, 1);
                g.strokeRect(TILE_SIZE / 2 - 14, 8, 28, 26); // lantern housing
                g.fillStyle(lit ? 0x00ffaa : 0x2a2a2a, lit ? 0.35 : 1);
                g.fillRect(TILE_SIZE / 2 - 11, 11, 22, 20);
                g.fillStyle(lit ? 0x00ffaa : 0x555555, 1);
                g.fillCircle(TILE_SIZE / 2, 21, lit ? 8 : 6);
                g.fillStyle(lit ? 0x00ffaa : 0x555555, 1);
                g.fillTriangle(TILE_SIZE / 2 - 16, 8, TILE_SIZE / 2 + 16, 8, TILE_SIZE / 2, -6); // cap
            };
            drawBeacon(false);
            g.generateTexture('checkpoint_off', TILE_SIZE, TILE_SIZE);
            g.clear();
            drawBeacon(true);
            g.generateTexture('checkpoint_on', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Teleporter pad (rune circle, tinted per id at runtime)
            {
                const tx = TILE_SIZE / 2, ty = TILE_SIZE / 2;
                g.fillStyle(0xffffff, 1);
                g.fillEllipse(tx, ty + 20, TILE_SIZE - 24, 30);
                g.lineStyle(5, 0xffffff, 1);
                g.strokeCircle(tx, ty, 30);
                g.strokeCircle(tx, ty, 44);
                g.lineStyle(2, 0xffffff, 0.7);
                g.strokeCircle(tx, ty, 16);
                g.lineStyle(2, 0xffffff, 0.6);
                for (let a = 0; a < 8; a++) {
                    const ang = (Math.PI / 4) * a;
                    g.beginPath();
                    g.moveTo(tx + Math.cos(ang) * 16, ty + Math.sin(ang) * 16);
                    g.lineTo(tx + Math.cos(ang) * 30, ty + Math.sin(ang) * 30);
                    g.strokePath();
                }
                g.lineStyle(3, 0xffffff, 0.9);
                for (let a = 0; a < 4; a++) {
                    const ang = (Math.PI / 2) * a;
                    g.beginPath();
                    g.moveTo(tx + Math.cos(ang) * 40, ty + Math.sin(ang) * 40);
                    g.lineTo(tx + Math.cos(ang) * 48, ty + Math.sin(ang) * 48);
                    g.strokePath();
                }
            }
            g.generateTexture('teleporter', TILE_SIZE, TILE_SIZE);
            g.clear();

            // Wall sconce (pure decoration, no gameplay meaning)
            g.fillStyle(0x241814, 1);
            g.fillRect(TILE_SIZE / 2 - 3, 0, 6, 10); // arm
            g.fillStyle(0x3a2418, 1);
            g.fillRect(TILE_SIZE / 2 - 10, 0, 20, 14); // bracket
            g.fillStyle(0x2a1c12, 1);
            g.fillTriangle(TILE_SIZE / 2 - 16, 30, TILE_SIZE / 2 + 16, 30, TILE_SIZE / 2 + 9, 14); // shade
            g.fillTriangle(TILE_SIZE / 2 - 16, 30, TILE_SIZE / 2 + 9, 14, TILE_SIZE / 2 - 9, 14);
            g.fillStyle(0xffd27f, 0.25);
            g.fillCircle(TILE_SIZE / 2, 32, 24); // halo
            g.fillStyle(0xffd27f, 0.9);
            g.fillCircle(TILE_SIZE / 2, 32, 12); // bulb
            g.generateTexture('sconce', TILE_SIZE, 60);
            g.clear();

            // Dummy thumbnail for JSON (just to not fail if loaded)
            g.fillStyle(0x00f3ff, 1);
            g.fillRect(0, 0, 200, 200);
            g.generateTexture('thumb', 200, 200);
            g.clear();
        }

        create() {
            this.scene.start('TitleScene');
        }
    }

    class TitleScene extends Phaser.Scene {
        constructor() {
            super('TitleScene');
        }

        create() {
            this.cameras.main.setBackgroundColor('#140809');
            this.cameras.main.fadeIn(350, 20, 8, 9);
            addCeilingStrip(this);

            const glow = this.add.circle(960, 190, 260, 0x00f3ff, 0.08).setAlpha(0);
            const title = this.add.text(960, 140, 'MIDNIGHT BELLHOP', {
                font: 'bold 100px Arial', fill: '#00f3ff', stroke: '#003a40', strokeThickness: 8
            }).setOrigin(0.5).setAlpha(0);
            const subtitle = this.add.text(960, 255, 'a night-shift platformer', { font: '28px Arial', fill: '#ffd700' }).setOrigin(0.5).setAlpha(0);
            this.tweens.add({ targets: glow, alpha: 1, duration: 500, delay: 100 });
            this.tweens.add({ targets: title, alpha: 1, y: 170, duration: 450, delay: 100, ease: 'Cubic.easeOut' });
            this.tweens.add({ targets: subtitle, alpha: 1, duration: 400, delay: 300 });

            addHeroRow(this, 960, 520);

            const hint = this.add.text(960, 630,
                'ARROWS move & jump   •   DOWN drop through catwalks   •   ENTER select',
                { font: '22px Arial', fill: '#aaaaaa' }
            ).setOrigin(0.5).setAlpha(0);
            this.tweens.add({ targets: hint, alpha: 1, duration: 350, delay: 500 });

            const save = loadSave();
            this.optionKeys = [];
            if (save.furthestFloor > 0 && save.furthestFloor < LEVELS.length) {
                this.optionKeys.push('continue');
            }
            this.optionKeys.push('newgame');
            this.optionKeys.push('music');
            this.optionKeys.push('sfx');

            this.selectedIndex = 0;
            this.menuTop = 720;
            this.menuRowH = 62;
            this.selectHighlight = this.add.rectangle(960, this.menuTop, 440, 52, 0x00343a, 0.6)
                .setStrokeStyle(2, 0x00f3ff, 0.8)
                .setAlpha(0);
            this.optionTexts = this.optionKeys.map((key, i) =>
                this.add.text(960, this.menuTop + i * this.menuRowH, '', { font: '36px Arial', fill: '#ffffff' }).setOrigin(0.5).setAlpha(0)
            );
            this.refreshOptions();
            this.tweens.add({ targets: this.selectHighlight, alpha: 1, duration: 300, delay: 600 });
            this.optionTexts.forEach((t, i) => {
                this.tweens.add({ targets: t, alpha: 1, duration: 300, delay: 600 + i * 60 });
            });

            this.input.keyboard.on('keydown', (e) => {
                sfx.unlock();
                if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
                else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.confirm(); }
            });
        }

        move(delta) {
            sfx.select();
            this.selectedIndex = (this.selectedIndex + delta + this.optionKeys.length) % this.optionKeys.length;
            this.refreshOptions();
        }

        optionLabel(key) {
            if (key === 'continue') return 'CONTINUE — FLOOR ' + (loadSave().furthestFloor + 1);
            if (key === 'newgame') return 'NEW GAME';
            if (key === 'music') return 'MUSIC: ' + (sfx.isMusicMuted() ? 'OFF' : 'ON');
            if (key === 'sfx') return 'SOUND FX: ' + (sfx.isSfxMuted() ? 'OFF' : 'ON');
            return '';
        }

        refreshOptions() {
            this.optionKeys.forEach((key, i) => {
                const t = this.optionTexts[i];
                t.setText(this.optionLabel(key));
                t.setColor(i === this.selectedIndex ? '#00f3ff' : '#ffffff');
            });
            this.tweens.add({
                targets: this.selectHighlight,
                y: this.menuTop + this.selectedIndex * this.menuRowH,
                duration: 150,
                ease: 'Cubic.easeOut'
            });
        }

        confirm() {
            const key = this.optionKeys[this.selectedIndex];
            sfx.confirm();
            if (key === 'continue') {
                fadeToScene(this, 'PlayScene', { level: loadSave().furthestFloor });
            } else if (key === 'newgame') {
                fadeToScene(this, 'PlayScene', { level: 0 });
            } else if (key === 'music') {
                sfx.setMusicMuted(!sfx.isMusicMuted());
                saveMusicMuted(sfx.isMusicMuted());
                this.refreshOptions();
            } else if (key === 'sfx') {
                sfx.setSfxMuted(!sfx.isSfxMuted());
                saveSfxMuted(sfx.isSfxMuted());
                this.refreshOptions();
            }
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
            this.paused = false;
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
            sfx.unlock();
            this.cameras.main.setBackgroundColor('#140809');
            this.cameras.main.fadeIn(350, 20, 8, 9);

            if (this.levelIndex >= LEVELS.length) {
                // Game Beat!
                sfx.winFanfare();
                addCeilingStrip(this);

                const glow = this.add.circle(960, 210, 260, 0x00ffaa, 0.1).setAlpha(0);
                const title = this.add.text(960, 160, 'YOU WIN!', {
                    font: 'bold 110px Arial', fill: '#00f3ff', stroke: '#003a40', strokeThickness: 8
                }).setOrigin(0.5).setAlpha(0);
                const subtitle = this.add.text(960, 280, `All ${LEVELS.length} floors cleared — checkout complete.`, { font: '28px Arial', fill: '#ffd700' }).setOrigin(0.5).setAlpha(0);
                this.tweens.add({ targets: glow, alpha: 1, duration: 500, delay: 100 });
                this.tweens.add({ targets: title, alpha: 1, y: 190, duration: 450, delay: 100, ease: 'Back.easeOut' });
                this.tweens.add({ targets: subtitle, alpha: 1, duration: 400, delay: 300 });

                addHeroRow(this, 960, 560);

                const hint = this.add.text(960, 690, 'Press any key to continue', { font: '32px Arial', fill: '#ffffff' }).setOrigin(0.5).setAlpha(0);
                this.tweens.add({ targets: hint, alpha: 1, duration: 350, delay: 600 });

                // A little gold confetti falling for the celebration.
                this.add.particles(0, -20, 'luggage', {
                    x: { min: 200, max: 1720 },
                    speedY: { min: 120, max: 220 },
                    scale: { start: 0.25, end: 0.15 },
                    rotate: { start: 0, end: 360 },
                    lifespan: 3000,
                    frequency: 60,
                    quantity: 1
                });

                this.input.keyboard.once('keydown', () => {
                    fadeToScene(this, 'TitleScene');
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
            addAmbience(this, this.gridW);

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
                this.platforms.push({ gridX: p.x, gridY: p.y, prevX: p.x, prevY: p.y, axis: p.axis, dir: p.dir, startX: p.x, startY: p.y, startDir: p.dir, dwellRemaining: 0, sprite });
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
            this.add.text(20, 20, `FLOOR ${this.levelIndex + 1}/${LEVELS.length} — ${level.name}`, { font: '40px Arial', fill: '#ffffff' }).setScrollFactor(0).setDepth(50);
            this.hudLuggageIcon = this.add.image(34, 92, 'luggage').setScale(0.32).setScrollFactor(0).setDepth(50);
            this.hudLuggageText = this.add.text(58, 76, '', { font: '28px Arial', fill: '#ffd700' }).setScrollFactor(0).setDepth(50);
            this.hudKeyIcons = [];
            this.updateHud();
            this.add.text(20, 1080 - 40, 'ESC / BACK — Pause', { font: '22px Arial', fill: '#666666' }).setScrollFactor(0).setDepth(50);

            this.createPauseUI();

            this.input.keyboard.on('keydown', (e) => {
                if (this.paused) {
                    if (e.key === 'ArrowUp') { e.preventDefault(); this.movePauseSelection(-1); }
                    else if (e.key === 'ArrowDown') { e.preventDefault(); this.movePauseSelection(1); }
                    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.confirmPauseSelection(); }
                    else if (e.key === 'Escape') { e.preventDefault(); this.setPaused(false); }
                    return;
                }
                if (this.isDead || this.levelComplete) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.setPaused(true);
                    return;
                }
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
            if (!this.hudLuggageText) return;
            this.hudLuggageText.setText(`${this.collected}/${this.totalLuggage}`);

            this.hudKeyIcons.forEach(icon => icon.destroy());
            this.hudKeyIcons = [];
            Object.keys(this.collectedKeys).forEach((id, i) => {
                const icon = this.add.image(150 + i * 38, 92, 'key').setScale(0.28).setScrollFactor(0).setDepth(50);
                icon.setTint(KEY_COLORS[id] || 0xffffff);
                this.hudKeyIcons.push(icon);
            });
        }

        spawnFloatText(gridX, gridY, text, color) {
            const t = this.add.text(gridX * TILE_SIZE + TILE_SIZE / 2, gridY * TILE_SIZE + TILE_SIZE / 2, text, { font: '32px Arial', fill: color }).setOrigin(0.5).setDepth(20);
            this.tweens.add({
                targets: t,
                y: t.y - 50,
                alpha: 0,
                duration: 600,
                ease: 'Quad.easeOut',
                onComplete: () => t.destroy()
            });
        }

        // ---- pause menu -------------------------------------------------
        createPauseUI() {
            const cx = 1920 / 2, cy = 1080 / 2;
            this.pauseOverlay = this.add.rectangle(cx, cy, 1920, 1080, 0x000000, 0.7).setScrollFactor(0).setDepth(100).setVisible(false);
            this.pauseTitle = this.add.text(cx, cy - 160, 'PAUSED', { font: '80px Arial', fill: '#00f3ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(101).setVisible(false);
            this.pauseOptionKeys = ['resume', 'restart', 'music', 'sfx', 'quit'];
            this.pauseSelectedIndex = 0;
            this.pauseOptionTexts = this.pauseOptionKeys.map((key, i) =>
                this.add.text(cx, cy - 30 + i * 70, '', { font: '40px Arial', fill: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(101).setVisible(false)
            );
        }

        pauseOptionLabel(key) {
            if (key === 'resume') return 'RESUME';
            if (key === 'restart') return 'RESTART FLOOR';
            if (key === 'music') return 'MUSIC: ' + (sfx.isMusicMuted() ? 'OFF' : 'ON');
            if (key === 'sfx') return 'SOUND FX: ' + (sfx.isSfxMuted() ? 'OFF' : 'ON');
            if (key === 'quit') return 'QUIT TO TITLE';
            return '';
        }

        refreshPauseTexts() {
            this.pauseOptionKeys.forEach((key, i) => {
                const t = this.pauseOptionTexts[i];
                t.setText((i === this.pauseSelectedIndex ? '> ' : '   ') + this.pauseOptionLabel(key));
                t.setColor(i === this.pauseSelectedIndex ? '#00f3ff' : '#ffffff');
            });
        }

        setPaused(v) {
            this.paused = v;
            const elements = [this.pauseOverlay, this.pauseTitle, ...this.pauseOptionTexts];
            if (v) {
                this.pauseSelectedIndex = 0;
                // No tweens.pauseAll() here: that pauses the whole manager,
                // including tweens added afterward — which would freeze the
                // menu's own entrance animation before it ever played.
                // update()'s `if (this.paused) return` already stops any
                // *new* cart/platform/player moves from being scheduled;
                // at worst an already-in-flight ~200ms move finishes on its own.
                this.refreshPauseTexts();
                elements.forEach(el => el.setVisible(true).setAlpha(0));
                this.pauseTitle.setScale(0.85);
                this.tweens.add({ targets: this.pauseOverlay, alpha: 1, duration: 200 });
                this.tweens.add({ targets: this.pauseTitle, alpha: 1, scale: 1, duration: 220, ease: 'Back.easeOut' });
                this.pauseOptionTexts.forEach((t, i) => {
                    this.tweens.add({ targets: t, alpha: 1, duration: 180, delay: 60 + i * 40 });
                });
            } else {
                this.tweens.add({
                    targets: elements,
                    alpha: 0,
                    duration: 150,
                    onComplete: () => elements.forEach(el => el.setVisible(false))
                });
            }
        }

        movePauseSelection(delta) {
            sfx.select();
            this.pauseSelectedIndex = (this.pauseSelectedIndex + delta + this.pauseOptionKeys.length) % this.pauseOptionKeys.length;
            this.refreshPauseTexts();
        }

        confirmPauseSelection() {
            const key = this.pauseOptionKeys[this.pauseSelectedIndex];
            sfx.confirm();
            if (key === 'resume') {
                this.setPaused(false);
            } else if (key === 'restart') {
                fadeToScene(this, 'PlayScene', { level: this.levelIndex });
            } else if (key === 'music') {
                sfx.setMusicMuted(!sfx.isMusicMuted());
                saveMusicMuted(sfx.isMusicMuted());
                this.refreshPauseTexts();
            } else if (key === 'sfx') {
                sfx.setSfxMuted(!sfx.isSfxMuted());
                saveSfxMuted(sfx.isSfxMuted());
                this.refreshPauseTexts();
            } else if (key === 'quit') {
                fadeToScene(this, 'TitleScene');
            }
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

        // Like isSolid, but a one-way floor never blocks movement INTO its cell —
        // it only holds you up if you're already standing on it from above
        // (isGrounded still treats it as solid). Without this split, a catwalk
        // overhead makes every jump underneath it a no-op across its whole span,
        // since the jump target is always "solid". A jump into a one-way tile
        // from below still won't let you rest there — isGrounded fails the next
        // tick and you fall straight back — this just stops it from eating the
        // input entirely.
        canMove(x, y) {
            if (x < 0 || x >= this.gridW || y < 0 || y >= this.gridH) return false;
            const key = x + ',' + y;
            if (this.wallSet.has(key)) return false;
            for (const d of this.doors) {
                if (!d.open && d.x === x && d.y === y) return false;
            }
            for (const p of this.platforms) {
                if (p.gridX === x && p.gridY === y) return false;
            }
            return true;
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
                sfx.jump();
            } else if (type === 'fall') {
                ease = 'Quad.easeIn';
                duration = 150;
            } else {
                ease = 'Sine.easeInOut';
                if (type === 'walk') {
                    this.particles.explode(4, this.playerSprite.x, this.playerSprite.y + 50);
                }
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
                    if (type === 'fall' && this.isGrounded(this.playerGridX, this.playerGridY)) {
                        sfx.land();
                        this.tweens.add({
                            targets: this.playerSprite,
                            scaleX: 1.25, scaleY: 0.75,
                            duration: 80,
                            yoyo: true,
                            ease: 'Quad.easeOut'
                        });
                    }
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
                    sfx.collect();
                    this.luggages.splice(i, 1);
                    this.collected++;

                    this.cameras.main.flash(200, 255, 215, 0);
                    this.spawnFloatText(l.x, l.y, '+1', '#ffd700');
                    this.tweens.add({
                        targets: l.sprite,
                        scale: 1.6, alpha: 0,
                        duration: 250,
                        ease: 'Back.easeOut',
                        onComplete: () => l.sprite.destroy()
                    });

                    if (this.collected >= this.totalLuggage) {
                        this.elevatorSprite.setTexture('door_open');
                    }
                    this.updateHud();
                }
            }

            for (let i = this.keysList.length - 1; i >= 0; i--) {
                const k = this.keysList[i];
                if (k.x === this.playerGridX && k.y === this.playerGridY) {
                    sfx.key();
                    this.keysList.splice(i, 1);
                    this.collectedKeys[k.id] = true;

                    this.cameras.main.flash(200, 180, 120, 255);
                    this.spawnFloatText(k.x, k.y, 'KEY', '#b388ff');
                    this.tweens.add({
                        targets: k.sprite,
                        scale: 1.6, alpha: 0,
                        duration: 250,
                        ease: 'Back.easeOut',
                        onComplete: () => k.sprite.destroy()
                    });

                    for (const d of this.doors) {
                        if (d.id === k.id && !d.open) {
                            d.open = true;
                            sfx.door();
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
                sfx.levelComplete();
                saveProgress(this.levelIndex + 1);

                this.tweens.add({
                    targets: this.playerSprite,
                    alpha: 0,
                    scale: 0,
                    duration: 500,
                    onComplete: () => {
                        fadeToScene(this, 'PlayScene', { level: this.levelIndex + 1 });
                    }
                });
            }
        }

        checkTeleport() {
            const here = this.teleporters.find(t => t.x === this.playerGridX && t.y === this.playerGridY);
            if (!here) return;
            const dest = this.teleporters.find(t => t.id === here.id && t !== here);
            if (!dest) return;

            sfx.teleport();
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
            sfx.checkpoint();
            this.cameras.main.flash(150, 0, 255, 170);
        }

        die() {
            if (this.isDead || this.levelComplete) return;
            this.isDead = true;
            sfx.death();
            this.cameras.main.shake(300, 0.02);
            this.playerSprite.setTint(0xff0000);

            this.time.delayedCall(800, () => {
                if (this.lastCheckpoint) {
                    this.respawnAtCheckpoint();
                } else {
                    fadeToScene(this, 'PlayScene', { level: this.levelIndex });
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
                p.dwellRemaining = 0;
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
                // Sitting out an extended dwell at one end of its patrol — see
                // PLATFORM_ENDPOINT_DWELL_TICKS. Give the tick back without
                // touching position, so it just holds still a bit longer.
                if (p.dwellRemaining > 0) {
                    p.dwellRemaining--;
                    continue;
                }

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
                    // Hit the end of its patrol — turn around, but don't take the
                    // first step back yet. dwellRemaining keeps it parked here for
                    // a few extra ticks, giving a much bigger window to hop on or
                    // off right where it stops instead of a single ~600ms beat.
                    p.dir *= -1;
                    p.dwellRemaining = PLATFORM_ENDPOINT_DWELL_TICKS;
                }

                if (moved) {
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
                    if (riderHere && !this.isAnimating) {
                        const ndx = p.gridX - p.prevX, ndy = p.gridY - p.prevY;
                        if (ndx !== 0 || ndy !== 0) {
                            this.moveTo(this.playerGridX + ndx, this.playerGridY + ndy, 'ride');
                        }
                    }
                }
            }
        }

        update(time, delta) {
            if (this.paused) return;
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
        scene: [BootScene, TitleScene, PlayScene],
        physics: { default: 'none' }
    };

    const game = new Phaser.Game(config);
    game.events.once('destroy', () => sfx.stopMusic());

    // Called by the launcher when the TV remote's hardware back button is
    // pressed (that event never reaches Phaser's own keyboard input — the
    // host app intercepts it natively before it can become a DOM keydown).
    // Returns true if the game consumed it (opened/closed the pause menu),
    // false to let the launcher exit back to the game grid.
    game.handleBackButton = function() {
        const scene = game.scene.getScenes(true)[0];
        if (!scene || scene.scene.key !== 'PlayScene') return false;
        if (scene.isDead || scene.levelComplete) return false;
        scene.setPaused(!scene.paused);
        return true;
    };

    return game;
};
