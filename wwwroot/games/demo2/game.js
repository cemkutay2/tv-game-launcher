window.launchGame = function(containerId) {
    const config = {
        type: Phaser.AUTO,
        width: 1920,
        height: 1080,
        parent: containerId,
        backgroundColor: '#000033',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        physics: {
            default: 'arcade',
            arcade: { gravity: { y: 300 }, debug: false }
        },
        scene: {
            preload: function() {
                // we can draw a circle to use as a texture
                var graphics = this.make.graphics({x: 0, y: 0, add: false});
                graphics.fillStyle(0xff0000);
                graphics.fillCircle(50, 50, 50);
                graphics.generateTexture('ball', 100, 100);
            },
            create: function() {
                this.add.text(960, 200, 'Bouncing Ball\nPress ESC/Back to exit', {
                    font: '60px Arial',
                    fill: '#ffffff',
                    align: 'center'
                }).setOrigin(0.5);

                var ball = this.physics.add.image(960, 400, 'ball');
                ball.setBounce(1);
                ball.setCollideWorldBounds(true);
                ball.setVelocity(200, 200);
            }
        }
    };

    return new Phaser.Game(config);
};
