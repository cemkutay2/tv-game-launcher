window.launchGame = function(containerId) {
    const TILE_SIZE = 120;
    const GRID_W = 16;
    const GRID_H = 9;
    // How long (ms) to hold the player at the very start of a fall, waiting
    // for a dash key that hasn't arrived yet, before committing to falling
    // straight down. Gives remote-control input extra time to register.
    const AIR_DASH_GRACE_MS = 150;

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

            // Player (Bellhop - Neon Blue)
            g.fillStyle(0x00f3ff, 1);
            g.fillCircle(TILE_SIZE / 2, TILE_SIZE / 2 - 15, TILE_SIZE / 4);
            g.fillStyle(0xffffff, 1);
            g.fillRect(TILE_SIZE / 2 - 15, TILE_SIZE / 2 - 5, 30, 40);
            g.fillStyle(0x00f3ff, 1);
            g.fillRect(TILE_SIZE / 2 - 20, TILE_SIZE / 2 - 20, 40, 10); // hat
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
            this.luggages = [];
            this.walls = [];
            this.collected = 0;
            this.nextCartMoveTime = 0;
        }

        create() {
            this.cameras.main.setBackgroundColor('#140809');

            const levels = [
                // Level 1
                [
                    "WWWWWWWWWWWWWWWW",
                    "W..............W",
                    "W..............W",
                    "W..............W",
                    "W..............W",
                    "W..............W",
                    "W..............W",
                    "W.P..W...L...E.W",
                    "WWWWWWWWWWWWWWWW"
                ],
                // Level 2
                [
                    "WWWWWWWWWWWWWWWW",
                    "W.............EW",
                    "W............WWW",
                    "W..........W.WWW",
                    "W........LWW.WWW",
                    "W.....L.WWWW.WWW",
                    "W...W.W.WWWW.WWW",
                    "WP.WW>W<WWWW>WWW",
                    "WWWWWWWWWWWWWWWW"
                ],
                // Level 3
                [
                    "WWWWWWWWWWWWWWWW",
                    "W.L...........EW",
                    "W.W.......L.WWWW",
                    "W.W.W.W...W....W",
                    "W.......W......W",
                    "W.....WWW......W",
                    "W...W..........W",
                    "WPW....<W>.....W",
                    "WWWWWWWWWWWWWWWW"
                ]
            ];

            if (this.levelIndex >= levels.length) {
                // Game Beat!
                this.add.text(1920 / 2, 1080 / 2 - 60, 'YOU WIN!', { font: '100px Arial', fill: '#00f3ff' }).setOrigin(0.5);
                this.add.text(1920 / 2, 1080 / 2 + 60, 'Press any key to play again', { font: '40px Arial', fill: '#ffffff' }).setOrigin(0.5);
                this.input.keyboard.once('keydown', () => {
                    this.scene.start('PlayScene', { level: 0 });
                });
                return;
            }

            this.map = levels[this.levelIndex];
            this.totalLuggage = 0;

            this.wallGroup = this.add.group();
            this.luggageGroup = this.add.group();

            for (let y = 0; y < GRID_H; y++) {
                for (let x = 0; x < GRID_W; x++) {
                    let char = this.map[y][x];
                    let px = x * TILE_SIZE + TILE_SIZE / 2;
                    let py = y * TILE_SIZE + TILE_SIZE / 2;

                    if (char === 'W') {
                        this.add.image(px, py, 'wall');
                        this.walls.push({ x, y });
                    } else if (char === 'P') {
                        this.playerGridX = x;
                        this.playerGridY = y;
                        this.playerSprite = this.add.image(px, py, 'player');
                        this.playerSprite.setDepth(10);
                    } else if (char === 'E') {
                        this.elevatorGridX = x;
                        this.elevatorGridY = y;
                        this.elevatorSprite = this.add.image(px, py, 'door_closed');
                    } else if (char === 'L') {
                        let lug = this.add.image(px, py, 'luggage');
                        this.luggages.push({ x, y, sprite: lug });
                        this.totalLuggage++;
                    } else if (char === '<' || char === '>') {
                        let dir = char === '<' ? -1 : 1;
                        let tex = dir === -1 ? 'cart_left' : 'cart_right';
                        let c = this.add.image(px, py, tex);
                        c.setDepth(5);
                        this.carts.push({ gridX: x, gridY: y, prevX: x, prevY: y, dir: dir, sprite: c });
                    }
                }
            }

            // A level with no luggage to collect starts already "cleared"
            if (this.totalLuggage === 0) {
                this.elevatorSprite.setTexture('door_open');
            }

            // Decorate with some text
            this.add.text(20, 20, `FLOOR ${this.levelIndex + 1}`, { font: '40px Arial', fill: '#ffffff' });

            this.input.keyboard.on('keydown', (e) => {
                // Map Enter/Space to interaction/start if needed
                if (this.isDead || this.levelComplete) return;

                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                    e.preventDefault(); // don't let arrow keys scroll the page
                    if (this.inputBuffer.length < 3) {
                        this.inputBuffer.push(e.key === 'ArrowLeft' ? 'LEFT' : e.key === 'ArrowRight' ? 'RIGHT' : 'UP');
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

        isSolid(x, y) {
            if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return true;
            for (let w of this.walls) {
                if (w.x === x && w.y === y) return true;
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
                    this.checkCollectibles();
                    this.checkElevator();
                    this.checkCollisions(); // ensure we check after landing
                }
            });
        }

        checkCollectibles() {
            for (let i = this.luggages.length - 1; i >= 0; i--) {
                let l = this.luggages[i];
                if (l.x === this.playerGridX && l.y === this.playerGridY) {
                    l.sprite.destroy();
                    this.luggages.splice(i, 1);
                    this.collected++;
                    
                    // Flash effect
                    this.cameras.main.flash(200, 255, 215, 0);

                    if (this.collected >= this.totalLuggage) {
                        this.elevatorSprite.setTexture('door_open');
                    }
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

        die() {
            if (this.isDead || this.levelComplete) return;
            this.isDead = true;
            this.cameras.main.shake(300, 0.02);
            this.playerSprite.setTint(0xff0000);
            
            this.time.delayedCall(800, () => {
                this.scene.start('PlayScene', { level: this.levelIndex });
            });
        }

        checkCollisions() {
            for (let c of this.carts) {
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
            for (let c of this.carts) {
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
                        } else if (action === 'UP') {
                            this.inputBuffer.shift(); // UP does nothing in air, consume it
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

            if (time > this.nextCartMoveTime) {
                this.nextCartMoveTime = time + 600;
                this.moveCarts();
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
