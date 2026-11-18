import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

export async function compileBrowserApp({
  entry,
  outdir,
  publicPrefix,
  name = path.basename(entry, path.extname(entry)),
  target = ['chrome55', 'safari11'],
}) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target,
    charset: 'utf8',
    legalComments: 'none',
  });
  const script = result.outputFiles[0].contents;
  const hash = createHash('sha256').update(script).digest('hex').slice(0, 12);
  const filename = `${name}-${hash}.js`;
  await fs.mkdir(outdir, { recursive: true });
  await fs.writeFile(path.join(outdir, filename), script);
  // Older cached pages can still request the original script filename.
  await fs.writeFile(path.join(outdir, `${name}.js`), script);
  return `${publicPrefix.replace(/\/$/, '')}/${filename}`;
}
