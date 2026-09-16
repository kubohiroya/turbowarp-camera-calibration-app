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

// The SB3 carries the OpenCV build, so it is megabytes and expected to be. The
// ceiling is not a size target; it is there to catch the archive growing by
// something nobody meant to add -- a second copy of an extension, an asset that
// should have been pruned -- which otherwise shows up only as a slow download.
// Measured: 3,220 B with the calibration path off, 2,221,684 B with it on.
// The ceiling was 8 MiB when the extension carried a 10.9 MB OpenCV; against a
// 2.2 MB archive that would no longer catch anything.
const MAXIMUM_BYTES = 4 * 1024 * 1024;
if (bytes.byteLength > MAXIMUM_BYTES) {
  throw new Error(
    `${output} is ${bytes.byteLength} B, over the ${MAXIMUM_BYTES} B ceiling. Check what was added before raising it.`,
  );
}

await writeFile(
  'public/downloads/release.json',
  JSON.stringify(
    {
      file: 'app.sb3',
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    null,
    2,
  ) + '\n',
);
