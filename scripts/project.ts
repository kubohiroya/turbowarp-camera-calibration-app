// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import {
  BOARDS,
  backdrop as boardBackdrop,
  boardName,
  layout,
  type BoardSpec,
} from './checkerboard.ts';
import { EMBEDS_EXTENSIONS, EXTENSION_PINS } from './extensions.ts';
import {
  extensionReporter,
  extensionStep,
  forever,
  setVariableFrom,
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
  samples: 'samples',
  quality: 'quality',
  reprojection: 'reprojection',
  code: 'code',
} as const;

const CAMERA_SOURCE = 'kubohiroyacamerasource';
const CAMERA_CALIBRATION = 'kubohiroyacameracalibration';

/** The camera every role shares, and the board the capture role looks for. */
const CAPTURE_CAMERA = 'default';
const CAPTURE_BOARD = BOARDS[0] ?? { columns: 9, rows: 6 };

const CAPTURING = [
  's=1枚撮る  v=solve  p=camera-sourceへ登録',
  'x=やり直す  space=役割を選び直す',
  '角度と距離を変えながら撮ること。同じ位置からの連写は拒否されます。',
].join('  /  ');

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

export interface ProjectOptions {
  /**
   * Whether this build carries the calibration extensions.
   *
   * Defaults to the feature flag. Named explicitly so a test can build the
   * variant this repository is not currently committing -- otherwise the
   * calibration path is checked by nothing until someone flips the flag.
   */
  readonly embedExtensions?: boolean;
}

export function createProject(title: string, options: ProjectOptions = {}) {
  const embedExtensions = options.embedExtensions ?? EMBEDS_EXTENSIONS;
  const choosing = embedExtensions
    ? '1/2/3=模様を表示  c=撮影を始める  space=選び直す'
    : '1/2/3=模様を表示  space=選び直す（この配布物に校正は入っていません）';
  const costumes = backdrops();
  const blocks: BlockMap = {
    // Choosing is the state the project starts in and returns to. Both roles
    // are reachable from here, so one SB3 covers a single machine pointed at
    // its own screen and a pair of machines alike.
    ...script('start', 48, 48, whenFlagClicked(), [
      setVariable(VARIABLES.role, 'role', ''),
      setVariable(VARIABLES.board, 'board', ''),
      setVariable(VARIABLES.status, 'status', `${title}: ${choosing}`),
      showVariable(VARIABLES.role, 'role'),
      showVariable(VARIABLES.board, 'board'),
      showVariable(VARIABLES.status, 'status'),
      switchBackdrop(chooserName),
    ]),
    ...script('choose', 48, 320, whenKeyPressed('space'), [
      setVariable(VARIABLES.role, 'role', ''),
      setVariable(VARIABLES.board, 'board', ''),
      setVariable(VARIABLES.status, 'status', choosing),
      showVariable(VARIABLES.role, 'role'),
      showVariable(VARIABLES.board, 'board'),
      showVariable(VARIABLES.status, 'status'),
      switchBackdrop(chooserName),
    ]),
  };

  if (embedExtensions) {
    Object.assign(
      blocks,
      // Taking the camera and starting a session are one step. A camera held
      // without a session is a camera taken from whoever else wanted it for
      // nothing, and the operator has no way to see that it happened.
      script('capture', 48, 560, whenKeyPressed('c'), [
        setVariable(VARIABLES.role, 'role', 'capture'),
        setVariable(
          VARIABLES.board,
          'board',
          `${CAPTURE_BOARD.columns}x${CAPTURE_BOARD.rows}`,
        ),
        setVariable(VARIABLES.status, 'status', CAPTURING),
        switchBackdrop(chooserName),
        extensionStep(CAMERA_SOURCE, 'startSharedCamera', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        extensionStep(CAMERA_SOURCE, 'showCameraPreview', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        extensionStep(CAMERA_CALIBRATION, 'startCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
          CALIBRATION_ID: 'session-1',
          COLUMNS: String(CAPTURE_BOARD.columns),
          ROWS: String(CAPTURE_BOARD.rows),
          SQUARE_METERS: '0.025',
          MAX_ERROR_PX: '1.5',
        }),
        showVariable(VARIABLES.samples, 'samples'),
        showVariable(VARIABLES.quality, 'quality'),
        showVariable(VARIABLES.reprojection, 'error px'),
        showVariable(VARIABLES.code, 'code'),
      ]),
      script('sample', 360, 560, whenKeyPressed('s'), [
        extensionStep(CAMERA_CALIBRATION, 'addCameraCalibrationSample', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      script('solve', 680, 560, whenKeyPressed('v'), [
        extensionStep(CAMERA_CALIBRATION, 'solveCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      script('publish', 1000, 560, whenKeyPressed('p'), [
        extensionStep(CAMERA_CALIBRATION, 'publishCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      script('restart', 1320, 560, whenKeyPressed('x'), [
        extensionStep(CAMERA_CALIBRATION, 'cancelCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        setVariable(VARIABLES.status, 'status', CAPTURING),
      ]),
      // The reporters are mirrored into variables rather than shown as their
      // own monitors. A monitor on an extension reporter is addressed by an ID
      // the VM derives from the block's arguments, and one written by hand that
      // does not match shows nothing at all -- with no error to say so.
      script('watch', 48, 860, whenFlagClicked(), [
        forever([
          setVariableFrom(
            VARIABLES.samples,
            'samples',
            extensionReporter(
              CAMERA_CALIBRATION,
              'cameraCalibrationSampleCount',
              {
                CAMERA_ID: CAPTURE_CAMERA,
              },
            ),
          ),
          setVariableFrom(
            VARIABLES.quality,
            'quality',
            extensionReporter(
              CAMERA_CALIBRATION,
              'cameraCalibrationSampleQuality',
              { CAMERA_ID: CAPTURE_CAMERA },
            ),
          ),
          setVariableFrom(
            VARIABLES.reprojection,
            'error px',
            extensionReporter(
              CAMERA_CALIBRATION,
              'cameraCalibrationReprojectionError',
              { CAMERA_ID: CAPTURE_CAMERA },
            ),
          ),
          // The refusal code, not the state. "sample-too-similar" is the one
          // the operator needs to see, and it is the one a state reporter
          // hides: the session goes straight back to ready.
          setVariableFrom(
            VARIABLES.code,
            'code',
            extensionReporter(
              CAMERA_CALIBRATION,
              'cameraCalibrationErrorCode',
              {
                CAMERA_ID: CAPTURE_CAMERA,
              },
            ),
          ),
        ]),
      ]),
    );
  }

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
          [VARIABLES.status]: ['status', choosing],
          ...(embedExtensions
            ? {
                [VARIABLES.samples]: ['samples', 0],
                [VARIABLES.quality]: ['quality', 0],
                [VARIABLES.reprojection]: ['error px', 0],
                [VARIABLES.code]: ['code', ''],
              }
            : {}),
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
      monitor(VARIABLES.status, 'status', 10, 58, choosing),
      ...(embedExtensions
        ? [
            monitor(VARIABLES.samples, 'samples', 10, 82, 0),
            monitor(VARIABLES.quality, 'quality', 10, 106, 0),
            monitor(VARIABLES.reprojection, 'error px', 10, 130, 0),
            monitor(VARIABLES.code, 'code', 10, 154, ''),
          ]
        : []),
    ],
    extensions: embedExtensions ? EXTENSION_PINS.map((pin) => pin.id) : [],
    // Each embedded extension is carried in the SB3 as a data URL. The source
    // form holds this reference instead, and the build reconstructs the URL
    // from embedded-extensions.json, so the bytes live in one place.
    extensionURLs: Object.fromEntries(
      (embedExtensions ? EXTENSION_PINS.map((pin) => pin.id) : []).map((id) => [
        id,
        `embedded-extension:extensions/${id}.js`,
      ]),
    ),
    meta: { semver: '3.0.0', vm: '11.3.0', agent: 'turbowarp-app-template' },
  };
}

function monitor(
  id: string,
  name: string,
  x: number,
  y: number,
  value: string | number = '',
) {
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
