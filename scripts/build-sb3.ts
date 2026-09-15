import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = 'public/downloads/app.sb3';
await mkdir('public/downloads', { recursive: true });
execFileSync('pnpm', ['exec', 'sb3-toolchain', 'check', 'apps/main/source'], {
  stdio: 'inherit',
});
execFileSync(
  'pnpm',
  [
    'exec',
    'sb3-toolchain',
    'build',
    'apps/main/source',
    '--output',
    output,
    '--yes',
  ],
  { stdio: 'inherit' },
);
const bytes = await readFile(output);
await writeFile(
  'public/downloads/release.json',
  JSON.stringify(
    {
      file: 'app.sb3',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    null,
    2,
  ) + '\n',
);
