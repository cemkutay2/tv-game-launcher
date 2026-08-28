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
        0x00FFFF, // 1: Cyan
        0x0055FF, // 2: Blue
        0xFFA500, // 3: Orange
        0xFFFF00, // 4: Yellow
        0x00FF00, // 5: Green
        0xAA00FF, // 6: Purple
        0xFF0000  // 7: Red
    ];

    // Grid configuration
    const COLS = 10;
    const ROWS = 20;
    const BLOCK_SIZE = 48;
    const GRID_WIDTH = COLS * BLOCK_SIZE;
    const GRID_HEIGHT = ROWS * BLOCK_SIZE;
    const OFFSET_X = (1920 - GRID_WIDTH) / 2; // Center horizontally
    const OFFSET_Y = (1080 - GRID_HEIGHT) / 2; // Center vertically

    // ---------------------------------------------------------
    // MAIN SCENE
    // ---------------------------------------------------------
    class TetrisScene extends Phaser.Scene {
        constructor() {
            super({ key: 'TetrisScene' });
        }

        create() {
            // We use a single Graphics object to draw the entire game efficiently
            this.graphics = this.add.graphics();

            // Set up UI Text
            this.setupUI();

            // Setup input mapping for TV Remote / Keyboard
            this.setupInputs();

            // Initialize game state
            this.resetGame();
        }

        setupUI() {
            const textStyle = { fontSize: '42px', fontFamily: 'Arial, sans-serif', color: '#FFFFFF' };
            const titleStyle = { fontSize: '56px', fontFamily: 'Arial, sans-serif', color: '#00FFFF', fontStyle: 'bold' };

            // Left panel (Controls)
            this.add.text(200, OFFSET_Y, 'TETRIS', titleStyle);
            this.add.text(200, OFFSET_Y + 100, 'TV CONTROLS:\n\nLeft / Right : Move\nUp : Rotate\nDown : Soft Drop\nOK (Enter) : Hard Drop', { fontSize: '38px', fontFamily: 'Arial, sans-serif', color: '#DDDDDD', lineSpacing: 10 });

            // Right panel (Stats)
            this.scoreText = this.add.text(OFFSET_X + GRID_WIDTH + 150, OFFSET_Y, 'Score: 0', textStyle);
            this.levelText = this.add.text(OFFSET_X + GRID_WIDTH + 150, OFFSET_Y + 80, 'Level: 1', textStyle);
            this.linesText = this.add.text(OFFSET_X + GRID_WIDTH + 150, OFFSET_Y + 160, 'Lines: 0', textStyle);

            // Game Over overlay
            this.gameOverText = this.add.text(1920 / 2, 1080 / 2, 'GAME OVER\nPress OK to Restart', {
                fontSize: '64px',
                fontFamily: 'Arial, sans-serif',
                color: '#FF0000',
                fontStyle: 'bold',
                align: 'center',
                backgroundColor: '#000000AA',
                padding: { x: 20, y: 20 }
            }).setOrigin(0.5).setVisible(false);
        }

        setupInputs() {
            // D-Pad Left
            this.input.keyboard.on('keydown-LEFT', () => {
                if (!this.gameOver && this.isValidMove(this.piece.matrix, this.piece.x - 1, this.piece.y)) {
                    this.piece.x--;
                    this.draw();
                }
            });

            // D-Pad Right
            this.input.keyboard.on('keydown-RIGHT', () => {
                if (!this.gameOver && this.isValidMove(this.piece.matrix, this.piece.x + 1, this.piece.y)) {
                    this.piece.x++;
                    this.draw();
                }
            });

            // D-Pad Up (Rotate)
            this.input.keyboard.on('keydown-UP', () => this.handleRotate());

            // D-Pad Down (Soft Drop)
            this.input.keyboard.on('keydown-DOWN', () => {
                if (!this.gameOver) {
                    this.moveDown();
                }
            });

            // OK Button (Enter on Android TV) -> Hard Drop or Restart
            const handleAction = () => {
                if (this.gameOver) {
                    this.resetGame();
                } else {
                    this.hardDrop();
                }
            };

            this.input.keyboard.on('keydown-ENTER', handleAction);
            this.input.keyboard.on('keydown-SPACE', handleAction); // Kept for easy PC testing
        }

        resetGame() {
            this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
            this.score = 0;
            this.level = 1;
            this.lines = 0;
            this.fallDelay = 1000;
            this.fallTimer = 0;
            this.gameOver = false;

            this.gameOverText.setVisible(false);
            this.updateUI();
            this.spawnPiece();
            this.draw();
        }

        spawnPiece() {
            const shapeIdx = Phaser.Math.Between(1, 7);
            this.piece = {
                matrix: SHAPES[shapeIdx],
                x: 3,
                y: -1, // Start slightly above board
                color: shapeIdx
            };

            // If it immediately collides upon spawning, game over
            if (!this.isValidMove(this.piece.matrix, this.piece.x, this.piece.y)) {
                this.gameOver = true;
                this.gameOverText.setVisible(true);
            }
        }

        handleRotate() {
            if (this.gameOver) return;
            const rotated = this.rotateMatrix(this.piece.matrix);
            if (this.isValidMove(rotated, this.piece.x, this.piece.y)) {
                this.piece.matrix = rotated;
                this.draw();
            }
        }

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
                        let newX = cellX + c;
                        let newY = cellY + r;

                        // Bounds check
                        if (newX < 0 || newX >= COLS || newY >= ROWS) return false;

                        // Collision check with placed pieces (only if it has entered the board entirely)
                        if (newY >= 0 && this.board[newY][newX]) return false;
                    }
                }
            }
            return true;
        }

        moveDown() {
            if (this.isValidMove(this.piece.matrix, this.piece.x, this.piece.y + 1)) {
                this.piece.y++;
            } else {
                this.lockPiece();
            }
            this.fallTimer = 0; // Reset timer so it doesn't instantly drop again
            this.draw();
        }

        hardDrop() {
            while (this.isValidMove(this.piece.matrix, this.piece.x, this.piece.y + 1)) {
                this.piece.y++;
            }
            this.lockPiece();
            this.fallTimer = 0;
            this.draw();
        }

        lockPiece() {
            for (let r = 0; r < this.piece.matrix.length; r++) {
                for (let c = 0; c < this.piece.matrix[r].length; c++) {
                    if (this.piece.matrix[r][c]) {
                        // If it locks above the visible board, Game Over
                        if (this.piece.y + r < 0) {
                            this.gameOver = true;
                            this.gameOverText.setVisible(true);
                            return;
                        }
                        this.board[this.piece.y + r][this.piece.x + c] = this.piece.color;
                    }
                }
            }

            this.clearLines();

            if (!this.gameOver) {
                this.spawnPiece();
            }
        }

        clearLines() {
            let linesCleared = 0;
            for (let r = ROWS - 1; r >= 0; r--) {
                let isFull = true;
                for (let c = 0; c < COLS; c++) {
                    if (this.board[r][c] === 0) {
                        isFull = false;
                        break;
                    }
                }

                if (isFull) {
                    this.board.splice(r, 1);
                    this.board.unshift(Array(COLS).fill(0));
                    linesCleared++;
                    r++; // Re-evaluate the current row index since items shifted down
                }
            }

            if (linesCleared > 0) {
                this.lines += linesCleared;
                const baseScores = [0, 100, 300, 500, 800];
                this.score += baseScores[linesCleared] * this.level;
                this.level = Math.floor(this.lines / 10) + 1;
                // Decrease drop delay as level goes up, capping at 100ms
                this.fallDelay = Math.max(100, 1000 - ((this.level - 1) * 80));
                this.updateUI();
            }
        }

        updateUI() {
            this.scoreText.setText(`Score: ${this.score}`);
            this.levelText.setText(`Level: ${this.level}`);
            this.linesText.setText(`Lines: ${this.lines}`);
        }

        update(time, delta) {
            if (this.gameOver) return;

            this.fallTimer += delta;
            if (this.fallTimer >= this.fallDelay) {
                this.moveDown();
            }
        }

        // ---------------------------------------------------------
        // RENDERING
        // ---------------------------------------------------------
        draw() {
            this.graphics.clear();

            // Draw Background Area
            this.graphics.fillStyle(0x111111);
            this.graphics.fillRect(OFFSET_X, OFFSET_Y, GRID_WIDTH, GRID_HEIGHT);

            // Draw Grid Lines
            this.graphics.lineStyle(1, 0x333333, 1);
            for (let r = 0; r <= ROWS; r++) {
                this.graphics.moveTo(OFFSET_X, OFFSET_Y + r * BLOCK_SIZE);
                this.graphics.lineTo(OFFSET_X + GRID_WIDTH, OFFSET_Y + r * BLOCK_SIZE);
            }
            for (let c = 0; c <= COLS; c++) {
                this.graphics.moveTo(OFFSET_X + c * BLOCK_SIZE, OFFSET_Y);
                this.graphics.lineTo(OFFSET_X + c * BLOCK_SIZE, OFFSET_Y + GRID_HEIGHT);
            }
            this.graphics.strokePath();

            // Draw locked board pieces
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (this.board[r][c] !== 0) {
                        this.drawBlock(c, r, COLORS[this.board[r][c]]);
                    }
                }
            }

            // Draw falling piece
            if (this.piece) {
                for (let r = 0; r < this.piece.matrix.length; r++) {
                    for (let c = 0; c < this.piece.matrix[r].length; c++) {
                        if (this.piece.matrix[r][c]) {
                            this.drawBlock(this.piece.x + c, this.piece.y + r, COLORS[this.piece.color]);
                        }
                    }
                }
            }

            // Draw thick border around the grid
            this.graphics.lineStyle(4, 0x555555, 1);
            this.graphics.strokeRect(OFFSET_X, OFFSET_Y, GRID_WIDTH, GRID_HEIGHT);
        }

        drawBlock(x, y, color) {
            // Prevent drawing blocks above the visible play area
            if (y < 0) return;

            const px = OFFSET_X + (x * BLOCK_SIZE);
            const py = OFFSET_Y + (y * BLOCK_SIZE);

            // Fill block
            this.graphics.fillStyle(color);
            this.graphics.fillRect(px, py, BLOCK_SIZE, BLOCK_SIZE);

            // Give it a basic bevel/highlight look so it's not a flat square
            this.graphics.lineStyle(2, 0xFFFFFF, 0.4);
            this.graphics.strokeRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

            this.graphics.lineStyle(2, 0x000000, 0.6);
            this.graphics.beginPath();
            this.graphics.moveTo(px, py + BLOCK_SIZE);
            this.graphics.lineTo(px + BLOCK_SIZE, py + BLOCK_SIZE);
            this.graphics.lineTo(px + BLOCK_SIZE, py);
            this.graphics.strokePath();
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
        scene: [TetrisScene]
    };

    return new Phaser.Game(config);
};
