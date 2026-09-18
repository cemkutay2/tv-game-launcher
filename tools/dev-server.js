// Zero-dependency static file server for wwwroot/, so games can be tested in a
// desktop browser without building/running the MAUI app or an emulator.
//
// Usage:
//   node tools/dev-server.js [port]
//   (defaults to port 8080, or the PORT env var)
//
// Then open http://localhost:<port>/dev-harness.html

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const ROOT = path.resolve(__dirname, '../wwwroot');

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

const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(ROOT, safePath === '/' ? 'dev-harness.html' : safePath);

    // Never serve outside wwwroot/
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (!err && stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        fs.readFile(filePath, (readErr, content) => {
            if (readErr) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found: ' + safePath);
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
            res.end(content);
        });
    });
});

server.listen(PORT, () => {
    console.log(`Game test harness running at http://localhost:${PORT}/dev-harness.html`);
    console.log(`(serving ${ROOT})`);
    console.log('For party games, also run "npm start" in server/ in another terminal.');
});
