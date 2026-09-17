// SPDX-License-Identifier: MPL-2.0
/**
 * Reads an exported profile file the way a receiving app does, and says what is in it.
 *
 * For checking a file saved from the profile list (or text read off the QR
 * code) on a real machine: it goes through the installed Camera Source's own
 * reader, so a file this accepts is one a receiving app accepts. With a second
 * file, it also says whether the two carry the same text, ignoring the CR that
 * TurboWarp's export writes.
 *
 *   pnpm profile:read ~/Downloads/profile.txt [qr.txt]
 */
import { readFileSync } from 'node:fs';
import {
  readCameraProfileDocument,
  readProfileText,
} from '@kubohiroya/turbowarp-camera-source/profile';

const [path, other] = process.argv.slice(2);
if (path === undefined) {
  process.stderr.write(
    'Usage: pnpm profile:read <profile file> [second file]\n',
  );
  process.exit(2);
}

const normalize = (text: string) =>
  text.replace(/\r/g, '').replace(/\n*$/, '\n');
const text = readFileSync(path, 'utf8');
const read = readProfileText(text);
const result = read.ok ? readCameraProfileDocument(read.document) : read;

if (!result.ok) {
  const { code, path: member, message } = result.error;
  process.stderr.write(
    `Refused (${code}) ${member ? `${member}: ` : ''}${message}\n`,
  );
  process.exit(1);
}

const { profile } = result;
const lines = [
  `bytes: ${Buffer.byteLength(normalize(text))}`,
  `camera: ${profile.cameraId}`,
  `profile: ${profile.profileId}, calibrated at ${profile.calibratedAt}`,
  `image: ${profile.image.width}x${profile.image.height}`,
  `intrinsics: fx ${profile.intrinsics.fx}, fy ${profile.intrinsics.fy}, cx ${profile.intrinsics.cx}, cy ${profile.intrinsics.cy}`,
  `distortion: ${profile.distortion.model} [${profile.distortion.coefficients.join(', ')}]`,
  `capture: ${JSON.stringify(profile.capture ?? null)}`,
  `quality: ${JSON.stringify(profile.quality ?? null)}`,
  `device: ${JSON.stringify(profile.device ?? null)}`,
  `ROS camera_info: ${/^image_width: /.test(text) ? 'yes' : 'no (JSON)'}`,
];
if (other !== undefined) {
  const same = normalize(readFileSync(other, 'utf8')) === normalize(text);
  lines.push(`same text as ${other}: ${same ? 'yes' : 'NO'}`);
  if (!same) process.exitCode = 1;
}
process.stdout.write(`${lines.join('\n')}\n`);
