import { describe, expect, it } from 'vitest';
import { createProject } from '../scripts/project.ts';
import { featureFlags } from '../config/feature-flags.ts';
describe('starter project', () => {
  it('has a connected green flag startup script and an observable status', () => {
    const project = createProject('Test');
    const stage = project.targets[0];
    expect(stage.blocks.start.next).toBe('ready');
    expect(stage.blocks.ready.parent).toBe('start');
    expect(project.monitors[0].id).toBe('appStatus');
    expect(project.extensions).toEqual([]);
  });
  it('is deterministic and leaves experimental runtime disabled', () => {
    expect(createProject('Test')).toEqual(createProject('Test'));
    expect(featureFlags.experimentalRuntime).toBe(false);
  });
});
