// SPDX-License-Identifier: MPL-2.0
/**
 * The picture of what to do with the board, laid over the camera picture.
 *
 * Words are read; a shape is seen. The operator is looking at the preview to
 * see whether the board is in frame, so the instruction has to be where their
 * eyes already are.
 *
 * No squares. Every other drawing in this project avoids a complete grid
 * because a camera pointed at the screen would find it, and this one is drawn
 * on top of the very picture that camera is producing -- so it is the one
 * drawing where a chessboard would certainly be found, and the calibration
 * would succeed against the wrong board with a small error to prove it. A
 * plain outline and an arrow say the same thing and cannot be detected.
 */

const SIZE = 220;
const INK = '#eaf2ff';
const ACCENT = '#7fd4ff';

function svg(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `${body}</svg>\n`
  );
}

/**
 * The board as a quadrilateral, with one edge brought closer.
 *
 * `near` names the edge that should come toward the camera; the outline is
 * drawn wider there, which is what the camera would actually see.
 */
function board(near: 'top' | 'bottom' | 'left' | 'right'): string {
  const wide = 92;
  const narrow = 52;
  const mid = SIZE / 2;
  const points = {
    top: [
      [mid - wide, mid - 58],
      [mid + wide, mid - 58],
      [mid + narrow, mid + 58],
      [mid - narrow, mid + 58],
    ],
    bottom: [
      [mid - narrow, mid - 58],
      [mid + narrow, mid - 58],
      [mid + wide, mid + 58],
      [mid - wide, mid + 58],
    ],
    left: [
      [mid - 58, mid - wide],
      [mid + 58, mid - narrow],
      [mid + 58, mid + narrow],
      [mid - 58, mid + wide],
    ],
    right: [
      [mid - 58, mid - narrow],
      [mid + 58, mid - wide],
      [mid + 58, mid + wide],
      [mid - 58, mid + narrow],
    ],
  }[near];
  return (
    `<polygon points="${points.map(([x, y]) => `${x},${y}`).join(' ')}" ` +
    `fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
  );
}

/** An arrow along the edge that is coming forward, curving out of the plane. */
function arrow(near: 'top' | 'bottom' | 'left' | 'right'): string {
  const mid = SIZE / 2;
  const paths = {
    top: `M ${mid} ${mid - 78} q 46 -18 58 22`,
    bottom: `M ${mid} ${mid + 78} q 46 18 58 -22`,
    left: `M ${mid - 78} ${mid} q -18 46 22 58`,
    right: `M ${mid + 78} ${mid} q 18 46 -22 58`,
  };
  const heads = {
    top: `M ${mid + 58} ${mid - 56} l -12 -6 l 14 -8 z`,
    bottom: `M ${mid + 58} ${mid + 56} l -12 6 l 14 8 z`,
    left: `M ${mid - 56} ${mid + 58} l -6 -12 l -8 14 z`,
    right: `M ${mid + 56} ${mid + 58} l 6 -12 l 8 14 z`,
  };
  return (
    `<path d="${paths[near]}" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="${heads[near]}" fill="${ACCENT}"/>`
  );
}

export const GUIDE_DIRECTIONS = [
  'top-near',
  'top-far',
  'left-near',
  'right-near',
] as const;

export type GuideDirection = (typeof GUIDE_DIRECTIONS)[number];

/** Which edge the picture brings forward, for each direction the extension names. */
const EDGE: Readonly<
  Record<GuideDirection, 'top' | 'bottom' | 'left' | 'right'>
> = {
  'top-near': 'top',
  // Pushing the top away is the same picture as bringing the bottom forward,
  // and the bottom coming forward is what the camera sees.
  'top-far': 'bottom',
  'left-near': 'left',
  'right-near': 'right',
};

export function guideName(direction: GuideDirection): string {
  return `guide-${direction}`;
}

export function guideSvg(direction: GuideDirection): string {
  const edge = EDGE[direction];
  return svg(
    // A soft plate behind it, so the outline survives a bright camera picture
    // without hiding what is behind it.
    `<rect x="18" y="18" width="${SIZE - 36}" height="${SIZE - 36}" rx="26" fill="#0b1524" fill-opacity="0.35"/>` +
      board(edge) +
      arrow(edge),
  );
}

export function guideCostumes(): ReadonlyArray<{
  name: string;
  contents: string;
}> {
  return GUIDE_DIRECTIONS.map((direction) => ({
    name: guideName(direction),
    contents: guideSvg(direction),
  }));
}
