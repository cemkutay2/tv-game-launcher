/**
 * TV Host Screen Bootstrap for Standalone TV Browser
 */
window.addEventListener('DOMContentLoaded', () => {
    const config = {
        type: Phaser.AUTO,
        width: 1920,
        height: 1080,
        parent: 'tv-game-container',
        backgroundColor: '#0A0C14',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: [
            window.LobbyScene,
            window.DemoBuzzerGameScene,
            window.NeonTankGameScene
        ]
    };

    window.tvGameInstance = new Phaser.Game(config);
    console.log('[TV App] Phaser TV Host Game started.');
});
