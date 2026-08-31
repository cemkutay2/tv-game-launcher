window.launchGame = function(containerId) {
    
    // Shared Texture Generation Function
    function generateGlobalTextures(scene) {
        if (scene.textures.exists('bg_gradient')) return;

        const canvas = scene.textures.createCanvas('bg_gradient', 1920, 1080);
        const ctx = canvas.getContext();
        const gradient = ctx.createRadialGradient(960, 0, 100, 960, 540, 1200);
        gradient.addColorStop(0, '#112240');
        gradient.addColorStop(1, '#020c1b');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1920, 1080);
        ctx.strokeStyle = 'rgba(100, 255, 218, 0.03)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 1920; i += 60) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1080); ctx.stroke(); }
        for (let i = 0; i < 1080; i += 60) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1920, i); ctx.stroke(); }
        canvas.refresh();

        const pCanvas = scene.textures.createCanvas('particle', 16, 16);
        const pCtx = pCanvas.getContext();
        const pGrad = pCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
        pGrad.addColorStop(0, 'rgba(100, 255, 218, 1)');
        pGrad.addColorStop(1, 'rgba(100, 255, 218, 0)');
        pCtx.fillStyle = pGrad;
        pCtx.fillRect(0, 0, 16, 16);
        pCanvas.refresh();

        const drawRoundRect = (c, x, y, w, h, r) => {
            c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y);
            c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
            c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r);
            c.quadraticCurveTo(x, y, x + r, y); c.closePath();
        };

        const cCanvas = scene.textures.createCanvas('card', 170, 230);
        const cCtx = cCanvas.getContext();
        cCtx.shadowColor = 'rgba(0,0,0,0.4)'; cCtx.shadowBlur = 10; cCtx.shadowOffsetX = 5; cCtx.shadowOffsetY = 5;
        cCtx.fillStyle = '#ffffff'; drawRoundRect(cCtx, 10, 10, 150, 210, 15); cCtx.fill();
        cCtx.shadowColor = 'transparent';
        cCtx.strokeStyle = '#e2e8f0'; cCtx.lineWidth = 2; drawRoundRect(cCtx, 18, 18, 134, 194, 10); cCtx.stroke();
        cCanvas.refresh();

        const cbCanvas = scene.textures.createCanvas('card_back', 170, 230);
        const cbCtx = cbCanvas.getContext();
        cbCtx.shadowColor = 'rgba(0,0,0,0.4)'; cbCtx.shadowBlur = 10; cbCtx.shadowOffsetX = 5; cbCtx.shadowOffsetY = 5;
        cbCtx.fillStyle = '#112240'; drawRoundRect(cbCtx, 10, 10, 150, 210, 15); cbCtx.fill();
        cbCtx.shadowColor = 'transparent';
        cbCtx.strokeStyle = '#64ffda'; cbCtx.lineWidth = 4; drawRoundRect(cbCtx, 16, 16, 138, 198, 10); cbCtx.stroke();
        cbCtx.fillStyle = '#233554';
        for (let i = 25; i < 145; i += 20) {
            for (let j = 25; j < 205; j += 20) { cbCtx.fillRect(i, j, 10, 10); }
        }
        cbCanvas.refresh();
    }

    class MenuScene extends Phaser.Scene {
        constructor() { super({ key: 'MenuScene' }); }
        create() {
            generateGlobalTextures(this);

            this.add.image(960, 540, 'bg_gradient');
            this.add.particles(0, 0, 'particle', {
                x: { min: 0, max: 1920 }, y: { min: -50, max: 1150 },
                lifespan: 10000, speedY: { min: -10, max: -30 }, speedX: { min: -10, max: 10 },
                scale: { start: 0.5, end: 0 }, alpha: { start: 0.2, end: 0 },
                quantity: 1, frequency: 200, blendMode: 'ADD'
            });

            this.add.text(960, 300, 'NEON BLACKJACK', {
                fontFamily: 'sans-serif', fontSize: '120px', color: '#64ffda', fontStyle: 'bold'
            }).setOrigin(0.5).setShadow(0, 0, '#64ffda', 20, false, true);

            this.add.text(50, 1030, 'Press BACK to exit', {
                fontFamily: 'sans-serif', fontSize: '28px', color: '#8892b0'
            }).setOrigin(0, 0.5);

            this.options = ['PLAY', 'LEARN'];
            this.selectedOptionIndex = 0;
            this.menuItems = [];
            this.menuContainer = this.add.container(960, 600);

            this.options.forEach((opt, index) => {
                const item = this.add.container(0, index * 120);
                const bg = this.add.graphics();
                const txt = this.add.text(0, 0, opt, {
                    fontFamily: 'sans-serif', fontSize: '42px', color: '#ffffff', fontStyle: 'bold'
                }).setOrigin(0.5);
                
                item.add([bg, txt]);
                item.bg = bg;
                item.txt = txt;
                
                this.menuItems.push(item);
                this.menuContainer.add(item);
            });

            this.drawMenuSelection();
            this.input.keyboard.on('keydown', this.handleInput, this);
        }

        drawMenuSelection() {
            const btnW = 300;
            const btnH = 90;
            const radius = 45;
            
            this.menuItems.forEach((item, index) => {
                item.bg.clear();
                if (index === this.selectedOptionIndex) {
                    item.bg.fillStyle(0x64ffda, 0.2);
                    item.bg.fillRoundedRect(-btnW/2, -btnH/2, btnW, btnH, radius);
                    item.bg.lineStyle(4, 0x64ffda, 1);
                    item.bg.strokeRoundedRect(-btnW/2, -btnH/2, btnW, btnH, radius);
                    item.txt.setColor('#64ffda');
                    item.txt.setShadow(0, 0, '#64ffda', 10, false, true);
                    item.setScale(1.1);
                } else {
                    item.bg.fillStyle(0x112240, 0.8);
                    item.bg.fillRoundedRect(-btnW/2, -btnH/2, btnW, btnH, radius);
                    item.bg.lineStyle(2, 0x233554, 1);
                    item.bg.strokeRoundedRect(-btnW/2, -btnH/2, btnW, btnH, radius);
                    item.txt.setColor('#8892b0');
                    item.txt.setShadow(0,0,'#000',0,false,false);
                    item.setScale(1.0);
                }
            });
        }

        handleInput(event) {
            const key = event.keyCode;
            const K = Phaser.Input.Keyboard.KeyCodes;
            
            if (key === K.UP) {
                this.selectedOptionIndex--;
                if (this.selectedOptionIndex < 0) this.selectedOptionIndex = this.options.length - 1;
                this.drawMenuSelection();
            } else if (key === K.DOWN) {
                this.selectedOptionIndex++;
                if (this.selectedOptionIndex >= this.options.length) this.selectedOptionIndex = 0;
                this.drawMenuSelection();
            } else if (key === K.ENTER || key === K.SPACE) {
                const opt = this.options[this.selectedOptionIndex];
                if (opt === 'PLAY') {
                    this.scene.start('BlackjackScene');
                } else if (opt === 'LEARN') {
                    this.scene.start('LearnScene');
                }
            }
        }
    }

    class LearnScene extends Phaser.Scene {
        constructor() { super({ key: 'LearnScene' }); }
        create() {
            this.add.image(960, 540, 'bg_gradient');
            this.add.particles(0, 0, 'particle', {
                x: { min: 0, max: 1920 }, y: { min: -50, max: 1150 },
                lifespan: 10000, speedY: { min: -10, max: -30 }, speedX: { min: -10, max: 10 },
                scale: { start: 0.5, end: 0 }, alpha: { start: 0.2, end: 0 },
                quantity: 1, frequency: 200, blendMode: 'ADD'
            });

            this.add.text(960, 150, 'HOW TO PLAY', {
                fontFamily: 'sans-serif', fontSize: '80px', color: '#64ffda', fontStyle: 'bold'
            }).setOrigin(0.5).setShadow(0, 0, '#64ffda', 15, false, true);

            const rules = 
                "• The goal is to get a hand value closer to 21 than the dealer without going over.\n" +
                "• Cards 2-10 are worth their face value. Face cards (J,Q,K) are worth 10.\n" +
                "• Aces can be worth 1 or 11, whichever is more favorable.\n" +
                "• Place your bet before the hand begins.\n" +
                "• 'HIT' to take another card. 'STAND' to end your turn.\n" +
                "• If you go over 21, you BUST and lose your bet.\n" +
                "• The dealer must hit until they reach at least 17.\n" +
                "• Regular wins pay 1:1. Blackjack (21 on first two cards) pays 3:2.";

            this.add.text(960, 520, rules, {
                fontFamily: 'sans-serif', fontSize: '34px', color: '#ccd6f6', lineSpacing: 25, align: 'left', wordWrap: { width: 1400 }
            }).setOrigin(0.5);

            const item = this.add.container(960, 900);
            const bg = this.add.graphics();
            const txt = this.add.text(0, 0, 'BACK', { fontFamily: 'sans-serif', fontSize: '42px', color: '#64ffda', fontStyle: 'bold' }).setOrigin(0.5).setShadow(0,0,'#64ffda',10,false,true);
            item.add([bg, txt]);
            
            bg.fillStyle(0x64ffda, 0.2);
            bg.fillRoundedRect(-150, -45, 300, 90, 45);
            bg.lineStyle(4, 0x64ffda, 1);
            bg.strokeRoundedRect(-150, -45, 300, 90, 45);

            this.input.keyboard.on('keydown', (event) => {
                const key = event.keyCode;
                const K = Phaser.Input.Keyboard.KeyCodes;
                if (key === K.ENTER || key === K.SPACE || key === K.ESC) {
                    this.scene.start('MenuScene');
                }
            });
        }
    }

    class BlackjackScene extends Phaser.Scene {
        constructor() { super({ key: 'BlackjackScene' }); }

        create() {
            this.add.image(960, 540, 'bg_gradient');
            this.add.particles(0, 0, 'particle', {
                x: { min: 0, max: 1920 }, y: { min: -50, max: 1150 },
                lifespan: 10000, speedY: { min: -10, max: -30 }, speedX: { min: -10, max: 10 },
                scale: { start: 0.5, end: 0 }, alpha: { start: 0.2, end: 0 },
                quantity: 1, frequency: 200, blendMode: 'ADD'
            });

            this.deck = [];
            this.playerHand = [];
            this.dealerHand = [];
            this.gameState = 'IDLE'; 
            
            this.bankroll = 1000;
            this.currentBet = 0;

            this.add.text(960, 80, 'NEON BLACKJACK', {
                fontFamily: 'sans-serif', fontSize: '64px', color: '#64ffda', fontStyle: 'bold'
            }).setOrigin(0.5).setShadow(0, 0, '#64ffda', 10, false, true);

            this.bankrollText = this.add.text(1800, 70, `BANK: $${this.bankroll}`, {
                fontFamily: 'monospace', fontSize: '42px', color: '#64ffda', fontStyle: 'bold'
            }).setOrigin(1, 0.5).setShadow(0, 0, '#64ffda', 10, false, true);

            this.highScore = parseInt(localStorage.getItem('blackjack_highscore')) || 1000;
            this.highScoreText = this.add.text(1800, 120, `TOP: $${this.highScore}`, {
                fontFamily: 'monospace', fontSize: '28px', color: '#ffb86c', fontStyle: 'bold'
            }).setOrigin(1, 0.5).setShadow(0, 0, '#ffb86c', 10, false, true);

            this.betText = this.add.text(960, 580, '', {
                fontFamily: 'monospace', fontSize: '42px', color: '#ffd700', fontStyle: 'bold'
            }).setOrigin(0.5).setShadow(0, 0, '#ffd700', 10, false, true);

            this.dealerScoreText = this.add.text(960, 140, '', {
                fontFamily: 'sans-serif', fontSize: '28px', color: '#8892b0'
            }).setOrigin(0.5);

            this.playerScoreText = this.add.text(960, 890, '', {
                fontFamily: 'sans-serif', fontSize: '28px', color: '#8892b0'
            }).setOrigin(0.5);

            this.statusText = this.add.text(960, 480, '', {
                fontFamily: 'sans-serif', fontSize: '64px', color: '#ccd6f6', fontStyle: 'bold', align: 'center'
            }).setOrigin(0.5).setShadow(0, 0, '#64ffda', 10, false, true);

            this.dealerContainer = this.add.container(960, 280);
            this.playerContainer = this.add.container(960, 750);
            this.menuContainer = this.add.container(960, 980);

            this.options = [];
            this.selectedOptionIndex = 0;
            this.menuItems = [];

            this.input.keyboard.on('keydown', this.handleInput, this);
            
            this.createDeck();
            this.startBetting();
        }

        createDeck() {
            this.deck = [];
            const suits = ['♠', '♥', '♦', '♣'];
            const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            for (let suit of suits) {
                for (let value of values) {
                    let numericValue = parseInt(value);
                    if (['J', 'Q', 'K'].includes(value)) numericValue = 10;
                    if (value === 'A') numericValue = 11;
                    this.deck.push({
                        suit, value, numericValue,
                        color: (suit === '♥' || suit === '♦') ? '#ff6b6b' : '#2d3436'
                    });
                }
            }
            Phaser.Utils.Array.Shuffle(this.deck);
        }

        startBetting() {
            this.gameState = 'BETTING';
            this.playerHand = [];
            this.dealerHand = [];
            this.dealerContainer.removeAll(true);
            this.playerContainer.removeAll(true);
            
            if (this.currentBet > this.bankroll) this.currentBet = this.bankroll;
            if (this.currentBet === 0 && this.bankroll > 0) this.currentBet = Math.min(10, this.bankroll);
            
            if (this.bankroll === 0 && this.currentBet === 0) {
                this.statusText.setText('BANKRUPT!\nPress ENTER to Restart');
                this.betText.setText('');
                this.updateScores();
                this.updateMenu(['RESTART', 'MENU']);
                return;
            }

            this.statusText.setText('PLACE YOUR BET');
            this.updateScores();
            this.updateFinancials();
            this.updateMenu(['+ $10', '+ $50', 'CLEAR', 'ALL IN', 'DEAL', 'MENU']);
        }
        
        updateFinancials() {
            this.bankrollText.setText(`BANK: $${this.bankroll}`);
            if (this.bankroll > this.highScore) {
                this.highScore = this.bankroll;
                localStorage.setItem('blackjack_highscore', this.highScore);
                this.highScoreText.setText(`TOP: $${this.highScore}`);
            }

            if (this.gameState === 'BETTING') this.betText.setText(`CURRENT BET: $${this.currentBet}`);
            else if (this.currentBet > 0) this.betText.setText(`BET: $${this.currentBet}`);
            else this.betText.setText('');
        }

        dealInitial() {
            this.gameState = 'DEALING';
            this.playerHand = [];
            this.dealerHand = [];
            this.dealerContainer.removeAll(true);
            this.playerContainer.removeAll(true);
            this.statusText.setText('');
            
            this.drawCard(this.playerHand, this.playerContainer, false, () => {
                this.drawCard(this.dealerHand, this.dealerContainer, false, () => {
                    this.drawCard(this.playerHand, this.playerContainer, false, () => {
                        this.drawCard(this.dealerHand, this.dealerContainer, true, () => {
                            this.checkBlackjack();
                        });
                    });
                });
            });
            this.updateMenu([]);
        }

        drawCard(hand, container, hidden, callback) {
            const cardData = this.deck.pop();
            hand.push({...cardData, hidden});
            
            const cardObj = this.createCardSprite(cardData, hidden);
            cardObj.setPosition(1000, -500); 
            
            container.add(cardObj);
            
            const count = hand.length;
            const startX = -((count - 1) * 45);
            const targetX = startX + (count - 1) * 90;
            const targetY = 0;
            
            this.tweens.add({
                targets: cardObj,
                x: targetX,
                y: targetY,
                angle: Phaser.Math.Between(-3, 3),
                duration: 400,
                ease: 'Sine.easeOut',
                onComplete: () => {
                    this.rearrangeCards(hand, container);
                    this.updateScores();
                    if (callback) callback();
                }
            });
        }

        createCardSprite(cardData, hidden) {
            const card = this.add.container(0, 0);
            const bg = this.add.sprite(0, 0, hidden ? 'card_back' : 'card');
            card.add(bg);
            
            if (!hidden) {
                const textTop = this.add.text(-50, -80, cardData.value + '\n' + cardData.suit, {
                    fontFamily: 'sans-serif', fontSize: '24px', color: cardData.color, align: 'center', lineSpacing: -5
                }).setOrigin(0.5, 0.5);
                
                const textBot = this.add.text(50, 80, cardData.value + '\n' + cardData.suit, {
                    fontFamily: 'sans-serif', fontSize: '24px', color: cardData.color, align: 'center', lineSpacing: -5
                }).setOrigin(0.5, 0.5).setAngle(180);
                
                const centerSuit = this.add.text(0, 0, cardData.suit, {
                    fontFamily: 'sans-serif', fontSize: '64px', color: cardData.color
                }).setOrigin(0.5);
                
                card.add([textTop, textBot, centerSuit]);
            }
            card.cardData = cardData;
            return card;
        }

        rearrangeCards(hand, container) {
            const count = hand.length;
            const startX = -((count - 1) * 45);
            container.list.forEach((child, index) => {
                this.tweens.add({
                    targets: child,
                    x: startX + index * 90,
                    duration: 200,
                    ease: 'Power1'
                });
            });
        }

        calculateScore(hand) {
            let score = 0;
            let aces = 0;
            for (let card of hand) {
                if (!card.hidden) {
                    score += card.numericValue;
                    if (card.value === 'A') aces++;
                }
            }
            while (score > 21 && aces > 0) { score -= 10; aces--; }
            return score;
        }

        updateScores() {
            if (this.gameState === 'PLAYER_TURN' || this.gameState === 'DEALING' || this.gameState === 'DEALER_TURN' || this.gameState === 'GAME_OVER') {
                const pScore = this.calculateScore(this.playerHand);
                
                let dealerVisibleScore = 0;
                let hasHidden = false;
                let dealerAces = 0;
                for (let card of this.dealerHand) {
                    if (card.hidden) {
                        hasHidden = true;
                    } else {
                        dealerVisibleScore += card.numericValue;
                        if (card.value === 'A') dealerAces++;
                    }
                }
                while (dealerVisibleScore > 21 && dealerAces > 0) { dealerVisibleScore -= 10; dealerAces--; }
                
                if (this.gameState === 'GAME_OVER' || this.gameState === 'DEALER_TURN' || !hasHidden) {
                    this.dealerScoreText.setText(`Dealer: ${dealerVisibleScore}`);
                } else if (hasHidden) {
                    this.dealerScoreText.setText(`Dealer: ${dealerVisibleScore} + ?`);
                } else {
                    this.dealerScoreText.setText('');
                }
                this.playerScoreText.setText(pScore > 0 ? `Player: ${pScore}` : '');
            } else {
                this.dealerScoreText.setText('');
                this.playerScoreText.setText('');
            }
        }

        checkBlackjack() {
            const pScore = this.calculateScore(this.playerHand);
            let trueDealerScore = 0;
            let dealerAces = 0;
            for (let c of this.dealerHand) {
                trueDealerScore += c.numericValue;
                if (c.value === 'A') dealerAces++;
            }
            while (trueDealerScore > 21 && dealerAces > 0) { trueDealerScore -= 10; dealerAces--; }
            
            if (pScore === 21) {
                this.revealDealer(() => {
                    if (trueDealerScore === 21) this.endGame('PUSH - BOTH BLACKJACK!', 'PUSH');
                    else this.endGame('BLACKJACK!', 'BLACKJACK');
                });
            } else if (trueDealerScore === 21) {
                this.revealDealer(() => { this.endGame('DEALER BLACKJACK!', 'LOSE'); });
            } else {
                this.gameState = 'PLAYER_TURN';
                this.updateMenu(['HIT', 'STAND']);
            }
        }

        playerHit() {
            if (this.gameState !== 'PLAYER_TURN') return;
            this.gameState = 'DEALING';
            this.updateMenu([]);
            
            this.drawCard(this.playerHand, this.playerContainer, false, () => {
                const score = this.calculateScore(this.playerHand);
                if (score > 21) this.endGame('BUST! YOU LOSE!', 'LOSE');
                else {
                    this.gameState = 'PLAYER_TURN';
                    this.updateMenu(['HIT', 'STAND']);
                }
            });
        }

        playerStand() {
            if (this.gameState !== 'PLAYER_TURN') return;
            this.gameState = 'DEALER_TURN';
            this.updateMenu([]);
            this.revealDealer(() => { this.dealerTurn(); });
        }

        revealDealer(callback) {
            const hiddenCardObj = this.dealerContainer.getAt(1);
            if (hiddenCardObj && this.dealerHand[1].hidden) {
                this.dealerHand[1].hidden = false;
                this.tweens.add({
                    targets: hiddenCardObj, scaleX: 0, duration: 150,
                    onComplete: () => {
                        hiddenCardObj.removeAll(true);
                        const cardData = this.dealerHand[1];
                        const bg = this.add.sprite(0, 0, 'card');
                        hiddenCardObj.add(bg);
                        
                        const textTop = this.add.text(-50, -80, cardData.value + '\n' + cardData.suit, { fontFamily: 'sans-serif', fontSize: '24px', color: cardData.color, align: 'center', lineSpacing: -5 }).setOrigin(0.5, 0.5);
                        const textBot = this.add.text(50, 80, cardData.value + '\n' + cardData.suit, { fontFamily: 'sans-serif', fontSize: '24px', color: cardData.color, align: 'center', lineSpacing: -5 }).setOrigin(0.5, 0.5).setAngle(180);
                        const centerSuit = this.add.text(0, 0, cardData.suit, { fontFamily: 'sans-serif', fontSize: '64px', color: cardData.color }).setOrigin(0.5);
                        hiddenCardObj.add([textTop, textBot, centerSuit]);
                        
                        this.updateScores();
                        this.tweens.add({ targets: hiddenCardObj, scaleX: 1, duration: 150, onComplete: () => { if(callback) callback(); } });
                    }
                });
            } else {
                if(callback) callback();
            }
        }

        dealerTurn() {
            const score = this.calculateScore(this.dealerHand);
            if (score < 17) {
                this.time.delayedCall(800, () => {
                    this.drawCard(this.dealerHand, this.dealerContainer, false, () => { this.dealerTurn(); });
                });
            } else {
                this.time.delayedCall(800, () => { this.determineWinner(); });
            }
        }

        determineWinner() {
            const pScore = this.calculateScore(this.playerHand);
            const dScore = this.calculateScore(this.dealerHand);
            if (dScore > 21) this.endGame('DEALER BUSTS!', 'WIN');
            else if (pScore > dScore) this.endGame('YOU WIN!', 'WIN');
            else if (dScore > pScore) this.endGame('DEALER WINS!', 'LOSE');
            else this.endGame('PUSH (TIE)', 'PUSH');
        }

        endGame(message, outcome) {
            this.gameState = 'GAME_OVER';
            if (outcome === 'WIN') {
                this.bankroll += this.currentBet * 2;
                message += `\n+$${this.currentBet}`; 
            } else if (outcome === 'BLACKJACK') {
                const winnings = this.currentBet * 1.5;
                this.bankroll += this.currentBet + winnings;
                message += `\n+$${winnings}`;
            } else if (outcome === 'PUSH') {
                this.bankroll += this.currentBet;
                message += `\nRETURNED $${this.currentBet}`;
            } else {
                message += `\n-$${this.currentBet}`;
            }
            
            this.updateFinancials();
            this.statusText.setText(message);
            this.statusText.setScale(1);
            this.tweens.add({ targets: this.statusText, scale: 1.1, yoyo: true, duration: 300, ease: 'Quad.easeInOut' });
            this.updateMenu(['PLAY AGAIN', 'MENU']);
            if (this.deck.length < 15) this.createDeck();
        }

        updateMenu(options) {
            this.menuContainer.removeAll(true);
            this.options = options;
            this.selectedOptionIndex = 0;
            this.menuItems = [];
            if (options.length === 0) return;
            
            // Adjust spacing dynamically if many options
            let itemWidth = 240;
            if (options.length >= 6) itemWidth = 210;
            
            const totalWidth = options.length * itemWidth;
            const startX = -totalWidth / 2 + (itemWidth / 2);
            
            options.forEach((opt, index) => {
                const item = this.add.container(startX + index * itemWidth, 0);
                const bg = this.add.graphics();
                const txt = this.add.text(0, 0, opt, {
                    fontFamily: 'sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold'
                }).setOrigin(0.5);
                item.add([bg, txt]);
                item.bg = bg;
                item.txt = txt;
                this.menuItems.push(item);
                this.menuContainer.add(item);
            });
            this.drawMenuSelection(itemWidth);
        }

        drawMenuSelection(itemWidth) {
            const btnW = itemWidth - 20;
            const btnH = 70;
            const radius = 35;
            
            this.menuItems.forEach((item, index) => {
                item.bg.clear();
                if (index === this.selectedOptionIndex) {
                    item.bg.fillStyle(0x64ffda, 0.2);
                    item.bg.fillRoundedRect(-btnW/2, -btnH/2, btnW, btnH, radius);
                    item.bg.lineStyle(4, 0x64ffda, 1);
                    item.bg.strokeRoundedRect(-btnW/2, -btnH/2, btnW, btnH, radius);
                    item.txt.setColor('#64ffda');
                    item.txt.setShadow(0, 0, '#64ffda', 10, false, true);
                    item.setScale(1.1);
                } else {
                    item.bg.fillStyle(0x112240, 0.8);
                    item.bg.fillRoundedRect(-btnW/2, -btnH/2, btnW, btnH, radius);
                    item.bg.lineStyle(2, 0x233554, 1);
                    item.bg.strokeRoundedRect(-btnW/2, -btnH/2, btnW, btnH, radius);
                    item.txt.setColor('#8892b0');
                    item.txt.setShadow(0,0,'#000',0,false,false);
                    item.setScale(1.0);
                }
            });
        }

        handleInput(event) {
            const key = event.keyCode;
            const K = Phaser.Input.Keyboard.KeyCodes;
            
            // Allow backing out via ESC or BACK remote button anywhere
            if (key === K.ESC) {
                this.scene.start('MenuScene');
                return;
            }

            if (this.options.length === 0) return;
            
            if (key === K.LEFT || key === K.UP) {
                this.selectedOptionIndex--;
                if (this.selectedOptionIndex < 0) this.selectedOptionIndex = this.options.length - 1;
                this.drawMenuSelection(this.options.length >= 6 ? 210 : 240);
            } else if (key === K.RIGHT || key === K.DOWN) {
                this.selectedOptionIndex++;
                if (this.selectedOptionIndex >= this.options.length) this.selectedOptionIndex = 0;
                this.drawMenuSelection(this.options.length >= 6 ? 210 : 240);
            } else if (key === K.ENTER || key === K.SPACE) {
                this.executeOption();
            }
        }

        executeOption() {
            const opt = this.options[this.selectedOptionIndex];
            
            if (opt === 'MENU') {
                this.scene.start('MenuScene');
            } else if (opt === 'RESTART') {
                this.bankroll = 1000;
                this.currentBet = 0;
                this.startBetting();
            } else if (this.gameState === 'BETTING') {
                if (opt === '+ $10') {
                    if (this.currentBet + 10 <= this.bankroll) this.currentBet += 10;
                    else this.currentBet = this.bankroll;
                } else if (opt === '+ $50') {
                    if (this.currentBet + 50 <= this.bankroll) this.currentBet += 50;
                    else this.currentBet = this.bankroll;
                } else if (opt === 'CLEAR') {
                    this.currentBet = 0;
                } else if (opt === 'ALL IN') {
                    this.currentBet = this.bankroll;
                } else if (opt === 'DEAL') {
                    if (this.currentBet > 0) {
                        this.bankroll -= this.currentBet;
                        this.updateFinancials();
                        this.dealInitial();
                    } else {
                        this.tweens.add({ targets: this.betText, scale: 1.2, yoyo: true, duration: 150 });
                    }
                }
                this.updateFinancials();
            } else if (opt === 'HIT') {
                this.playerHit();
            } else if (opt === 'STAND') {
                this.playerStand();
            } else if (opt === 'PLAY AGAIN') {
                this.startBetting();
            }
        }
    }

    const config = {
        type: Phaser.AUTO,
        parent: containerId,
        width: 1920,
        height: 1080,
        backgroundColor: '#0a192f',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: [MenuScene, LearnScene, BlackjackScene],
        input: {
            keyboard: true
        }
    };

    return new Phaser.Game(config);
};
