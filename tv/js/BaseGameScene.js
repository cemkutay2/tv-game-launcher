/**
 * Standardized BaseGameScene for TV Host Party Games
 * Inherits from Phaser.Scene, manages lifecycle, session state, and network event routing.
 */
class BaseGameScene extends Phaser.Scene {
    constructor(sceneKey) {
        super({ key: sceneKey });
        this.sceneKey = sceneKey;

        // Session data
        this.roomId = null;
        this.players = [];
        this.playersMap = new Map();
        this.network = null;
        this.soundFx = null;

        // Unsubscribe tracking for zero memory leaks
        this.networkUnsubscribers = [];
    }

    /**
     * Ingests session data from LobbyScene
     * @param {Object} data - { roomId, players, network, soundFx, ... }
     */
    init(data) {
        this.roomId = data.roomId || (window.tvHostNetwork ? window.tvHostNetwork.roomId : '');
        this.players = (data.players || []).map(p => ({ ...p }));
        this.playersMap = new Map(this.players.map(p => [p.id, p]));
        this.network = data.network || window.tvHostNetwork;
        this.soundFx = data.soundFx || window.soundFx;

        // Auto clean-up on scene shutdown
        this.events.once('shutdown', this.cleanupScene, this);
        this.events.once('destroy', this.cleanupScene, this);

        // Wire network listeners
        this.wireNetworkEvents();
    }

    /**
     * Wires server WebSocket events to class methods
     */
    wireNetworkEvents() {
        if (!this.network) return;

        // Route player inputs
        const unsubInput = this.network.on('PLAYER_INPUT', (payload) => {
            this.onPlayerInput(payload.playerId, payload);
        });
        this.networkUnsubscribers.push(unsubInput);

        // Player disconnected
        const unsubDisc = this.network.on('PLAYER_DISCONNECTED', (payload) => {
            if (this.playersMap.has(payload.playerId)) {
                this.playersMap.get(payload.playerId).connected = false;
            }
            this.onPlayerDisconnected(payload.playerId, payload);
        });
        this.networkUnsubscribers.push(unsubDisc);

        // Player permanently left
        const unsubLeft = this.network.on('PLAYER_LEFT', (payload) => {
            this.playersMap.delete(payload.playerId);
            this.players = this.players.filter(p => p.id !== payload.playerId);
            this.onPlayerLeft(payload.playerId, payload);
        });
        this.networkUnsubscribers.push(unsubLeft);

        // Score update sync
        const unsubScore = this.network.on('SCORE_UPDATED', (payload) => {
            if (payload.player && this.playersMap.has(payload.player.id)) {
                this.playersMap.get(payload.player.id).score = payload.player.score;
            }
            this.onScoreUpdated(payload);
        });
        this.networkUnsubscribers.push(unsubScore);

        // Return to lobby broadcast
        const unsubReturn = this.network.on('RETURN_TO_LOBBY', (payload) => {
            this.transitionToLobby();
        });
        this.networkUnsubscribers.push(unsubReturn);
    }

    /**
     * Template hooks for subclasses to override
     */
    onPlayerInput(playerId, inputData) {
        // Subclass overrides
    }

    onPlayerDisconnected(playerId, payload) {
        // Subclass overrides
    }

    onPlayerLeft(playerId, payload) {
        // Subclass overrides
    }

    onScoreUpdated(payload) {
        // Subclass overrides
    }

    /**
     * Update player score on TV and server
     */
    awardScore(playerId, pointsDelta) {
        if (!this.network || !this.playersMap.has(playerId)) return;
        const player = this.playersMap.get(playerId);
        player.score = (player.score || 0) + pointsDelta;
        this.network.updateScore(playerId, pointsDelta, false);
    }

    /**
     * Ends game, awards final scores, broadcasts winner to controllers
     */
    endGame(results = {}) {
        // Determine winner
        let winner = results.winner || null;
        if (!winner && this.players.length > 0) {
            const sorted = [...this.players].sort((a, b) => (b.score || 0) - (a.score || 0));
            winner = sorted[0];
        }

        if (this.soundFx) {
            this.soundFx.victoryFanfare();
        }

        if (this.network) {
            this.network.gameOver(winner, this.players);
        }
    }

    /**
     * Return all clients to LobbyScene
     */
    returnToLobby() {
        if (this.network) {
            this.network.returnToLobby();
        }
        this.transitionToLobby();
    }

    /**
     * Transitions host screen back to LobbyScene
     */
    transitionToLobby() {
        this.scene.start('LobbyScene', {
            roomId: this.roomId,
            players: this.players,
            network: this.network
        });
    }

    /**
     * Clean memory leak prevention: removes unsubscribers, tweens, timers
     */
    cleanupScene() {
        // Unsubscribe all network listeners
        for (const unsub of this.networkUnsubscribers) {
            if (typeof unsub === 'function') {
                unsub();
            }
        }
        this.networkUnsubscribers = [];

        // Remove tweens and timers associated with this scene
        this.tweens.killAll();
        this.time.removeAllEvents();
    }
}

if (typeof window !== 'undefined') {
    window.BaseGameScene = BaseGameScene;
}

if (typeof module !== 'undefined') {
    module.exports = BaseGameScene;
}
