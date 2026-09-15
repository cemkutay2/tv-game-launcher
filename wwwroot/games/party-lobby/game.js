/**
 * Party Room & Lobby Launcher Integration
 * Designed for TV Game Launcher (Phaser 3.8)
 */

(function() {
    // -------------------------------------------------------------------------
    // 1. QR Code Generator (Pure JavaScript, Zero Dependencies)
    // -------------------------------------------------------------------------
    const EXP_TABLE = new Uint8Array(256);
    const LOG_TABLE = new Uint8Array(256);
    for (let i = 0, x = 1; i < 255; i++) {
        EXP_TABLE[i] = x;
        LOG_TABLE[x] = i;
        x <<= 1;
        if (x & 256) x ^= 0x11d;
    }
    EXP_TABLE[255] = EXP_TABLE[0];

    function glog(n) { return LOG_TABLE[n]; }
    function gexp(n) {
        while (n < 0) n += 255;
        while (n >= 255) n -= 255;
        return EXP_TABLE[n];
    }

    function polyMultiply(p1, p2) {
        const num = new Uint8Array(p1.length + p2.length - 1);
        for (let i = 0; i < p1.length; i++) {
            for (let j = 0; j < p2.length; j++) {
                num[i + j] ^= gexp(glog(p1[i]) + glog(p2[j]));
            }
        }
        return num;
    }

    function polyMod(dividend, divisor) {
        let result = new Uint8Array(dividend);
        while (result.length >= divisor.length) {
            const coeff = result[0];
            if (coeff !== 0) {
                const logCoeff = glog(coeff);
                for (let i = 0; i < divisor.length; i++) {
                    result[i] ^= gexp(logCoeff + glog(divisor[i]));
                }
            }
            let lead = 0;
            while (lead < result.length && result[lead] === 0) lead++;
            result = result.subarray(lead);
        }
        return result;
    }

    function getGeneratorPoly(degree) {
        let poly = new Uint8Array([1]);
        for (let i = 0; i < degree; i++) {
            poly = polyMultiply(poly, new Uint8Array([1, gexp(i)]));
        }
        return poly;
    }

    const VERSION_SPECS = [
        null,
        { ver: 1, size: 21, totalDataBytes: 16, ecBytes: 10, totalCodewords: 26 },
        { ver: 2, size: 25, totalDataBytes: 28, ecBytes: 16, totalCodewords: 44 },
        { ver: 3, size: 29, totalDataBytes: 44, ecBytes: 26, totalCodewords: 70 },
        { ver: 4, size: 33, totalDataBytes: 64, ecBytes: 36, totalCodewords: 100 },
        { ver: 5, size: 37, totalDataBytes: 86, ecBytes: 48, totalCodewords: 134 }
    ];

    const ALIGN_PATTERNS = [null, [], [6, 18], [6, 22], [6, 26], [6, 30]];

    function pickVersion(dataLen) {
        for (let v = 1; v <= 5; v++) {
            if (dataLen + 2 <= VERSION_SPECS[v].totalDataBytes) return VERSION_SPECS[v];
        }
        return VERSION_SPECS[5];
    }

    class BitBuffer {
        constructor() { this.buffer = []; this.length = 0; }
        put(num, length) {
            for (let i = 0; i < length; i++) {
                this.putBit(((num >>> (length - i - 1)) & 1) === 1);
            }
        }
        putBit(bit) {
            const byteIndex = Math.floor(this.length / 8);
            if (this.buffer.length <= byteIndex) this.buffer.push(0);
            if (bit) this.buffer[byteIndex] |= (0x80 >>> (this.length % 8));
            this.length++;
        }
    }

    class QRCode {
        constructor(text) {
            this.text = text;
            const utf8Bytes = [];
            for (let i = 0; i < text.length; i++) {
                let c = text.charCodeAt(i);
                if (c < 128) utf8Bytes.push(c);
                else if (c < 2048) utf8Bytes.push((c >> 6) | 192, (c & 63) | 128);
                else utf8Bytes.push((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128);
            }
            this.rawBytes = utf8Bytes;
            this.spec = pickVersion(utf8Bytes.length);
            this.size = this.spec.size;
            this.modules = Array.from({ length: this.size }, () => Array(this.size).fill(null));
            this.isReserved = Array.from({ length: this.size }, () => Array(this.size).fill(false));
            this.buildMatrix();
        }

        buildMatrix() {
            this.setupPositionPatterns();
            this.setupTimingPatterns();
            this.setupAlignmentPatterns();
            this.reserveFormatInfo();
            const dataBits = this.createDataBits();
            this.placeDataBits(dataBits);
            this.applyBestMask();
        }

        setupPositionPattern(row, col) {
            for (let r = -1; r <= 7; r++) {
                for (let c = -1; c <= 7; c++) {
                    const currRow = row + r;
                    const currCol = col + c;
                    if (currRow >= 0 && currRow < this.size && currCol >= 0 && currCol < this.size) {
                        this.isReserved[currRow][currCol] = true;
                        if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                            (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                            this.modules[currRow][currCol] = true;
                        } else {
                            this.modules[currRow][currCol] = false;
                        }
                    }
                }
            }
        }

        setupPositionPatterns() {
            this.setupPositionPattern(0, 0);
            this.setupPositionPattern(0, this.size - 7);
            this.setupPositionPattern(this.size - 7, 0);
        }

        setupTimingPatterns() {
            for (let i = 8; i < this.size - 8; i++) {
                const val = (i % 2 === 0);
                if (!this.isReserved[6][i]) { this.modules[6][i] = val; this.isReserved[6][i] = true; }
                if (!this.isReserved[i][6]) { this.modules[i][6] = val; this.isReserved[i][6] = true; }
            }
        }

        setupAlignmentPatterns() {
            const coords = ALIGN_PATTERNS[this.spec.ver];
            if (!coords) return;
            for (const r of coords) {
                for (const c of coords) {
                    if (this.isReserved[r][c]) continue;
                    for (let y = -2; y <= 2; y++) {
                        for (let x = -2; x <= 2; x++) {
                            this.modules[r + y][c + x] = Math.abs(x) === 2 || Math.abs(y) === 2 || (x === 0 && y === 0);
                            this.isReserved[r + y][c + x] = true;
                        }
                    }
                }
            }
        }

        reserveFormatInfo() {
            for (let i = 0; i < 9; i++) {
                if (i < this.size) { this.isReserved[i][8] = true; this.isReserved[8][i] = true; }
            }
            for (let i = 0; i < 8; i++) {
                this.isReserved[this.size - 1 - i][8] = true;
                this.isReserved[8][this.size - 1 - i] = true;
            }
        }

        createDataBits() {
            const bb = new BitBuffer();
            bb.put(4, 4);
            bb.put(this.rawBytes.length, 8);
            for (const b of this.rawBytes) bb.put(b, 8);
            const totalBits = this.spec.totalDataBytes * 8;
            for (let i = 0; i < 4 && bb.length < totalBits; i++) bb.putBit(false);
            while (bb.length % 8 !== 0) bb.putBit(false);
            const padBytes = [0xEC, 0x11];
            let padIdx = 0;
            while (bb.length < totalBits) { bb.put(padBytes[padIdx % 2], 8); padIdx++; }

            const dataBytes = new Uint8Array(bb.buffer.slice(0, this.spec.totalDataBytes));
            const genPoly = getGeneratorPoly(this.spec.ecBytes);
            const paddedData = new Uint8Array(dataBytes.length + this.spec.ecBytes);
            paddedData.set(dataBytes);
            const ecBytes = polyMod(paddedData, genPoly);

            const finalCodewords = new Uint8Array(this.spec.totalCodewords);
            finalCodewords.set(dataBytes, 0);
            finalCodewords.set(ecBytes, dataBytes.length);

            const bits = [];
            for (let i = 0; i < finalCodewords.length; i++) {
                for (let b = 7; b >= 0; b--) bits.push(((finalCodewords[i] >>> b) & 1) === 1);
            }
            return bits;
        }

        placeDataBits(bits) {
            let bitIdx = 0, dir = -1, row = this.size - 1, col = this.size - 1;
            while (col > 0) {
                if (col === 6) col--;
                for (let i = 0; i < this.size; i++) {
                    const r = row;
                    for (let c = col; c >= col - 1; c--) {
                        if (!this.isReserved[r][c]) {
                            this.modules[r][c] = bitIdx < bits.length ? bits[bitIdx++] : false;
                        }
                    }
                    row += dir;
                }
                dir = -dir;
                row += dir;
                col -= 2;
            }
        }

        applyBestMask() {
            const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
            for (let r = 0; r < this.size; r++) {
                for (let c = 0; c < this.size; c++) {
                    if (!this.isReserved[r][c] && (r + c) % 2 === 0) {
                        this.modules[r][c] = !this.modules[r][c];
                    }
                }
            }
            for (let i = 0; i < 15; i++) {
                const bit = formatBits[i] === 1;
                if (i <= 5) this.modules[i][8] = bit;
                else if (i === 6) this.modules[7][8] = bit;
                else if (i === 7) this.modules[8][8] = bit;
                else if (i === 8) this.modules[8][7] = bit;
                else this.modules[8][14 - i] = bit;

                if (i < 8) this.modules[8][this.size - i - 1] = bit;
                else this.modules[this.size - 15 + i][8] = bit;
            }
            this.modules[this.size - 8][8] = true;
        }

        renderToGraphics(graphics, x, y, sizePx = 280, colorDark = 0x000000, colorLight = 0xFFFFFF) {
            const moduleSize = sizePx / (this.size + 4);
            const quietZone = moduleSize * 2;
            graphics.fillStyle(colorLight, 1);
            graphics.fillRoundedRect(x, y, sizePx, sizePx, 16);
            graphics.fillStyle(colorDark, 1);
            for (let r = 0; r < this.size; r++) {
                for (let c = 0; c < this.size; c++) {
                    if (this.modules[r][c]) {
                        graphics.fillRect(
                            Math.round(x + quietZone + (c * moduleSize)),
                            Math.round(y + quietZone + (r * moduleSize)),
                            Math.ceil(moduleSize),
                            Math.ceil(moduleSize)
                        );
                    }
                }
            }
        }
    }

    window.QRCodeGenerator = {
        create: (text) => new QRCode(text)
    };

    // -------------------------------------------------------------------------
    // 2. Sound Synthesizer (Web Audio API)
    // -------------------------------------------------------------------------
    class SoundFx {
        constructor() { this.ctx = null; }
        init() {
            if (!this.ctx && typeof window !== 'undefined') {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        }
        playTone(freq, dur, type = 'sine', startGain = 0.25) {
            this.init();
            if (!this.ctx) return;
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                gain.gain.setValueAtTime(startGain, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + dur);
            } catch (e) {}
        }
        joinChime() {
            this.playTone(523.25, 0.15, 'triangle', 0.2);
            setTimeout(() => this.playTone(783.99, 0.25, 'triangle', 0.2), 120);
        }
        readyBeep() { this.playTone(880, 0.12, 'sine', 0.2); }
        countdownPip(isFinal = false) {
            this.playTone(isFinal ? 1046.5 : 523.25, isFinal ? 0.35 : 0.15, isFinal ? 'square' : 'sine', 0.25);
        }
        buzzerHit() {
            this.playTone(440, 0.25, 'sawtooth', 0.3);
            this.playTone(554.37, 0.25, 'sawtooth', 0.2);
        }
        victoryFanfare() {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
                setTimeout(() => this.playTone(f, 0.3, 'triangle', 0.25), idx * 120);
            });
        }
        laserShot() {
            this.init();
            if (!this.ctx) return;
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(880, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(160, this.ctx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.22, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.12);
            } catch (e) {}
        }
        ricochet() {
            this.init();
            if (!this.ctx) return;
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
                osc.frequency.linearRampToValueAtTime(1900, this.ctx.currentTime + 0.04);
                osc.frequency.exponentialRampToValueAtTime(900, this.ctx.currentTime + 0.08);
                gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.08);
            } catch (e) {}
        }
        tankHit() {
            this.playTone(220, 0.1, 'square', 0.25);
            this.playTone(110, 0.15, 'sawtooth', 0.3);
        }
        tankExplosion() {
            this.init();
            if (!this.ctx) return;
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(180, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(32, this.ctx.currentTime + 0.45);
                gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.45);
                setTimeout(() => this.playTone(85, 0.2, 'square', 0.25), 80);
            } catch (e) {}
        }
        boostSound() {
            this.init();
            if (!this.ctx) return;
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(220, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(580, this.ctx.currentTime + 0.22);
                gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.22);
            } catch (e) {}
        }
    }
    window.soundFx = new SoundFx();

    // -------------------------------------------------------------------------
    // 3. TV Host WebSocket Client
    // -------------------------------------------------------------------------
    class LauncherTvNetwork {
        constructor() {
            this.ws = null;
            this.listeners = new Map();
            this.isConnected = false;
            this.roomId = null;
            this.hostToken = null;
            this.controllerUrl = null;
            this.pingInterval = null;
        }

        getCandidates() {
            const list = [];
            try {
                const saved = localStorage.getItem('tv_server_url');
                if (saved) list.push(saved);
            } catch (e) {}

            if (window.PARTY_SERVER_URL) list.push(window.PARTY_SERVER_URL);

            // Android Emulator loopback alias (maps to host machine)
            list.push('ws://10.0.2.2:3000');

            // Host machine local LAN IP
            list.push('ws://192.168.1.60:3000');

            // If running on browser/network with valid hostname
            const host = window.location.hostname;
            if (host && host !== '0.0.0.1' && host !== '0.0.0.0' && host !== 'localhost' && host !== '127.0.0.1') {
                const port = window.location.port || '3000';
                list.push(`ws://${host}:${port}`);
            }

            // Desktop loopback
            list.push('ws://127.0.0.1:3000');
            list.push('ws://localhost:3000');

            return Array.from(new Set(list));
        }

        async connect(onProgress) {
            const candidates = this.getCandidates();
            console.log('[Party Lobby] Testing server candidate URLs:', candidates);

            for (const url of candidates) {
                if (typeof onProgress === 'function') {
                    onProgress(url);
                }
                const ok = await this.probeUrl(url, 1500);
                if (ok) {
                    console.log('[Party Lobby] Connected successfully to:', url);
                    try { localStorage.setItem('tv_server_url', url); } catch (e) {}
                    return true;
                }
            }

            console.warn('[Party Lobby] All server candidates failed.');
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
                            this.activeUrl = url;
                            this.bindSocketEvents();
                            this.startPing();
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

            this.ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    this.handleMessage(msg);
                } catch (err) {}
            };

            this.ws.onerror = (err) => {
                console.warn('[Party Lobby] WS error:', err);
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.stopPing();
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
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
            this.ws.send(JSON.stringify({
                type,
                roomId: this.roomId || '',
                senderId: 'host_tv',
                payload
            }));
            return true;
        }

        createRoom(hostName = 'TV Launcher Host') { return this.send('ROOM_CREATE', { hostName }); }
        selectGame(gameId, gameTitle) { return this.send('GAME_SELECT', { gameId, gameTitle }); }
        startGame(gameId, controllerLayoutType, config = {}) {
            return this.send('GAME_START', { gameId, controllerLayoutType, config });
        }
        updateScore(playerId, deltaOrTotal, isAbsolute = false) {
            return this.send('SCORE_UPDATE', { playerId, deltaOrTotal, isAbsolute });
        }
        gameOver(winner, finalScores) { return this.send('GAME_OVER', { winner, finalScores }); }
        returnToLobby() { return this.send('RETURN_TO_LOBBY', {}); }

        handleMessage(msg) {
            const { type, roomId, payload } = msg;
            if (type === 'ROOM_CREATED' || type === 'HOST_RECONNECTED') {
                this.roomId = payload.roomId;
                this.hostToken = payload.hostToken;
                this.controllerUrl = payload.controllerUrl;
                this.qrModules = payload.qrModules;
                this.qrDataUrl = payload.qrDataUrl;
            }
            const callbacks = this.listeners.get(type);
            if (callbacks) {
                for (const cb of callbacks) cb(payload, msg);
            }
        }

        on(type, callback) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(callback);
            return () => this.off(type, callback);
        }

        off(type, callback) {
            if (this.listeners.has(type)) this.listeners.get(type).delete(callback);
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
    window.tvHostNetwork = new LauncherTvNetwork();

    // -------------------------------------------------------------------------
    // 4. BaseGameScene & DemoBuzzerGameScene & LobbyScene
    // -------------------------------------------------------------------------
    class BaseGameScene extends Phaser.Scene {
        constructor(sceneKey) {
            super({ key: sceneKey });
            this.sceneKey = sceneKey;
            this.roomId = null;
            this.players = [];
            this.playersMap = new Map();
            this.network = null;
            this.soundFx = null;
            this.networkUnsubscribers = [];
        }

        init(data) {
            this.roomId = data.roomId || (window.tvHostNetwork ? window.tvHostNetwork.roomId : '');
            this.players = (data.players || []).map(p => ({ ...p }));
            this.playersMap = new Map(this.players.map(p => [p.id, p]));
            this.network = data.network || window.tvHostNetwork;
            this.soundFx = data.soundFx || window.soundFx;

            this.events.once('shutdown', this.cleanupScene, this);
            this.events.once('destroy', this.cleanupScene, this);
            this.wireNetworkEvents();
        }

        wireNetworkEvents() {
            if (!this.network) return;
            this.networkUnsubscribers.push(
                this.network.on('PLAYER_INPUT', (payload) => this.onPlayerInput(payload.playerId, payload)),
                this.network.on('PLAYER_DISCONNECTED', (payload) => this.onPlayerDisconnected(payload.playerId, payload)),
                this.network.on('PLAYER_LEFT', (payload) => {
                    this.playersMap.delete(payload.playerId);
                    this.players = this.players.filter(p => p.id !== payload.playerId);
                }),
                this.network.on('SCORE_UPDATED', (payload) => {
                    if (payload.player && this.playersMap.has(payload.player.id)) {
                        this.playersMap.get(payload.player.id).score = payload.player.score;
                    }
                }),
                this.network.on('RETURN_TO_LOBBY', () => this.transitionToLobby())
            );
        }

        onPlayerInput(playerId, inputData) {}
        onPlayerDisconnected(playerId, payload) {}

        awardScore(playerId, pointsDelta) {
            if (!this.network || !this.playersMap.has(playerId)) return;
            const player = this.playersMap.get(playerId);
            player.score = (player.score || 0) + pointsDelta;
            this.network.updateScore(playerId, pointsDelta, false);
        }

        endGame(results = {}) {
            let winner = results.winner || null;
            if (!winner && this.players.length > 0) {
                const sorted = [...this.players].sort((a, b) => (b.score || 0) - (a.score || 0));
                winner = sorted[0];
            }
            if (this.soundFx) this.soundFx.victoryFanfare();
            if (this.network) this.network.gameOver(winner, this.players);
        }

        returnToLobby() {
            if (this.network) this.network.returnToLobby();
            this.transitionToLobby();
        }

        transitionToLobby() {
            this.scene.start('LobbyScene', {
                roomId: this.roomId,
                players: this.players,
                network: this.network
            });
        }

        cleanupScene() {
            for (const unsub of this.networkUnsubscribers) {
                if (typeof unsub === 'function') unsub();
            }
            this.networkUnsubscribers = [];
            this.tweens.killAll();
            this.time.removeAllEvents();
        }
    }

    class DemoBuzzerGameScene extends BaseGameScene {
        constructor() {
            super('DemoBuzzerGameScene');
            this.gameState = 'INTRO';
            this.currentRound = 1;
            this.totalRounds = 3;
            this.roundStartTime = 0;
            this.buzzedPlayers = [];
        }

        create() {
            this.cameras.main.setBackgroundColor('#0B0D14');

            const bg = this.add.graphics();
            bg.fillGradientStyle(0x161B2E, 0x161B2E, 0x0A0C14, 0x0A0C14, 1);
            bg.fillRect(0, 0, 1920, 1080);
            bg.lineStyle(1, 0x222B45, 0.4);
            for (let x = 0; x < 1920; x += 120) { bg.moveTo(x, 0); bg.lineTo(x, 1080); }
            for (let y = 0; y < 1080; y += 120) { bg.moveTo(0, y); bg.lineTo(1920, y); }
            bg.strokePath();

            // Header
            this.add.text(960, 60, '⚡ BUZZER BLITZ ⚡', {
                fontSize: '52px', fontFamily: 'system-ui, sans-serif', color: '#00D2D3', fontStyle: 'bold'
            }).setOrigin(0.5);

            this.roundText = this.add.text(960, 120, `ROUND ${this.currentRound} / ${this.totalRounds}`, {
                fontSize: '28px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE', letterSpacing: 2
            }).setOrigin(0.5);

            // Center Ring Stage
            this.centerContainer = this.add.container(960, 480);
            this.centerRing = this.add.circle(0, 0, 170, 0x192033, 0.8);
            this.centerRing.setStrokeStyle(6, 0x00D2D3, 0.8);

            this.statusText = this.add.text(0, -20, 'GET READY', {
                fontSize: '56px', fontFamily: 'system-ui, sans-serif', color: '#FFFFFF', fontStyle: 'bold', align: 'center'
            }).setOrigin(0.5);

            this.subStatusText = this.add.text(0, 50, 'Watch for GO!', {
                fontSize: '24px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE'
            }).setOrigin(0.5);

            this.centerContainer.add([this.centerRing, this.statusText, this.subStatusText]);

            // Fastest buzzer banner
            this.buzzBanner = this.add.container(960, 740).setVisible(false);
            const bannerBg = this.add.rectangle(0, 0, 760, 100, 0x1E2746, 0.95);
            bannerBg.setStrokeStyle(4, 0x2ED573);
            this.buzzBannerText = this.add.text(0, 0, '', {
                fontSize: '36px', fontFamily: 'system-ui, sans-serif', color: '#2ED573', fontStyle: 'bold'
            }).setOrigin(0.5);
            this.buzzBanner.add([bannerBg, this.buzzBannerText]);

            // Leaderboard row
            this.leaderboardContainer = this.add.container(960, 930);
            this.refreshLeaderboard();

            // Controls help
            this.add.text(960, 1040, 'TV Remote: [ENTER] Skip / Next   |   [ESC] Return to Lobby', {
                fontSize: '20px', fontFamily: 'system-ui, sans-serif', color: '#5C667A'
            }).setOrigin(0.5);

            this.input.keyboard.on('keydown-ENTER', () => this.handleRemoteSelect());
            this.input.keyboard.on('keydown-SPACE', () => this.handleRemoteSelect());
            this.input.keyboard.on('keydown-ESC', () => this.returnToLobby());

            this.time.delayedCall(1200, () => this.startNewRound());
        }

        refreshLeaderboard() {
            this.leaderboardContainer.removeAll(true);
            if (this.players.length === 0) return;

            const count = this.players.length;
            const cardWidth = Math.min(220, 1400 / count);
            const totalWidth = count * cardWidth;
            const startX = -totalWidth / 2 + cardWidth / 2;

            this.players.forEach((player, idx) => {
                const x = startX + (idx * cardWidth);
                const card = this.add.container(x, 0);
                const hexColor = parseInt(player.color.replace('#', '0x'), 16);
                const isBuzzed = this.buzzedPlayers.some(b => b.playerId === player.id);

                const bg = this.add.rectangle(0, 0, cardWidth - 16, 110, 0x131826, 0.9);
                bg.setStrokeStyle(isBuzzed ? 4 : 2, isBuzzed ? 0x2ED573 : hexColor);

                const tag = this.add.rectangle(-cardWidth / 2 + 16, 0, 8, 110, hexColor);
                const name = this.add.text(-cardWidth / 2 + 32, -24, player.name, {
                    fontSize: '22px', fontFamily: 'system-ui, sans-serif', color: '#FFFFFF', fontStyle: 'bold'
                });
                const score = this.add.text(-cardWidth / 2 + 32, 12, `${player.score || 0} pts`, {
                    fontSize: '26px', fontFamily: 'system-ui, sans-serif', color: '#FFA502', fontStyle: 'bold'
                });

                card.add([bg, tag, name, score]);
                this.leaderboardContainer.add(card);
            });
        }

        startNewRound() {
            this.gameState = 'COUNTDOWN';
            this.buzzedPlayers = [];
            this.buzzBanner.setVisible(false);
            this.refreshLeaderboard();
            this.roundText.setText(`ROUND ${this.currentRound} / ${this.totalRounds}`);

            let count = 3;
            this.statusText.setText(count);
            this.statusText.setColor('#FFA502');
            this.subStatusText.setText('Prepare to tap your phone!');
            this.centerRing.setStrokeStyle(6, 0xFFA502);
            if (this.soundFx) this.soundFx.countdownPip(false);

            this.time.addEvent({
                delay: 1000,
                repeat: 2,
                callback: () => {
                    count--;
                    if (count > 0) {
                        this.statusText.setText(count);
                        if (this.soundFx) this.soundFx.countdownPip(false);
                    } else {
                        this.activateBuzzers();
                    }
                }
            });
        }

        activateBuzzers() {
            this.gameState = 'ACTIVE';
            this.roundStartTime = Date.now();
            this.statusText.setText('BUZZ!');
            this.statusText.setColor('#2ED573');
            this.subStatusText.setText('TAP NOW!');
            this.centerRing.setStrokeStyle(10, 0x2ED573);
            if (this.soundFx) this.soundFx.countdownPip(true);

            this.tweens.add({
                targets: this.centerRing,
                scaleX: 1.15,
                scaleY: 1.15,
                duration: 200,
                yoyo: true,
                repeat: -1
            });

            this.time.delayedCall(6000, () => {
                if (this.gameState === 'ACTIVE') this.finishRound();
            });
        }

        onPlayerInput(playerId, inputData) {
            if (this.gameState !== 'ACTIVE' || inputData.action !== 'BUZZ') return;
            if (this.buzzedPlayers.some(b => b.playerId === playerId)) return;

            const reactionTime = Date.now() - this.roundStartTime;
            const player = this.playersMap.get(playerId);
            if (!player) return;

            const place = this.buzzedPlayers.length + 1;
            this.buzzedPlayers.push({ playerId, place, reactionTime, name: player.name });
            const points = place === 1 ? 100 : (place === 2 ? 50 : 25);
            this.awardScore(playerId, points);
            if (this.soundFx) this.soundFx.buzzerHit();

            if (place === 1) {
                this.buzzBannerText.setText(`🥇 ${player.name} Buzzed 1st! (${reactionTime}ms) +100pts`);
                this.buzzBannerText.setColor(player.color || '#2ED573');
                this.buzzBanner.setVisible(true);
                this.cameras.main.shake(120, 0.005);
            }

            this.refreshLeaderboard();
            if (this.buzzedPlayers.length >= this.players.length) {
                this.time.delayedCall(800, () => this.finishRound());
            }
        }

        finishRound() {
            if (this.gameState === 'ROUND_OVER' || this.gameState === 'MATCH_OVER') return;
            this.gameState = 'ROUND_OVER';
            this.tweens.killTweensOf(this.centerRing);
            this.centerRing.setScale(1);

            if (this.buzzedPlayers.length === 0) {
                this.statusText.setText('TIME OUT');
                this.statusText.setColor('#FF4757');
                this.subStatusText.setText('Nobody buzzed in time!');
            } else {
                const fastest = this.buzzedPlayers[0];
                this.statusText.setText('ROUND OVER');
                this.statusText.setColor('#FFFFFF');
                this.subStatusText.setText(`Winner: ${fastest.name} (${fastest.reactionTime}ms)`);
            }
            this.refreshLeaderboard();

            if (this.currentRound >= this.totalRounds) {
                this.time.delayedCall(2500, () => this.showMatchOver());
            } else {
                this.currentRound++;
                this.time.delayedCall(3000, () => this.startNewRound());
            }
        }

        showMatchOver() {
            this.gameState = 'MATCH_OVER';
            const sorted = [...this.players].sort((a, b) => (b.score || 0) - (a.score || 0));
            const winner = sorted[0];
            this.endGame({ winner, finalScores: sorted });

            this.centerContainer.setVisible(false);
            this.buzzBanner.setVisible(false);

            const victoryCard = this.add.container(960, 480);
            const cardBg = this.add.rectangle(0, 0, 840, 400, 0x131826, 0.95);
            cardBg.setStrokeStyle(4, 0xFFA502);
            const trophy = this.add.text(0, -120, '🏆', { fontSize: '80px' }).setOrigin(0.5);
            const title = this.add.text(0, -30, 'MATCH WINNER', {
                fontSize: '36px', fontFamily: 'system-ui, sans-serif', color: '#FFA502', fontStyle: 'bold'
            }).setOrigin(0.5);
            const winnerText = this.add.text(0, 40, winner ? winner.name : 'Nobody', {
                fontSize: '64px', fontFamily: 'system-ui, sans-serif', color: winner ? winner.color : '#FFFFFF', fontStyle: 'bold'
            }).setOrigin(0.5);
            const sub = this.add.text(0, 120, 'Returning to Lobby in 6 seconds...', {
                fontSize: '26px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE'
            }).setOrigin(0.5);

            victoryCard.add([cardBg, trophy, title, winnerText, sub]);

            this.time.delayedCall(6000, () => this.returnToLobby());
        }

        handleRemoteSelect() {
            if (this.gameState === 'ROUND_OVER') {
                if (this.currentRound >= this.totalRounds) this.showMatchOver();
                else { this.currentRound++; this.startNewRound(); }
            } else if (this.gameState === 'MATCH_OVER') {
                this.returnToLobby();
            }
        }
    }

    class NeonTankGameScene extends BaseGameScene {
        constructor() {
            super('NeonTankGameScene');
            this.gameState = 'INTRO';
            this.currentRound = 1;
            this.totalRounds = 3;
            this.tanks = [];
            this.tanksMap = new Map();
            this.bullets = [];
            this.powerups = [];
            this.arenaBounds = { left: 140, right: 1780, top: 140, bottom: 940, width: 1640, height: 800 };
            this.barriers = [
                { x: 740, y: 380, w: 80, h: 140 },
                { x: 1100, y: 380, w: 80, h: 140 },
                { x: 740, y: 620, w: 80, h: 140 },
                { x: 1100, y: 620, w: 80, h: 140 },
                { x: 880, y: 520, w: 160, h: 60 },
                { x: 420, y: 480, w: 70, h: 180 },
                { x: 1430, y: 480, w: 70, h: 180 }
            ];
            this.spawnPoints = [
                { x: 260, y: 260, angle: 45 },
                { x: 1660, y: 260, angle: 135 },
                { x: 1660, y: 820, angle: 225 },
                { x: 260, y: 820, angle: 315 },
                { x: 960, y: 230, angle: 90 },
                { x: 960, y: 850, angle: 270 },
                { x: 230, y: 540, angle: 0 },
                { x: 1690, y: 540, angle: 180 }
            ];
            this.powerupTimer = null;
        }

        create() {
            this.cameras.main.setBackgroundColor('#090B12');
            this.bgGraphics = this.add.graphics();
            this.treadMarksGraphics = this.add.graphics();
            this.arenaGraphics = this.add.graphics();
            this.bulletGraphics = this.add.graphics();

            this.drawBackground();
            this.drawArena();
            this.createHeaderUI();
            this.createCenterStageUI();
            this.createLeaderboardUI();
            this.createControlsHintUI();
            this.initTanks();

            this.input.keyboard.on('keydown-ENTER', () => this.handleRemoteSelect());
            this.input.keyboard.on('keydown-SPACE', () => this.handleRemoteSelect());
            this.input.keyboard.on('keydown-ESC', () => this.returnToLobby());

            this.time.delayedCall(1000, () => this.startNewRound());
        }

        drawBackground() {
            this.bgGraphics.clear();
            this.bgGraphics.fillGradientStyle(0x111627, 0x111627, 0x070910, 0x070910, 1);
            this.bgGraphics.fillRect(0, 0, 1920, 1080);
            this.bgGraphics.lineStyle(1, 0x1A2238, 0.35);
            for (let x = 0; x < 1920; x += 80) { this.bgGraphics.moveTo(x, 0); this.bgGraphics.lineTo(x, 1080); }
            for (let y = 0; y < 1080; y += 80) { this.bgGraphics.moveTo(0, y); this.bgGraphics.lineTo(1920, y); }
            this.bgGraphics.strokePath();
        }

        drawArena() {
            this.arenaGraphics.clear();
            const { left, top, width, height } = this.arenaBounds;
            this.arenaGraphics.lineStyle(4, 0x00D2D3, 0.85);
            this.arenaGraphics.strokeRoundedRect(left, top, width, height, 16);
            this.arenaGraphics.fillStyle(0x0C101C, 0.6);
            this.arenaGraphics.fillRoundedRect(left, top, width, height, 16);

            const cornerLen = 40;
            this.arenaGraphics.lineStyle(6, 0x2ED573, 1);
            this.arenaGraphics.moveTo(left, top + cornerLen); this.arenaGraphics.lineTo(left, top); this.arenaGraphics.lineTo(left + cornerLen, top);
            this.arenaGraphics.moveTo(left + width - cornerLen, top); this.arenaGraphics.lineTo(left + width, top); this.arenaGraphics.lineTo(left + width, top + cornerLen);
            this.arenaGraphics.moveTo(left + width, top + height - cornerLen); this.arenaGraphics.lineTo(left + width, top + height); this.arenaGraphics.lineTo(left + width - cornerLen, top + height);
            this.arenaGraphics.moveTo(left + cornerLen, top + height); this.arenaGraphics.lineTo(left, top + height); this.arenaGraphics.lineTo(left, top + height - cornerLen);
            this.arenaGraphics.strokePath();

            this.barriers.forEach(b => {
                this.arenaGraphics.fillStyle(0x192033, 0.95);
                this.arenaGraphics.fillRoundedRect(b.x, b.y, b.w, b.h, 10);
                this.arenaGraphics.lineStyle(2, 0x4A5878, 0.9);
                this.arenaGraphics.strokeRoundedRect(b.x, b.y, b.w, b.h, 10);
                this.arenaGraphics.lineStyle(1, 0x00D2D3, 0.4);
                this.arenaGraphics.strokeRoundedRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8, 8);
            });
        }

        createHeaderUI() {
            this.headerContainer = this.add.container(960, 50);
            this.titleText = this.add.text(0, -10, '💥 NEON TANK ARENA 💥', {
                fontSize: '44px', fontFamily: 'system-ui, sans-serif', color: '#00D2D3', fontStyle: 'bold', letterSpacing: 3
            }).setOrigin(0.5);
            this.roundInfoText = this.add.text(0, 32, `ROUND ${this.currentRound} / ${this.totalRounds}`, {
                fontSize: '22px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE', letterSpacing: 2, fontStyle: 'bold'
            }).setOrigin(0.5);
            this.headerContainer.add([this.titleText, this.roundInfoText]);
        }

        createCenterStageUI() {
            this.centerContainer = this.add.container(960, 540);
            this.countdownText = this.add.text(0, -20, 'GET READY', {
                fontSize: '68px', fontFamily: 'system-ui, sans-serif', color: '#FFA502', fontStyle: 'bold'
            }).setOrigin(0.5);
            this.countdownSubText = this.add.text(0, 50, 'Drive with D-Pad, [A] to Fire', {
                fontSize: '24px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE'
            }).setOrigin(0.5);
            this.centerContainer.add([this.countdownText, this.countdownSubText]);

            this.winnerBanner = this.add.container(960, 540).setVisible(false);
            const bannerBg = this.add.rectangle(0, 0, 840, 160, 0x131826, 0.95);
            bannerBg.setStrokeStyle(4, 0x2ED573);
            this.winnerText = this.add.text(0, -24, '', {
                fontSize: '44px', fontFamily: 'system-ui, sans-serif', color: '#2ED573', fontStyle: 'bold'
            }).setOrigin(0.5);
            this.winnerSubText = this.add.text(0, 32, '', {
                fontSize: '24px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE'
            }).setOrigin(0.5);
            this.winnerBanner.add([bannerBg, this.winnerText, this.winnerSubText]);
        }

        createLeaderboardUI() {
            this.leaderboardContainer = this.add.container(960, 1000);
            this.refreshLeaderboard();
        }

        createControlsHintUI() {
            this.add.text(960, 1055, 'Phone: [D-PAD] Drive   |   [A] Fire Laser   |   [B] Nitro Boost   ||   TV: [ENTER] Skip   [ESC] Lobby', {
                fontSize: '18px', fontFamily: 'system-ui, sans-serif', color: '#5C667A'
            }).setOrigin(0.5);
        }

        initTanks() {
            this.tanks = [];
            this.tanksMap.clear();

            let playerList = (this.players && this.players.length > 0) ? this.players : [];
            if (playerList.length === 1) {
                playerList = [
                    playerList[0],
                    { id: 'ai_drone_1', name: 'Cyber Drone 1', color: '#FF4757', score: 0, isAi: true },
                    { id: 'ai_drone_2', name: 'Cyber Drone 2', color: '#FFA502', score: 0, isAi: true }
                ];
            } else if (playerList.length === 0) {
                playerList = [
                    { id: 'demo_tank_1', name: 'Neon Alpha', color: '#00D2D3', score: 0, isAi: true },
                    { id: 'demo_tank_2', name: 'Neon Beta', color: '#FF4757', score: 0, isAi: true }
                ];
            }

            playerList.forEach((player, idx) => {
                const spawn = this.spawnPoints[idx % this.spawnPoints.length];
                const hexColor = parseInt(player.color.replace('#', '0x'), 16);

                const container = this.add.container(spawn.x, spawn.y);
                const tankGraphics = this.add.graphics();
                const nameText = this.add.text(0, -42, player.name, {
                    fontSize: '16px', fontFamily: 'system-ui, sans-serif', color: '#FFFFFF', fontStyle: 'bold'
                }).setOrigin(0.5);
                const hpContainer = this.add.container(0, -26);

                container.add([tankGraphics, nameText, hpContainer]);

                const tankObj = {
                    id: player.id,
                    name: player.name,
                    color: player.color,
                    hexColor,
                    x: spawn.x,
                    y: spawn.y,
                    angle: spawn.angle,
                    targetAngle: spawn.angle,
                    spawnAngle: spawn.angle,
                    vx: 0,
                    vy: 0,
                    speed: 240,
                    hp: 3,
                    maxHp: 3,
                    isAlive: true,
                    isBoosting: false,
                    boostTimer: 0,
                    boostCooldown: 0,
                    fireCooldown: 0,
                    powerup: null,
                    powerupTimer: 0,
                    activeDirections: new Set(),
                    isAi: !!player.isAi,
                    aiNextAction: 0,
                    score: player.score || 0,
                    container,
                    tankGraphics,
                    nameText,
                    hpContainer
                };

                this.redrawTankVisual(tankObj);
                this.updateTankHp(tankObj);
                this.tanks.push(tankObj);
                this.tanksMap.set(player.id, tankObj);
            });

            this.refreshLeaderboard();
        }

        redrawTankVisual(tank) {
            const g = tank.tankGraphics;
            g.clear();
            g.fillStyle(0x161C2A, 1);
            g.fillRoundedRect(-24, -22, 48, 11, 4);
            g.fillRoundedRect(-24, 11, 48, 11, 4);
            g.lineStyle(1.5, 0x2A354E, 1);
            g.strokeRoundedRect(-24, -22, 48, 11, 4);
            g.strokeRoundedRect(-24, 11, 48, 11, 4);

            g.fillStyle(0x101420, 1);
            g.fillRoundedRect(-18, -14, 36, 28, 6);
            g.fillStyle(tank.hexColor, 0.85);
            g.fillRoundedRect(-14, -10, 28, 20, 4);
            g.lineStyle(2, tank.isBoosting ? 0xFFFFFF : tank.hexColor, 1);
            g.strokeRoundedRect(-18, -14, 36, 28, 6);

            g.fillStyle(0x222B40, 1);
            g.fillRect(0, -4, 28, 8);
            g.lineStyle(2, tank.hexColor, 1);
            g.strokeRect(0, -4, 28, 8);
            g.fillStyle(tank.hexColor, 1);
            g.fillRect(24, -3, 6, 6);

            g.fillStyle(0x101420, 1);
            g.fillCircle(0, 0, 11);
            g.lineStyle(2, 0xFFFFFF, 0.9);
            g.strokeCircle(0, 0, 11);

            if (tank.powerup) {
                g.lineStyle(2, 0xFFA502, 0.8);
                g.strokeCircle(0, 0, 28);
            }
        }

        updateTankHp(tank) {
            tank.hpContainer.removeAll(true);
            const pipSpacing = 14;
            const startX = -((tank.maxHp - 1) * pipSpacing) / 2;
            for (let i = 0; i < tank.maxHp; i++) {
                const pipX = startX + (i * pipSpacing);
                const isFilled = i < tank.hp;
                const pip = this.add.circle(pipX, 0, 4, isFilled ? 0x2ED573 : 0x2B3448);
                pip.setStrokeStyle(1.5, isFilled ? 0xFFFFFF : 0x4A5878);
                tank.hpContainer.add(pip);
            }
        }

        startNewRound() {
            this.gameState = 'COUNTDOWN';
            this.bullets.forEach(b => { if (b.graphics) b.graphics.destroy(); });
            this.bullets = [];
            this.powerups.forEach(p => { if (p.container) p.container.destroy(); });
            this.powerups = [];
            this.winnerBanner.setVisible(false);
            this.centerContainer.setVisible(true);

            this.roundInfoText.setText(`ROUND ${this.currentRound} / ${this.totalRounds}`);

            this.tanks.forEach((tank, idx) => {
                const spawn = this.spawnPoints[idx % this.spawnPoints.length];
                tank.x = spawn.x;
                tank.y = spawn.y;
                tank.angle = spawn.angle;
                tank.targetAngle = spawn.angle;
                tank.vx = 0;
                tank.vy = 0;
                tank.hp = 3;
                tank.isAlive = true;
                tank.isBoosting = false;
                tank.boostCooldown = 0;
                tank.fireCooldown = 0;
                tank.powerup = null;
                tank.powerupTimer = 0;
                tank.activeDirections.clear();

                tank.container.setPosition(spawn.x, spawn.y);
                tank.container.setRotation(Phaser.Math.DegToRad(spawn.angle));
                tank.container.setVisible(true);
                tank.nameText.setRotation(-Phaser.Math.DegToRad(spawn.angle));
                tank.hpContainer.setRotation(-Phaser.Math.DegToRad(spawn.angle));

                this.redrawTankVisual(tank);
                this.updateTankHp(tank);
            });

            this.refreshLeaderboard();

            let count = 3;
            this.countdownText.setText(count);
            this.countdownText.setColor('#FFA502');
            this.countdownSubText.setText('Prepare for tank battle!');
            if (this.soundFx) this.soundFx.countdownPip(false);

            this.time.addEvent({
                delay: 1000,
                repeat: 2,
                callback: () => {
                    count--;
                    if (count > 0) {
                        this.countdownText.setText(count);
                        if (this.soundFx) this.soundFx.countdownPip(false);
                    } else {
                        this.startBattle();
                    }
                }
            });
        }

        startBattle() {
            this.gameState = 'BATTLE';
            this.countdownText.setText('FIGHT!');
            this.countdownText.setColor('#2ED573');
            this.countdownSubText.setText('Blast opponent tanks!');
            if (this.soundFx) this.soundFx.countdownPip(true);

            this.time.delayedCall(800, () => {
                if (this.gameState === 'BATTLE') this.centerContainer.setVisible(false);
            });

            this.powerupTimer = this.time.addEvent({
                delay: 12000,
                loop: true,
                callback: () => {
                    if (this.gameState === 'BATTLE') this.spawnPowerup();
                }
            });
        }

        spawnPowerup() {
            if (this.powerups.length >= 2) return;
            const types = [
                { type: 'TRIPLE', color: 0xFF4757 },
                { type: 'RAPID', color: 0xFFA502 },
                { type: 'SHIELD', color: 0x2ED573 }
            ];
            const selected = Phaser.Utils.Array.GetRandom(types);
            const px = Phaser.Math.Between(550, 1370);
            const py = Phaser.Math.Between(260, 820);

            const container = this.add.container(px, py);
            const bg = this.add.circle(0, 0, 22, selected.color, 0.25);
            bg.setStrokeStyle(2.5, selected.color, 1);
            const icon = this.add.text(0, 0, selected.type === 'RAPID' ? '⚡' : (selected.type === 'SHIELD' ? '🛡️' : '★'), {
                fontSize: '20px'
            }).setOrigin(0.5);

            container.add([bg, icon]);
            this.tweens.add({ targets: bg, scaleX: 1.25, scaleY: 1.25, duration: 600, yoyo: true, repeat: -1 });
            this.powerups.push({ x: px, y: py, type: selected.type, container });
        }

        onPlayerInput(playerId, inputData) {
            if (this.gameState !== 'BATTLE') return;
            const tank = this.tanksMap.get(playerId);
            if (!tank || !tank.isAlive) return;

            const action = inputData.action;
            const inputType = inputData.inputType;

            if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(action)) {
                if (inputType === 'button_down') tank.activeDirections.add(action);
                else if (inputType === 'button_up') tank.activeDirections.delete(action);
            } else if (action === 'A' && inputType === 'button_down') {
                this.fireBullet(tank);
            } else if (action === 'B' && inputType === 'button_down') {
                this.triggerBoost(tank);
            }
        }

        fireBullet(tank) {
            if (tank.fireCooldown > 0) return;
            const maxBullets = 3;
            const activeCount = this.bullets.filter(b => b.ownerId === tank.id).length;
            if (activeCount >= maxBullets && tank.powerup !== 'RAPID') return;

            const speed = 640;
            const spawnAtAngle = (ang) => {
                const rad = Phaser.Math.DegToRad(ang);
                const bx = tank.x + Math.cos(rad) * 32;
                const by = tank.y + Math.sin(rad) * 32;
                const vx = Math.cos(rad) * speed;
                const vy = Math.sin(rad) * speed;

                const bGfx = this.add.graphics();
                this.bullets.push({
                    x: bx, y: by, vx, vy, ownerId: tank.id, color: tank.hexColor, bouncesLeft: 2, age: 0, graphics: bGfx
                });
            };

            if (tank.powerup === 'TRIPLE') {
                spawnAtAngle(tank.angle - 16);
                spawnAtAngle(tank.angle);
                spawnAtAngle(tank.angle + 16);
            } else {
                spawnAtAngle(tank.angle);
            }

            if (this.soundFx) this.soundFx.laserShot();
            this.cameras.main.shake(80, 0.002);
            tank.fireCooldown = tank.powerup === 'RAPID' ? 180 : 360;
        }

        triggerBoost(tank) {
            if (tank.boostCooldown > 0 || tank.isBoosting) return;
            tank.isBoosting = true;
            tank.boostTimer = 1.2;
            tank.boostCooldown = 4.0;
            if (this.soundFx) this.soundFx.boostSound();
            this.redrawTankVisual(tank);
        }

        update(time, delta) {
            const dt = delta / 1000;
            if (this.gameState === 'BATTLE') {
                this.updateTanks(dt);
                this.updateBullets(dt);
                this.updatePowerups();
                this.checkRoundStatus();
            }
        }

        updateTanks(dt) {
            this.tanks.forEach(tank => {
                if (!tank.isAlive) return;

                if (tank.fireCooldown > 0) tank.fireCooldown -= (dt * 1000);
                if (tank.boostCooldown > 0) tank.boostCooldown -= dt;

                if (tank.isBoosting) {
                    tank.boostTimer -= dt;
                    if (tank.boostTimer <= 0) { tank.isBoosting = false; this.redrawTankVisual(tank); }
                }

                if (tank.powerup) {
                    tank.powerupTimer -= dt;
                    if (tank.powerupTimer <= 0) { tank.powerup = null; this.redrawTankVisual(tank); }
                }

                if (tank.isAi) this.updateAiDrone(tank, dt);

                let dx = 0, dy = 0;
                if (tank.activeDirections.has('UP')) dy -= 1;
                if (tank.activeDirections.has('DOWN')) dy += 1;
                if (tank.activeDirections.has('LEFT')) dx -= 1;
                if (tank.activeDirections.has('RIGHT')) dx += 1;

                if (dx !== 0 || dy !== 0) {
                    const len = Math.hypot(dx, dy);
                    dx /= len; dy /= len;

                    const targetAngle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
                    tank.angle = Phaser.Math.Angle.RotateTo(
                        Phaser.Math.DegToRad(tank.angle),
                        Phaser.Math.DegToRad(targetAngle),
                        Phaser.Math.DegToRad(420 * dt)
                    );
                    tank.angle = Phaser.Math.RadToDeg(tank.angle);

                    const currentSpeed = (tank.isBoosting ? 380 : 230) * dt;
                    const nextX = tank.x + Math.cos(Phaser.Math.DegToRad(tank.angle)) * currentSpeed;
                    const nextY = tank.y + Math.sin(Phaser.Math.DegToRad(tank.angle)) * currentSpeed;

                    this.tryMoveTank(tank, nextX, nextY);

                    if (Math.random() < 0.25) {
                        this.treadMarksGraphics.fillStyle(0x070912, 0.45);
                        this.treadMarksGraphics.fillCircle(tank.x, tank.y, 3);
                    }
                }

                tank.container.setPosition(tank.x, tank.y);
                tank.container.setRotation(Phaser.Math.DegToRad(tank.angle));
                tank.nameText.setRotation(-Phaser.Math.DegToRad(tank.angle));
                tank.hpContainer.setRotation(-Phaser.Math.DegToRad(tank.angle));
            });
        }

        tryMoveTank(tank, targetX, targetY) {
            const radius = 22;
            const b = this.arenaBounds;
            let clampedX = Phaser.Math.Clamp(targetX, b.left + radius + 10, b.right - radius - 10);
            let clampedY = Phaser.Math.Clamp(targetY, b.top + radius + 10, b.bottom - radius - 10);

            let collidesX = this.barriers.some(bar => {
                return clampedX + radius > bar.x && clampedX - radius < bar.x + bar.w &&
                       tank.y + radius > bar.y && tank.y - radius < bar.y + bar.h;
            });
            if (!collidesX) tank.x = clampedX;

            let collidesY = this.barriers.some(bar => {
                return tank.x + radius > bar.x && tank.x - radius < bar.x + bar.w &&
                       clampedY + radius > bar.y && clampedY - radius < bar.y + bar.h;
            });
            if (!collidesY) tank.y = clampedY;
        }

        updateAiDrone(tank, dt) {
            tank.aiNextAction -= dt;
            if (tank.aiNextAction <= 0) {
                tank.aiNextAction = Phaser.Math.FloatBetween(0.8, 2.2);
                tank.activeDirections.clear();
                const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
                tank.activeDirections.add(Phaser.Utils.Array.GetRandom(dirs));
                if (Math.random() < 0.6) this.fireBullet(tank);
            }
        }

        updateBullets(dt) {
            this.bulletGraphics.clear();
            const toRemove = [];

            this.bullets.forEach((bullet, idx) => {
                bullet.age += dt;
                bullet.x += bullet.vx * dt;
                bullet.y += bullet.vy * dt;

                this.bulletGraphics.fillStyle(bullet.color, 1);
                this.bulletGraphics.fillCircle(bullet.x, bullet.y, 5);
                this.bulletGraphics.lineStyle(1.5, 0xFFFFFF, 0.9);
                this.bulletGraphics.strokeCircle(bullet.x, bullet.y, 5);

                const b = this.arenaBounds;
                let hasBounced = false;

                if (bullet.x <= b.left + 8 || bullet.x >= b.right - 8) {
                    bullet.vx = -bullet.vx;
                    bullet.x = Phaser.Math.Clamp(bullet.x, b.left + 9, b.right - 9);
                    hasBounced = true;
                }
                if (bullet.y <= b.top + 8 || bullet.y >= b.bottom - 8) {
                    bullet.vy = -bullet.vy;
                    bullet.y = Phaser.Math.Clamp(bullet.y, b.top + 9, b.bottom - 9);
                    hasBounced = true;
                }

                this.barriers.forEach(bar => {
                    if (bullet.x >= bar.x && bullet.x <= bar.x + bar.w &&
                        bullet.y >= bar.y && bullet.y <= bar.y + bar.h) {
                        const distLeft = Math.abs(bullet.x - bar.x);
                        const distRight = Math.abs(bullet.x - (bar.x + bar.w));
                        const distTop = Math.abs(bullet.y - bar.y);
                        const distBottom = Math.abs(bullet.y - (bar.y + bar.h));
                        if (Math.min(distLeft, distRight) < Math.min(distTop, distBottom)) {
                            bullet.vx = -bullet.vx;
                        } else {
                            bullet.vy = -bullet.vy;
                        }
                        hasBounced = true;
                    }
                });

                if (hasBounced) {
                    bullet.bouncesLeft--;
                    if (this.soundFx) this.soundFx.ricochet();
                    if (bullet.bouncesLeft < 0) { toRemove.push(idx); return; }
                }

                if (bullet.age > 4.5) { toRemove.push(idx); return; }

                this.tanks.forEach(tank => {
                    if (!tank.isAlive) return;
                    if (tank.id === bullet.ownerId && bullet.age < 0.12) return;
                    const dist = Math.hypot(tank.x - bullet.x, tank.y - bullet.y);
                    if (dist < 26) {
                        toRemove.push(idx);
                        this.hitTank(tank, bullet.ownerId);
                    }
                });
            });

            for (let i = toRemove.length - 1; i >= 0; i--) {
                const b = this.bullets[toRemove[i]];
                if (b && b.graphics) b.graphics.destroy();
                this.bullets.splice(toRemove[i], 1);
            }
        }

        hitTank(tank, attackerId) {
            tank.hp--;
            this.updateTankHp(tank);
            if (this.soundFx) this.soundFx.tankHit();
            this.cameras.main.shake(120, 0.005);
            this.tweens.add({ targets: tank.container, alpha: 0.3, duration: 80, yoyo: true, repeat: 2 });

            if (attackerId && attackerId !== tank.id) {
                this.awardScore(attackerId, 25);
                this.refreshLeaderboard();
            }

            if (tank.hp <= 0) this.destroyTank(tank, attackerId);
        }

        destroyTank(tank, attackerId) {
            tank.isAlive = false;
            tank.container.setVisible(false);
            if (this.soundFx) this.soundFx.tankExplosion();
            this.cameras.main.shake(250, 0.01);

            for (let i = 0; i < 16; i++) {
                const p = this.add.circle(tank.x, tank.y, Phaser.Math.Between(4, 9), tank.hexColor);
                const pAng = Phaser.Math.FloatBetween(0, Math.PI * 2);
                const pDist = Phaser.Math.Between(40, 120);
                this.tweens.add({
                    targets: p,
                    x: tank.x + Math.cos(pAng) * pDist,
                    y: tank.y + Math.sin(pAng) * pDist,
                    alpha: 0,
                    scale: 0.2,
                    duration: Phaser.Math.Between(400, 700),
                    onComplete: () => p.destroy()
                });
            }

            if (attackerId && attackerId !== tank.id) this.awardScore(attackerId, 50);
            this.refreshLeaderboard();
        }

        updatePowerups() {
            this.powerups = this.powerups.filter(p => {
                let collected = false;
                this.tanks.forEach(tank => {
                    if (!tank.isAlive || collected) return;
                    if (Math.hypot(tank.x - p.x, tank.y - p.y) < 36) {
                        collected = true;
                        if (p.type === 'SHIELD') {
                            tank.hp = Math.min(tank.maxHp, tank.hp + 1);
                            this.updateTankHp(tank);
                        } else {
                            tank.powerup = p.type;
                            tank.powerupTimer = 10;
                            this.redrawTankVisual(tank);
                        }
                        if (this.soundFx) this.soundFx.readyBeep();
                        p.container.destroy();
                    }
                });
                return !collected;
            });
        }

        checkRoundStatus() {
            const aliveTanks = this.tanks.filter(t => t.isAlive);
            if (aliveTanks.length <= 1) {
                this.gameState = 'ROUND_OVER';
                if (this.powerupTimer) this.powerupTimer.remove();

                const winner = aliveTanks[0] || null;
                if (winner) {
                    this.awardScore(winner.id, 100);
                    this.winnerText.setText(`🏆 ${winner.name} Won Round ${this.currentRound}!`);
                    this.winnerText.setColor(winner.color || '#2ED573');
                    this.winnerSubText.setText('+100 Victory Bonus');
                } else {
                    this.winnerText.setText('⚡ DRAW! Mutual Destruction!');
                    this.winnerText.setColor('#FFA502');
                    this.winnerSubText.setText('No survivors this round');
                }

                this.winnerBanner.setVisible(true);
                this.refreshLeaderboard();

                if (this.currentRound >= this.totalRounds) {
                    this.time.delayedCall(3000, () => this.showMatchOver());
                } else {
                    this.currentRound++;
                    this.time.delayedCall(3500, () => this.startNewRound());
                }
            }
        }

        showMatchOver() {
            this.gameState = 'MATCH_OVER';
            const sorted = [...this.tanks].sort((a, b) => (b.score || 0) - (a.score || 0));
            const champion = sorted[0];

            this.endGame({ winner: champion, finalScores: sorted });
            this.centerContainer.setVisible(false);
            this.winnerBanner.setVisible(false);

            const victoryCard = this.add.container(960, 540);
            const cardBg = this.add.rectangle(0, 0, 880, 420, 0x131826, 0.96);
            cardBg.setStrokeStyle(4, 0xFFA502);

            const trophy = this.add.text(0, -130, '🏆', { fontSize: '80px' }).setOrigin(0.5);
            const title = this.add.text(0, -40, 'ARENA CHAMPION', {
                fontSize: '34px', fontFamily: 'system-ui, sans-serif', color: '#FFA502', fontStyle: 'bold', letterSpacing: 2
            }).setOrigin(0.5);
            const winnerName = this.add.text(0, 30, champion ? champion.name : 'Nobody', {
                fontSize: '60px', fontFamily: 'system-ui, sans-serif', color: champion ? champion.color : '#FFFFFF', fontStyle: 'bold'
            }).setOrigin(0.5);
            const scoreDetail = this.add.text(0, 100, `Final Score: ${champion ? champion.score : 0} points`, {
                fontSize: '28px', fontFamily: 'system-ui, sans-serif', color: '#2ED573', fontStyle: 'bold'
            }).setOrigin(0.5);
            const sub = this.add.text(0, 155, 'Returning to Lobby in 6 seconds...', {
                fontSize: '22px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE'
            }).setOrigin(0.5);

            victoryCard.add([cardBg, trophy, title, winnerName, scoreDetail, sub]);
            this.time.delayedCall(6500, () => this.returnToLobby());
        }

        refreshLeaderboard() {
            this.leaderboardContainer.removeAll(true);
            if (!this.tanks || this.tanks.length === 0) return;

            const count = this.tanks.length;
            const cardWidth = Math.min(220, 1500 / count);
            const totalWidth = count * cardWidth;
            const startX = -totalWidth / 2 + cardWidth / 2;

            this.tanks.forEach((tank, idx) => {
                const x = startX + (idx * cardWidth);
                const card = this.add.container(x, 0);

                const bg = this.add.rectangle(0, 0, cardWidth - 14, 76, 0x131826, 0.92);
                bg.setStrokeStyle(tank.isAlive ? 2 : 1, tank.isAlive ? tank.hexColor : 0x3A455E);

                const tag = this.add.rectangle(-cardWidth / 2 + 15, 0, 6, 76, tank.hexColor);
                const name = this.add.text(-cardWidth / 2 + 28, -16, tank.name, {
                    fontSize: '18px', fontFamily: 'system-ui, sans-serif', color: tank.isAlive ? '#FFFFFF' : '#6A7890', fontStyle: 'bold'
                });
                const score = this.add.text(-cardWidth / 2 + 28, 10, `${tank.score || 0} pts`, {
                    fontSize: '20px', fontFamily: 'system-ui, sans-serif', color: '#FFA502', fontStyle: 'bold'
                });
                const status = this.add.text(cardWidth / 2 - 20, 0, tank.isAlive ? '●' : '✖', {
                    fontSize: '20px', fontFamily: 'system-ui, sans-serif', color: tank.isAlive ? '#2ED573' : '#FF4757', fontStyle: 'bold'
                }).setOrigin(0.5);

                card.add([bg, tag, name, score, status]);
                this.leaderboardContainer.add(card);
            });
        }

        handleRemoteSelect() {
            if (this.gameState === 'ROUND_OVER') {
                if (this.currentRound >= this.totalRounds) this.showMatchOver();
                else { this.currentRound++; this.startNewRound(); }
            } else if (this.gameState === 'MATCH_OVER') {
                this.returnToLobby();
            }
        }
    }

    class LobbyScene extends Phaser.Scene {
        constructor() {
            super({ key: 'LobbyScene' });
            this.network = null;
            this.soundFx = null;
            this.roomId = null;
            this.controllerUrl = null;
            this.players = [];
            this.networkUnsubscribers = [];
            this.gamesList = [
                { id: 'demo-buzzer', title: '⚡ Buzzer Blitz', description: 'Fastest finger reaction party battle!', layout: 'BUZZER', sceneKey: 'DemoBuzzerGameScene', color: 0xFF4757 },
                { id: 'neon-tanks', title: '💥 Neon Tank Arena', description: '2-8 player retro tank battle with bouncing laser shells!', layout: 'DPAD_ACTION', sceneKey: 'NeonTankGameScene', color: 0x00D2D3 }
            ];
            this.selectedGameIndex = 0;
        }

        init(data) {
            this.network = data.network || window.tvHostNetwork;
            this.soundFx = data.soundFx || window.soundFx;
            if (data.players) this.players = data.players.map(p => ({ ...p, isReady: false }));
            this.events.once('shutdown', this.cleanup, this);
            this.events.once('destroy', this.cleanup, this);
        }

        create() {
            this.cameras.main.setBackgroundColor('#0A0C14');

            const bg = this.add.graphics();
            bg.fillGradientStyle(0x131828, 0x131828, 0x080A10, 0x080A10, 1);
            bg.fillRect(0, 0, 1920, 1080);
            bg.lineStyle(1, 0x1B2338, 0.4);
            for (let x = 0; x < 1920; x += 120) { bg.moveTo(x, 0); bg.lineTo(x, 1080); }
            for (let y = 0; y < 1080; y += 120) { bg.moveTo(0, y); bg.lineTo(1920, y); }
            bg.strokePath();

            // Header
            this.add.text(100, 60, 'HOTEL SMART TV PARTY', {
                fontSize: '28px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE', letterSpacing: 4, fontStyle: 'bold'
            });
            this.add.text(100, 100, 'Party Room & Game Lobby', {
                fontSize: '48px', fontFamily: 'system-ui, sans-serif', color: '#FFFFFF', fontStyle: 'bold'
            });

            // Left QR Card
            const cardX = 100, cardY = 180, cardWidth = 440, cardHeight = 620;
            const cardBg = this.add.graphics();
            cardBg.fillStyle(0x131826, 0.95);
            cardBg.fillRoundedRect(cardX, cardY, cardWidth, cardHeight, 24);
            cardBg.lineStyle(2, 0x00D2D3, 0.4);
            cardBg.strokeRoundedRect(cardX, cardY, cardWidth, cardHeight, 24);

            this.add.text(cardX + cardWidth / 2, cardY + 36, 'ROOM CODE', {
                fontSize: '18px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE', letterSpacing: 3, fontStyle: 'bold'
            }).setOrigin(0.5);

            this.roomCodeText = this.add.text(cardX + cardWidth / 2, cardY + 80, '....', {
                fontSize: '68px', fontFamily: 'system-ui, sans-serif', color: '#00D2D3', fontStyle: 'bold', letterSpacing: 8
            }).setOrigin(0.5);

            this.qrGraphics = this.add.graphics();
            this.qrX = cardX + (cardWidth - 280) / 2;
            this.qrY = cardY + 140;

            this.add.text(cardX + cardWidth / 2, cardY + 450, 'SCAN WITH PHONE CAMERA', {
                fontSize: '16px', fontFamily: 'system-ui, sans-serif', color: '#2ED573', letterSpacing: 2, fontStyle: 'bold'
            }).setOrigin(0.5);

            this.urlDetailText = this.add.text(cardX + cardWidth / 2, cardY + 490, 'Connecting to server...', {
                fontSize: '18px', fontFamily: 'system-ui, sans-serif', color: '#FFFFFF', align: 'center', wordWrap: { width: cardWidth - 40 }
            }).setOrigin(0.5);

            this.playerCountPill = this.add.text(cardX + cardWidth / 2, cardY + 565, '0 / 8 Players Joined', {
                fontSize: '18px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE', backgroundColor: '#1E2538', padding: { x: 16, y: 8 }
            }).setOrigin(0.5);

            // Right Players Grid
            this.add.text(580, 180, 'CONNECTED PLAYERS', {
                fontSize: '22px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE', letterSpacing: 2, fontStyle: 'bold'
            });
            this.playersContainer = this.add.container(580, 220);
            this.renderPlayerSlots();

            // Right Games Carousel
            this.add.text(580, 520, 'SELECT PARTY GAME', {
                fontSize: '22px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE', letterSpacing: 2, fontStyle: 'bold'
            });
            this.carouselContainer = this.add.container(580, 560);
            this.renderGameCards();

            // Footer
            this.footerContainer = this.add.container(960, 960);
            this.startBtnBg = this.add.rectangle(0, 0, 800, 80, 0x1E2738, 0.95);
            this.startBtnBg.setStrokeStyle(3, 0x5C667A);
            this.startBtnText = this.add.text(0, 0, 'WAITING FOR PLAYERS TO JOIN...', {
                fontSize: '26px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE', fontStyle: 'bold', letterSpacing: 2
            }).setOrigin(0.5);
            this.footerContainer.add([this.startBtnBg, this.startBtnText]);

            this.add.text(960, 1030, 'TV Remote: [◀ / ▶] Change Game   |   [ENTER / OK] Start Game', {
                fontSize: '18px', fontFamily: 'system-ui, sans-serif', color: '#5C667A'
            }).setOrigin(0.5);

            this.setupNetworking();
            this.setupKeyNavigation();
        }

        renderPlayerSlots() {
            this.playersContainer.removeAll(true);
            const slotWidth = 300, slotHeight = 110, cols = 4, gapX = 24, gapY = 20;

            for (let i = 0; i < 8; i++) {
                const row = Math.floor(i / cols), col = i % cols;
                const x = col * (slotWidth + gapX), y = row * (slotHeight + gapY);
                const player = this.players[i] || null;
                const slot = this.add.container(x, y);
                const bg = this.add.graphics();

                if (player) {
                    const hexColor = parseInt(player.color.replace('#', '0x'), 16);
                    bg.fillStyle(0x131826, 0.95);
                    bg.fillRoundedRect(0, 0, slotWidth, slotHeight, 16);
                    bg.lineStyle(player.isReady ? 3 : 2, player.isReady ? 0x2ED573 : hexColor, 1);
                    bg.strokeRoundedRect(0, 0, slotWidth, slotHeight, 16);

                    const avatar = this.add.circle(44, slotHeight / 2, 28, hexColor);
                    const initial = this.add.text(44, slotHeight / 2, player.name.charAt(0).toUpperCase(), {
                        fontSize: '26px', fontFamily: 'system-ui, sans-serif', color: '#FFFFFF', fontStyle: 'bold'
                    }).setOrigin(0.5);

                    const name = this.add.text(86, slotHeight / 2 - 18, player.name, {
                        fontSize: '22px', fontFamily: 'system-ui, sans-serif', color: '#FFFFFF', fontStyle: 'bold'
                    });

                    const status = this.add.text(86, slotHeight / 2 + 10, player.isReady ? '✓ READY' : '● Waiting', {
                        fontSize: '16px', fontFamily: 'system-ui, sans-serif', color: player.isReady ? '#2ED573' : '#8F9CAE', fontStyle: 'bold'
                    });

                    slot.add([bg, avatar, initial, name, status]);
                } else {
                    bg.lineStyle(2, 0x1E2738, 0.8);
                    bg.strokeRoundedRect(0, 0, slotWidth, slotHeight, 16);
                    const placeholder = this.add.text(slotWidth / 2, slotHeight / 2, `Slot ${i + 1}\nWaiting for player...`, {
                        fontSize: '16px', fontFamily: 'system-ui, sans-serif', color: '#344055', align: 'center'
                    }).setOrigin(0.5);
                    slot.add([bg, placeholder]);
                }
                this.playersContainer.add(slot);
            }
            this.playerCountPill.setText(`${this.players.length} / 8 Players Joined`);
        }

        renderGameCards() {
            this.carouselContainer.removeAll(true);
            const cardWidth = 380, cardHeight = 220, gap = 30;

            this.gamesList.forEach((game, idx) => {
                const isSelected = idx === this.selectedGameIndex;
                const x = idx * (cardWidth + gap);
                const card = this.add.container(x, 0);

                const bg = this.add.graphics();
                bg.fillStyle(isSelected ? 0x1B2338 : 0x131826, 0.95);
                bg.fillRoundedRect(0, 0, cardWidth, cardHeight, 18);
                bg.lineStyle(isSelected ? 4 : 2, isSelected ? game.color : 0x243048, 1);
                bg.strokeRoundedRect(0, 0, cardWidth, cardHeight, 18);

                const title = this.add.text(24, 24, game.title, {
                    fontSize: '28px', fontFamily: 'system-ui, sans-serif', color: '#FFFFFF', fontStyle: 'bold'
                });

                const desc = this.add.text(24, 75, game.description, {
                    fontSize: '18px', fontFamily: 'system-ui, sans-serif', color: '#8F9CAE', wordWrap: { width: cardWidth - 48 }
                });

                const layoutTag = this.add.text(24, cardHeight - 48, `Layout: ${game.layout}`, {
                    fontSize: '15px', fontFamily: 'system-ui, sans-serif', color: isSelected ? '#00D2D3' : '#5C667A', fontStyle: 'bold', backgroundColor: '#0F1420', padding: { x: 10, y: 5 }
                });

                card.add([bg, title, desc, layoutTag]);
                this.carouselContainer.add(card);
            });
        }

        async setupNetworking() {
            if (!this.network) return;
            try {
                this.urlDetailText.setText('Connecting to server...');
                if (!this.network.isConnected) {
                    const connected = await this.network.connect((probingUrl) => {
                        this.urlDetailText.setText(`Searching server...\n${probingUrl}`);
                    });

                    if (!connected) {
                        this.urlDetailText.setText('Server not reached.\nPress [I] to set IP, [R] to retry');
                        return;
                    }
                }

                this.networkUnsubscribers.push(
                    this.network.on('ROOM_CREATED', (p) => this.handleRoomCreated(p)),
                    this.network.on('PLAYER_JOINED', (p) => this.handlePlayerJoined(p)),
                    this.network.on('LOBBY_STATE_UPDATE', (p) => this.handleLobbyUpdate(p)),
                    this.network.on('PLAYER_LEFT', (p) => this.handlePlayerLeft(p)),
                    this.network.on('GAME_STARTED', () => this.launchSelectedGame())
                );

                if (this.network.roomId) {
                    this.roomCodeText.setText(this.network.roomId);
                    if (this.network.controllerUrl) this.renderQRCode(this.network.controllerUrl);
                    this.renderPlayerSlots();
                    this.checkReadyStatus();
                } else {
                    this.network.createRoom('TV Launcher Host');
                }
            } catch (e) {
                this.urlDetailText.setText('Server connection failed.\nPress [I] to set server IP');
            }
        }

        handleRoomCreated(payload) {
            this.roomId = payload.roomId;
            this.controllerUrl = payload.controllerUrl;
            this.roomCodeText.setText(this.roomId);
            this.urlDetailText.setText(this.controllerUrl);
            this.renderQRCode(payload);
            const initialGame = this.gamesList[this.selectedGameIndex];
            this.network.selectGame(initialGame.id, initialGame.title);
        }

        renderQRCode(source) {
            this.qrGraphics.clear();
            const qrModules = (source && source.qrModules) ? source.qrModules : (this.network ? this.network.qrModules : null);
            const x = this.qrX;
            const y = this.qrY;
            const sizePx = 280;

            if (qrModules && qrModules.data) {
                const size = qrModules.size;
                const quietZone = 4; // ISO standard 4-module quiet zone
                const totalModules = size + (quietZone * 2);
                const moduleSize = sizePx / totalModules;

                // Sharp white background
                this.qrGraphics.fillStyle(0xFFFFFF, 1);
                this.qrGraphics.fillRect(x, y, sizePx, sizePx);

                // Dark modules
                this.qrGraphics.fillStyle(0x000000, 1);
                for (let r = 0; r < size; r++) {
                    for (let c = 0; c < size; c++) {
                        if (qrModules.data[r * size + c] === 1) {
                            const mx = x + (c + quietZone) * moduleSize;
                            const my = y + (r + quietZone) * moduleSize;
                            this.qrGraphics.fillRect(
                                Math.floor(mx),
                                Math.floor(my),
                                Math.ceil(moduleSize),
                                Math.ceil(moduleSize)
                            );
                        }
                    }
                }
                console.log('[Party Lobby] Spec-compliant on-canvas QR rendered.');
            }
        }

        handlePlayerJoined(payload) {
            const player = payload.player;
            const existingIdx = this.players.findIndex(p => p.id === player.id);
            if (existingIdx >= 0) this.players[existingIdx] = player;
            else this.players.push(player);

            if (this.soundFx) this.soundFx.joinChime();
            this.renderPlayerSlots();
            this.checkReadyStatus();
        }

        handleLobbyUpdate(payload) {
            if (payload.players) {
                this.players = payload.players;
                this.renderPlayerSlots();
                this.checkReadyStatus();
                if (payload.player && payload.player.isReady && this.soundFx) {
                    this.soundFx.readyBeep();
                }
            }
        }

        handlePlayerLeft(payload) {
            this.players = this.players.filter(p => p.id !== payload.playerId);
            this.renderPlayerSlots();
            this.checkReadyStatus();
        }

        checkReadyStatus() {
            const connectedPlayers = this.players.filter(p => p.connected !== false);
            const allReady = connectedPlayers.length > 0 && connectedPlayers.every(p => p.isReady);

            if (connectedPlayers.length === 0) {
                this.startBtnBg.setFillStyle(0x1E2738, 0.95);
                this.startBtnBg.setStrokeStyle(3, 0x5C667A);
                this.startBtnText.setText('WAITING FOR PLAYERS TO JOIN...');
                this.startBtnText.setColor('#8F9CAE');
                this.canStart = false;
            } else if (!allReady) {
                const readyCount = connectedPlayers.filter(p => p.isReady).length;
                this.startBtnBg.setFillStyle(0x1E2738, 0.95);
                this.startBtnBg.setStrokeStyle(3, 0xFFA502);
                this.startBtnText.setText(`WAITING FOR READY (${readyCount}/${connectedPlayers.length})`);
                this.startBtnText.setColor('#FFA502');
                this.canStart = true;
            } else {
                this.startBtnBg.setFillStyle(0x163826, 0.95);
                this.startBtnBg.setStrokeStyle(4, 0x2ED573);
                this.startBtnText.setText('⚡ ALL PLAYERS READY! PRESS [ENTER] TO START ⚡');
                this.startBtnText.setColor('#2ED573');
                this.canStart = true;
            }
        }

        setupKeyNavigation() {
            this.input.keyboard.on('keydown-LEFT', () => {
                if (this.selectedGameIndex > 0) {
                    this.selectedGameIndex--;
                    this.renderGameCards();
                    const g = this.gamesList[this.selectedGameIndex];
                    if (this.network) this.network.selectGame(g.id, g.title);
                }
            });

            this.input.keyboard.on('keydown-RIGHT', () => {
                if (this.selectedGameIndex < this.gamesList.length - 1) {
                    this.selectedGameIndex++;
                    this.renderGameCards();
                    const g = this.gamesList[this.selectedGameIndex];
                    if (this.network) this.network.selectGame(g.id, g.title);
                }
            });

            this.input.keyboard.on('keydown-ENTER', () => this.requestStartGame());
            this.input.keyboard.on('keydown-SPACE', () => this.requestStartGame());

            // Retry shortcut
            this.input.keyboard.on('keydown-R', () => {
                console.log('[Party Lobby] Retrying connection...');
                this.setupNetworking();
            });

            // IP config shortcut
            this.input.keyboard.on('keydown-I', () => {
                const current = localStorage.getItem('tv_server_url') || 'ws://10.0.2.2:3000';
                const input = prompt('Enter Party Server WebSocket URL:', current);
                if (input && input.trim()) {
                    localStorage.setItem('tv_server_url', input.trim());
                    if (this.network) this.network.disconnect();
                    this.setupNetworking();
                }
            });
        }

        requestStartGame() {
            if (!this.canStart && this.players.length === 0) return;
            const selectedGame = this.gamesList[this.selectedGameIndex];
            if (this.network) {
                this.network.startGame(selectedGame.id, selectedGame.layout, {});
            } else {
                this.launchSelectedGame();
            }
        }

        launchSelectedGame() {
            const selectedGame = this.gamesList[this.selectedGameIndex];
            this.scene.start(selectedGame.sceneKey, {
                roomId: this.roomId,
                players: this.players,
                network: this.network,
                soundFx: this.soundFx
            });
        }

        cleanup() {
            for (const unsub of this.networkUnsubscribers) {
                if (typeof unsub === 'function') unsub();
            }
            this.networkUnsubscribers = [];
            this.tweens.killAll();
        }
    }

    // -------------------------------------------------------------------------
    // 5. Expose launchGame for TV Game Launcher
    // -------------------------------------------------------------------------
    window.launchGame = function(containerId) {
        console.log('[Party Lobby] Launching game inside container:', containerId);

        const config = {
            type: Phaser.AUTO,
            width: 1920,
            height: 1080,
            parent: containerId,
            backgroundColor: '#0A0C14',
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH
            },
            scene: [
                LobbyScene,
                DemoBuzzerGameScene,
                NeonTankGameScene
            ]
        };

        const game = new Phaser.Game(config);

        // Enhance exitGame cleanup hook
        const originalExit = window.appLauncher ? window.appLauncher.exitGame : null;
        if (window.appLauncher && !window.appLauncher._partyHooked) {
            window.appLauncher._partyHooked = true;
            window.appLauncher.exitGame = function() {
                if (window.tvHostNetwork) {
                    window.tvHostNetwork.disconnect();
                }
                if (originalExit) {
                    originalExit.call(window.appLauncher);
                }
            };
        }

        return game;
    };
})();
