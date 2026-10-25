// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { matchesEmbeddedDependency } from '../scripts/dependency-range.ts';

const family = '@kubohiroya/turbowarp-camera-source';

describe('embedded dependency ranges', () => {
  it('keeps exact pins exact, including prereleases', () => {
    expect(matchesEmbeddedDependency(family, '0.19.3', '0.19.3')).toBe(true);
    expect(matchesEmbeddedDependency(family, '0.19.3', '0.19.4')).toBe(false);
    expect(matchesEmbeddedDependency(family, '1.0.0-rc.1', '1.0.0-rc.1')).toBe(
      true,
    );
  });

  it('limits zero-major caret ranges to their compatible minor or patch', () => {
    expect(matchesEmbeddedDependency(family, '^0.19.3', '0.19.3')).toBe(true);
    expect(matchesEmbeddedDependency(family, '^0.19.3', '0.19.4')).toBe(true);
    expect(matchesEmbeddedDependency(family, '^0.19.3', '0.19.2')).toBe(false);
    expect(matchesEmbeddedDependency(family, '^0.19.3', '0.20.0')).toBe(false);
    expect(matchesEmbeddedDependency(family, '^0.0.3', '0.0.3')).toBe(true);
    expect(matchesEmbeddedDependency(family, '^0.0.3', '0.0.4')).toBe(false);
  });

  it('allows compatible stable minors while respecting the major boundary', () => {
    expect(matchesEmbeddedDependency(family, '^1.2.3', '1.3.0')).toBe(true);
    expect(matchesEmbeddedDependency(family, '^1.2.3', '1.2.2')).toBe(false);
    expect(matchesEmbeddedDependency(family, '^1.2.3', '2.0.0')).toBe(false);
    expect(matchesEmbeddedDependency(family, '^1.2.3', '1.3.0-rc.1')).toBe(
      false,
    );
  });

  it('rejects unsupported ranges and caret declarations outside the family', () => {
    for (const declared of ['~0.19.3', '*', 'latest', '^0.19.3 || 1.0.0']) {
      expect(
        matchesEmbeddedDependency(family, declared, '0.19.3'),
        declared,
      ).toBe(false);
    }
    expect(matchesEmbeddedDependency('comlink', '^4.4.2', '4.4.2')).toBe(false);
    expect(matchesEmbeddedDependency(family, '^0.19.3', '0.19.3anything')).toBe(
      false,
    );
  });
});
