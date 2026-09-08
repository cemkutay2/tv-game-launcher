const crypto = require('crypto');

// Characters for 4-letter room codes (excludes confusing characters: 0, O, 1, I)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DEFAULT_PARTY_COLORS = [
    '#FF4757', // Coral Red
    '#00D2D3', // Cyber Cyan
    '#2ED573', // Electric Lime
    '#FFA502', // Neon Orange
    '#9B59B6', // Vibrant Purple
    '#FF6B81', // Bubblegum Pink
    '#1E90FF', // Ocean Blue
    '#ECCC68'  // Golden Yellow
];

class RoomManager {
    constructor(options = {}) {
        this.rooms = new Map(); // roomId -> Room
        this.socketToRoom = new Map(); // ws -> { roomId, role: 'host' | 'player', playerId? }
        this.hostGracePeriodMs = options.hostGracePeriodMs || 30000;
        this.playerGracePeriodMs = options.playerGracePeriodMs || 30000;
        this.maxPlayers = options.maxPlayers || 8;
    }

    /**
     * Generate a unique 4-character room code.
     */
    generateRoomCode() {
        let code;
        let attempts = 0;
        do {
            code = '';
            for (let i = 0; i < 4; i++) {
                const index = Math.floor(Math.random() * CODE_ALPHABET.length);
                code += CODE_ALPHABET[index];
            }
            attempts++;
            if (attempts > 500) {
                code += Math.floor(Math.random() * 10);
                break;
            }
        } while (this.rooms.has(code));
        return code;
    }

    /**
     * Creates a new game room for a TV host.
     */
    createRoom(hostWs, hostName = 'TV Host') {
        const roomId = this.generateRoomCode();
        const hostToken = crypto.randomBytes(16).toString('hex');
        const hostId = 'host_' + crypto.randomBytes(4).toString('hex');

        const room = {
            roomId,
            hostSocket: hostWs,
            hostId,
            hostToken,
            hostName,
            hostConnected: true,
            hostDisconnectTimer: null,
            players: new Map(), // playerId -> Player
            playerTokens: new Map(), // token -> playerId
            activeGameId: null,
            controllerLayoutType: null,
            roomState: 'LOBBY', // 'LOBBY' | 'IN_GAME'
            createdAt: Date.now()
        };

        this.rooms.set(roomId, room);
        this.socketToRoom.set(hostWs, { roomId, role: 'host', hostId });

        return room;
    }

    /**
     * Retrieves room by ID (case-insensitive).
     */
    getRoom(roomId) {
        if (!roomId) return null;
        return this.rooms.get(roomId.toUpperCase()) || null;
    }

    /**
     * Reconnects a host if within grace period.
     */
    reconnectHost(hostWs, roomId, hostToken) {
        const room = this.getRoom(roomId);
        if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };
        if (room.hostToken !== hostToken) return { success: false, error: 'INVALID_HOST_TOKEN' };

        if (room.hostDisconnectTimer) {
            clearTimeout(room.hostDisconnectTimer);
            room.hostDisconnectTimer = null;
        }

        room.hostSocket = hostWs;
        room.hostConnected = true;
        this.socketToRoom.set(hostWs, { roomId: room.roomId, role: 'host', hostId: room.hostId });

        return {
            success: true,
            room: this.getRoomPublicState(room)
        };
    }

    /**
     * Player joins or reconnects to a room.
     */
    joinPlayer(playerWs, roomId, { name, color, playerId, playerToken }) {
        const room = this.getRoom(roomId);
        if (!room) {
            return { success: false, error: 'ROOM_NOT_FOUND' };
        }

        // Reconnection check
        if (playerId && room.players.has(playerId)) {
            const existing = room.players.get(playerId);
            const tokenMatches = !playerToken || existing.token === playerToken;
            if (tokenMatches) {
                if (existing.disconnectTimer) {
                    clearTimeout(existing.disconnectTimer);
                    existing.disconnectTimer = null;
                }
                existing.socket = playerWs;
                existing.connected = true;
                existing.lastSeen = Date.now();
                this.socketToRoom.set(playerWs, { roomId: room.roomId, role: 'player', playerId });

                return {
                    success: true,
                    reconnected: true,
                    player: this.sanitizePlayer(existing),
                    room: this.getRoomPublicState(room)
                };
            }
        }

        // Check if room is full
        const activePlayersCount = Array.from(room.players.values()).filter(p => p.connected).length;
        if (activePlayersCount >= this.maxPlayers) {
            return { success: false, error: 'ROOM_FULL' };
        }

        // Generate player identity
        const newPlayerId = 'p_' + crypto.randomBytes(4).toString('hex');
        const token = crypto.randomBytes(16).toString('hex');
        const sanitizedName = (name && String(name).trim().slice(0, 16)) || `Player ${room.players.size + 1}`;
        
        // Pick an available color if none provided or already taken
        const usedColors = new Set(Array.from(room.players.values()).map(p => p.color));
        let chosenColor = color;
        if (!chosenColor || usedColors.has(chosenColor)) {
            chosenColor = DEFAULT_PARTY_COLORS.find(c => !usedColors.has(c)) || DEFAULT_PARTY_COLORS[room.players.size % DEFAULT_PARTY_COLORS.length];
        }

        const player = {
            id: newPlayerId,
            token,
            socket: playerWs,
            name: sanitizedName,
            color: chosenColor,
            isReady: false,
            score: 0,
            connected: true,
            lastSeen: Date.now(),
            disconnectTimer: null
        };

        room.players.set(newPlayerId, player);
        room.playerTokens.set(token, newPlayerId);
        this.socketToRoom.set(playerWs, { roomId: room.roomId, role: 'player', playerId: newPlayerId });

        return {
            success: true,
            reconnected: false,
            player: this.sanitizePlayer(player),
            token,
            room: this.getRoomPublicState(room)
        };
    }

    /**
     * Toggles or updates player ready status.
     */
    setPlayerReady(roomId, playerId, isReady) {
        const room = this.getRoom(roomId);
        if (!room) return null;

        const player = room.players.get(playerId);
        if (!player) return null;

        player.isReady = Boolean(isReady);
        player.lastSeen = Date.now();

        return {
            player: this.sanitizePlayer(player),
            roomState: this.getRoomPublicState(room)
        };
    }

    /**
     * Selects active game in lobby.
     */
    selectGame(roomId, gameId, gameTitle) {
        const room = this.getRoom(roomId);
        if (!room) return null;

        room.activeGameId = gameId;
        room.activeGameTitle = gameTitle;

        return {
            activeGameId: gameId,
            activeGameTitle: gameTitle
        };
    }

    /**
     * Starts game from host.
     */
    startGame(roomId, gameId, controllerLayoutType) {
        const room = this.getRoom(roomId);
        if (!room) return null;

        room.activeGameId = gameId;
        room.controllerLayoutType = controllerLayoutType || 'BUZZER';
        room.roomState = 'IN_GAME';

        return {
            gameId,
            controllerLayoutType: room.controllerLayoutType,
            players: this.getPlayersList(room)
        };
    }

    /**
     * Resets room back to lobby.
     */
    returnToLobby(roomId) {
        const room = this.getRoom(roomId);
        if (!room) return null;

        room.roomState = 'LOBBY';
        room.controllerLayoutType = null;
        // Reset player ready states for next game round
        for (const player of room.players.values()) {
            player.isReady = false;
        }

        return this.getRoomPublicState(room);
    }

    /**
     * Updates player scores or game state.
     */
    updateScore(roomId, playerId, deltaOrTotal, isAbsolute = false) {
        const room = this.getRoom(roomId);
        if (!room) return null;

        const player = room.players.get(playerId);
        if (!player) return null;

        if (isAbsolute) {
            player.score = deltaOrTotal;
        } else {
            player.score = (player.score || 0) + deltaOrTotal;
        }

        return this.sanitizePlayer(player);
    }

    /**
     * Handles socket disconnect for host or player with grace periods.
     */
    handleDisconnect(ws, onRoomClosed, onPlayerLeft) {
        const binding = this.socketToRoom.get(ws);
        if (!binding) return;

        this.socketToRoom.delete(ws);
        const { roomId, role, playerId } = binding;
        const room = this.getRoom(roomId);
        if (!room) return;

        if (role === 'host') {
            room.hostConnected = false;
            room.hostSocket = null;

            // Start host grace period timer
            room.hostDisconnectTimer = setTimeout(() => {
                // Room cleanup if host does not reconnect
                this.destroyRoom(roomId);
                if (typeof onRoomClosed === 'function') {
                    onRoomClosed(roomId, 'HOST_DISCONNECTED_TIMEOUT');
                }
            }, this.hostGracePeriodMs);

        } else if (role === 'player' && playerId) {
            const player = room.players.get(playerId);
            if (!player) return;

            player.connected = false;
            player.socket = null;
            player.lastSeen = Date.now();

            if (typeof onPlayerLeft === 'function') {
                onPlayerLeft(roomId, player, false); // disconnected (grace period started)
            }

            // Start player grace period timer
            player.disconnectTimer = setTimeout(() => {
                // Player failed to reconnect within grace period
                if (room.roomState === 'LOBBY') {
                    room.players.delete(playerId);
                }
                if (typeof onPlayerLeft === 'function') {
                    onPlayerLeft(roomId, player, true); // permanently removed
                }
            }, this.playerGracePeriodMs);
        }
    }

    /**
     * Completely destroys a room and cleans up resources.
     */
    destroyRoom(roomId) {
        const room = this.getRoom(roomId);
        if (!room) return;

        if (room.hostDisconnectTimer) {
            clearTimeout(room.hostDisconnectTimer);
        }

        for (const player of room.players.values()) {
            if (player.disconnectTimer) {
                clearTimeout(player.disconnectTimer);
            }
            if (player.socket) {
                this.socketToRoom.delete(player.socket);
            }
        }

        if (room.hostSocket) {
            this.socketToRoom.delete(room.hostSocket);
        }

        this.rooms.delete(roomId);
    }

    /**
     * Helper to return clean player array.
     */
    getPlayersList(room) {
        return Array.from(room.players.values()).map(p => this.sanitizePlayer(p));
    }

    /**
     * Strips sensitive socket references and internal tokens.
     */
    sanitizePlayer(player) {
        return {
            id: player.id,
            name: player.name,
            color: player.color,
            isReady: player.isReady,
            score: player.score,
            connected: player.connected
        };
    }

    /**
     * Returns sanitized public room representation.
     */
    getRoomPublicState(room) {
        const players = this.getPlayersList(room);
        const connectedPlayers = players.filter(p => p.connected);
        const allReady = connectedPlayers.length > 0 && connectedPlayers.every(p => p.isReady);

        return {
            roomId: room.roomId,
            hostConnected: room.hostConnected,
            players,
            activeGameId: room.activeGameId,
            activeGameTitle: room.activeGameTitle || null,
            controllerLayoutType: room.controllerLayoutType,
            roomState: room.roomState,
            allReady,
            playerCount: players.length
        };
    }
}

module.exports = RoomManager;
