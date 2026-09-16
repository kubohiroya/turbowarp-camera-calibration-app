// SPDX-License-Identifier: MPL-2.0
/**
 * The chessboard the operator points a camera at.
 *
 * Drawn as stage backdrops rather than with the pen, so the pattern is a fixed
 * image the build produces once and the running project only switches to. A
 * pattern redrawn every frame would tear against the camera's exposure and
 * produce corners that move between the samples meant to be of the same board.
 */

/** The TurboWarp stage, in the units backdrop artwork is authored in. */
export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 360;

export interface BoardSpec {
  /** Inner corners across, which is one fewer than the squares across. */
  readonly columns: number;
  /** Inner corners down. */
  readonly rows: number;
}

export interface BoardLayout extends BoardSpec {
  /** Side of one square, in stage units. */
  readonly cell: number;
  readonly boardWidth: number;
  readonly boardHeight: number;
  /** Blank margin on each side. Never less than one square. */
  readonly quietX: number;
  readonly quietY: number;
}

/**
 * The boards offered for display, smallest grid last.
 *
 * More inner corners constrain the solve better; fewer survive a camera that is
 * far away or short of resolution, where a 40-unit square lands on too few
 * pixels to locate its corners.
 */
export const BOARDS: readonly BoardSpec[] = [
  { columns: 9, rows: 6 },
  { columns: 7, rows: 5 },
  { columns: 5, rows: 4 },
];

/**
 * Fits a board onto the stage with a blank margin around it.
 *
 * The margin is at least one square on every side. OpenCV's chessboard finder
 * needs the outer squares to be bounded by background it can trace; a board run
 * to the edge of the frame loses its outermost corners, and the pattern is
 * refused as incomplete rather than found with fewer points.
 */
export function layout(board: BoardSpec): BoardLayout {
  const squaresX = board.columns + 1;
  const squaresY = board.rows + 1;
  // Two extra squares in each direction: one of margin on each side.
  const cell = Math.floor(
    Math.min(STAGE_WIDTH / (squaresX + 2), STAGE_HEIGHT / (squaresY + 2)),
  );
  const boardWidth = cell * squaresX;
  const boardHeight = cell * squaresY;
  return {
    ...board,
    cell,
    boardWidth,
    boardHeight,
    quietX: (STAGE_WIDTH - boardWidth) / 2,
    quietY: (STAGE_HEIGHT - boardHeight) / 2,
  };
}

/** The costume name a board is switched to by. */
export function boardName(board: BoardSpec): string {
  return `board-${board.columns}x${board.rows}`;
}

/**
 * Draws the board as an SVG backdrop.
 *
 * Only the dark squares are emitted, over a white ground. Painting both colours
 * would put a seam between every pair of rectangles, and a renderer that leaves
 * a half-unit of background showing along it gives the corner finder a line of
 * light where the board has an edge.
 */
export function backdrop(board: BoardSpec): string {
  const { cell, quietX, quietY } = layout(board);
  const squares: string[] = [];
  for (let row = 0; row <= board.rows; row += 1) {
    for (let column = 0; column <= board.columns; column += 1) {
      if ((row + column) % 2 !== 0) continue;
      const x = quietX + column * cell;
      const y = quietY + row * cell;
      squares.push(
        `<rect x="${x}" y="${y}" width="${cell}" height="${cell}"/>`,
      );
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${STAGE_WIDTH}" height="${STAGE_HEIGHT}">` +
    `<rect width="${STAGE_WIDTH}" height="${STAGE_HEIGHT}" fill="#ffffff"/>` +
    `<g fill="#000000">${squares.join('')}</g>` +
    '</svg>\n'
  );
}
