window.launchGame = function(containerId) {
    const config = {
        type: Phaser.AUTO,
        width: 1920,
        height: 1080,
        parent: containerId,
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: {
            create: function() {
                this.add.text(960, 540, 'Neon Grid\nPress ESC/Back to exit', {
                    font: '80px Arial',
                    fill: '#00ff00',
                    align: 'center'
                }).setOrigin(0.5);

                // Grid effect
                var graphics = this.add.graphics();
                graphics.lineStyle(2, 0x00ff00, 1);
                for(var i = 0; i < 1920; i += 100) {
                    graphics.moveTo(i, 0);
                    graphics.lineTo(i, 1080);
                }
                for(var j = 0; j < 1080; j += 100) {
                    graphics.moveTo(0, j);
                    graphics.lineTo(1920, j);
                }
                graphics.strokePath();
            }
        }
    };

    return new Phaser.Game(config);
};
