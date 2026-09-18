import { guideCostumes } from '../src/guide.ts';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import {
  applyButtonCostume,
  backButtonCostume,
  profileQrCostume,
  backdrops,
  createProject,
  md5,
  soundFiles,
  titleButtons,
} from './project.ts';
import {
  EMBEDS_EXTENSIONS,
  EXTENSION_PINS,
  embeddedExtensions,
  resolveExtension,
} from './extensions.ts';
const root = new URL('../', import.meta.url);
const config = JSON.parse(
  await readFile(new URL('config/app.json', root), 'utf8'),
) as { title: string };
const extensions = EMBEDS_EXTENSIONS
  ? EXTENSION_PINS.map(resolveExtension)
  : [];
const assets = [
  ...backdrops(EMBEDS_EXTENSIONS),
  // The opening screen's controls.
  ...(EMBEDS_EXTENSIONS ? titleButtons().map((button) => button.costume) : []),
  // The way back, once a session is over.
  ...(EMBEDS_EXTENSIONS ? [backButtonCostume()] : []),
  // Applying a profile read on the import screen.
  ...(EMBEDS_EXTENSIONS ? [applyButtonCostume()] : []),
  // What the QR code's sprite wears when no code is up.
  ...(EMBEDS_EXTENSIONS ? [profileQrCostume()] : []),
  // The tilt guide's four pictures, which live on one sprite over the preview.
  ...(EMBEDS_EXTENSIONS ? guideCostumes() : []),
].map((costume) => ({
  ...costume,
  file: `${md5(costume.contents)}.svg`,
}));
// Everything this app says without words, in the build that can say it.
const sounds = EMBEDS_EXTENSIONS ? soundFiles() : [];
const files = new Map<string, string>([
  [
    'apps/main/source/project.source.json',
    JSON.stringify(createProject(config.title), null, 2) + '\n',
  ],
  [
    'apps/main/source/embedded-extensions.json',
    JSON.stringify(embeddedExtensions(extensions), null, 2) + '\n',
  ],
  [
    'apps/main/source/sb3-source.json',
    JSON.stringify(
      {
        formatVersion: 1,
        project: 'project.source.json',
        embeddedExtensions: 'embedded-extensions.json',
        assetsDirectory: 'assets',
        archiveEntries: [
          'project.json',
          ...assets.map((asset) => asset.file),
          ...sounds.map((sound) => sound.file),
        ],
      },
      null,
      2,
    ) + '\n',
  ],
]);
for (const asset of assets) {
  files.set(`apps/main/source/assets/${asset.file}`, asset.contents);
}
for (const extension of extensions) {
  files.set(
    `apps/main/source/extensions/${extension.id}.js`,
    extension.javascript.toString('utf8'),
  );
  files.set(
    `apps/main/source/extensions/${extension.id}.manifest.json`,
    extension.manifest.toString('utf8'),
  );
}
const binaries = new Map<string, Uint8Array>(
  sounds.map((sound) => [`apps/main/source/assets/${sound.file}`, sound.bytes]),
);

// The directory is build output, not source: everything in it comes from the
// scripts above and from the pinned packages in node_modules. Starting from an
// empty directory means a file an earlier build wrote -- an asset under a hash
// no costume references any more, an extension the flags have since switched
// off -- cannot survive into the SB3.
await rm(new URL('apps/main/source/', root), { recursive: true, force: true });
for (const [path, contents] of [...files, ...binaries]) {
  const url = new URL(path, root);
  await mkdir(new URL('.', url), { recursive: true });
  await writeFile(url, contents);
}
console.log('Generated apps/main/source from the authored project.');
