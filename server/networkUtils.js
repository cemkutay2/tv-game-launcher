const os = require('os');

/**
 * Returns the primary local IPv4 address on the network (non-internal, Wi-Fi or Ethernet).
 * Useful for Smart TVs and mobile phones on the same local Wi-Fi.
 */
function getLocalNetworkIp() {
    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                // Prefer common Wi-Fi / Ethernet interface names if multiple exist
                const lowerName = name.toLowerCase();
                const isLikelyLan = lowerName.startsWith('en') || 
                                     lowerName.startsWith('eth') || 
                                     lowerName.startsWith('wlan') || 
                                     lowerName.startsWith('wi-fi');
                candidates.push({ ip: net.address, priority: isLikelyLan ? 1 : 2 });
            }
        }
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => a.priority - b.priority);
        return candidates[0].ip;
    }

    return '127.0.0.1';
}

/**
 * Generates the full controller URL for players to join the room.
 */
function getControllerUrl(port, roomId, customHost = null) {
    const host = customHost || getLocalNetworkIp();
    return `http://${host}:${port}/play?room=${roomId}`;
}

module.exports = {
    getLocalNetworkIp,
    getControllerUrl
};
