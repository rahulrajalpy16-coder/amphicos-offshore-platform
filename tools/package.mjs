// Zips the offline edition: dist/Amphicos_Platform_Offline.zip (Windows and macOS launchers, all files local).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'dist/offline'), out = path.join(root, 'dist/Amphicos_Platform_Offline.zip');
fs.rmSync(out, { force: true });
// python's zipfile keeps the macOS launcher executable (unix mode in the zip entry)
execFileSync('python3', ['-c', `
import os, zipfile, sys
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for d, _, fs in os.walk(src):
        for f in sorted(fs):
            p = os.path.join(d, f); a = os.path.relpath(p, src)
            zi = zipfile.ZipInfo.from_file(p, a); zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = ((0o755 if f.endswith('.command') else 0o644) | 0o100000) << 16
            with open(p, 'rb') as fh: z.writestr(zi, fh.read())
`, src, out]);
console.log('offline package:', path.relative(root, out), (fs.statSync(out).size / 1048576).toFixed(1), 'MB');
