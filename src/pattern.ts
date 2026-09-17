// SPDX-License-Identifier: MPL-2.0
/**
 * The chessboard, shown in the page.
 *
 * This is the display half of the app. It needs no camera, no extension and no
 * Scratch: a page can go full screen, print, save a file, and say how large the
 * squares came out, and a fixed-size Scratch stage can do none of those.
 */
import {
  BOARDS,
  PRINT_HEIGHT_MM,
  PRINT_WIDTH_MM,
  layout,
  patternSvg,
  type BoardSpec,
} from './board.ts';

/** CSS defines its pixel as 1/96 inch, which is what this conversion means. */
const MM_PER_CSS_PIXEL = 25.4 / 96;

export function boardId(board: BoardSpec): string {
  return `${board.columns}x${board.rows}`;
}

export function findBoard(id: string | null): BoardSpec | undefined {
  return BOARDS.find((board) => boardId(board) === id);
}

export interface PatternView {
  /** The rendered square size, in CSS pixels and in nominal millimetres. */
  measure(): { cellPixels: number; cellMillimetres: number };
  close(): void;
}

/**
 * Fills an element with the board and reports how big the squares came out.
 *
 * The SVG scales uniformly and letterboxes the remainder; nothing here stretches
 * it to the viewport. A board stretched along one axis is no longer a regular
 * grid, the calibration solves for a lens that is not there, and the reprojection
 * error stays small while it does -- so the operator would have no way to tell.
 */
export function showPattern(
  container: HTMLElement,
  board: BoardSpec,
  onClose: () => void,
): PatternView {
  container.innerHTML = patternSvg(board);
  const svg = container.querySelector('svg');
  svg?.setAttribute('role', 'img');
  svg?.setAttribute(
    'aria-label',
    `内側コーナー ${board.columns}x${board.rows} の市松模様`,
  );

  const dismiss = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
    onClose();
  };
  container.addEventListener('click', dismiss);
  document.addEventListener('keydown', dismiss);
  document.body.classList.add('pattern-open');

  return {
    measure() {
      const drawn = layout(board);
      const box = svg?.getBoundingClientRect();
      // The SVG letterboxes, so the scale is whichever axis ran out first --
      // the same value on both, which is the point of measuring it this way.
      const scale = Math.min(
        (box?.width ?? 0) / 1000,
        (box?.height ?? 0) / 750,
      );
      const cellPixels = drawn.cell * scale;
      return {
        cellPixels,
        cellMillimetres: cellPixels * MM_PER_CSS_PIXEL,
      };
    },
    close() {
      container.removeEventListener('click', dismiss);
      document.removeEventListener('keydown', dismiss);
      document.body.classList.remove('pattern-open');
      container.innerHTML = '';
    },
  };
}

/** A standalone file the operator can print or carry to another machine. */
export function patternFile(board: BoardSpec): Blob {
  const svg = patternSvg(board)
    .replace(
      ' width="100%" height="100%"',
      ` width="${PRINT_WIDTH_MM}mm" height="${PRINT_HEIGHT_MM}mm"`,
    )
    .replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`], {
    type: 'image/svg+xml',
  });
}
