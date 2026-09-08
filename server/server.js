const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { WebSocketServer, WebSocket } = require('ws');

const RoomManager = require('./roomManager');
const { getLocalNetworkIp, getControllerUrl } = require('./networkUtils');
const QRCode = require('qrcode');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const roomManager = new RoomManager();

// Directory paths
const TV_DIR = path.resolve(__dirname, '../tv');
const CONTROLLER_DIR = path.resolve(__dirname, '../controller');
const SHARED_PHASER = path.resolve(__dirname, '../wwwroot/js/phaser.min.js');

// MIME types
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

/**
 * Static file server handler
 */
function serveStaticFile(req, res, filePath, contentType) {
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            res.end(content);
        }
    });
}

/**
 * Native HTTP server
 */
const server = http.createServer((req, res) => {
    // CORS headers for local LAN party development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = parsedUrl.pathname;

    // Health check / API status
    if (pathname === '/health' || pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            lanIp: getLocalNetworkIp(),
            activeRooms: roomManager.rooms.size,
            uptime: process.uptime()
        }));
        return;
    }

    // Direct Phaser library route for standalone TV display
    if (pathname === '/js/phaser.min.js' || pathname === '/phaser.min.js') {
        serveStaticFile(req, res, SHARED_PHASER, 'application/javascript; charset=UTF-8');
        return;
    }

    // /play?room=XXXX route -> serves controller/index.html
    if (pathname === '/play') {
        serveStaticFile(req, res, path.join(CONTROLLER_DIR, 'index.html'), 'text/html; charset=UTF-8');
        return;
    }

    // Controller route (/controller/...)
    if (pathname.startsWith('/controller')) {
        let subPath = pathname.replace(/^\/controller/, '');
        if (!subPath || subPath === '/') subPath = '/index.html';
        const targetPath = path.join(CONTROLLER_DIR, subPath);
        const ext = path.extname(targetPath).toLowerCase();
        serveStaticFile(req, res, targetPath, MIME_TYPES[ext] || 'application/octet-stream');
        return;
    }

    // TV route (/tv/...)
    if (pathname.startsWith('/tv')) {
        let subPath = pathname.replace(/^\/tv/, '');
        if (!subPath || subPath === '/') subPath = '/index.html';
        const targetPath = path.join(TV_DIR, subPath);
        const ext = path.extname(targetPath).toLowerCase();
        serveStaticFile(req, res, targetPath, MIME_TYPES[ext] || 'application/octet-stream');
        return;
    }

    // Root route: Redirect to /tv if TV browser, or display quick index
    if (pathname === '/' || pathname === '') {
        // Serve a landing page with TV and Controller links
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Party Game System</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #111; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; margin: 0; }
        .card { background: #222; padding: 2rem 3rem; border-radius: 12px; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        h1 { color: #00D2D3; margin-bottom: 0.5rem; }
        p { color: #aaa; margin-bottom: 2rem; }
        .btn { display: inline-block; padding: 12px 24px; margin: 0 10px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 1.1rem; }
        .btn-tv { background: #FF4757; color: white; }
        .btn-play { background: #2ED573; color: black; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Hotel Smart TV Party System</h1>
        <p>Phaser 3 Room &amp; Lobby Architecture</p>
        <a class="btn btn-tv" href="/tv/">Open Host TV Screen</a>
        <a class="btn btn-play" href="/play">Open Controller</a>
    </div>
</body>
</html>`);
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

/**
 * WebSocket Server
 */
const wss = new WebSocketServer({ server });

/**
 * Standardized message transmission helper
 */
function sendMsg(ws, type, roomId, senderId, payload = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
        ws.send(JSON.stringify({
            type,
            roomId: roomId || '',
            senderId: senderId || 'server',
            payload
        }));
    } catch (err) {
        console.error('Failed to send WebSocket message:', err);
    }
}

/**
 * Broadcasts to all connected players in a room
 */
function broadcastToPlayers(room, type, payload, excludePlayerId = null) {
    if (!room) return;
    for (const [pId, player] of room.players.entries()) {
        if (pId !== excludePlayerId && player.socket && player.socket.readyState === WebSocket.OPEN) {
            sendMsg(player.socket, type, room.roomId, 'server', payload);
        }
    }
}

/**
 * Broadcasts to host and all players in a room
 */
function broadcastToRoom(room, type, payload) {
    if (!room) return;
    if (room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
        sendMsg(room.hostSocket, type, room.roomId, 'server', payload);
    }
    broadcastToPlayers(room, type, payload);
}

// Heartbeat ping interval
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        try {
            ws.ping();
        } catch (e) {
            ws.terminate();
        }
    });
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

wss.on('connection', (ws, req) => {
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', async (rawData) => {
        let msg;
        try {
            msg = JSON.parse(rawData.toString());
        } catch (err) {
            console.error('Malformed WebSocket message:', rawData.toString());
            sendMsg(ws, 'ERROR', '', 'server', { error: 'MALFORMED_JSON' });
            return;
        }

        let { type, roomId, senderId, payload = {} } = msg;
        roomId = (roomId || payload.roomId || '').toUpperCase().trim();

        switch (type) {
            case 'PING': {
                sendMsg(ws, 'PONG', roomId, 'server', { timestamp: Date.now() });
                break;
            }

            // ==========================================
            // HOST ACTIONS
            // ==========================================
            case 'ROOM_CREATE': {
                const activePort = server.address() ? server.address().port : PORT;
                const room = roomManager.createRoom(ws, payload.hostName || 'TV Host');
                const controllerUrl = getControllerUrl(activePort, room.roomId, payload.customHost || null);

                let qrModules = null;
                let qrDataUrl = null;
                try {
                    const qr = QRCode.create(controllerUrl, { errorCorrectionLevel: 'M' });
                    qrModules = { size: qr.modules.size, data: Array.from(qr.modules.data) };
                    qrDataUrl = await QRCode.toDataURL(controllerUrl, { margin: 4, scale: 8 });
                } catch (e) {
                    console.error('[Host] QR generation error:', e);
                }

                sendMsg(ws, 'ROOM_CREATED', room.roomId, 'server', {
                    roomId: room.roomId,
                    hostId: room.hostId,
                    hostToken: room.hostToken,
                    controllerUrl,
                    qrModules,
                    qrDataUrl,
                    serverTime: Date.now()
                });
                console.log(`[Host] Room created: ${room.roomId} -> ${controllerUrl}`);
                break;
            }

            case 'HOST_RECONNECT': {
                const result = roomManager.reconnectHost(ws, roomId, payload.hostToken);
                if (result.success) {
                    const activePort = server.address() ? server.address().port : PORT;
                    const controllerUrl = getControllerUrl(activePort, roomId, payload.customHost || null);

                    let qrModules = null;
                    let qrDataUrl = null;
                    try {
                        const qr = QRCode.create(controllerUrl, { errorCorrectionLevel: 'M' });
                        qrModules = { size: qr.modules.size, data: Array.from(qr.modules.data) };
                        qrDataUrl = await QRCode.toDataURL(controllerUrl, { margin: 4, scale: 8 });
                    } catch (e) {
                        console.error('[Host] QR generation error:', e);
                    }

                    sendMsg(ws, 'HOST_RECONNECTED', roomId, 'server', {
                        roomId,
                        controllerUrl,
                        qrModules,
                        qrDataUrl,
                        roomState: result.room
                    });
                    console.log(`[Host] Host reconnected to room: ${roomId}`);
                } else {
                    sendMsg(ws, 'ERROR', roomId, 'server', { code: result.error, message: 'Host reconnection failed' });
                }
                break;
            }

            case 'GAME_SELECT': {
                const room = roomManager.getRoom(roomId);
                if (!room) {
                    sendMsg(ws, 'ERROR', roomId, 'server', { code: 'ROOM_NOT_FOUND' });
                    return;
                }
                roomManager.selectGame(roomId, payload.gameId, payload.gameTitle);
                broadcastToPlayers(room, 'GAME_SELECT', {
                    gameId: payload.gameId,
                    gameTitle: payload.gameTitle
                });
                break;
            }

            case 'GAME_START': {
                const room = roomManager.getRoom(roomId);
                if (!room) {
                    sendMsg(ws, 'ERROR', roomId, 'server', { code: 'ROOM_NOT_FOUND' });
                    return;
                }
                const gameData = roomManager.startGame(roomId, payload.gameId, payload.controllerLayoutType);
                // Broadcast to controllers with dynamic layout skin requirement
                broadcastToPlayers(room, 'GAME_START', {
                    gameId: payload.gameId,
                    controllerLayoutType: payload.controllerLayoutType || 'BUZZER',
                    config: payload.config || {}
                });
                // Confirm to host
                sendMsg(ws, 'GAME_STARTED', roomId, 'server', gameData);
                console.log(`[Game] Started in room ${roomId}: ${payload.gameId} (${payload.controllerLayoutType})`);
                break;
            }

            case 'SCORE_UPDATE': {
                const room = roomManager.getRoom(roomId);
                if (!room) return;
                const updatedPlayer = roomManager.updateScore(roomId, payload.playerId, payload.deltaOrTotal, payload.isAbsolute);
                if (updatedPlayer) {
                    broadcastToRoom(room, 'SCORE_UPDATED', {
                        player: updatedPlayer,
                        allScores: roomManager.getPlayersList(room)
                    });
                }
                break;
            }

            case 'GAME_OVER': {
                const room = roomManager.getRoom(roomId);
                if (!room) return;
                broadcastToPlayers(room, 'GAME_OVER', {
                    winner: payload.winner || null,
                    finalScores: payload.finalScores || roomManager.getPlayersList(room)
                });
                break;
            }

            case 'RETURN_TO_LOBBY': {
                const room = roomManager.getRoom(roomId);
                if (!room) return;
                const publicState = roomManager.returnToLobby(roomId);
                broadcastToRoom(room, 'RETURN_TO_LOBBY', {
                    roomState: publicState
                });
                console.log(`[Game] Returned to lobby in room ${roomId}`);
                break;
            }

            // ==========================================
            // PLAYER / CONTROLLER ACTIONS
            // ==========================================
            case 'PLAYER_JOIN': {
                const result = roomManager.joinPlayer(ws, roomId, {
                    name: payload.name,
                    color: payload.color,
                    playerId: payload.playerId,
                    playerToken: payload.playerToken
                });

                if (!result.success) {
                    sendMsg(ws, 'JOIN_ERROR', roomId, 'server', { code: result.error });
                    return;
                }

                const room = roomManager.getRoom(roomId);

                // Send confirmation to the joining controller
                sendMsg(ws, 'PLAYER_JOINED', roomId, 'server', {
                    player: result.player,
                    playerToken: result.token,
                    reconnected: result.reconnected,
                    roomState: result.room
                });

                // Notify TV Host and other controllers
                if (room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
                    sendMsg(room.hostSocket, 'PLAYER_JOINED', roomId, 'server', {
                        player: result.player,
                        players: result.room.players,
                        allReady: result.room.allReady
                    });
                }

                broadcastToPlayers(room, 'LOBBY_STATE_UPDATE', {
                    players: result.room.players,
                    allReady: result.room.allReady
                }, result.player.id);

                console.log(`[Player] ${result.player.name} (${result.player.id}) joined room ${roomId}`);
                break;
            }

            case 'PLAYER_READY': {
                const update = roomManager.setPlayerReady(roomId, senderId, payload.isReady);
                if (!update) return;

                const room = roomManager.getRoom(roomId);
                broadcastToRoom(room, 'LOBBY_STATE_UPDATE', {
                    player: update.player,
                    players: update.roomState.players,
                    allReady: update.roomState.allReady
                });
                break;
            }

            // ==========================================
            // HIGH-FREQUENCY CONTROLLER INPUT
            // ==========================================
            case 'CONTROLLER_INPUT': {
                const room = roomManager.getRoom(roomId);
                if (!room || !room.hostSocket || room.hostSocket.readyState !== WebSocket.OPEN) {
                    return;
                }

                // Forward input directly to TV Host with zero serialization overhead
                sendMsg(room.hostSocket, 'PLAYER_INPUT', roomId, senderId, {
                    playerId: senderId,
                    inputType: payload.inputType,   // 'button_down' | 'button_up' | 'choice' | 'analog'
                    action: payload.action,         // 'BUZZ', 'A', 'B', 'CHOICE_0', etc.
                    value: payload.value,
                    clientTime: payload.timestamp || Date.now(),
                    serverReceiveTime: Date.now()
                });
                break;
            }

            default:
                console.warn(`[WS] Unknown message type: ${type}`);
        }
    });

    ws.on('close', () => {
        roomManager.handleDisconnect(
            ws,
            // onRoomClosed
            (roomId, reason) => {
                console.log(`[Room] Room ${roomId} destroyed (${reason})`);
            },
            // onPlayerLeft
            (roomId, player, permanent) => {
                const room = roomManager.getRoom(roomId);
                if (!room) return;

                console.log(`[Player] ${player.name} (${player.id}) disconnected from ${roomId} (permanent: ${permanent})`);

                const eventType = permanent ? 'PLAYER_LEFT' : 'PLAYER_DISCONNECTED';
                const payload = {
                    playerId: player.id,
                    name: player.name,
                    permanent,
                    players: roomManager.getPlayersList(room)
                };

                if (room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
                    sendMsg(room.hostSocket, eventType, roomId, 'server', payload);
                }
                broadcastToPlayers(room, 'LOBBY_STATE_UPDATE', {
                    players: payload.players,
                    allReady: roomManager.getRoomPublicState(room).allReady
                });
            }
        );
    });

    ws.on('error', (err) => {
        console.error('[WS] Socket error:', err.message);
    });
});

/**
 * Start Server
 */
function start(port = PORT, host = HOST) {
    return new Promise((resolve) => {
        server.listen(port, host, () => {
            const lanIp = getLocalNetworkIp();
            console.log('====================================================');
            console.log(`  Hotel Smart TV Game Server running on port ${port}`);
            console.log(`  Local TV Host URL:    http://localhost:${port}/tv/`);
            console.log(`  LAN TV Host URL:      http://${lanIp}:${port}/tv/`);
            console.log(`  Mobile Controller:    http://${lanIp}:${port}/play`);
            console.log(`  WebSocket Endpoint:   ws://${lanIp}:${port}`);
            console.log('====================================================');
            resolve({ server, wss, port, lanIp });
        });
    });
}

function stop() {
    return new Promise((resolve) => {
        clearInterval(heartbeatInterval);
        wss.close(() => {
            server.close(() => {
                resolve();
            });
        });
    });
}

// Auto-run if executed directly
if (require.main === module) {
    start();
}

module.exports = {
    server,
    wss,
    roomManager,
    start,
    stop
};
