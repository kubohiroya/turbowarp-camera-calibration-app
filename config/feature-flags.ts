// SPDX-License-Identifier: MPL-2.0
/**
 * Read once at startup, and fixed for the life of the build.
 *
 * The calibration path is on by default, so the SB3 the page offers is one
 * that calibrates. Turning it off is the rollback: flip the flag, run
 * `pnpm source:update`, and the regenerated SB3 embeds no extension and is a few
 * kilobytes again. `source:check` refuses a flag that has been changed without the
 * project being rebuilt, so what the page reports and what the SB3 does cannot
 * drift apart.
 *
 * Enabling a flag does not implement a runtime.
 */
export interface CameraCalibrationAppFeatureFlags {
  /** Displaying the chessboard. Needs no extension and no camera. */
  readonly patternDisplayV1: boolean;
  /**
   * Taking samples and solving, through the camera-calibration extension.
   *
   * Also switches on Camera Source's profile contract, because a solved
   * calibration with nowhere to register it is not a working path.
   */
  readonly captureAndSolveV1: boolean;
}

export const featureFlags: CameraCalibrationAppFeatureFlags = Object.freeze({
  patternDisplayV1: true,
  captureAndSolveV1: true,
});
