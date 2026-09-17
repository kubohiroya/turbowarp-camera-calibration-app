import { guideCostumes } from '../src/guide.ts';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import {
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
// The one asset that is not text. Kept apart because comparing it as a string
// would decode bytes that are not characters, and a difference in what does
// not decode would be reported as no difference at all.
const binaries = new Map<string, Uint8Array>(
  sounds.map((sound) => [`apps/main/source/assets/${sound.file}`, sound.bytes]),
);

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
for (const [path, bytes] of binaries) {
  const url = new URL(path, root);
  if (write) {
    await mkdir(new URL('.', url), { recursive: true });
    await writeFile(url, bytes);
  } else {
    const found = await readFile(url).catch(() => undefined);
    if (!found || !found.equals(Buffer.from(bytes))) {
      throw new Error(`${path} is stale; run pnpm source:update.`);
    }
  }
}

// An extension file left behind when the calibration path is switched off is
// still committed, still validated, and still looks like part of the project --
// while nothing lists it. The toolchain reports it as an extra file rather than
// removing it, so the removal happens here.
const extensionDirectory = new URL('apps/main/source/extensions/', root);
await mkdir(extensionDirectory, { recursive: true });
const expectedExtensionFiles = new Set(
  extensions.flatMap((extension) => [
    `${extension.id}.js`,
    `${extension.id}.manifest.json`,
  ]),
);
const strayExtensions = (await readdir(extensionDirectory)).filter(
  (name) => !expectedExtensionFiles.has(name),
);
if (strayExtensions.length > 0) {
  if (!write) {
    throw new Error(
      `apps/main/source/extensions holds files nothing embeds: ${strayExtensions.join(', ')}; run pnpm source:update.`,
    );
  }
  for (const stray of strayExtensions) {
    await unlink(new URL(stray, extensionDirectory));
  }
}

// An asset whose board changed keeps its old file under a hash nobody
// references. Left behind it would still be committed, still be packed into the
// SB3 by archiveEntries drift, and still look like part of the project.
const assetDirectory = new URL('apps/main/source/assets/', root);
await mkdir(assetDirectory, { recursive: true });
const expected = new Set([
  ...assets.map((asset) => asset.file),
  ...sounds.map((sound) => sound.file),
]);
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
console.log('SB3 source matches the authored project.');
