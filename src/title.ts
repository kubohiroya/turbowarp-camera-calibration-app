// SPDX-License-Identifier: MPL-2.0
/**
 * The screen this app opens on.
 *
 * Drawn into the backdrop rather than assembled from variable monitors: a
 * monitor is a name and a value in a rounded box, and none of this is a name
 * and a value. It is a title, a licence, a sentence saying what the thing
 * does, and one saying what the operator has to go and fetch.
 *
 * It exists because the operator arrives knowing nothing and has to make one
 * decision -- is this machine showing the board, or calibrating a camera? --
 * which nothing else in the app was asking them.
 */

const WIDTH = 480;
const HEIGHT = 360;
const PLATE = '#152033';
const INK = '#e8f0ff';
const DIM = '#8fb6ff';

function escape(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function line(
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  weight = 'normal',
): string {
  return (
    `<text x="${x}" y="${y}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" ` +
    `font-size="${size}" font-weight="${weight}" fill="${fill}">${escape(text)}</text>`
  );
}

export interface TitleFacts {
  readonly title: string;
  readonly version: string;
  readonly author: string;
  readonly license: string;
  readonly year: number;
}

/**
 * The stage as it looks before anything has started.
 *
 * No chessboard anywhere on it, for the same reason nothing else in this
 * project draws one: a camera pointed at this screen would find it, and the
 * calibration would succeed against the wrong thing.
 */
export function titleBackdrop(facts: TitleFacts): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${PLATE}"/>` +
    line('Camera Calibration', 28, 56, 26, INK, '600') +
    line(`v${facts.version}`, 28, 78, 12, DIM) +
    line(
      `© ${facts.year} ${facts.author} · ${facts.license}`,
      28,
      96,
      11,
      DIM,
    ) +
    line('カメラのレンズの歪みを測り、', 28, 140, 14, INK) +
    line('校正プロファイルを作ります。', 28, 160, 14, INK) +
    line('ChArUco ボードが要ります。この端末に表示するか、', 28, 196, 12, DIM) +
    line('印刷した紙を用意してください。', 28, 214, 12, DIM) +
    line('ボードを表示', 28, 258, 11, DIM) +
    line('校正を始める', 28, 318, 11, DIM) +
    '</svg>\n'
  );
}

export const titleBackdropName = 'title';

/** The backdrop a board is shown on, named by the board it carries. */
export function boardBackdropName(columns: number, rows: number): string {
  return `board-${columns}x${rows}`;
}
