import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { backdrops, createProject, md5 } from './project.ts';
const root = new URL('../', import.meta.url);
const config = JSON.parse(
  await readFile(new URL('config/app.json', root), 'utf8'),
) as { title: string };
const assets = backdrops().map((costume) => ({
  ...costume,
  file: `${md5(costume.contents)}.svg`,
}));
const files = new Map<string, string>([
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
        archiveEntries: ['project.json', ...assets.map((asset) => asset.file)],
      },
      null,
      2,
    ) + '\n',
  ],
]);
for (const asset of assets) {
  files.set(`apps/main/source/assets/${asset.file}`, asset.contents);
}
const write = process.argv.includes('--write');
for (const [path, contents] of files) {
  const url = new URL(path, root);
  if (write) {
    await mkdir(new URL('.', url), { recursive: true });
    await writeFile(url, contents);
  } else if ((await readFile(url, 'utf8')) !== contents) {
    throw new Error(`${path} is stale; run pnpm source:update.`);
  }
}
// An asset whose board changed keeps its old file under a hash nobody
// references. Left behind it would still be committed, still be packed into the
// SB3 by archiveEntries drift, and still look like part of the project.
const assetDirectory = new URL('apps/main/source/assets/', root);
await mkdir(assetDirectory, { recursive: true });
const expected = new Set(assets.map((asset) => asset.file));
const orphans = (await readdir(assetDirectory)).filter(
  (name) => !expected.has(name),
);
if (orphans.length > 0) {
  if (!write) {
    throw new Error(
      `apps/main/source/assets holds files no costume references: ${orphans.join(', ')}; run pnpm source:update.`,
    );
  }
  for (const orphan of orphans) {
    await unlink(new URL(orphan, assetDirectory));
  }
}
await mkdir(new URL('apps/main/source/extensions/', root), { recursive: true });
console.log('SB3 source matches the authored project.');
