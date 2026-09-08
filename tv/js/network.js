/**
 * WebSocket Network Client for Host TV Screen
 */
class TvHostNetwork {
    constructor() {
        this.ws = null;
        this.listeners = new Map();
        this.isConnected = false;
        this.roomId = null;
        this.hostToken = null;
        this.controllerUrl = null;
        this.pingInterval = null;
        this.reconnectTimer = null;
    }

    getCandidates() {
        const list = [];
        try {
            const saved = localStorage.getItem('tv_server_url');
            if (saved) list.push(saved);
        } catch (e) {}

        if (window.PARTY_SERVER_URL) list.push(window.PARTY_SERVER_URL);

        // Android Emulator host loopback
        list.push('ws://10.0.2.2:3000');

        // Server local LAN IP
        list.push('ws://192.168.1.60:3000');

        // If running in browser with valid hostname
        const host = window.location.hostname;
        if (host && host !== '0.0.0.1' && host !== '0.0.0.0' && host !== 'localhost' && host !== '127.0.0.1') {
            const port = window.location.port || '3000';
            list.push(`ws://${host}:${port}`);
        }

        // Localhost loopback
        list.push('ws://127.0.0.1:3000');
        list.push('ws://localhost:3000');

        return Array.from(new Set(list));
    }

    /**
     * Connect to server WebSocket with candidate probing
     */
    async connect(customServerUrl = null) {
        if (customServerUrl) {
            return this.probeUrl(customServerUrl, 3000);
        }

        const candidates = this.getCandidates();
        console.log('[TV Net] Probing server candidate URLs:', candidates);

        for (const url of candidates) {
            const ok = await this.probeUrl(url, 1500);
            if (ok) {
                console.log('[TV Net] Connected to server at:', url);
                try { localStorage.setItem('tv_server_url', url); } catch (e) {}
                return true;
            }
        }

        console.warn('[TV Net] All server candidates failed.');
        return false;
    }

    probeUrl(url, timeoutMs = 1500) {
        return new Promise((resolve) => {
            let finished = false;
            let testWs = null;

            const timer = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    if (testWs) {
                        try { testWs.close(); } catch (e) {}
                    }
                    resolve(false);
                }
            }, timeoutMs);

            try {
                testWs = new WebSocket(url);
                testWs.onopen = () => {
                    if (!finished) {
                        finished = true;
                        clearTimeout(timer);
                        this.ws = testWs;
                        this.isConnected = true;
                        this.bindSocketEvents();
                        this.startPing();
                        this.emit('connected', {});
                        resolve(true);
                    }
                };

                testWs.onerror = () => {
                    if (!finished) {
                        finished = true;
                        clearTimeout(timer);
                        resolve(false);
                    }
                };

                testWs.onclose = () => {
                    if (!finished) {
                        finished = true;
                        clearTimeout(timer);
                        resolve(false);
                    }
                };
            } catch (err) {
                if (!finished) {
                    finished = true;
                    clearTimeout(timer);
                    resolve(false);
                }
            }
        });
    }

    bindSocketEvents() {
        if (!this.ws) return;

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (err) {
                console.error('[TV Net] Malformed message:', err);
            }
        };

        this.ws.onerror = (err) => {
            console.error('[TV Net] WebSocket error:', err);
            this.emit('error', err);
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            this.stopPing();
            console.warn('[TV Net] Socket closed.');
            this.emit('disconnected', {});
        };
    }

    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                this.send('PING', {});
            }
        }, 20000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[TV Net] Socket not open, cannot send:', type);
            return false;
        }

        const envelope = {
            type,
            roomId: this.roomId || '',
            senderId: 'host_tv',
            payload
        };

        this.ws.send(JSON.stringify(envelope));
        return true;
    }

    createRoom(hostName = 'TV Lounge') {
        return this.send('ROOM_CREATE', { hostName });
    }

    selectGame(gameId, gameTitle) {
        return this.send('GAME_SELECT', { gameId, gameTitle });
    }

    startGame(gameId, controllerLayoutType = 'BUZZER', config = {}) {
        return this.send('GAME_START', { gameId, controllerLayoutType, config });
    }

    updateScore(playerId, deltaOrTotal, isAbsolute = false) {
        return this.send('SCORE_UPDATE', { playerId, deltaOrTotal, isAbsolute });
    }

    gameOver(winner, finalScores) {
        return this.send('GAME_OVER', { winner, finalScores });
    }

    returnToLobby() {
        return this.send('RETURN_TO_LOBBY', {});
    }

    handleMessage(msg) {
        const { type, roomId, senderId, payload } = msg;

        if (type === 'ROOM_CREATED') {
            this.roomId = payload.roomId;
            this.hostToken = payload.hostToken;
            this.controllerUrl = payload.controllerUrl;
            this.qrModules = payload.qrModules;
            this.qrDataUrl = payload.qrDataUrl;
            sessionStorage.setItem('tv_host_room', this.roomId);
            sessionStorage.setItem('tv_host_token', this.hostToken);
        } else if (type === 'HOST_RECONNECTED') {
            this.roomId = payload.roomId;
            this.controllerUrl = payload.controllerUrl;
            this.qrModules = payload.qrModules;
            this.qrDataUrl = payload.qrDataUrl;
        }

        const callbacks = this.listeners.get(type);
        if (callbacks) {
            for (const cb of callbacks) {
                cb(payload, msg);
            }
        }
    }

    on(type, callback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type).add(callback);
        return () => this.off(type, callback);
    }

    off(type, callback) {
        if (this.listeners.has(type)) {
            this.listeners.get(type).delete(callback);
        }
    }

    emit(type, data) {
        const callbacks = this.listeners.get(type);
        if (callbacks) {
            for (const cb of callbacks) {
                cb(data);
            }
        }
    }

    disconnect() {
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }
}

window.tvHostNetwork = new TvHostNetwork();
