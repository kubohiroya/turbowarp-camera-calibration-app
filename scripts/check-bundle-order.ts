// SPDX-License-Identifier: MPL-2.0
/**
 * Checks the built SB3, not the source it was built from.
 *
 * The camera extensions read their feature flags off `globalThis` once, while
 * their module body runs, so the injector has to be evaluated first. That
 * ordering lives in the project's extension list and is easy to preserve by
 * accident and lose by accident -- a reordered map literal, a rebuilt source, a
 * bundling step that groups entries. Losing it produces a project where the
 * flags are simply not in effect, which looks like the flags having been left
 * off rather than like an ordering fault.
 *
 * So it is asserted where it finally matters: on the bytes a user downloads.
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { EMBEDDED_EXTENSION_IDS } from './extensions.ts';
import { FLAG_EXTENSION_ID } from './feature-flag-extension.ts';

const archive = readFileSync(
  new URL('../public/downloads/app.sb3', import.meta.url),
);
const project = JSON.parse(readEntry(archive, 'project.json')) as {
  extensions: string[];
  extensionURLs: Record<string, string>;
};

const errors: string[] = [];

if (project.extensions[0] !== FLAG_EXTENSION_ID) {
  errors.push(
    `the SB3 evaluates ${project.extensions[0]} before the feature flag injector`,
  );
}
if (project.extensions.join() !== EMBEDDED_EXTENSION_IDS.join()) {
  errors.push(
    `the SB3 lists ${project.extensions.join(', ')}; the build declares ${EMBEDDED_EXTENSION_IDS.join(', ')}`,
  );
}

// The list is the load order, but the URLs are what carry the code, and a
// reader that walks the object rather than the array would take them in this
// order instead. Both have to agree, so neither reading can be the wrong one.
const serialized = JSON.stringify(project.extensionURLs);
const offsets = EMBEDDED_EXTENSION_IDS.map((id) => ({
  id,
  offset: serialized.indexOf(JSON.stringify(id)),
}));
for (const entry of offsets) {
  if (entry.offset < 0) errors.push(`the SB3 carries no URL for ${entry.id}`);
}
const flags = offsets.find((entry) => entry.id === FLAG_EXTENSION_ID);
for (const entry of offsets) {
  if (entry.id === FLAG_EXTENSION_ID) continue;
  if (flags !== undefined && entry.offset < flags.offset) {
    errors.push(
      `${entry.id} is stored ahead of the feature flag injector in the SB3`,
    );
  }
}

if (errors.length > 0) {
  process.stderr.write(`Extension evaluation order is wrong:\n`);
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write(
  `Extension evaluation order holds: ${project.extensions.join(' -> ')}\n`,
);

/**
 * Reads one file out of a ZIP by walking its local headers.
 *
 * Enough of the format for an archive this build produced itself: stored and
 * deflated entries, no encryption, no ZIP64. A general reader is not needed and
 * would be a second thing to be wrong.
 */
function readEntry(zip: Buffer, wanted: string): string {
  let offset = 0;
  while (offset + 30 <= zip.length) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) break;
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = zip
      .subarray(nameStart, nameStart + nameLength)
      .toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (name === wanted) {
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }
    offset = dataStart + compressedSize;
  }
  throw new Error(`the SB3 has no ${wanted} entry`);
}
