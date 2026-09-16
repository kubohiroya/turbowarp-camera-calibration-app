// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import {
  BOARDS,
  backdrop as boardBackdrop,
  boardName,
  layout,
  type BoardSpec,
} from './checkerboard.ts';
import {
  hideVariable,
  script,
  setVariable,
  showVariable,
  switchBackdrop,
  whenFlagClicked,
  whenKeyPressed,
  type BlockMap,
} from './blocks.ts';

/** The backdrop shown while a role is being chosen. Deliberately featureless. */
export const chooserBackdrop =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#152033"/></svg>\n';

export const chooserName = 'chooser';

export function md5(contents: string): string {
  return createHash('md5').update(contents).digest('hex');
}

/** Every backdrop this project ships, in costume order. */
export function backdrops(): ReadonlyArray<{ name: string; contents: string }> {
  return [
    { name: chooserName, contents: chooserBackdrop },
    ...BOARDS.map((board) => ({
      name: boardName(board),
      contents: boardBackdrop(board),
    })),
  ];
}

/** The key that shows each board, in the order the boards are listed. */
export function boardKey(index: number): string {
  return String(index + 1);
}

const VARIABLES = {
  role: 'role',
  board: 'board',
  status: 'status',
} as const;

const CHOOSING = '1/2/3=模様を表示  c=撮影して校正  space=選び直す';

/**
 * How a board is described while it is on screen.
 *
 * The inner corner counts are what the calibration blocks are given, and they
 * are not the number of squares: a 9x6 board shows 10x7 squares. Naming the
 * wrong one here would be copied straight into a solve, where a board whose
 * shape does not match the one found is refused with no indication of which
 * number was wrong.
 */
function boardStatus(board: BoardSpec): string {
  const { cell } = layout(board);
  return `内側コーナー ${board.columns}x${board.rows}（マス ${board.columns + 1}x${board.rows + 1}、1マス=ステージ${cell}単位）`;
}

export function createProject(title: string) {
  const costumes = backdrops();
  const blocks: BlockMap = {
    // Choosing is the state the project starts in and returns to. Both roles
    // are reachable from here, so one SB3 covers a single machine pointed at
    // its own screen and a pair of machines alike.
    ...script('start', 48, 48, whenFlagClicked(), [
      setVariable(VARIABLES.role, 'role', ''),
      setVariable(VARIABLES.board, 'board', ''),
      setVariable(VARIABLES.status, 'status', `${title}: ${CHOOSING}`),
      showVariable(VARIABLES.role, 'role'),
      showVariable(VARIABLES.board, 'board'),
      showVariable(VARIABLES.status, 'status'),
      switchBackdrop(chooserName),
    ]),
    ...script('choose', 48, 320, whenKeyPressed('space'), [
      setVariable(VARIABLES.role, 'role', ''),
      setVariable(VARIABLES.board, 'board', ''),
      setVariable(VARIABLES.status, 'status', CHOOSING),
      showVariable(VARIABLES.role, 'role'),
      showVariable(VARIABLES.board, 'board'),
      showVariable(VARIABLES.status, 'status'),
      switchBackdrop(chooserName),
    ]),
    ...script('capture', 48, 560, whenKeyPressed('c'), [
      setVariable(VARIABLES.role, 'role', 'capture'),
      setVariable(
        VARIABLES.status,
        'status',
        '撮影と校正はまだ実装していません。いまは模様の表示だけです。',
      ),
      switchBackdrop(chooserName),
    ]),
  };

  BOARDS.forEach((board, index) => {
    Object.assign(
      blocks,
      script(
        `display-${index}`,
        360 + index * 320,
        48,
        whenKeyPressed(boardKey(index)),
        [
          setVariable(VARIABLES.role, 'role', 'display'),
          setVariable(
            VARIABLES.board,
            'board',
            `${board.columns}x${board.rows}`,
          ),
          setVariable(VARIABLES.status, 'status', boardStatus(board)),
          // Every monitor goes away before the board appears. A monitor drawn
          // over the pattern hides the squares underneath it, and the finder
          // reports the board as missing rather than as partly covered.
          hideVariable(VARIABLES.role, 'role'),
          hideVariable(VARIABLES.board, 'board'),
          hideVariable(VARIABLES.status, 'status'),
          switchBackdrop(boardName(board)),
        ],
      ),
    );
  });

  return {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: {
          [VARIABLES.role]: ['role', ''],
          [VARIABLES.board]: ['board', ''],
          [VARIABLES.status]: ['status', CHOOSING],
        },
        lists: {},
        broadcasts: {},
        blocks,
        comments: {},
        currentCostume: 0,
        costumes: costumes.map((costume) => {
          const assetId = md5(costume.contents);
          return {
            assetId,
            name: costume.name,
            bitmapResolution: 1,
            md5ext: `${assetId}.svg`,
            dataFormat: 'svg',
            rotationCenterX: 240,
            rotationCenterY: 180,
          };
        }),
        sounds: [],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: 'off',
        textToSpeechLanguage: null,
      },
    ],
    monitors: [
      monitor(VARIABLES.role, 'role', 10, 10),
      monitor(VARIABLES.board, 'board', 10, 34),
      monitor(VARIABLES.status, 'status', 10, 58, CHOOSING),
    ],
    extensions: [],
    meta: { semver: '3.0.0', vm: '11.3.0', agent: 'turbowarp-app-template' },
  };
}

function monitor(id: string, name: string, x: number, y: number, value = '') {
  return {
    id,
    mode: 'default',
    opcode: 'data_variable',
    params: { VARIABLE: name },
    spriteName: null,
    value,
    width: 0,
    height: 0,
    x,
    y,
    visible: true,
    sliderMin: 0,
    sliderMax: 100,
    isDiscrete: true,
  };
}
