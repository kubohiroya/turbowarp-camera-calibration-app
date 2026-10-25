// SPDX-License-Identifier: MPL-2.0
const EXACT_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u;
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

/** Accept exact versions and stable family caret ranges for embedded artifacts. */
export function matchesEmbeddedDependency(
  packageName: string,
  declared: string,
  installed: string,
): boolean {
  if (!EXACT_VERSION.test(installed)) return false;
  if (EXACT_VERSION.test(declared)) return installed === declared;
  if (
    !packageName.startsWith('@kubohiroya/turbowarp-') ||
    !declared.startsWith('^')
  )
    return false;
  const minimum = STABLE_VERSION.exec(declared.slice(1));
  const actual = STABLE_VERSION.exec(installed);
  if (!minimum || !actual) return false;
  const [major, minor, patch] = minimum.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const [actualMajor, actualMinor, actualPatch] = actual
    .slice(1)
    .map(Number) as [number, number, number];
  if (actualMajor !== major) return false;
  if (major === 0) {
    return (
      actualMinor === minor &&
      (minor === 0 ? actualPatch === patch : actualPatch >= patch)
    );
  }
  return actualMinor > minor || (actualMinor === minor && actualPatch >= patch);
}
