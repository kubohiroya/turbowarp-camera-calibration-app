// SPDX-License-Identifier: MPL-2.0
/**
 * The chessboard the operator points a camera at.
 *
 * Drawn as SVG in the page rather than inside the SB3. The pattern needs no
 * camera, no extension and no arithmetic, and the things the plan asks of it --
 * printing, reporting the rendered cell size, never being stretched -- are all
 * things a page can do and a fixed-size Scratch stage cannot.
 *
 * Geometry lives here rather than in the markup so that the printed sheet, the
 * full-screen view and the saved file are the same board.
 */

export interface BoardSpec {
  /** Inner corners across, which is one fewer than the squares across. */
  readonly columns: number;
  /** Inner corners down. */
  readonly rows: number;
}

export interface BoardLayout extends BoardSpec {
  /** Side of one square, in the units the board is drawn in. */
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
 * Fits a board into a box with a blank margin around it.
 *
 * The margin is at least one square on every side. OpenCV's chessboard finder
 * needs the outer squares to be bounded by background it can trace; a board run
 * to the edge of the frame loses its outermost corners, and the pattern is
 * refused as incomplete rather than found with fewer points.
 *
 * The box is the drawing's own coordinate space. Nothing here knows the size of
 * the screen it will end up on: the board is drawn once and scaled uniformly,
 * because scaling one axis alone would turn the squares into rectangles and the
 * calibration would solve for a lens that is not there.
 */
export function layout(
  board: BoardSpec,
  width = 1000,
  height = 750,
): BoardLayout {
  const squaresX = board.columns + 1;
  const squaresY = board.rows + 1;
  // Two extra squares in each direction: one of margin on each side.
  const cell = Math.floor(
    Math.min(width / (squaresX + 2), height / (squaresY + 2)),
  );
  const boardWidth = cell * squaresX;
  const boardHeight = cell * squaresY;
  return {
    ...board,
    cell,
    boardWidth,
    boardHeight,
    quietX: (width - boardWidth) / 2,
    quietY: (height - boardHeight) / 2,
  };
}

/** The costume name a board is switched to by. */
export function boardName(board: BoardSpec): string {
  return `board-${board.columns}x${board.rows}`;
}

/**
 * Draws the board as an SVG.
 *
 * Only the dark squares are emitted, over a white ground. Painting both colours
 * would put a seam between every pair of rectangles, and a renderer that leaves
 * a half-unit of background showing along it gives the corner finder a line of
 * light where the board has an edge.
 */
export function patternSvg(
  board: BoardSpec,
  width = 1000,
  height = 750,
): string {
  const { cell, quietX, quietY } = layout(board, width, height);
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
  // preserveAspectRatio keeps the scaling uniform and letterboxes the rest. A
  // viewer that stretched one axis would hand the solver a grid whose squares
  // are not square, and the bias that follows does not show up as reprojection
  // error -- it is simply a wrong calibration that looks like a good one.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"` +
    ` preserveAspectRatio="xMidYMid meet" width="100%" height="100%">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    `<g fill="#000000">${squares.join('')}</g>` +
    '</svg>'
  );
}
