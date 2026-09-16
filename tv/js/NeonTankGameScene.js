/**
 * NeonTankGameScene
 * 2-8 Player Retro Neon Tank Battle for Smart TV Party Room
 * Controlled via mobile landscape DPAD_ACTION gamepad.
 * Inherits from BaseGameScene.
 */

class NeonTankGameScene extends BaseGameScene {
    constructor() {
        super('NeonTankGameScene');

        this.gameState = 'INTRO'; // 'INTRO' | 'COUNTDOWN' | 'BATTLE' | 'ROUND_OVER' | 'MATCH_OVER'
        this.currentRound = 1;
        this.totalRounds = 3;

        this.tanks = [];
        this.tanksMap = new Map();
        this.bullets = [];
        this.powerups = [];
        this.particles = [];

        this.arenaBounds = {
            left: 140,
            right: 1780,
            top: 140,
            bottom: 940,
            width: 1640,
            height: 800
        };

        // Static obstacles in the arena
        this.barriers = [
            // Center cross pillars
            { x: 740, y: 380, w: 80, h: 140 },
            { x: 1100, y: 380, w: 80, h: 140 },
            { x: 740, y: 620, w: 80, h: 140 },
            { x: 1100, y: 620, w: 80, h: 140 },
            // Middle protective blocks
            { x: 880, y: 520, w: 160, h: 60 },
            // Left & right cover blocks
            { x: 420, y: 480, w: 70, h: 180 },
            { x: 1430, y: 480, w: 70, h: 180 }
        ];

        // 8 Perimeter spawn locations with inward angles
        this.spawnPoints = [
            { x: 260, y: 260, angle: 45 },
            { x: 1660, y: 260, angle: 135 },
            { x: 1660, y: 820, angle: 225 },
            { x: 260, y: 820, angle: 315 },
            { x: 960, y: 230, angle: 90 },
            { x: 960, y: 850, angle: 270 },
            { x: 230, y: 540, angle: 0 },
            { x: 1690, y: 540, angle: 180 }
        ];

        this.powerupTimer = null;
        this.roundTimer = 0;
    }

    create() {
        this.cameras.main.setBackgroundColor('#090B12');

        // Graphics layers
        this.bgGraphics = this.add.graphics();
        this.treadMarksGraphics = this.add.graphics();
        this.arenaGraphics = this.add.graphics();
        this.bulletGraphics = this.add.graphics();

        this.drawBackground();
        this.drawArena();

        // UI Containers
        this.createHeaderUI();
        this.createCenterStageUI();
        this.createLeaderboardUI();
        this.createControlsHintUI();

        // Initialize tanks from connected players
        this.initTanks();

        // Remote / Keyboard input
        this.input.keyboard.on('keydown-ENTER', () => this.handleRemoteSelect());
        this.input.keyboard.on('keydown-SPACE', () => this.handleRemoteSelect());
        this.input.keyboard.on('keydown-ESC', () => this.returnToLobby());

        // Start first round
        this.time.delayedCall(1000, () => this.startNewRound());
    }

    drawBackground() {
        this.bgGraphics.clear();
        // Subtle cyber grid
        this.bgGraphics.fillGradientStyle(0x111627, 0x111627, 0x070910, 0x070910, 1);
        this.bgGraphics.fillRect(0, 0, 1920, 1080);

        this.bgGraphics.lineStyle(1, 0x1A2238, 0.35);
        for (let x = 0; x < 1920; x += 80) {
            this.bgGraphics.moveTo(x, 0);
            this.bgGraphics.lineTo(x, 1080);
        }
        for (let y = 0; y < 1080; y += 80) {
            this.bgGraphics.moveTo(0, y);
            this.bgGraphics.lineTo(1920, y);
        }
        this.bgGraphics.strokePath();
    }

    drawArena() {
        this.arenaGraphics.clear();

        const { left, top, width, height } = this.arenaBounds;

        // Arena outer border glow
        this.arenaGraphics.lineStyle(4, 0x00D2D3, 0.85);
        this.arenaGraphics.strokeRoundedRect(left, top, width, height, 16);

        // Arena inner bounding fill
        this.arenaGraphics.fillStyle(0x0C101C, 0.6);
        this.arenaGraphics.fillRoundedRect(left, top, width, height, 16);

        // Corner aesthetic accents
        const cornerLen = 40;
        this.arenaGraphics.lineStyle(6, 0x2ED573, 1);
        // Top-left
        this.arenaGraphics.moveTo(left, top + cornerLen);
        this.arenaGraphics.lineTo(left, top);
        this.arenaGraphics.lineTo(left + cornerLen, top);
        // Top-right
        this.arenaGraphics.moveTo(left + width - cornerLen, top);
        this.arenaGraphics.lineTo(left + width, top);
        this.arenaGraphics.lineTo(left + width, top + cornerLen);
        // Bottom-right
        this.arenaGraphics.moveTo(left + width, top + height - cornerLen);
        this.arenaGraphics.lineTo(left + width, top + height);
        this.arenaGraphics.lineTo(left + width - cornerLen, top + height);
        // Bottom-left
        this.arenaGraphics.moveTo(left + cornerLen, top + height);
        this.arenaGraphics.lineTo(left, top + height);
        this.arenaGraphics.lineTo(left, top + height - cornerLen);
        this.arenaGraphics.strokePath();

        // Draw barrier obstacles
        this.barriers.forEach(b => {
            this.arenaGraphics.fillStyle(0x192033, 0.95);
            this.arenaGraphics.fillRoundedRect(b.x, b.y, b.w, b.h, 10);
            this.arenaGraphics.lineStyle(2, 0x4A5878, 0.9);
            this.arenaGraphics.strokeRoundedRect(b.x, b.y, b.w, b.h, 10);

            // Barrier core glow line
            this.arenaGraphics.lineStyle(1, 0x00D2D3, 0.4);
            this.arenaGraphics.strokeRoundedRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8, 8);
        });
    }

    createHeaderUI() {
        this.headerContainer = this.add.container(960, 50);

        this.titleText = this.add.text(0, -10, '💥 NEON TANK ARENA 💥', {
            fontSize: '44px',
            fontFamily: 'system-ui, sans-serif',
            color: '#00D2D3',
            fontStyle: 'bold',
            letterSpacing: 3
        }).setOrigin(0.5);

        this.roundInfoText = this.add.text(0, 32, `ROUND ${this.currentRound} / ${this.totalRounds}`, {
            fontSize: '22px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE',
            letterSpacing: 2,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.headerContainer.add([this.titleText, this.roundInfoText]);
    }

    createCenterStageUI() {
        this.centerContainer = this.add.container(960, 540);

        this.countdownText = this.add.text(0, -20, 'GET READY', {
            fontSize: '68px',
            fontFamily: 'system-ui, sans-serif',
            color: '#FFA502',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.countdownSubText = this.add.text(0, 50, 'Drive with D-Pad, [A] to Fire', {
            fontSize: '24px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE'
        }).setOrigin(0.5);

        this.centerContainer.add([this.countdownText, this.countdownSubText]);

        // Round Winner Announcement Banner
        this.winnerBanner = this.add.container(960, 540).setVisible(false);
        const bannerBg = this.add.rectangle(0, 0, 840, 160, 0x131826, 0.95);
        bannerBg.setStrokeStyle(4, 0x2ED573);
        this.winnerText = this.add.text(0, -24, '', {
            fontSize: '44px',
            fontFamily: 'system-ui, sans-serif',
            color: '#2ED573',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.winnerSubText = this.add.text(0, 32, '', {
            fontSize: '24px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE'
        }).setOrigin(0.5);

        this.winnerBanner.add([bannerBg, this.winnerText, this.winnerSubText]);
    }

    createLeaderboardUI() {
        this.leaderboardContainer = this.add.container(960, 1000);
        this.refreshLeaderboard();
    }

    createControlsHintUI() {
        this.add.text(960, 1055, 'Phone: [D-PAD] Drive   |   [A] Fire Laser   |   [B] Nitro Boost   ||   TV: [ENTER] Skip   [ESC] Lobby', {
            fontSize: '18px',
            fontFamily: 'system-ui, sans-serif',
            color: '#5C667A'
        }).setOrigin(0.5);
    }

    initTanks() {
        this.tanks = [];
        this.tanksMap.clear();

        let playerList = (this.players && this.players.length > 0) ? this.players : [];

        // If only 1 player or solo testing, add 2 practice AI drone tanks!
        if (playerList.length === 1) {
            playerList = [
                playerList[0],
                { id: 'ai_drone_1', name: 'Cyber Drone 1', color: '#FF4757', score: 0, isAi: true },
                { id: 'ai_drone_2', name: 'Cyber Drone 2', color: '#FFA502', score: 0, isAi: true }
            ];
        } else if (playerList.length === 0) {
            // Demo practice mode if started directly
            playerList = [
                { id: 'demo_tank_1', name: 'Neon Alpha', color: '#00D2D3', score: 0, isAi: true },
                { id: 'demo_tank_2', name: 'Neon Beta', color: '#FF4757', score: 0, isAi: true }
            ];
        }

        playerList.forEach((player, idx) => {
            const spawn = this.spawnPoints[idx % this.spawnPoints.length];
            const hexColor = parseInt(player.color.replace('#', '0x'), 16);

            // Tank Container
            const container = this.add.container(spawn.x, spawn.y);

            // Tank visual graphics
            const tankGraphics = this.add.graphics();

            // Name text floating above
            const nameText = this.add.text(0, -42, player.name, {
                fontSize: '16px',
                fontFamily: 'system-ui, sans-serif',
                color: '#FFFFFF',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            // Health dots container floating above
            const hpContainer = this.add.container(0, -26);

            container.add([tankGraphics, nameText, hpContainer]);

            const tankObj = {
                id: player.id,
                name: player.name,
                color: player.color,
                hexColor,
                x: spawn.x,
                y: spawn.y,
                angle: spawn.angle,
                targetAngle: spawn.angle,
                spawnAngle: spawn.angle,
                spawnX: spawn.x,
                spawnY: spawn.y,
                vx: 0,
                vy: 0,
                speed: 240,
                hp: 3,
                maxHp: 3,
                isAlive: true,
                isBoosting: false,
                boostTimer: 0,
                boostCooldown: 0,
                fireCooldown: 0,
                powerup: null,
                powerupTimer: 0,
                activeDirections: new Set(),
                isAi: !!player.isAi,
                aiNextAction: 0,
                score: player.score || 0,
                container,
                tankGraphics,
                nameText,
                hpContainer
            };

            this.redrawTankVisual(tankObj);
            this.updateTankHp(tankObj);

            this.tanks.push(tankObj);
            this.tanksMap.set(player.id, tankObj);
        });

        this.refreshLeaderboard();
    }

    redrawTankVisual(tank) {
        const g = tank.tankGraphics;
        g.clear();

        // 1. Treads (Left & Right)
        g.fillStyle(0x161C2A, 1);
        g.fillRoundedRect(-24, -22, 48, 11, 4);
        g.fillRoundedRect(-24, 11, 48, 11, 4);

        g.lineStyle(1.5, 0x2A354E, 1);
        g.strokeRoundedRect(-24, -22, 48, 11, 4);
        g.strokeRoundedRect(-24, 11, 48, 11, 4);

        // 2. Chassis Hull
        g.fillStyle(0x101420, 1);
        g.fillRoundedRect(-18, -14, 36, 28, 6);

        // Armored Neon Plate
        g.fillStyle(tank.hexColor, 0.85);
        g.fillRoundedRect(-14, -10, 28, 20, 4);

        g.lineStyle(2, tank.isBoosting ? 0xFFFFFF : tank.hexColor, 1);
        g.strokeRoundedRect(-18, -14, 36, 28, 6);

        // 3. Turret Cannon & Hub
        // Cannon barrel extending forward (rightwards along angle 0)
        g.fillStyle(0x222B40, 1);
        g.fillRect(0, -4, 28, 8);
        g.lineStyle(2, tank.hexColor, 1);
        g.strokeRect(0, -4, 28, 8);

        // Barrel energy tip
        g.fillStyle(tank.hexColor, 1);
        g.fillRect(24, -3, 6, 6);

        // Center turret dome
        g.fillStyle(0x101420, 1);
        g.fillCircle(0, 0, 11);
        g.lineStyle(2, 0xFFFFFF, 0.9);
        g.strokeCircle(0, 0, 11);

        // Power-up indicator aura
        if (tank.powerup) {
            g.lineStyle(2, 0xFFA502, 0.8);
            g.strokeCircle(0, 0, 28);
        }
    }

    updateTankHp(tank) {
        tank.hpContainer.removeAll(true);
        const pipSpacing = 14;
        const startX = -((tank.maxHp - 1) * pipSpacing) / 2;

        for (let i = 0; i < tank.maxHp; i++) {
            const pipX = startX + (i * pipSpacing);
            const isFilled = i < tank.hp;
            const pip = this.add.circle(pipX, 0, 4, isFilled ? 0x2ED573 : 0x2B3448);
            pip.setStrokeStyle(1.5, isFilled ? 0xFFFFFF : 0x4A5878);
            tank.hpContainer.add(pip);
        }
    }

    startNewRound() {
        this.gameState = 'COUNTDOWN';
        this.bullets.forEach(b => { if (b.graphics) b.graphics.destroy(); });
        this.bullets = [];
        this.powerups.forEach(p => { if (p.container) p.container.destroy(); });
        this.powerups = [];
        this.winnerBanner.setVisible(false);
        this.centerContainer.setVisible(true);

        this.roundInfoText.setText(`ROUND ${this.currentRound} / ${this.totalRounds}`);

        // Reset and respawn all tanks
        this.tanks.forEach((tank, idx) => {
            const spawn = this.spawnPoints[idx % this.spawnPoints.length];
            tank.x = spawn.x;
            tank.y = spawn.y;
            tank.angle = spawn.angle;
            tank.targetAngle = spawn.angle;
            tank.vx = 0;
            tank.vy = 0;
            tank.hp = 3;
            tank.isAlive = true;
            tank.isBoosting = false;
            tank.boostCooldown = 0;
            tank.fireCooldown = 0;
            tank.powerup = null;
            tank.powerupTimer = 0;
            tank.activeDirections.clear();

            tank.container.setPosition(spawn.x, spawn.y);
            tank.container.setRotation(Phaser.Math.DegToRad(spawn.angle));
            tank.container.setVisible(true);
            tank.nameText.setRotation(-Phaser.Math.DegToRad(spawn.angle));
            tank.hpContainer.setRotation(-Phaser.Math.DegToRad(spawn.angle));

            this.redrawTankVisual(tank);
            this.updateTankHp(tank);
        });

        this.refreshLeaderboard();

        // 3-2-1 Countdown
        let count = 3;
        this.countdownText.setText(count);
        this.countdownText.setColor('#FFA502');
        this.countdownSubText.setText('Prepare for tank battle!');
        if (this.soundFx) this.soundFx.countdownPip(false);

        const timerEvent = this.time.addEvent({
            delay: 1000,
            repeat: 2,
            callback: () => {
                count--;
                if (count > 0) {
                    this.countdownText.setText(count);
                    if (this.soundFx) this.soundFx.countdownPip(false);
                } else {
                    this.startBattle();
                }
            }
        });
    }

    startBattle() {
        this.gameState = 'BATTLE';
        this.countdownText.setText('FIGHT!');
        this.countdownText.setColor('#2ED573');
        this.countdownSubText.setText('Blast opponent tanks!');
        if (this.soundFx) this.soundFx.countdownPip(true);

        this.time.delayedCall(800, () => {
            if (this.gameState === 'BATTLE') {
                this.centerContainer.setVisible(false);
            }
        });

        // Spawn periodic power-ups
        this.powerupTimer = this.time.addEvent({
            delay: 12000,
            loop: true,
            callback: () => {
                if (this.gameState === 'BATTLE') this.spawnPowerup();
            }
        });
    }

    spawnPowerup() {
        if (this.powerups.length >= 2) return;

        const types = [
            { type: 'TRIPLE', color: 0xFF4757, label: '★ TRI-SHOT ★' },
            { type: 'RAPID', color: 0xFFA502, label: '⚡ RAPID ⚡' },
            { type: 'SHIELD', color: 0x2ED573, label: '🛡️ SHIELD +1' }
        ];
        const selected = Phaser.Utils.Array.GetRandom(types);

        // Random location in central arena
        const px = Phaser.Math.Between(550, 1370);
        const py = Phaser.Math.Between(260, 820);

        const container = this.add.container(px, py);
        const bg = this.add.circle(0, 0, 22, selected.color, 0.25);
        bg.setStrokeStyle(2.5, selected.color, 1);
        const icon = this.add.text(0, 0, selected.type === 'RAPID' ? '⚡' : (selected.type === 'SHIELD' ? '🛡️' : '★'), {
            fontSize: '20px'
        }).setOrigin(0.5);

        container.add([bg, icon]);

        // Pulse tween
        this.tweens.add({
            targets: bg,
            scaleX: 1.25,
            scaleY: 1.25,
            duration: 600,
            yoyo: true,
            repeat: -1
        });

        this.powerups.push({
            x: px,
            y: py,
            type: selected.type,
            container
        });
    }

    onPlayerInput(playerId, inputData) {
        if (this.gameState !== 'BATTLE') return;
        const tank = this.tanksMap.get(playerId);
        if (!tank || !tank.isAlive) return;

        const action = inputData.action;
        const inputType = inputData.inputType;

        if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(action)) {
            if (inputType === 'button_down') {
                tank.activeDirections.add(action);
            } else if (inputType === 'button_up') {
                tank.activeDirections.delete(action);
            }
        } else if (action === 'A' && inputType === 'button_down') {
            this.fireBullet(tank);
        } else if (action === 'B' && inputType === 'button_down') {
            this.triggerBoost(tank);
        }
    }

    fireBullet(tank) {
        if (tank.fireCooldown > 0) return;

        const maxBullets = 3;
        const activeCount = this.bullets.filter(b => b.ownerId === tank.id).length;
        if (activeCount >= maxBullets && tank.powerup !== 'RAPID') return;

        const angleRad = Phaser.Math.DegToRad(tank.angle);
        const speed = 640;

        const spawnAtAngle = (ang) => {
            const rad = Phaser.Math.DegToRad(ang);
            const bx = tank.x + Math.cos(rad) * 32;
            const by = tank.y + Math.sin(rad) * 32;
            const vx = Math.cos(rad) * speed;
            const vy = Math.sin(rad) * speed;

            const bGfx = this.add.graphics();
            this.bullets.push({
                x: bx,
                y: by,
                vx,
                vy,
                ownerId: tank.id,
                color: tank.hexColor,
                bouncesLeft: 2,
                age: 0,
                graphics: bGfx
            });
        };

        if (tank.powerup === 'TRIPLE') {
            spawnAtAngle(tank.angle - 16);
            spawnAtAngle(tank.angle);
            spawnAtAngle(tank.angle + 16);
        } else {
            spawnAtAngle(tank.angle);
        }

        if (this.soundFx) this.soundFx.laserShot();
        this.cameras.main.shake(80, 0.002);

        tank.fireCooldown = tank.powerup === 'RAPID' ? 180 : 360;
    }

    triggerBoost(tank) {
        if (tank.boostCooldown > 0 || tank.isBoosting) return;

        tank.isBoosting = true;
        tank.boostTimer = 1.2;
        tank.boostCooldown = 4.0;

        if (this.soundFx) this.soundFx.boostSound();

        this.redrawTankVisual(tank);
    }

    update(time, delta) {
        const dt = delta / 1000;

        if (this.gameState === 'BATTLE') {
            this.updateTanks(dt);
            this.updateBullets(dt);
            this.updatePowerups();
            this.checkRoundStatus();
        }
    }

    updateTanks(dt) {
        this.tanks.forEach(tank => {
            if (!tank.isAlive) return;

            // Cooldowns
            if (tank.fireCooldown > 0) tank.fireCooldown -= (dt * 1000);
            if (tank.boostCooldown > 0) tank.boostCooldown -= dt;

            if (tank.isBoosting) {
                tank.boostTimer -= dt;
                if (tank.boostTimer <= 0) {
                    tank.isBoosting = false;
                    this.redrawTankVisual(tank);
                }
            }

            if (tank.powerup) {
                tank.powerupTimer -= dt;
                if (tank.powerupTimer <= 0) {
                    tank.powerup = null;
                    this.redrawTankVisual(tank);
                }
            }

            // AI Drone automated behavior
            if (tank.isAi) {
                this.updateAiDrone(tank, dt);
            }

            // Direction calculation
            let dx = 0, dy = 0;
            if (tank.activeDirections.has('UP')) dy -= 1;
            if (tank.activeDirections.has('DOWN')) dy += 1;
            if (tank.activeDirections.has('LEFT')) dx -= 1;
            if (tank.activeDirections.has('RIGHT')) dx += 1;

            if (dx !== 0 || dy !== 0) {
                const len = Math.hypot(dx, dy);
                dx /= len;
                dy /= len;

                // Turn towards direction
                const targetAngle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
                tank.angle = Phaser.Math.Angle.RotateTo(
                    Phaser.Math.DegToRad(tank.angle),
                    Phaser.Math.DegToRad(targetAngle),
                    Phaser.Math.DegToRad(420 * dt)
                );
                tank.angle = Phaser.Math.RadToDeg(tank.angle);

                const currentSpeed = (tank.isBoosting ? 380 : 230) * dt;
                const nextX = tank.x + Math.cos(Phaser.Math.DegToRad(tank.angle)) * currentSpeed;
                const nextY = tank.y + Math.sin(Phaser.Math.DegToRad(tank.angle)) * currentSpeed;

                // Move with collision resolution
                this.tryMoveTank(tank, nextX, nextY);

                // Leave subtle track tread mark
                if (Math.random() < 0.25) {
                    this.treadMarksGraphics.fillStyle(0x070912, 0.45);
                    this.treadMarksGraphics.fillCircle(tank.x, tank.y, 3);
                }
            }

            // Sync visual container
            tank.container.setPosition(tank.x, tank.y);
            tank.container.setRotation(Phaser.Math.DegToRad(tank.angle));

            // Keep text and HP unrotated relative to screen
            tank.nameText.setRotation(-Phaser.Math.DegToRad(tank.angle));
            tank.hpContainer.setRotation(-Phaser.Math.DegToRad(tank.angle));
        });
    }

    tryMoveTank(tank, targetX, targetY) {
        const radius = 22;
        const b = this.arenaBounds;

        // Clamp to arena outer wall
        let clampedX = Phaser.Math.Clamp(targetX, b.left + radius + 10, b.right - radius - 10);
        let clampedY = Phaser.Math.Clamp(targetY, b.top + radius + 10, b.bottom - radius - 10);

        // Check barrier collision with X movement
        let collidesX = this.barriers.some(bar => {
            return clampedX + radius > bar.x && clampedX - radius < bar.x + bar.w &&
                   tank.y + radius > bar.y && tank.y - radius < bar.y + bar.h;
        });

        if (!collidesX) {
            tank.x = clampedX;
        }

        // Check barrier collision with Y movement
        let collidesY = this.barriers.some(bar => {
            return tank.x + radius > bar.x && tank.x - radius < bar.x + bar.w &&
                   clampedY + radius > bar.y && clampedY - radius < bar.y + bar.h;
        });

        if (!collidesY) {
            tank.y = clampedY;
        }
    }

    updateAiDrone(tank, dt) {
        tank.aiNextAction -= dt;
        if (tank.aiNextAction <= 0) {
            tank.aiNextAction = Phaser.Math.FloatBetween(0.8, 2.2);

            // Random movement choice
            tank.activeDirections.clear();
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
            const chosen = Phaser.Utils.Array.GetRandom(dirs);
            tank.activeDirections.add(chosen);

            // Chance to shoot
            if (Math.random() < 0.6) {
                this.fireBullet(tank);
            }
        }
    }

    updateBullets(dt) {
        this.bulletGraphics.clear();
        const toRemove = [];

        this.bullets.forEach((bullet, idx) => {
            bullet.age += dt;
            bullet.x += bullet.vx * dt;
            bullet.y += bullet.vy * dt;

            // Render bullet with neon trail glow
            this.bulletGraphics.fillStyle(bullet.color, 1);
            this.bulletGraphics.fillCircle(bullet.x, bullet.y, 5);
            this.bulletGraphics.lineStyle(1.5, 0xFFFFFF, 0.9);
            this.bulletGraphics.strokeCircle(bullet.x, bullet.y, 5);

            const b = this.arenaBounds;
            let hasBounced = false;

            // Outer arena boundary bounce
            if (bullet.x <= b.left + 8 || bullet.x >= b.right - 8) {
                bullet.vx = -bullet.vx;
                bullet.x = Phaser.Math.Clamp(bullet.x, b.left + 9, b.right - 9);
                hasBounced = true;
            }
            if (bullet.y <= b.top + 8 || bullet.y >= b.bottom - 8) {
                bullet.vy = -bullet.vy;
                bullet.y = Phaser.Math.Clamp(bullet.y, b.top + 9, b.bottom - 9);
                hasBounced = true;
            }

            // Obstacle barrier bounce
            this.barriers.forEach(bar => {
                if (bullet.x >= bar.x && bullet.x <= bar.x + bar.w &&
                    bullet.y >= bar.y && bullet.y <= bar.y + bar.h) {

                    const distLeft = Math.abs(bullet.x - bar.x);
                    const distRight = Math.abs(bullet.x - (bar.x + bar.w));
                    const distTop = Math.abs(bullet.y - bar.y);
                    const distBottom = Math.abs(bullet.y - (bar.y + bar.h));

                    const minH = Math.min(distLeft, distRight);
                    const minV = Math.min(distTop, distBottom);

                    if (minH < minV) {
                        bullet.vx = -bullet.vx;
                    } else {
                        bullet.vy = -bullet.vy;
                    }
                    hasBounced = true;
                }
            });

            if (hasBounced) {
                bullet.bouncesLeft--;
                if (this.soundFx) this.soundFx.ricochet();
                if (bullet.bouncesLeft < 0) {
                    toRemove.push(idx);
                    return;
                }
            }

            if (bullet.age > 4.5) {
                toRemove.push(idx);
                return;
            }

            // Check hit against tanks
            this.tanks.forEach(tank => {
                if (!tank.isAlive) return;
                // Grace period: ignore firing tank for 0.12s
                if (tank.id === bullet.ownerId && bullet.age < 0.12) return;

                const dist = Math.hypot(tank.x - bullet.x, tank.y - bullet.y);
                if (dist < 26) {
                    toRemove.push(idx);
                    this.hitTank(tank, bullet.ownerId);
                }
            });
        });

        // Clean up expired bullets in reverse order
        for (let i = toRemove.length - 1; i >= 0; i--) {
            const b = this.bullets[toRemove[i]];
            if (b && b.graphics) b.graphics.destroy();
            this.bullets.splice(toRemove[i], 1);
        }
    }

    hitTank(tank, attackerId) {
        tank.hp--;
        this.updateTankHp(tank);

        if (this.soundFx) this.soundFx.tankHit();
        this.cameras.main.shake(120, 0.005);

        // Flash tank red
        this.tweens.add({
            targets: tank.container,
            alpha: 0.3,
            duration: 80,
            yoyo: true,
            repeat: 2
        });

        // Award damage score
        if (attackerId && attackerId !== tank.id) {
            this.awardScore(attackerId, 25);
            this.refreshLeaderboard();
        }

        if (tank.hp <= 0) {
            this.destroyTank(tank, attackerId);
        }
    }

    destroyTank(tank, attackerId) {
        tank.isAlive = false;
        tank.container.setVisible(false);

        if (this.soundFx) this.soundFx.tankExplosion();
        this.cameras.main.shake(250, 0.01);

        // Spawn explosion particles
        for (let i = 0; i < 16; i++) {
            const p = this.add.circle(tank.x, tank.y, Phaser.Math.Between(4, 9), tank.hexColor);
            const pAng = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const pDist = Phaser.Math.Between(40, 120);

            this.tweens.add({
                targets: p,
                x: tank.x + Math.cos(pAng) * pDist,
                y: tank.y + Math.sin(pAng) * pDist,
                alpha: 0,
                scale: 0.2,
                duration: Phaser.Math.Between(400, 700),
                onComplete: () => p.destroy()
            });
        }

        if (attackerId && attackerId !== tank.id) {
            this.awardScore(attackerId, 50); // Bonus kill score
        }

        this.refreshLeaderboard();
    }

    updatePowerups() {
        this.powerups = this.powerups.filter(p => {
            let collected = false;
            this.tanks.forEach(tank => {
                if (!tank.isAlive || collected) return;
                const dist = Math.hypot(tank.x - p.x, tank.y - p.y);
                if (dist < 36) {
                    collected = true;
                    if (p.type === 'SHIELD') {
                        tank.hp = Math.min(tank.maxHp, tank.hp + 1);
                        this.updateTankHp(tank);
                    } else {
                        tank.powerup = p.type;
                        tank.powerupTimer = 10;
                        this.redrawTankVisual(tank);
                    }
                    if (this.soundFx) this.soundFx.readyBeep();
                    p.container.destroy();
                }
            });
            return !collected;
        });
    }

    checkRoundStatus() {
        const aliveTanks = this.tanks.filter(t => t.isAlive);

        if (aliveTanks.length <= 1) {
            this.gameState = 'ROUND_OVER';
            if (this.powerupTimer) this.powerupTimer.remove();

            const winner = aliveTanks[0] || null;
            if (winner) {
                this.awardScore(winner.id, 100);
                this.winnerText.setText(`🏆 ${winner.name} Won Round ${this.currentRound}!`);
                this.winnerText.setColor(winner.color || '#2ED573');
                this.winnerSubText.setText('+100 Victory Bonus');
            } else {
                this.winnerText.setText('⚡ DRAW! Mutual Destruction!');
                this.winnerText.setColor('#FFA502');
                this.winnerSubText.setText('No survivors this round');
            }

            this.winnerBanner.setVisible(true);
            this.refreshLeaderboard();

            if (this.currentRound >= this.totalRounds) {
                this.time.delayedCall(3000, () => this.showMatchOver());
            } else {
                this.currentRound++;
                this.time.delayedCall(3500, () => this.startNewRound());
            }
        }
    }

    showMatchOver() {
        this.gameState = 'MATCH_OVER';
        const sorted = [...this.tanks].sort((a, b) => (b.score || 0) - (a.score || 0));
        const champion = sorted[0];

        this.endGame({ winner: champion, finalScores: sorted });

        this.centerContainer.setVisible(false);
        this.winnerBanner.setVisible(false);

        const victoryCard = this.add.container(960, 540);
        const cardBg = this.add.rectangle(0, 0, 880, 420, 0x131826, 0.96);
        cardBg.setStrokeStyle(4, 0xFFA502);

        const trophy = this.add.text(0, -130, '🏆', { fontSize: '80px' }).setOrigin(0.5);
        const title = this.add.text(0, -40, 'ARENA CHAMPION', {
            fontSize: '34px',
            fontFamily: 'system-ui, sans-serif',
            color: '#FFA502',
            fontStyle: 'bold',
            letterSpacing: 2
        }).setOrigin(0.5);

        const winnerName = this.add.text(0, 30, champion ? champion.name : 'Nobody', {
            fontSize: '60px',
            fontFamily: 'system-ui, sans-serif',
            color: champion ? champion.color : '#FFFFFF',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const scoreDetail = this.add.text(0, 100, `Final Score: ${champion ? champion.score : 0} points`, {
            fontSize: '28px',
            fontFamily: 'system-ui, sans-serif',
            color: '#2ED573',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const sub = this.add.text(0, 155, 'Returning to Lobby in 6 seconds...', {
            fontSize: '22px',
            fontFamily: 'system-ui, sans-serif',
            color: '#8F9CAE'
        }).setOrigin(0.5);

        victoryCard.add([cardBg, trophy, title, winnerName, scoreDetail, sub]);

        this.time.delayedCall(6500, () => this.returnToLobby());
    }

    refreshLeaderboard() {
        this.leaderboardContainer.removeAll(true);
        if (!this.tanks || this.tanks.length === 0) return;

        const count = this.tanks.length;
        const cardWidth = Math.min(220, 1500 / count);
        const totalWidth = count * cardWidth;
        const startX = -totalWidth / 2 + cardWidth / 2;

        this.tanks.forEach((tank, idx) => {
            const x = startX + (idx * cardWidth);
            const card = this.add.container(x, 0);

            const bg = this.add.rectangle(0, 0, cardWidth - 14, 76, 0x131826, 0.92);
            bg.setStrokeStyle(tank.isAlive ? 2 : 1, tank.isAlive ? tank.hexColor : 0x3A455E);

            const tag = this.add.rectangle(-cardWidth / 2 + 15, 0, 6, 76, tank.hexColor);

            const name = this.add.text(-cardWidth / 2 + 28, -16, tank.name, {
                fontSize: '18px',
                fontFamily: 'system-ui, sans-serif',
                color: tank.isAlive ? '#FFFFFF' : '#6A7890',
                fontStyle: 'bold'
            });

            const score = this.add.text(-cardWidth / 2 + 28, 10, `${tank.score || 0} pts`, {
                fontSize: '20px',
                fontFamily: 'system-ui, sans-serif',
                color: '#FFA502',
                fontStyle: 'bold'
            });

            const status = this.add.text(cardWidth / 2 - 20, 0, tank.isAlive ? '●' : '✖', {
                fontSize: '20px',
                fontFamily: 'system-ui, sans-serif',
                color: tank.isAlive ? '#2ED573' : '#FF4757',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            card.add([bg, tag, name, score, status]);
            this.leaderboardContainer.add(card);
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
    window.NeonTankGameScene = NeonTankGameScene;
}

if (typeof module !== 'undefined') {
    module.exports = NeonTankGameScene;
}
