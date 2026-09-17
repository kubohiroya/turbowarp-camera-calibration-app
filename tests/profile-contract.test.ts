// SPDX-License-Identifier: MPL-2.0
/**
 * The contract for the file this app hands over.
 *
 * `fixtures/profile-default.yaml` is a calibration as this app exports it: the
 * ROS camera_info YAML Camera Source writes for a solved profile, split into
 * the profile list a line per item. Everything here is checked with the
 * installed Camera Source -- its writer, its reader and its compatibility
 * rule -- rather than a copy, so the day the contract moves this fails here
 * and not in the app that receives the file.
 */
import { readFileSync } from 'node:fs';
import {
  evaluateProfileCompatibility,
  readCameraConditions,
  readCameraProfileDocument,
  readProfileText,
  serializeCameraInfoYaml,
  type CameraIntrinsicProfileV1,
} from '@kubohiroya/turbowarp-camera-source/profile';
import { describe, expect, it } from 'vitest';

const exported = readFileSync(
  new URL('./fixtures/profile-default.yaml', import.meta.url),
  'utf8',
);

function read(text: string): CameraIntrinsicProfileV1 {
  const parsed = readProfileText(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const result = readCameraProfileDocument(parsed.document);
  if (!result.ok) {
    throw new Error(`${result.error.path}: ${result.error.message}`);
  }
  return result.profile;
}

/** What the SB3's list holds after `do-register`: the text cut on line breaks. */
function toListItems(text: string): string[] {
  const items = text.split('\n');
  if (items.at(-1) === '') items.pop();
  return items;
}

/** TurboWarp's list export and import, as scratch-gui implements them. */
function exportList(items: readonly string[]): string {
  return items.join('\r\n');
}
function importList(file: string): string[] {
  return file.replace(/\r/g, '').split('\n');
}

/** What `do-adopt` rebuilds from the list: each item and a line break. */
function fromListItems(items: readonly string[]): string {
  return items.map((item) => `${item}\n`).join('');
}

describe('the exported calibration file', () => {
  it('is exactly what the installed Camera Source writes for that profile', () => {
    // A fixture that drifted from the writer would be a contract with nobody.
    expect(serializeCameraInfoYaml(read(exported))).toBe(exported);
  });

  it('is a ROS camera_info document with the calibration record beside it', () => {
    const profile = read(exported);
    expect(exported).toMatch(
      /^image_width: 1280\nimage_height: 720\ncamera_name: default\n/,
    );
    expect(exported).toContain('distortion_model: plumb_bob\n');
    expect(exported).toContain('turbowarp_camera_source:\n');
    expect(profile.producer).toBe('turbowarp-camera-calibration');
    expect(profile.capture).toBeDefined();
  });

  it('survives the list: exported, imported and joined, it is the same text', () => {
    const file = exportList(toListItems(exported));
    expect(fromListItems(importList(file))).toBe(exported);
  });

  it('starts with a line TurboWarp will not split into columns on import', () => {
    // scratch-gui asks which column to keep when the first row has more than
    // one, and keeping one would cut every matrix row at its first comma.
    const first = exported.split('\n')[0]!;
    expect(first).not.toMatch(/[,;\t|]/);
  });

  it('fits the camera it was made on, and says so', () => {
    const profile = read(exported);
    const conditions = readCameraConditions(
      {
        width: 1280,
        height: 720,
        deviceId: 'device-1',
        previewFlip: 'horizontal',
        label: 'FaceTime HD Camera',
      },
      { frameRate: 30, resizeMode: 'none', zoom: 1, focusMode: 'continuous' },
    );
    expect(evaluateProfileCompatibility(profile, conditions).state).toBe(
      'compatible',
    );
  });

  it('does not fit the camera at another size or zoom', () => {
    const profile = read(exported);
    const at = (width: number, height: number, zoom: number) =>
      evaluateProfileCompatibility(
        profile,
        readCameraConditions(
          {
            width,
            height,
            deviceId: 'device-1',
            previewFlip: 'none',
            label: 'FaceTime HD Camera',
          },
          { resizeMode: 'none', zoom, focusMode: 'continuous' },
        ),
      ).state;
    expect(at(640, 480, 1)).toBe('incompatible');
    expect(at(1280, 720, 2)).toBe('incompatible');
  });

  it('cannot be judged against a camera that has not delivered a frame', () => {
    const profile = read(exported);
    const verdict = evaluateProfileCompatibility(
      profile,
      readCameraConditions({
        width: 0,
        height: 0,
        deviceId: '',
        previewFlip: 'none',
      }),
    ).state;
    expect(verdict).not.toBe('compatible');
  });

  it('is read by a consumer under its own camera name', () => {
    // A receiving app registers the file as its own camera, such as `pose`.
    // The rebinding happens before validation, the way Camera Source's
    // `register camera profile as` block does it.
    const parsed = readProfileText(exported);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const rebound = readCameraProfileDocument({
      ...(parsed.document as Record<string, unknown>),
      cameraId: 'pose',
    });
    expect(rebound.ok && rebound.profile.cameraId).toBe('pose');
  });
});
