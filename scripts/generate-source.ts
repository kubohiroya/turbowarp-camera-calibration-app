import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { assetId, backdrop, createProject } from './project.ts';
const root = new URL('../', import.meta.url);
const config = JSON.parse(
  await readFile(new URL('config/app.json', root), 'utf8'),
) as { title: string };
const files = new Map([
  [
    'apps/main/source/project.source.json',
    JSON.stringify(createProject(config.title), null, 2) + '\n',
  ],
  [
    'apps/main/source/embedded-extensions.json',
    JSON.stringify({ formatVersion: 1, extensions: [] }, null, 2) + '\n',
  ],
  [
    'apps/main/source/sb3-source.json',
    JSON.stringify(
      {
        formatVersion: 1,
        project: 'project.source.json',
        embeddedExtensions: 'embedded-extensions.json',
        assetsDirectory: 'assets',
        archiveEntries: ['project.json', `${assetId}.svg`],
      },
      null,
      2,
    ) + '\n',
  ],
  [`apps/main/source/assets/${assetId}.svg`, backdrop],
]);
for (const [path, contents] of files) {
  const url = new URL(path, root);
  if (process.argv.includes('--write')) {
    await mkdir(new URL('.', url), { recursive: true });
    await writeFile(url, contents);
  } else if ((await readFile(url, 'utf8')) !== contents) {
    throw new Error(`${path} is stale; run pnpm source:update.`);
  }
}
await mkdir(new URL('apps/main/source/extensions/', root), { recursive: true });
console.log('SB3 source matches the authored project.');
