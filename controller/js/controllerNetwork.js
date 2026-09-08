/**
 * WebSocket Network Client for Mobile Controller
 */
class ControllerNetwork {
    constructor() {
        this.ws = null;
        this.listeners = new Map(); // eventType -> Set of callbacks
        this.isConnected = false;
        this.roomId = null;
        this.playerId = null;
        this.playerToken = null;
        this.pingInterval = null;
    }

    /**
     * Connect to WebSocket server
     */
    connect(customServerUrl = null) {
        return new Promise((resolve, reject) => {
            let wsUrl;
            if (customServerUrl) {
                wsUrl = customServerUrl;
            } else {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                wsUrl = `${protocol}//${window.location.host}`;
            }

            console.log('[Net] Connecting to:', wsUrl);
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.isConnected = true;
                console.log('[Net] Connected.');
                this.startPing();
                this.emit('connected', {});
                resolve();
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleMessage(msg);
                } catch (err) {
                    console.error('[Net] Error parsing WS message:', err);
                }
            };

            this.ws.onerror = (err) => {
                console.error('[Net] WebSocket error:', err);
                this.emit('error', err);
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.stopPing();
                console.warn('[Net] Connection closed.');
                this.emit('disconnected', {});
            };
        });
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

    /**
     * Sends standardized JSON envelope
     */
    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[Net] Cannot send, socket not open:', type);
            return false;
        }

        const envelope = {
            type,
            roomId: this.roomId || payload.roomId || '',
            senderId: this.playerId || 'anonymous',
            payload
        };

        this.ws.send(JSON.stringify(envelope));
        return true;
    }

    /**
     * Send low-latency controller input
     */
    sendInput(action, inputType = 'button_down', value = null) {
        return this.send('CONTROLLER_INPUT', {
            action,
            inputType,
            value,
            timestamp: Date.now()
        });
    }

    /**
     * Internal message routing
     */
    handleMessage(msg) {
        const { type, roomId, senderId, payload } = msg;

        // Auto-capture session IDs
        if (type === 'PLAYER_JOINED' && payload.player) {
            this.roomId = roomId;
            this.playerId = payload.player.id;
            if (payload.playerToken) {
                this.playerToken = payload.playerToken;
            }
        }

        const callbacks = this.listeners.get(type);
        if (callbacks) {
            for (const cb of callbacks) {
                cb(payload, msg);
            }
        }
    }

    /**
     * Event listener registration
     */
    on(type, callback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type).add(callback);
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
}

window.controllerNetwork = new ControllerNetwork();
