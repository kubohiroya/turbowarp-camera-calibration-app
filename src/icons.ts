// SPDX-License-Identifier: MPL-2.0
/**
 * The buttons of the capture role, drawn as sprite costumes.
 *
 * They sit over the camera preview -- Camera Source draws that into Scratch's
 * `video` render group, which is below sprites and above the backdrop -- so
 * each one needs an opaque plate of its own rather than a bare glyph on
 * whatever the camera happens to be looking at.
 *
 * No icon contains a complete chessboard. A drawing of the target is a thing
 * the detector can find, and the one arrangement where that matters -- a camera
 * pointed at the screen running this -- is also the one where the mistake is
 * invisible, because the solve succeeds. The board is chosen by its inner
 * corner counts instead, which is what the calibration block is given and what
 * the operator has to get right.
 */

const PLATE = '#152033';
const EDGE = '#8fb6ff';
const INK = '#e8f0ff';
const ACCENT = '#4c97ff';

/** Side of a button, in stage units. */
export const BUTTON_SIZE = 64;

function plate(): string {
  return `<rect x="0" y="0" width="${BUTTON_SIZE}" height="${BUTTON_SIZE}" rx="12" fill="${PLATE}" stroke="${EDGE}" stroke-width="1.5"/>`;
}

function svg(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BUTTON_SIZE}" height="${BUTTON_SIZE}">` +
    `${plate()}${body}</svg>\n`
  );
}

/** Turns the camera on and opens a session. A camera, because that is what it does. */
export function startIcon(): string {
  return svg(
    `<rect x="12" y="22" width="40" height="26" rx="4" fill="none" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M 24 22 l 3 -5 h 10 l 3 5" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<circle cx="32" cy="35" r="8" fill="none" stroke="${ACCENT}" stroke-width="2.5"/>`,
  );
}

/** Start over. The same action as start, once a session already exists. */
export function restartIcon(): string {
  return svg(
    `<path d="M 46 32 a 14 14 0 1 1 -6 -11.6" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M 41 14 l 0 8 l -8 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

/**
 * Add one view of the board.
 *
 * Two squares and a plus, not a shutter. This does not take a photograph and
 * keep it; it adds one more view to a set, and a shutter or a red dot would say
 * the wrong thing. Two squares cannot be found as a 9x6 grid either.
 */
export function sampleIcon(): string {
  const cell = 11;
  return svg(
    `<rect x="13" y="24" width="${cell * 2}" height="${cell * 2}" fill="${INK}"/>` +
      `<g fill="${PLATE}"><rect x="13" y="24" width="${cell}" height="${cell}"/>` +
      `<rect x="${13 + cell}" y="${24 + cell}" width="${cell}" height="${cell}"/></g>` +
      `<g stroke="${ACCENT}" stroke-width="3.5" stroke-linecap="round">` +
      `<line x1="45" y1="17" x2="45" y2="29"/><line x1="39" y1="23" x2="51" y2="23"/></g>`,
  );
}

/**
 * Solve.
 *
 * The pinhole model being solved: an object, the centre of projection, and the
 * image plane. Not a play button -- this runs once and ends the session, where
 * a play button says something continuous is starting.
 */
export function solveIcon(): string {
  return svg(
    `<line x1="44" y1="16" x2="44" y2="48" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>` +
      `<circle cx="32" cy="32" r="3" fill="${ACCENT}"/>` +
      `<g stroke="${INK}" stroke-width="2" stroke-linecap="round">` +
      `<line x1="14" y1="20" x2="44" y2="42"/><line x1="14" y1="44" x2="44" y2="22"/></g>` +
      `<line x1="14" y1="20" x2="14" y2="44" stroke="${ACCENT}" stroke-width="2.5" stroke-linecap="round"/>`,
  );
}

/**
 * Hand the profile to Camera Source.
 *
 * An arrow into a stack: deposited where others will read it. Deliberately not
 * the downward arrow into a tray, which is the universal save-a-file glyph and
 * belongs to exporting the profile as JSON. Registering and exporting are
 * different acts with different audiences, and one icon for both would let an
 * operator believe they had shared a calibration when they had filed it, or the
 * reverse.
 */
export function registerIcon(): string {
  return svg(
    `<g fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round">` +
      `<path d="M 40 18 h 10 v 8 h -10"/><path d="M 40 28 h 10 v 8 h -10"/><path d="M 40 38 h 10 v 8 h -10"/></g>` +
      `<line x1="14" y1="32" x2="36" y2="32" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M 29 25 l 7 7 l -7 7" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

/** Give up the role: leave, and hand the camera back. */
export function leaveIcon(): string {
  return svg(
    `<path d="M 36 16 h 12 v 32 h -12" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>` +
      `<line x1="38" y1="32" x2="16" y2="32" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M 24 24 l -8 8 l 8 8" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

/** Working. Not a button: what stands in for the buttons while they are hidden. */
export function workingIcon(): string {
  return svg(
    `<circle cx="32" cy="32" r="15" fill="none" stroke="${ACCENT}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="10 8"/>`,
  );
}

/** The handle that opens and closes the strip. Carries no board artwork. */
export function handleIcon(open: boolean): string {
  return svg(
    open
      ? `<path d="M 20 38 l 12 -12 l 12 12" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M 20 26 l 12 12 l 12 -12" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}
