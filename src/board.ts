// SPDX-License-Identifier: MPL-2.0
/**
 * The board, from the extension that looks for it.
 *
 * This app used to draw its own, and a browser check ran across both
 * repositories to confirm the two still matched. They did -- but nobody knew
 * that until the check was written, and the way a mismatch would have arrived
 * is an operator holding a board being told to show one.
 *
 * Re-exported through one module rather than imported from the package in five
 * places, so what this app takes from the extension is a list someone can
 * read.
 */
export {
  BOARDS,
  MARKER_RATIO,
  PRINT_HEIGHT_MM,
  PRINT_WIDTH_MM,
  boardName,
  layout,
  patternSvg,
  printedCellMillimetres,
  type BoardLayout,
  type BoardSpec,
} from '@kubohiroya/turbowarp-camera-calibration/runtime';
