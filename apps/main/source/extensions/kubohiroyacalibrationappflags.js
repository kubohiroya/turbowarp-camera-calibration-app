// Name: Camera Calibration App Feature Flags
// ID: kubohiroyacalibrationappflags
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

  globalThis.__TWCS_FEATURE_FLAGS__ = Object.freeze({"calibrationProfilesV1":false});
  globalThis.__TWCC_FEATURE_FLAGS__ = Object.freeze({"cameraCalibrationV1":false});

  Scratch.extensions.register({
    getInfo() {
      return {
        id: 'kubohiroyacalibrationappflags',
        name: 'Calibration App Flags',
        blocks: []
      };
    }
  });
})(Scratch);
