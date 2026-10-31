// Zero-dependency static file server for dist/ (or any folder): node tools/serve.mjs [folder] [port]
// Binds to 127.0.0.1 only. Used by Start_Digital_Twin.bat (serve option) and by the e2e tests.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

export function createStaticServer(rootDir) {
  const base = path.resolve(rootDir);
  return http.createServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://localhost');
      let p = decodeURIComponent(u.pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.resolve(base, '.' + p);
      if (!file.startsWith(base)) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
        fs.createReadStream(file).pipe(res);
      });
    } catch (e) {
      res.writeHead(400); res.end('Bad request');
    }
  });
}

export function serve(rootDir, port = 8080, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const srv = createStaticServer(rootDir);
    srv.once('error', reject);
    srv.listen(port, host, () => resolve(srv));
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, 'dist');
  const port = Number(process.argv[3] || process.env.PORT || 8080);
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    console.error(`No index.html in ${dir}. Run "npm run build" first.`);
    process.exit(1);
  }
  serve(dir, port).then(() => console.log(`Amphicos FPSO Digital Twin at http://127.0.0.1:${port}/  (Ctrl+C to stop)`));
}
