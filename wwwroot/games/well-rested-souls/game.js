window.launchGame = function(containerId) {
    const COLORS = {
        skyTop: 0x0f0c29,
        skyMiddle: 0x302b63,
        skyBottom: 0x24243e,
        dock: 0x00f5d4,
        campfire: 0xf15bb5,
        cabin: 0xfee440,
        upgrade: 0x00bbf9,
        traveler: 0xffd166,
        text: 0xffffff
    };

    class MainScene extends Phaser.Scene {
        constructor() {
            super({ key: 'MainScene' });
            this.stardust = 0;
            this.nodes = [];
            this.selectedIndex = 0;
            this.previousBottomIndex = 0;
            this.lastInputTime = 0;
            this.isAmbient = false;
            this.followingTravelers = [];
            this.ambientTween = null;
            this.camTween = null;
            this.tents = [];
        }

        init() {
            this.stardust = 0;
            this.nodes = [];
            this.selectedIndex = 0;
            this.previousBottomIndex = 0;
            this.lastInputTime = 0;
            this.isAmbient = false;
            this.followingTravelers = [];
            this.ambientTween = null;
            this.camTween = null;
            this.tents = [];
            this.tier2Revealed = false;
            this.nextAITime = 0;
        }

        preload() {
            this.createCircleTexture('orb', 10, 0xffffff);
            this.createCircleTexture('glow', 32, 0xffffff, 0.5);
            this.createCircleTexture('star', 3, 0xffffff);
            this.createRectTexture('cloud', 150, 40, 0xffffff, 0.15);
            this.createDiamondTexture('baseNode', 80, 0xffffff);
            this.createPentagonTexture('tier2Node', 110, 0xffffff);
            this.createTriangleTexture('tent', 30, 0xffffff);
            this.createVignetteTexture('vignette');
            this.createTravelerTexture('traveler_orb');
        }

        createCircleTexture(key, radius, color, alpha=1) {
            const graphics = this.make.graphics({ x: 0, y: 0, add: false });
            graphics.fillStyle(color, alpha);
            graphics.fillCircle(radius, radius, radius);
            graphics.generateTexture(key, radius*2, radius*2);
            graphics.destroy();
        }

        createRectTexture(key, width, height, color, alpha=1) {
            const graphics = this.make.graphics({ x: 0, y: 0, add: false });
            graphics.fillStyle(color, alpha);
            graphics.fillRoundedRect(0, 0, width, height, 15);
            graphics.generateTexture(key, width, height);
            graphics.destroy();
        }

        createDiamondTexture(key, size, color) {
            const graphics = this.make.graphics({ x: 0, y: 0, add: false });
            graphics.fillStyle(color, 1);
            graphics.beginPath();
            graphics.moveTo(size/2, 0);
            graphics.lineTo(size, size/2);
            graphics.lineTo(size/2, size);
            graphics.lineTo(0, size/2);
            graphics.closePath();
            graphics.fillPath();
            graphics.generateTexture(key, size, size);
            graphics.destroy();
        }

        createPentagonTexture(key, size, color) {
            const graphics = this.make.graphics({ x: 0, y: 0, add: false });
            graphics.fillStyle(color, 1);
            graphics.beginPath();
            
            const radius = size / 2;
            const centerX = size / 2;
            const centerY = size / 2;
            
            for (let i = 0; i < 5; i++) {
                const angle = (i * 2 * Math.PI / 5) - (Math.PI / 2);
                const px = centerX + radius * Math.cos(angle);
                const py = centerY + radius * Math.sin(angle);
                if (i === 0) {
                    graphics.moveTo(px, py);
                } else {
                    graphics.lineTo(px, py);
                }
            }
            
            graphics.closePath();
            graphics.fillPath();
            graphics.generateTexture(key, size, size);
            graphics.destroy();
        }

        createTriangleTexture(key, size, color) {
            const graphics = this.make.graphics({ x: 0, y: 0, add: false });
            graphics.fillStyle(color, 1);
            graphics.beginPath();
            graphics.moveTo(size/2, 0);
            graphics.lineTo(size, size);
            graphics.lineTo(0, size);
            graphics.closePath();
            graphics.fillPath();
            graphics.generateTexture(key, size, size);
            graphics.destroy();
        }

        createVignetteTexture(key) {
            const canvas = document.createElement('canvas');
            canvas.width = 1920;
            canvas.height = 1080;
            const ctx = canvas.getContext('2d');
            
            const gradient = ctx.createRadialGradient(
                1920 / 2, 1080 / 2, 500, // Inner circle (transparent center)
                1920 / 2, 1080 / 2, 1200 // Outer circle (dark edges)
            );
            
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,1)');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 1920, 1080);
            
            this.textures.addCanvas(key, canvas);
        }

        createTravelerTexture(key) {
            const size = 64;
            const center = size / 2;
            const graphics = this.make.graphics({ x: 0, y: 0, add: false });
            
            // Layered halo for smooth gradient effect (Golden Yellow)
            graphics.fillStyle(0xffd166, 0.15);
            graphics.fillCircle(center, center, 28);
            graphics.fillStyle(0xffd166, 0.3);
            graphics.fillCircle(center, center, 20);
            graphics.fillStyle(0xffd166, 0.5);
            graphics.fillCircle(center, center, 14);
            
            // Solid core (White)
            graphics.fillStyle(0xffffff, 1);
            graphics.fillCircle(center, center, 8);
            
            graphics.generateTexture(key, size, size);
            graphics.destroy();
        }

        create() {
            // Gradient Sky - Made HUGE to support zooming out without cutting off edges
            const bg = this.add.graphics();
            bg.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyBottom, COLORS.skyBottom, 1);
            bg.fillRect(-5000, -5000, 12000, 12000);
            bg.setScrollFactor(0);

            // Particles
            try {
                // Distant stars layer (moves very slowly)
                this.add.particles(0, 0, 'star', {
                    x: { min: -2000, max: 4000 },
                    y: { min: -2000, max: 3000 },
                    lifespan: { min: 2000, max: 5000 },
                    alpha: { start: 0, end: 0.6, ease: 'Sine.easeInOut', yoyo: true },
                    scale: { min: 0.2, max: 0.6 },
                    quantity: 15, 
                    frequency: 30, // Extremely dense
                    blendMode: 'ADD'
                }).setScrollFactor(0.05);

                // Near stars layer (moves slightly faster, creating parallax)
                this.add.particles(0, 0, 'star', {
                    x: { min: -2000, max: 4000 },
                    y: { min: -2000, max: 3000 },
                    lifespan: { min: 2000, max: 5000 },
                    alpha: { start: 0, end: 0.9, ease: 'Sine.easeInOut', yoyo: true },
                    scale: { min: 0.5, max: 1.2 },
                    quantity: 10, 
                    frequency: 40,
                    blendMode: 'ADD'
                }).setScrollFactor(0.1);

                this.add.particles(0, 0, 'cloud', {
                    x: { min: -3000, max: 5000 },
                    y: { min: -1000, max: 2000 },
                    lifespan: 30000,
                    speedX: { min: 5, max: 15 },
                    alpha: { start: 0, end: 0.4, ease: 'Sine.easeInOut', yoyo: true }, // Lowered peak opacity slightly
                    scale: { min: 1, max: 4 },
                    quantity: 2, 
                    frequency: 1500 // Slower spawn rate
                }).setScrollFactor(0.2);
            } catch (e) {
                // Fallback for pre-3.60
                const stars1 = this.add.particles('star');
                stars1.createEmitter({
                    x: { min: -2000, max: 4000 },
                    y: { min: -2000, max: 3000 },
                    lifespan: { min: 2000, max: 5000 },
                    alpha: (p, k, t) => 0.6 * Math.sin(Math.PI * t),
                    scale: { min: 0.2, max: 0.6 },
                    quantity: 15,
                    frequency: 30,
                    blendMode: 'ADD'
                });
                stars1.setScrollFactor(0.05);
                
                const stars2 = this.add.particles('star');
                stars2.createEmitter({
                    x: { min: -2000, max: 4000 },
                    y: { min: -2000, max: 3000 },
                    lifespan: { min: 2000, max: 5000 },
                    alpha: (p, k, t) => 0.9 * Math.sin(Math.PI * t),
                    scale: { min: 0.5, max: 1.2 },
                    quantity: 10,
                    frequency: 40,
                    blendMode: 'ADD'
                });
                stars2.setScrollFactor(0.1);
                
                const clouds = this.add.particles('cloud');
                clouds.createEmitter({
                    x: { min: -3000, max: 5000 },
                    y: { min: -1000, max: 2000 },
                    lifespan: 30000,
                    speedX: { min: 5, max: 15 },
                    alpha: (p, k, t) => 0.4 * Math.sin(Math.PI * t), // Lowered peak opacity slightly
                    scale: { min: 1, max: 4 },
                    quantity: 2,
                    frequency: 1500 // Slower spawn rate
                });
                clouds.setScrollFactor(0.2);
            }

            const BRANCH_COLORS = {
                fire: 0xff3333,       // Red (Campfire/Bonfire)
                wood: 0xc47e47,       // Brown (Cabin/Lodge)
                nature: 0x32cd32,     // Green (Hammock/Treehouse)
                space: 0x9b5de5,      // Purple (Observatory/Planetarium)
                water: 0x00d4ff,      // Cyan/Blue (Hot Springs/Spa)
                tea: 0xa7c957,        // Matcha Green (Tea Garden/Cafe)
                books: 0xffb703,      // Gold/Bronze (Library/Archives)
                music: 0xff006e       // Pink/Magenta (Music Tent/Concert Hall)
            };

            const normalNodes = [
                { id: 'dock', type: 'dock', color: COLORS.dock, capacity: 5, current: [], unlocked: true, label: 'The Dock\n(Arrivals)' },
                { id: 'campfire', type: 'rest', color: BRANCH_COLORS.fire, capacity: 3, current: [], unlocked: true, label: 'Campfire\n(Rest)' },
                { id: 'cabin', type: 'rest', color: BRANCH_COLORS.wood, capacity: 4, current: [], unlocked: false, label: 'Cabin\n(Unlock: 50)', unlockCost: 50 },
                { id: 'hammock', type: 'rest', color: BRANCH_COLORS.nature, capacity: 3, current: [], unlocked: false, label: 'Hammocks\n(Unlock: 120)', unlockCost: 120 },
                { id: 'observatory', type: 'rest', color: BRANCH_COLORS.space, capacity: 2, current: [], unlocked: false, label: 'Observatory\n(Unlock: 250)', unlockCost: 250 },
                { id: 'hotspring', type: 'rest', color: BRANCH_COLORS.water, capacity: 5, current: [], unlocked: false, label: 'Hot Springs\n(Unlock: 400)', unlockCost: 400 },
                { id: 'teagarden', type: 'rest', color: BRANCH_COLORS.tea, capacity: 3, current: [], unlocked: false, label: 'Tea Garden\n(Unlock: 600)', unlockCost: 600 },
                { id: 'library', type: 'rest', color: BRANCH_COLORS.books, capacity: 2, current: [], unlocked: false, label: 'Library\n(Unlock: 900)', unlockCost: 900 },
                { id: 'musictent', type: 'rest', color: BRANCH_COLORS.music, capacity: 4, current: [], unlocked: false, label: 'Music Tent\n(Unlock: 1300)', unlockCost: 1300 },
                // Tier 2 (Revealed when parent is unlocked)
                { id: 'bonfire', parentId: 'campfire', type: 'rest', color: BRANCH_COLORS.fire, capacity: 5, current: [], unlocked: false, hidden: true, label: 'Bonfire\n(Unlock: 800)', unlockCost: 800 },
                { id: 'lodge', parentId: 'cabin', type: 'rest', color: BRANCH_COLORS.wood, capacity: 6, current: [], unlocked: false, hidden: true, label: 'Grand Lodge\n(Unlock: 1500)', unlockCost: 1500 },
                { id: 'treehouse', parentId: 'hammock', type: 'rest', color: BRANCH_COLORS.nature, capacity: 4, current: [], unlocked: false, hidden: true, label: 'Treehouse\n(Unlock: 2200)', unlockCost: 2200 },
                { id: 'planetarium', parentId: 'observatory', type: 'rest', color: BRANCH_COLORS.space, capacity: 3, current: [], unlocked: false, hidden: true, label: 'Planetarium\n(Unlock: 3500)', unlockCost: 3500 },
                { id: 'spa', parentId: 'hotspring', type: 'rest', color: BRANCH_COLORS.water, capacity: 8, current: [], unlocked: false, hidden: true, label: 'Luxury Spa\n(Unlock: 5000)', unlockCost: 5000 },
                { id: 'cafe', parentId: 'teagarden', type: 'rest', color: BRANCH_COLORS.tea, capacity: 5, current: [], unlocked: false, hidden: true, label: 'Sky Cafe\n(Unlock: 7500)', unlockCost: 7500 },
                { id: 'archives', parentId: 'library', type: 'rest', color: BRANCH_COLORS.books, capacity: 3, current: [], unlocked: false, hidden: true, label: 'Great Archives\n(Unlock: 10000)', unlockCost: 10000 },
                { id: 'concerthall', parentId: 'musictent', type: 'rest', color: BRANCH_COLORS.music, capacity: 6, current: [], unlocked: false, hidden: true, label: 'Concert Hall\n(Unlock: 15000)', unlockCost: 15000 }
            ];

            this.nodes = [];
            let tier1Count = 0;
            let tier2Count = 0;
            const totalOrbiters = 8;
            
            normalNodes.forEach((n, i) => {
                if (n.id === 'dock') {
                    n.x = 960;
                    n.y = 540;
                } else if (!n.parentId) {
                    const baseAngle = tier1Count * (Math.PI * 2) / totalOrbiters;
                    
                    const angleOffsets = [0, 0.15, -0.15, 0.2, -0.1, 0.15, -0.2, 0.1];
                    const radiusOffsets = [0, -100, 200, -50, 150, -150, 250, -50];
                    
                    const angleOffset = angleOffsets[tier1Count % angleOffsets.length];
                    const radiusOffset = radiusOffsets[tier1Count % radiusOffsets.length];
                    
                    n.angle = baseAngle + angleOffset;
                    n.radius = 750 + radiusOffset;
                    
                    n.x = 960 + n.radius * Math.cos(n.angle);
                    n.y = 540 + n.radius * Math.sin(n.angle);
                    
                    tier1Count++;
                } else {
                    // It's a Tier 2 branched node
                    const parent = this.nodes.find(p => p.id === n.parentId);
                    
                    // Add subtle offsets so the branch isn't a perfectly straight line
                    const t2AngleOffsets = [0.12, -0.09, 0.15, -0.13, 0.08, -0.14, 0.1, -0.08];
                    const t2RadiusOffsets = [350, 420, 320, 450, 380, 340, 400, 360];
                    
                    n.angle = parent.angle + t2AngleOffsets[tier2Count % t2AngleOffsets.length];
                    n.radius = parent.radius + t2RadiusOffsets[tier2Count % t2RadiusOffsets.length]; 
                    
                    n.x = 960 + n.radius * Math.cos(n.angle);
                    n.y = 540 + n.radius * Math.sin(n.angle);
                    
                    tier2Count++;
                }
                
                this.nodes.push(n);
            });

            this.worldContainer = this.add.container(0, 0).setAlpha(0);

            this.linesGraphics = this.add.graphics();
            this.worldContainer.add(this.linesGraphics);
            this.drawConstellationLines();

            // Draw dynamic island bases
            this.nodes.forEach(n => {
                n.islandBase = this.add.ellipse(n.x, n.y + 50, 250, 70, 0x111122, 0.8);
                this.worldContainer.add(n.islandBase);
                if (n.hidden) {
                    n.islandBase.setAlpha(0);
                }
            });

            this.nodes.forEach(node => {
                node.obj = this.add.container(node.x, node.y);
                this.worldContainer.add(node.obj);
                
                const textureKey = node.parentId ? 'tier2Node' : 'baseNode';
                
                node.baseImage = this.add.image(0, 0, textureKey).setTint(node.color);
                node.glow = this.add.image(0, 0, textureKey).setTint(node.color).setBlendMode('ADD').setScale(1.2).setAlpha(0.3);
                
                node.textObj = this.add.text(0, -110, node.label, { 
                    font: '24px Arial', 
                    fill: '#ffffff', 
                    align: 'center',
                    stroke: '#000000',
                    strokeThickness: 4
                }).setOrigin(0.5);
                
                node.obj.add([node.glow, node.baseImage, node.textObj]);
                
                if (node.hidden) {
                    node.obj.setAlpha(0);
                    node.textObj.setAlpha(0);
                } else if (!node.unlocked) {
                    node.obj.setAlpha(0.2);
                }

                // Node pulsing glow
                this.tweens.add({
                    targets: node.glow,
                    scaleX: 1.4,
                    scaleY: 1.4,
                    alpha: 0.1,
                    duration: 1500 + Math.random() * 500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            });

            // Highlight cursor
            this.cursor = this.add.graphics();
            this.worldContainer.add(this.cursor);
            this.cursor.setBlendMode('ADD');
            
            // Draw the initial correct cursor shape
            this.updateSelection(true);
            
            this.tweens.add({
                targets: this.cursor,
                scaleX: 1.15,
                scaleY: 1.15,
                alpha: 0.4,
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            // Add Vignette effect independent of UI container
            this.vignette = this.add.image(1920/2, 1080/2, 'vignette').setBlendMode('MULTIPLY').setScrollFactor(0).setAlpha(0.5);
            
            // UI
            this.uiContainer = this.add.container(1920/2, 1080/2).setScrollFactor(0).setAlpha(0);
            
            this.stardustText = this.add.text(0, 60 - 1080/2, 'Stardust: 0', { 
                font: '56px Arial', 
                fill: '#ffffff', 
                fontWeight: 'bold',
                stroke: '#9b5de5',
                strokeThickness: 6,
                shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 4, stroke: true, fill: true }
            }).setOrigin(0.5);
            
            this.heldText = this.add.text(0, 140 - 1080/2, '', {
                font: '36px Arial',
                fill: '#00f5d4',
                fontWeight: 'bold',
                shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 4, stroke: true, fill: true }
            }).setOrigin(0.5);

            this.statusText = this.add.text(0, 1000 - 1080/2, 'D-Pad: Orbit Constellation | Point Inward: Snap to Dock | Enter: Interact & Unlock', {
                font: '28px Arial',
                fill: '#ffffff',
                alpha: 0.6
            }).setOrigin(0.5);

            this.uiContainer.add([this.stardustText, this.heldText, this.statusText]);

            // Menu Container
            this.gameState = 'menu';
            this.menuContainer = this.add.container(1920/2, 1080/2).setScrollFactor(0);
            
            this.title = this.add.text(0, -150, 'Well-Rested Souls', {
                font: '120px Arial',
                fill: '#ffffff',
                fontWeight: 'bold',
                stroke: '#9b5de5',
                strokeThickness: 12,
                shadow: { offsetX: 0, offsetY: 12, color: '#000000', blur: 15, stroke: true, fill: true }
            }).setOrigin(0.5);

            this.menuContainer.add(this.title);

            this.updateMenuOptions([
                { text: 'Play', action: () => this.startGame() },
                { text: 'Reset Save', action: () => this.resetSave() }
            ]);
            
            this.exitText = this.add.text(0, 300, 'Press Back/ESC to exit app', {
                font: '24px Arial',
                fill: '#ffffff',
                alpha: 0.6
            }).setOrigin(0.5);
            this.menuContainer.add(this.exitText);

            // Set initial camera for Menu
            const startNode = this.nodes[0];
            this.cameras.main.setZoom(1.5);
            this.cameras.main.setScroll(startNode.x - 1920/2, startNode.y - 1080/2);
            
            // Initial menu camera wobble
            this.camTween = this.tweens.add({
                targets: this.cameras.main,
                scrollX: (startNode.x - 1920/2) + 80,
                scrollY: (startNode.y - 1080/2) - 30,
                duration: 12000,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1
            });

            // Controls
            this.input.keyboard.on('keydown', this.handleInput, this);
            this.lastInputTime = this.time.now;

            // Wait, cursor was created above, let's hide it
            this.cursor.setAlpha(0);
            this.updateSelection();

            // Loops
            this.time.addEvent({ delay: 1000, callback: this.generateStardust, callbackScope: this, loop: true });

            this.loadGame();
            this.spawnTraveler();
        }

        updateMenuOptions(options) {
            if (this.menuOptionTexts) {
                this.menuOptionTexts.forEach(t => t.destroy());
            }
            this.menuOptions = options;
            this.menuSelection = 0;
            this.menuOptionTexts = [];
            
            this.menuOptions.forEach((opt, i) => {
                const text = this.add.text(0, 30 + i * 90, opt.text, {
                    font: '54px Arial',
                    fill: i === 0 ? '#00f5d4' : '#ffffff',
                    fontWeight: 'bold',
                    stroke: '#000000',
                    strokeThickness: 6,
                    shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 8, stroke: true, fill: true }
                }).setOrigin(0.5);
                this.menuOptionTexts.push(text);
                this.menuContainer.add(text);
            });
            
            if (this.menuCursorText) this.menuCursorText.destroy();
            this.menuCursorText = this.add.text(0, 30, '>                                   <', {
                font: '54px Arial',
                fill: '#00f5d4',
                fontWeight: 'bold'
            }).setOrigin(0.5);
            this.menuContainer.add(this.menuCursorText);
            
            this.tweens.add({
                targets: this.menuCursorText,
                alpha: 0.2,
                scaleX: 1.1,
                duration: 800,
                yoyo: true,
                repeat: -1
            });
        }

        refreshMenuDisplay() {
            this.menuOptionTexts.forEach((text, i) => {
                text.setFill(i === this.menuSelection ? '#00f5d4' : '#ffffff');
            });
            this.menuCursorText.setY(30 + this.menuSelection * 90);
        }

        saveGame() {
            const saveState = {
                stardust: this.stardust,
                nodes: this.nodes.map(n => ({ id: n.id, unlocked: n.unlocked, capacity: n.capacity })),
                tier2Revealed: this.tier2Revealed
            };
            localStorage.setItem('wellRestedSoulsSave', JSON.stringify(saveState));
        }

        loadGame() {
            const saveStr = localStorage.getItem('wellRestedSoulsSave');
            if (saveStr) {
                try {
                    const saveState = JSON.parse(saveStr);
                    this.stardust = saveState.stardust || 0;
                    this.tier2Revealed = saveState.tier2Revealed || false;
                    
                    if (saveState.nodes) {
                        saveState.nodes.forEach(savedNode => {
                            const n = this.nodes.find(node => node.id === savedNode.id);
                            if (n) {
                                n.unlocked = savedNode.unlocked;
                                if (savedNode.capacity) n.capacity = savedNode.capacity;
                                
                                if (n.unlocked) {
                                    n.obj.setAlpha(1);
                                    if (n.textObj) n.textObj.setAlpha(1);
                                }
                            }
                        });
                    }
                    this.updateStardustText();
                    
                    // If tier2 was revealed, upgrade the dock visual and reveal tier2 nodes
                    if (this.tier2Revealed) {
                        const dock = this.nodes[0];
                        dock.baseImage.setTexture('tier2Node');
                        dock.glow.setTexture('tier2Node');
                        dock.obj.setScale(1.35);
                        dock.islandBase.setScale(1.35);
                        dock.textObj.setScale(1 / 1.35);
                        
                        this.nodes.forEach(n => {
                            if (n.parentId) { // is tier 2
                                n.hidden = false;
                                if (n.islandBase) n.islandBase.setAlpha(0.8);
                                if (!n.unlocked) {
                                    n.obj.setAlpha(0.2);
                                    if (n.textObj) n.textObj.setAlpha(1); // restored in load
                                }
                            }
                        });
                        this.drawConstellationLines();
                    }
                } catch (e) {
                    console.error('Error loading save:', e);
                }
            }
        }

        resetSave() {
            localStorage.removeItem('wellRestedSoulsSave');
            this.scene.restart();
        }

        handleInput(event) {
            this.lastInputTime = this.time.now;
            
            const code = event.keyCode;
            const KEYS = Phaser.Input.Keyboard.KeyCodes;
            
            if (this.gameState === 'menu' || this.gameState === 'pause') {
                if (code === KEYS.ESC || code === KEYS.BACKSPACE) {
                    if (this.gameState === 'pause') {
                        this.startGame(); // Resume
                    }
                    // For menu, we do nothing and let the native TV OS handle the back button
                    return;
                }
                
                if (code === KEYS.UP) {
                    this.menuSelection = Math.max(0, this.menuSelection - 1);
                    this.refreshMenuDisplay();
                } else if (code === KEYS.DOWN) {
                    this.menuSelection = Math.min(this.menuOptions.length - 1, this.menuSelection + 1);
                    this.refreshMenuDisplay();
                } else if (code === KEYS.ENTER || code === KEYS.SPACE) {
                    this.menuOptions[this.menuSelection].action();
                }
                return;
            }

            // Pause Game
            if (code === KEYS.ESC || code === KEYS.BACKSPACE) {
                if (this.isAmbient) {
                    this.exitAmbientMode();
                } else {
                    this.pauseGame();
                }
                return;
            }

            if (this.isAmbient) {
                this.exitAmbientMode();
                return;
            }
            
            if (code === KEYS.LEFT) {
                this.navigateSpatial({x: -1, y: 0});
            } else if (code === KEYS.RIGHT) {
                this.navigateSpatial({x: 1, y: 0});
            } else if (code === KEYS.UP) {
                this.navigateSpatial({x: 0, y: -1});
            } else if (code === KEYS.DOWN) {
                this.navigateSpatial({x: 0, y: 1});
            } else if (code === KEYS.ENTER || code === KEYS.SPACE) {
                this.interactNode();
            }
        }

        startGame() {
            if (this.gameState === 'playing') return;
            this.gameState = 'playing';
            
            this.tweens.killTweensOf(this.menuContainer);
            this.tweens.add({
                targets: this.menuContainer,
                alpha: 0,
                duration: 1000,
                ease: 'Power2'
            });

            this.tweens.killTweensOf([this.worldContainer, this.uiContainer]);
            this.tweens.add({
                targets: [this.worldContainer, this.uiContainer],
                alpha: 1,
                duration: 1500,
                ease: 'Power2'
            });

            if (this.camTween) this.camTween.stop();
            const node = this.nodes[this.selectedIndex];
            
            this.camTween = this.tweens.add({
                targets: this.cameras.main,
                scrollX: node.x - 1920/2,
                scrollY: node.y - 1080/2 - 30,
                zoom: 0.85,
                duration: 1500,
                ease: 'Power2'
            });
        }

        pauseGame() {
            if (this.gameState === 'menu' || this.gameState === 'pause') return;
            this.gameState = 'pause';
            
            if (this.exitText) this.exitText.setVisible(false);
            
            this.updateMenuOptions([
                { text: 'Resume', action: () => this.startGame() },
                { text: 'Save & Go to Title', action: () => { this.saveGame(); this.goToTitle(); } }
            ]);

            this.tweens.killTweensOf(this.menuContainer);
            this.tweens.add({
                targets: this.menuContainer,
                alpha: 1,
                duration: 1000,
                ease: 'Power2'
            });

            this.tweens.killTweensOf([this.worldContainer, this.uiContainer]);
            this.tweens.add({
                targets: [this.worldContainer, this.uiContainer],
                alpha: 0,
                duration: 1000,
                ease: 'Power2'
            });

            if (this.camTween) this.camTween.stop();
            const node = this.nodes[this.selectedIndex];

            this.camTween = this.tweens.add({
                targets: this.cameras.main,
                scrollX: node.x - 1920/2,
                scrollY: node.y - 1080/2, 
                zoom: 1.5,
                duration: 2000,
                ease: 'Power2',
                onComplete: () => {
                    if (this.gameState === 'menu') {
                        this.camTween = this.tweens.add({
                            targets: this.cameras.main,
                            scrollX: (node.x - 1920/2) + 80,
                            scrollY: (node.y - 1080/2) - 30,
                            duration: 12000,
                            ease: 'Sine.easeInOut',
                            yoyo: true,
                            repeat: -1
                        });
                    }
                }
            });
        }

        goToTitle() {
            this.gameState = 'menu';
            
            if (this.exitText) this.exitText.setVisible(true);
            
            this.updateMenuOptions([
                { text: 'Play', action: () => this.startGame() },
                { text: 'Reset Save', action: () => this.resetSave() }
            ]);
            
            if (this.camTween) this.camTween.stop();
            const startNode = this.nodes[0];
            
            this.tweens.add({
                targets: this.cameras.main,
                scrollX: startNode.x - 1920/2,
                scrollY: startNode.y - 1080/2,
                zoom: 1.5,
                duration: 2000,
                ease: 'Power2',
                onComplete: () => {
                    if (this.gameState === 'menu') {
                        this.camTween = this.tweens.add({
                            targets: this.cameras.main,
                            scrollX: (startNode.x - 1920/2) + 80,
                            scrollY: (startNode.y - 1080/2) - 30,
                            duration: 12000,
                            ease: 'Sine.easeInOut',
                            yoyo: true,
                            repeat: -1
                        });
                    }
                }
            });
        }

        updateSelection(skipCamera = false) {
            const node = this.nodes[this.selectedIndex];
            this.cursor.setPosition(node.x, node.y);
            
            // Dynamically redraw cursor to match shape and size of current node
            this.cursor.clear();
            this.cursor.lineStyle(6, 0xffffff, 1);
            this.cursor.beginPath();
            
            const isPentagon = node.parentId || (this.tier2Revealed && node.id === 'dock');
            const radius = (this.tier2Revealed && node.id === 'dock') ? 100 : (node.parentId ? 85 : 60);
            
            if (isPentagon) {
                for (let i = 0; i < 5; i++) {
                    const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                    const x = radius * Math.cos(angle);
                    const y = radius * Math.sin(angle);
                    if (i === 0) this.cursor.moveTo(x, y);
                    else this.cursor.lineTo(x, y);
                }
            } else {
                for (let i = 0; i < 4; i++) {
                    const angle = (i * 2 * Math.PI) / 4;
                    const x = radius * Math.cos(angle);
                    const y = radius * Math.sin(angle);
                    if (i === 0) this.cursor.moveTo(x, y);
                    else this.cursor.lineTo(x, y);
                }
            }
            this.cursor.closePath();
            this.cursor.strokePath();
            
            if (!skipCamera) {
                if (this.camTween) {
                    this.camTween.stop();
                }
                
                if (this.gameState !== 'menu') {
                    this.camTween = this.tweens.add({
                        targets: this.cameras.main,
                        scrollX: node.x - 1920/2,
                        scrollY: node.y - 1080/2 - 30,
                        zoom: 0.85,
                        duration: 600,
                        ease: 'Power2'
                    });
                }
            }
        }

        navigateSpatial(dir) {
            const current = this.nodes[this.selectedIndex];
            
            // Hub-and-Spoke Snapping:
            // If you are on an outer planet and press the D-Pad inwards towards the Dock, instantly snap to it.
            if (this.selectedIndex !== 0) {
                const dock = this.nodes[0];
                const dx = dock.x - current.x;
                const dy = dock.y - current.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                const nx = dx / dist;
                const ny = dy / dist;
                
                // If the directional press is within ~60 degrees of the dock's direction, snap!
                if (nx * dir.x + ny * dir.y > 0.5) {
                    if (current.parentId) {
                        const parentIndex = this.nodes.findIndex(p => p.id === current.parentId);
                        if (parentIndex !== -1) {
                            this.selectedIndex = parentIndex;
                        }
                    } else {
                        this.selectedIndex = 0;
                    }
                    this.updateSelection();
                    return;
                }
            }
            
            let bestNode = -1;
            let bestScore = Infinity;

            this.nodes.forEach((node, index) => {
                if (index === this.selectedIndex) return;
                if (node.hidden) return; // Ignore invisible Tier 2 nodes until they unlock!
                
                const dx = node.x - current.x;
                const dy = node.y - current.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist === 0) return;
                
                const nx = dx / dist;
                const ny = dy / dist;
                
                const dotProduct = nx * dir.x + ny * dir.y;
                
                // Allow movement if within a wide ~72 degree cone
                if (dotProduct > 0.3) {
                    const anglePenalty = 1 - dotProduct;
                    const score = dist * (1 + anglePenalty * 5); // heavily penalize off-angle nodes
                    
                    if (score < bestScore) {
                        bestScore = score;
                        bestNode = index;
                    }
                }
            });

            if (bestNode !== -1) {
                this.selectedIndex = bestNode;
                this.updateSelection();
            }
        }

        interactNode() {
            const node = this.nodes[this.selectedIndex];
            
            if (node.id === 'dock') {
                if (node.current.length > 0) {
                    node.current.forEach((t) => {
                        this.tweens.killTweensOf(t);
                        t.followTimer = this.time.now;
                        t.alpha = 1;
                        this.followingTravelers.push(t);
                    });
                    
                    node.current = [];
                    this.updateHeldText();
                }
            } else if (node.type === 'rest') {
                if (!node.unlocked) {
                    if (this.stardust >= node.unlockCost) {
                        this.stardust -= node.unlockCost;
                        node.unlocked = true;
                        
                        this.tweens.add({
                            targets: node.obj,
                            alpha: 1,
                            duration: 1000
                        });
                        
                        this.showFloatingText('Unlocked!', node.x, node.y - 50, node.color);
                        this.updateStardustText();
                        // Text will automatically update next frame via updateNodeLabels!
                        
                        this.saveGame();
                    } else {
                        this.showFloatingText(`Need ${node.unlockCost} Stardust`, node.x, node.y - 50, 0xff0000);
                    }
                } else {
                    while (this.followingTravelers.length > 0 && node.current.length < node.capacity) {
                        const t = this.followingTravelers.shift();
                        
                        t.scaleX = 1;
                        t.scaleY = 1;
                        t.alpha = 1;
                        
                        // Spread them organically across the shadow ellipse
                        const ox = Phaser.Math.Between(-80, 80);
                        const oy = Phaser.Math.Between(-15, 15);
                        
                        // Add checkout time (30 - 45s for Tier 1, 60 - 90s for Tier 2)
                        if (node.parentId) {
                            t.checkOutTime = this.time.now + Phaser.Math.Between(60000, 90000);
                        } else {
                            t.checkOutTime = this.time.now + Phaser.Math.Between(30000, 45000);
                        }
                        
                        this.tweens.killTweensOf(t);
                        
                        this.tweens.add({
                            targets: t,
                            y: node.y + 50 + oy,
                            x: node.x + ox,
                            duration: 800,
                            ease: 'Bounce.easeOut'
                        });
                        
                        this.tweens.add({
                            targets: t,
                            alpha: 0.4,
                            scale: 1.2,
                            duration: 1500,
                            yoyo: true,
                            repeat: -1,
                            ease: 'Sine.easeInOut'
                        });

                        node.current.push(t);
                    }
                    this.updateHeldText();
                }
            }
        }

        showFloatingText(msg, x, y, color) {
            const t = this.add.text(x, y, msg, {
                font: '32px Arial',
                fill: '#ffffff',
                fontWeight: 'bold',
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(0.5).setTint(color);
            
            this.worldContainer.add(t);

            this.tweens.add({
                targets: t,
                y: y - 100,
                alpha: 0,
                duration: 2000,
                ease: 'Power2',
                onComplete: () => t.destroy()
            });
        }

        drawConstellationLines() {
            this.linesGraphics.clear();
            this.linesGraphics.lineStyle(3, 0xffffff, 0.15);
            
            this.nodes.forEach((n, i) => {
                if (n.hidden || i === 0) return;
                
                this.linesGraphics.beginPath();
                if (n.parentId) {
                    const parent = this.nodes.find(p => p.id === n.parentId);
                    this.linesGraphics.moveTo(parent.x, parent.y + 50);
                } else {
                    this.linesGraphics.moveTo(this.nodes[0].x, this.nodes[0].y + 50);
                }
                this.linesGraphics.lineTo(n.x, n.y + 50);
                this.linesGraphics.strokePath();
            });
        }

        spawnTraveler() {
            if (this.gameState === 'menu' || this.gameState === 'pause') {
                this.time.delayedCall(1000, () => this.spawnTraveler());
                return;
            }
            
            const dock = this.nodes.find(n => n.id === 'dock');
            if (dock.current.length < dock.capacity) {
                // Spread organically across the island shadow
                const spreadX = this.tier2Revealed ? 130 : 80;
                const spreadY = this.tier2Revealed ? 25 : 15;
                const ox = Phaser.Math.Between(-spreadX, spreadX);
                const oy = Phaser.Math.Between(-spreadY, spreadY);
                
                const t = this.add.image(dock.x + ox, dock.y - 200, 'traveler_orb');
                this.worldContainer.add(t);
                t.arrivalTime = this.time.now;
                
                this.tweens.add({
                    targets: t,
                    y: dock.y + 50 + oy,
                    duration: 1500,
                    ease: 'Bounce.easeOut'
                });
                
                this.tweens.add({
                    targets: t,
                    alpha: 0.6,
                    scale: 1.1,
                    duration: 1000,
                    yoyo: true,
                    repeat: -1
                });
                
                dock.current.push(t);
            }
            
            // Loop spawning forever. Faster spawn rates if Tier 2 is revealed.
            const spawnDelay = this.tier2Revealed ? Phaser.Math.Between(2000, 4500) : Phaser.Math.Between(4000, 8000);
            this.time.delayedCall(spawnDelay, () => this.spawnTraveler());
        }

        createTent(t) {
            // Scatter tents organically around the entire constellation
            const angle = Math.random() * Math.PI * 2;
            
            // Expand the camping grounds if Tier 2 is unlocked
            const maxRadius = this.tier2Revealed ? 1300 : 850;
            
            // Avoid spawning directly on the Dock (150px safe zone)
            const radius = Phaser.Math.Between(200, maxRadius);
            
            const tx = 960 + radius * Math.cos(angle);
            const ty = 540 + radius * Math.sin(angle);
            
            this.tweens.add({
                targets: t,
                x: tx,
                y: ty,
                scaleX: 1,
                scaleY: 1,
                duration: 2000,
                ease: 'Sine.easeInOut',
                onComplete: () => {
                    t.setTexture('tent');
                    t.setTint(0xffaa00);
                    t.setScale(1);
                    // Shorter checkout time for overflow tents
                    t.checkOutTime = this.time.now + Phaser.Math.Between(20000, 30000);
                    this.tents.push(t);
                }
            });
        }

        generateStardust() {
            if (this.gameState === 'menu' || this.gameState === 'pause') return;
            
            let generated = 0;
            this.nodes.forEach(node => {
                if (node.type === 'rest' && node.unlocked) {
                    const multiplier = node.parentId ? 3 : 1;
                    generated += (node.current.length * multiplier);
                    
                    node.current.forEach(t => {
                        const visualChance = node.parentId ? 0.7 : 0.3; // Show lots more stars for tier 2!
                        if (Math.random() < visualChance) {
                            const p = this.add.image(t.x, t.y, 'star').setTint(node.color); // Color match!
                            this.worldContainer.add(p);
                            this.tweens.add({
                                targets: p,
                                y: p.y - 60,
                                alpha: 0,
                                duration: 1500,
                                ease: 'Power1',
                                onComplete: () => p.destroy()
                            });
                        }
                    });
                }
            });

            this.tents.forEach(t => {
                // Tents generate half the Stardust
                if (Math.random() > 0.5) {
                    generated += 1;
                    const p = this.add.image(t.x, t.y - 20, 'star').setTint(0xffaa00);
                    this.worldContainer.add(p);
                    this.tweens.add({
                        targets: p,
                        y: p.y - 60,
                        alpha: 0,
                        duration: 1500,
                        ease: 'Power1',
                        onComplete: () => p.destroy()
                    });
                }
            });
            
            if (generated > 0) {
                this.stardust += generated;
                this.updateStardustText();
            }
        }

        updateStardustText() {
            this.stardustText.setText(`Stardust: ${this.stardust}`);
        }

        updateHeldText() {
            if (this.followingTravelers.length > 0) {
                this.heldText.setText(`Following you: ${this.followingTravelers.length}`);
            } else {
                this.heldText.setText('');
            }
        }

        enterAmbientMode() {
            this.isAmbient = true;
            this.tweens.killTweensOf(this.cameras.main);
            this.tweens.killTweensOf([this.uiContainer, this.cursor, this.vignette]);
            this.nodes.forEach(node => {
                if (node.textObj) this.tweens.killTweensOf(node.textObj);
            });
            
            this.tweens.add({
                targets: [this.uiContainer, this.cursor],
                alpha: 0,
                duration: 2000,
                ease: 'Sine.easeInOut'
            });

            this.tweens.add({
                targets: this.vignette,
                alpha: 0.15,
                duration: 2000,
                ease: 'Sine.easeInOut'
            });
            
            this.nodes.forEach(node => {
                if (node.textObj) {
                    this.tweens.add({
                        targets: node.textObj,
                        alpha: 0,
                        duration: 2000
                    });
                }
            });

            if (this.camTween) {
                this.camTween.stop();
            }

            // Calculate bounding box
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            this.nodes.forEach(node => {
                if (node.hidden) return; // Don't calculate bounding box for invisible nodes
                if (node.x < minX) minX = node.x;
                if (node.x > maxX) maxX = node.x;
                if (node.y < minY) minY = node.y;
                if (node.y > maxY) maxY = node.y;
            });

            // Add padding so nodes aren't touching screen edges
            const paddingX = 400;
            const paddingY = 400;
            
            const bbWidth = (maxX - minX) + paddingX * 2;
            const bbHeight = (maxY - minY) + paddingY * 2;
            
            // Calculate required zoom to fit the bounding box
            const targetZoom = Math.min(1920 / bbWidth, 1080 / bbHeight, 1);
            
            // Calculate center of the structure
            const centerX = minX + (maxX - minX) / 2;
            const centerY = minY + (maxY - minY) / 2;
            
            const targetScrollX = centerX - 1920 / 2;
            const targetScrollY = centerY - 1080 / 2;

            this.ambientTween = this.tweens.add({
                targets: this.cameras.main,
                zoom: targetZoom,
                scrollX: targetScrollX,
                scrollY: targetScrollY,
                duration: 6000,
                ease: 'Sine.easeInOut',
                onComplete: () => {
                    // Once zoomed out, gently pan back and forth for life
                    this.ambientTween = this.tweens.add({
                        targets: this.cameras.main,
                        scrollX: targetScrollX + 150,
                        duration: 20000,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut'
                    });
                }
            });
        }

        exitAmbientMode() {
            this.isAmbient = false;
            
            this.tweens.killTweensOf(this.cameras.main);
            this.tweens.killTweensOf([this.uiContainer, this.cursor, this.vignette]);
            this.nodes.forEach(node => {
                if (node.textObj) this.tweens.killTweensOf(node.textObj);
            });
            
            this.tweens.add({
                targets: [this.uiContainer, this.cursor],
                alpha: 1,
                duration: 500,
                ease: 'Sine.easeInOut'
            });

            this.tweens.add({
                targets: this.vignette,
                alpha: 0.5,
                duration: 500,
                ease: 'Sine.easeInOut'
            });
            
            this.nodes.forEach(node => {
                if (node.textObj) {
                    this.tweens.add({
                        targets: node.textObj,
                        alpha: 1,
                        duration: 500
                    });
                }
            });

            if (this.ambientTween) {
                this.ambientTween.stop();
                this.updateSelection();
            }
        }
        updateNodeLabels() {
            this.nodes.forEach(node => {
                if (node.type === 'dock') {
                    node.textObj.setText(`The Dock\n[${node.current.length}/${node.capacity}]`);
                } else if (node.type === 'rest' && node.unlocked) {
                    let baseName = node.label.split('\n')[0];
                    node.textObj.setText(`${baseName}\n[${node.current.length}/${node.capacity}]`);
                }
            });
        }

        update(time, delta) {
            if (this.gameState === 'menu' || this.gameState === 'pause') {
                const timeDiff = delta;
                
                this.nodes.forEach(node => {
                    node.current.forEach(t => {
                        if (t.arrivalTime) t.arrivalTime += timeDiff;
                        if (t.checkOutTime) t.checkOutTime += timeDiff;
                    });
                });
                
                this.tents.forEach(t => {
                    if (t.checkOutTime) t.checkOutTime += timeDiff;
                });
                
                this.followingTravelers.forEach(t => {
                    if (t.followTimer) t.followTimer += timeDiff;
                });
                
                this.lastInputTime += timeDiff;
                if (this.nextAITime) this.nextAITime += timeDiff;
                
                const invZoom = 1 / this.cameras.main.zoom;
                this.vignette.setScale(invZoom);
                this.uiContainer.setScale(invZoom);
                return;
            }

            // Counter-scale UI to ignore camera zoom and perfectly frame the screen
            const invZoom = 1 / this.cameras.main.zoom;
            this.vignette.setScale(invZoom);
            this.uiContainer.setScale(invZoom);
            
            this.updateNodeLabels();

            // Check if all Tier 1 nodes are unlocked
            const allTier1Unlocked = this.nodes.every(n => {
                if (n.parentId) return true; // Ignore Tier 2 nodes
                return n.unlocked; // Dock and Tier 1 must be unlocked
            });

            if (!this.tier2Revealed && allTier1Unlocked) {
                this.tier2Revealed = true;
                
                // Upgrade the Dock to handle the increased traffic
                const dock = this.nodes[0];
                dock.capacity = 12; // massive capacity boost
                
                // Evolve the Dock's physical shape!
                dock.baseImage.setTexture('tier2Node');
                dock.glow.setTexture('tier2Node');
                
                this.tweens.add({
                    targets: [dock.obj, dock.islandBase],
                    scaleX: 1.35,
                    scaleY: 1.35,
                    duration: 3000,
                    ease: 'Sine.easeOut'
                });
                
                // Counter-scale the text so it doesn't get pixelated and huge
                this.tweens.add({
                    targets: dock.textObj,
                    scaleX: 1 / 1.35,
                    scaleY: 1 / 1.35,
                    duration: 3000,
                    ease: 'Sine.easeOut'
                });
                
                this.nodes.forEach(n => {
                    if (n.hidden) {
                        n.hidden = false;
                        
                        // Set starting alpha
                        n.obj.setAlpha(0);
                        if (n.textObj) n.textObj.setAlpha(0);
                        if (n.islandBase) n.islandBase.setAlpha(0);
                        
                        this.tweens.add({
                            targets: n.obj,
                            alpha: 0.2,
                            duration: 1500,
                            ease: 'Sine.easeIn'
                        });
                        
                        if (n.islandBase) {
                            this.tweens.add({
                                targets: n.islandBase,
                                alpha: 0.8, // Full island base shadow!
                                duration: 1500,
                                ease: 'Sine.easeIn'
                            });
                        }
                        
                        if (n.textObj && !this.isAmbient) {
                            this.tweens.add({
                                targets: n.textObj,
                                alpha: 1,
                                duration: 1500,
                                ease: 'Sine.easeIn'
                            });
                        }
                    }
                });
                
                this.drawConstellationLines();
                
                // If in idle mode, recalculate bounding box and zoom out to reveal the new massive area
                if (this.isAmbient) {
                    this.enterAmbientMode();
                }
                
                // Show a big notification in the center of the screen
                const announcement = this.add.text(1920/2, 1080/2 - 300, 'Constellation Expanding!', {
                    font: '48px Arial',
                    fill: '#ffd700',
                    fontWeight: 'bold',
                    stroke: '#000000',
                    strokeThickness: 6
                }).setOrigin(0.5).setScrollFactor(0).setAlpha(0);
                
                this.tweens.add({
                    targets: announcement,
                    alpha: 1,
                    y: 1080/2 - 350,
                    duration: 2000,
                    yoyo: true,
                    hold: 3000,
                    onComplete: () => announcement.destroy()
                });
            }

            // Counteract camera zoom for fixed screen elements (UI only)
            const inverseZoom = 1 / this.cameras.main.zoom;
            this.uiContainer.setScale(inverseZoom);

            if (this.gameState === 'playing' && !this.isAmbient && (time - this.lastInputTime > 15000)) {
                this.enterAmbientMode();
            }

            if (this.isAmbient) {
                this.runAutoPlayAI(time);
            }

            // Duckling follow logic
            const cursorX = this.cursor.x;
            const cursorY = this.cursor.y;
            
            for (let i = this.followingTravelers.length - 1; i >= 0; i--) {
                const t = this.followingTravelers[i];
                
                // If they've been following for > 15 seconds, pitch a tent
                if (time - t.followTimer > 15000) {
                    this.followingTravelers.splice(i, 1);
                    this.updateHeldText();
                    
                    this.createTent(t);
                    continue;
                }
                
                const targetX = cursorX + Math.cos(time / 500 + i) * 60;
                const targetY = cursorY - 80 + Math.sin(time / 300 + i) * 30;
                
                t.x += (targetX - t.x) * 0.05;
                t.y += (targetY - t.y) * 0.05;
                
                t.scaleX = 1 + Math.sin(time / 150 + i) * 0.2;
                t.scaleY = 1 + Math.cos(time / 150 + i) * 0.2;
            }

            // Regular Node Check-outs
            this.nodes.forEach(node => {
                if (node.type === 'rest' && node.unlocked) {
                    for (let i = node.current.length - 1; i >= 0; i--) {
                        const t = node.current[i];
                        if (time > t.checkOutTime) {
                            node.current.splice(i, 1);
                            
                            this.stardust += 15; // Checkout Bonus
                            this.updateStardustText();
                            this.showFloatingText('+15 Check-out!', t.x, t.y - 30, COLORS.upgrade);
                            
                            // Fly away
                            this.tweens.add({
                                targets: t,
                                y: t.y - 300,
                                alpha: 0,
                                duration: 2000,
                                ease: 'Power2',
                                onComplete: () => t.destroy()
                            });
                        }
                    }
                }
            });

            // Overflow Tents (waited > 25s at dock)
            const dock = this.nodes.find(n => n.id === 'dock');
            for (let i = dock.current.length - 1; i >= 0; i--) {
                const t = dock.current[i];
                if (time - t.arrivalTime > 25000) {
                    dock.current.splice(i, 1);
                    this.createTent(t);
                }
            }

            // Tent Check-outs
            for (let i = this.tents.length - 1; i >= 0; i--) {
                const t = this.tents[i];
                if (t.checkOutTime && time > t.checkOutTime) {
                    this.tents.splice(i, 1);
                    
                    this.stardust += 5; // Smaller bonus for tents
                    this.updateStardustText();
                    this.showFloatingText('+5', t.x, t.y - 30, 0xffaa00);
                    
                    this.tweens.add({
                        targets: t,
                        y: t.y - 300,
                        alpha: 0,
                        duration: 2000,
                        ease: 'Power2',
                        onComplete: () => t.destroy()
                    });
                }
            }
        }

        runAutoPlayAI(time) {
            if (!this.nextAITime) this.nextAITime = time + 2000;
            
            if (time > this.nextAITime) {
                // Slower AI: acts every 8 to 15 seconds. 
                // Since travelers arrive every 6s, the AI will naturally fall behind,
                // causing some travelers to organically give up and pitch tents!
                this.nextAITime = time + Phaser.Math.Between(8000, 15000);
                
                // Priority 1: Unlock a node if we can afford it (and it is visible)
                const lockedNodes = this.nodes.filter(n => !n.unlocked && !n.hidden && n.unlockCost && this.stardust >= n.unlockCost);
                if (lockedNodes.length > 0) {
                    const nodeToUnlock = lockedNodes[0];
                    this.stardust -= nodeToUnlock.unlockCost;
                    this.updateStardustText();
                    
                    nodeToUnlock.unlocked = true;
                    nodeToUnlock.obj.setAlpha(1);
                    
                    this.tweens.add({
                        targets: nodeToUnlock.glow,
                        scaleX: 2, scaleY: 2, alpha: 0.8,
                        duration: 500, yoyo: true
                    });
                    this.showFloatingText('-' + nodeToUnlock.unlockCost + ' (Auto-Unlock)', nodeToUnlock.x, nodeToUnlock.y - 50, COLORS.upgrade);
                    
                    this.saveGame();
                    return; // End turn
                }
                
                // Priority 2: Assign travelers from dock to available beds
                const dock = this.nodes.find(n => n.id === 'dock');
                if (dock.current.length > 0) {
                    const availableNodes = this.nodes.filter(n => n.type === 'rest' && n.unlocked && n.current.length < n.capacity);
                    
                    if (availableNodes.length > 0) {
                        const targetNode = Phaser.Utils.Array.GetRandom(availableNodes);
                        const t = dock.current.shift();
                        
                        targetNode.current.push(t);
                        if (targetNode.parentId) {
                            t.checkOutTime = time + Phaser.Math.Between(60000, 90000);
                        } else {
                            t.checkOutTime = time + Phaser.Math.Between(30000, 45000);
                        }
                        
                        const ox = Phaser.Math.Between(-80, 80);
                        const oy = Phaser.Math.Between(-15, 15);
                        
                        this.tweens.killTweensOf(t);
                        
                        this.tweens.add({
                            targets: t,
                            x: targetNode.x + ox,
                            y: targetNode.y + 50 + oy,
                            duration: 3000,
                            ease: 'Sine.easeInOut'
                        });
                    }
                }
            }
        }
    }

    const config = {
        type: Phaser.AUTO,
        parent: containerId,
        width: 1920,
        height: 1080,
        backgroundColor: '#0f0c29',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: [MainScene]
    };

    return new Phaser.Game(config);
};
