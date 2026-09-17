// SPDX-License-Identifier: MPL-2.0
/**
 * The four controls of the opening screen.
 *
 * Buttons are back, and only here. The ones that were removed sat over the
 * camera picture while the operator held a board in both hands, offering to do
 * what was already being done. These sit on a still screen before anything has
 * started, in front of someone at a keyboard who has a decision to make:
 * whether this machine shows the board or calibrates a camera.
 *
 * No chessboard on any of them. A camera pointed at this screen would find it.
 */

import { squaresLabel } from './board.ts';

const WIDTH = 96;
const HEIGHT = 40;
const PLATE = '#1d2c46';
const EDGE = '#8fb6ff';
const INK = '#e8f0ff';
const GO = '#2f7d4f';
const GO_EDGE = '#7fe0a6';

function button(
  label: string,
  plate: string,
  edge: string,
  width = WIDTH,
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}">` +
    `<rect x="1" y="1" width="${width - 2}" height="${HEIGHT - 2}" rx="8" ` +
    `fill="${plate}" stroke="${edge}" stroke-width="1.5"/>` +
    `<text x="${width / 2}" y="${HEIGHT / 2 + 5}" text-anchor="middle" ` +
    `font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="15" ` +
    `fill="${INK}">${label}</text></svg>\n`
  );
}

/**
 * One per board, labelled by its squares -- what the operator can count on the
 * sheet in their hand. The arguments are the extension's inner corners.
 */
export function boardButton(columns: number, rows: number): string {
  return button(squaresLabel({ columns, rows }), PLATE, EDGE);
}

/**
 * Start calibrating against a named board. Green, and labelled by the board,
 * so the row reads as "calibrate with this one" rather than a second row of
 * the display buttons.
 */
export function startButton(columns: number, rows: number): string {
  return button(squaresLabel({ columns, rows }), GO, GO_EDGE);
}

/**
 * Back to the opening screen, once a session is over.
 *
 * Not a title-screen control, but drawn the same way: it is the same kind of
 * decision, made by someone who has put the board down.
 */
export function backButton(): string {
  return button('戻る', PLATE, EDGE);
}

export const TITLE_BUTTON_SIZE = { width: WIDTH, height: HEIGHT };
