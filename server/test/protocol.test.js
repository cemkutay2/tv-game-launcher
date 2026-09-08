const assert = require('assert');
const { WebSocket } = require('ws');
const { start, stop } = require('../server');

async function runProtocolTests() {
    console.log('--- Starting Room & Lobby Protocol Tests ---');
    const TEST_PORT = 3199;
    const { server, wss, roomManager } = await start(TEST_PORT, '127.0.0.1');

    function connectWs() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
            ws.on('open', () => resolve(ws));
            ws.on('error', reject);
        });
    }

    function waitForMessage(ws, expectedType, timeoutMs = 2000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout waiting for message type: ${expectedType}`));
            }, timeoutMs);

            const handler = (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === expectedType) {
                        clearTimeout(timer);
                        ws.off('message', handler);
                        resolve(msg);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            };

            ws.on('message', handler);
        });
    }

    try {
        // 1. Host creates room
        console.log('[Test 1] Host creates room...');
        const hostWs = await connectWs();
        hostWs.send(JSON.stringify({
            type: 'ROOM_CREATE',
            senderId: 'host_tv',
            payload: { hostName: 'Lounge TV' }
        }));

        const roomCreatedMsg = await waitForMessage(hostWs, 'ROOM_CREATED');
        assert.ok(roomCreatedMsg.payload.roomId, 'Room ID should be generated');
        assert.strictEqual(roomCreatedMsg.payload.roomId.length, 4, 'Room code must be 4 characters');
        assert.match(roomCreatedMsg.payload.roomId, /^[A-Z2-9]{4}$/, 'Room code must be 4 uppercase alphanumeric chars');
        assert.ok(roomCreatedMsg.payload.controllerUrl.includes(roomCreatedMsg.payload.roomId), 'Controller URL contains room code');
        const roomId = roomCreatedMsg.payload.roomId;
        console.log(`  ✓ Room created with code: ${roomId}`);

        // 2. Mobile Player 1 Joins
        console.log('[Test 2] Player 1 joins room...');
        const p1Ws = await connectWs();
        p1Ws.send(JSON.stringify({
            type: 'PLAYER_JOIN',
            roomId,
            senderId: 'temp_p1',
            payload: { name: 'Alice', color: '#FF4757' }
        }));

        const p1JoinedPromise = waitForMessage(p1Ws, 'PLAYER_JOINED');
        const hostNotifiedPromise = waitForMessage(hostWs, 'PLAYER_JOINED');
        const [p1JoinedMsg, hostP1Msg] = await Promise.all([p1JoinedPromise, hostNotifiedPromise]);

        assert.strictEqual(p1JoinedMsg.payload.player.name, 'Alice');
        assert.strictEqual(p1JoinedMsg.payload.player.color, '#FF4757');
        assert.strictEqual(p1JoinedMsg.payload.player.isReady, false);
        const p1Id = p1JoinedMsg.payload.player.id;
        console.log(`  ✓ Player 1 joined with ID: ${p1Id}`);

        // 3. Mobile Player 2 Joins
        console.log('[Test 3] Player 2 joins room...');
        const p2Ws = await connectWs();
        p2Ws.send(JSON.stringify({
            type: 'PLAYER_JOIN',
            roomId,
            senderId: 'temp_p2',
            payload: { name: 'Bob', color: '#00D2D3' }
        }));

        const [p2JoinedMsg] = await Promise.all([
            waitForMessage(p2Ws, 'PLAYER_JOINED'),
            waitForMessage(hostWs, 'PLAYER_JOINED')
        ]);
        const p2Id = p2JoinedMsg.payload.player.id;
        console.log(`  ✓ Player 2 joined with ID: ${p2Id}`);

        // 4. Players Toggle Ready
        console.log('[Test 4] Player 1 & 2 toggle ready...');
        p1Ws.send(JSON.stringify({
            type: 'PLAYER_READY',
            roomId,
            senderId: p1Id,
            payload: { isReady: true }
        }));
        const readyUpdate1 = await waitForMessage(hostWs, 'LOBBY_STATE_UPDATE');
        assert.strictEqual(readyUpdate1.payload.allReady, false, 'Not all ready yet');

        p2Ws.send(JSON.stringify({
            type: 'PLAYER_READY',
            roomId,
            senderId: p2Id,
            payload: { isReady: true }
        }));
        const readyUpdate2 = await waitForMessage(hostWs, 'LOBBY_STATE_UPDATE');
        assert.strictEqual(readyUpdate2.payload.allReady, true, 'All players ready now');
        console.log('  ✓ All players ready detected');

        // 5. Host Starts Game
        console.log('[Test 5] Host starts party game (BUZZER)...');
        hostWs.send(JSON.stringify({
            type: 'GAME_START',
            roomId,
            senderId: 'host_tv',
            payload: { gameId: 'demo-buzzer', controllerLayoutType: 'BUZZER' }
        }));

        const [p1GameStart, p2GameStart, hostGameStart] = await Promise.all([
            waitForMessage(p1Ws, 'GAME_START'),
            waitForMessage(p2Ws, 'GAME_START'),
            waitForMessage(hostWs, 'GAME_STARTED')
        ]);
        assert.strictEqual(p1GameStart.payload.controllerLayoutType, 'BUZZER');
        assert.strictEqual(p2GameStart.payload.controllerLayoutType, 'BUZZER');
        assert.strictEqual(hostGameStart.payload.gameId, 'demo-buzzer');
        console.log('  ✓ Game started and layout broadcasted to controllers');

        // 6. High Frequency Controller Input Forwarding
        console.log('[Test 6] Player 1 presses buzzer (CONTROLLER_INPUT)...');
        const inputSendTime = Date.now();
        p1Ws.send(JSON.stringify({
            type: 'CONTROLLER_INPUT',
            roomId,
            senderId: p1Id,
            payload: {
                inputType: 'button_down',
                action: 'BUZZ',
                timestamp: inputSendTime
            }
        }));

        const hostInputMsg = await waitForMessage(hostWs, 'PLAYER_INPUT');
        const receiveTime = Date.now();
        assert.strictEqual(hostInputMsg.payload.playerId, p1Id);
        assert.strictEqual(hostInputMsg.payload.action, 'BUZZ');
        console.log(`  ✓ Input forwarded to TV host in ${receiveTime - inputSendTime}ms`);

        // 7. Game Over & Return to Lobby
        console.log('[Test 7] Host ends game and returns to lobby...');
        hostWs.send(JSON.stringify({
            type: 'RETURN_TO_LOBBY',
            roomId,
            senderId: 'host_tv',
            payload: {}
        }));

        const [p1Lobby, p2Lobby, hostLobby] = await Promise.all([
            waitForMessage(p1Ws, 'RETURN_TO_LOBBY'),
            waitForMessage(p2Ws, 'RETURN_TO_LOBBY'),
            waitForMessage(hostWs, 'RETURN_TO_LOBBY')
        ]);
        assert.strictEqual(hostLobby.payload.roomState.roomState, 'LOBBY');
        console.log('  ✓ Return to lobby synchronized across all clients');

        // Cleanup
        hostWs.close();
        p1Ws.close();
        p2Ws.close();
        await new Promise((r) => setTimeout(r, 100));
        await stop();

        console.log('\n>>> All Protocol Tests Passed Successfully! <<<\n');
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        await stop().catch(() => {});
        process.exit(1);
    }
}

runProtocolTests();
