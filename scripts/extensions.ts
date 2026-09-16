// SPDX-License-Identifier: MPL-2.0
/**
 * The extensions embedded in the SB3, pinned to what is installed here.
 *
 * A TurboWarp extension ships as one standalone file, so embedding one means
 * carrying its bytes. The bytes are taken from the exact npm version this
 * repository installs, and recorded with their SHA-256, so the SB3 a user
 * downloads can be traced to a published artifact rather than to whatever was
 * on someone's disk at build time.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { FLAG_EXTENSION_ID } from './feature-flag-extension.ts';

const require = createRequire(import.meta.url);

export interface ExtensionPin {
  /** The extension ID, as it appears in opcodes and in the project's list. */
  readonly id: string;
  readonly packageName: string;
  /** JavaScript artifact, relative to the package root. */
  readonly artifact: string;
  /** API manifest, relative to the package root. Compared before an update. */
  readonly apiManifest: string;
}

/**
 * Embedded in this order, and the order is load-bearing.
 *
 * Both extensions read their feature flags off `globalThis` once, while their
 * module body runs. A flag set after that is a flag that does nothing, and
 * nothing about the resulting project says so: the blocks are simply absent and
 * the capability is simply missing.
 */
export const EXTENSION_PINS: readonly ExtensionPin[] = [
  {
    id: 'kubohiroyacamerasource',
    packageName: '@kubohiroya/turbowarp-camera-source',
    artifact: 'dist/camera-source.js',
    apiManifest: 'dist/extension-manifest.json',
  },
  {
    id: 'kubohiroyacameracalibration',
    packageName: '@kubohiroya/turbowarp-camera-calibration',
    artifact: 'dist/camera-calibration.js',
    apiManifest: 'dist/extension-manifest.json',
  },
];

export interface ResolvedExtension extends ExtensionPin {
  readonly version: string;
  readonly javascript: Buffer;
  readonly manifest: Buffer;
}

/** SRI form, which is what `embedded-extensions.json` records. */
export function integrity(bytes: Buffer): string {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

/**
 * Reads one pinned extension out of `node_modules`.
 *
 * The version has to be pinned exactly in this repository's `package.json`, and
 * the installed package has to be that version. A range would let two builds of
 * the same commit embed different bytes, and an extension that has not been
 * published cannot be installed at an exact version at all -- which is the
 * mechanical refusal the plan asks for, rather than a reviewer noticing.
 */
export function resolveExtension(pin: ExtensionPin): ResolvedExtension {
  const manifestPath = require.resolve(`${pin.packageName}/package.json`);
  const root = new URL('.', `file://${manifestPath}`);
  const installed = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version: string;
  };
  const declared = declaredVersion(pin.packageName);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(declared)) {
    throw new Error(
      `${pin.packageName} must be pinned to an exact version in package.json; found ${declared}.`,
    );
  }
  if (installed.version !== declared) {
    throw new Error(
      `${pin.packageName} is pinned to ${declared} but ${installed.version} is installed; run pnpm install.`,
    );
  }
  const javascript = readFileSync(new URL(pin.artifact, root));
  requireIdHeader(javascript, pin);
  return {
    ...pin,
    version: installed.version,
    javascript,
    manifest: readFileSync(new URL(pin.apiManifest, root)),
  };
}

/**
 * The `// ID:` header has to name the extension this project lists.
 *
 * The toolchain checks this too, but it checks the copy already written into
 * the source tree. Checking the package's own file first means a mismatch is
 * reported against the artifact it came from.
 */
function requireIdHeader(javascript: Buffer, pin: ExtensionPin): void {
  const header = javascript.subarray(0, 512).toString('utf8');
  const found = /^\/\/ ID: (.+)$/mu.exec(header)?.[1]?.trim();
  if (found !== pin.id) {
    throw new Error(
      `${pin.packageName} declares extension ID ${found ?? '(none)'}, not ${pin.id}.`,
    );
  }
}

function declaredVersion(packageName: string): string {
  const own = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared =
    own.dependencies?.[packageName] ?? own.devDependencies?.[packageName];
  if (declared === undefined) {
    throw new Error(
      `${packageName} is embedded but not declared in package.json.`,
    );
  }
  return declared;
}

/**
 * Every extension ID the project lists, in evaluation order.
 *
 * The flag injector is first and that is the whole point of it: the two camera
 * extensions read their flags while their module body runs, so anything that
 * sets those flags has to have finished before they start.
 */
export const EMBEDDED_EXTENSION_IDS: readonly string[] = [
  FLAG_EXTENSION_ID,
  ...EXTENSION_PINS.map((pin) => pin.id),
];

/** `embedded-extensions.json`, in the order the extensions are evaluated. */
export function embeddedExtensions(resolved: readonly ResolvedExtension[]) {
  return {
    formatVersion: 1,
    extensions: [
      {
        // Authored here rather than installed, so it carries no npm source.
        id: FLAG_EXTENSION_ID,
        path: `extensions/${FLAG_EXTENSION_ID}.js`,
        mediaType: 'text/javascript',
        parameters: [],
        encoding: 'base64',
      },
      ...resolved.map((extension) => ({
        id: extension.id,
        path: `extensions/${extension.id}.js`,
        mediaType: 'text/javascript',
        parameters: [],
        encoding: 'base64',
        source: {
          provider: 'npm',
          package: extension.packageName,
          version: extension.version,
          artifact: extension.artifact,
          integrity: integrity(extension.javascript),
          apiManifest: {
            artifact: extension.apiManifest,
            path: `extensions/${extension.id}.manifest.json`,
            formatVersion: 1,
            integrity: integrity(extension.manifest),
          },
        },
      })),
    ],
  };
}
