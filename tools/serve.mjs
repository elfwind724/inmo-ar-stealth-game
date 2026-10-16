import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain' };
http.createServer(async (req, res) => {
  try {
    const file = path.resolve(root, '.' + decodeURIComponent((req.url || '/').split('?')[0]));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    const target = file === root ? path.join(root, 'index.html') : file;
    res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
    res.end(await fs.readFile(target));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Game: http://localhost:4173'));
