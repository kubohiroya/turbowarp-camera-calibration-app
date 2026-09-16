// SPDX-License-Identifier: MPL-2.0
/**
 * The extension that sets the other extensions' feature flags.
 *
 * Camera Source and Camera Calibration each read their flags off `globalThis`
 * once, while their module body runs. There is no later opportunity: a flag set
 * afterwards is a flag that does nothing, and nothing about the result says so
 * -- the blocks are simply absent and the capability is simply missing, which
 * looks exactly like an extension that failed to load.
 *
 * So the flags are delivered by an extension of their own, embedded ahead of
 * both. It publishes no blocks; being an extension is only how it earns the
 * right to run first.
 */
import { featureFlags } from '../config/feature-flags.ts';

export const FLAG_EXTENSION_ID = 'kubohiroyacalibrationappflags';

/**
 * Renders the injector.
 *
 * It refuses to run sandboxed. A sandboxed extension runs in a worker with its
 * own `globalThis`, so the flags would be set on an object the other two never
 * see -- and the failure would look like the flags having been left off, which
 * is a different problem with a different fix.
 */
export function featureFlagExtension(): string {
  const cameraSource = {
    calibrationProfilesV1: featureFlags.captureAndSolveV1,
  };
  const cameraCalibration = {
    cameraCalibrationV1: featureFlags.captureAndSolveV1,
  };
  return `// Name: Camera Calibration App Feature Flags
// ID: ${FLAG_EXTENSION_ID}
// Description: Sets the startup feature flags the camera extensions read. Publishes no blocks.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    // A worker has its own globalThis. Setting the flags there would leave the
    // camera extensions reading an object nobody wrote to, and the project
    // would come up looking as though the flags had simply been left off.
    throw new Error(
      'Camera Calibration App Feature Flags must run unsandboxed; the flags it sets would otherwise reach no one.'
    );
  }

  globalThis.__TWCS_FEATURE_FLAGS__ = Object.freeze(${JSON.stringify(cameraSource)});
  globalThis.__TWCC_FEATURE_FLAGS__ = Object.freeze(${JSON.stringify(cameraCalibration)});

  Scratch.extensions.register({
    getInfo() {
      return {
        id: '${FLAG_EXTENSION_ID}',
        name: 'Calibration App Flags',
        blocks: []
      };
    }
  });
})(Scratch);
`;
}
