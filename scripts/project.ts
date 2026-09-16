// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import { BOARDS } from '../src/checkerboard.ts';
import { EMBEDS_EXTENSIONS, EXTENSION_PINS } from './extensions.ts';
import {
  extensionReporter,
  extensionStep,
  forever,
  hideVariable,
  script,
  setVariable,
  setVariableFrom,
  showVariable,
  switchBackdrop,
  whenFlagClicked,
  whenKeyPressed,
  type BlockMap,
} from './blocks.ts';

/**
 * The stage. Deliberately featureless.
 *
 * The chessboard is not here: it is drawn as SVG in the page, where it can be
 * printed, saved, shown on a tablet, and reported in millimetres -- none of
 * which a fixed-size Scratch stage can do. Keeping it out also means this
 * project contains no complete grid anywhere, so nothing it draws can be
 * mistaken for the target.
 */
export const stageBackdrop =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#152033"/></svg>\n';

export const backdropName = 'stage';

export function md5(contents: string): string {
  return createHash('md5').update(contents).digest('hex');
}

export function backdrops(): ReadonlyArray<{ name: string; contents: string }> {
  return [{ name: backdropName, contents: stageBackdrop }];
}

const CAMERA_SOURCE = 'kubohiroyacamerasource';
const CAMERA_CALIBRATION = 'kubohiroyacameracalibration';

/** The camera this project calibrates. Shared with every other consumer. */
const CAPTURE_CAMERA = 'default';

const VARIABLES = {
  board: 'board',
  columns: 'columns',
  rows: 'rows',
  status: 'status',
  samples: 'samples',
  quality: 'quality',
  reprojection: 'reprojection',
  code: 'code',
} as const;

const IDLE_STATUS = [
  'c=撮影を始める',
  '1/2/3=板を選ぶ',
  '模様はアプリのページで表示・印刷します',
].join('   ');

const CAPTURE_STATUS = [
  's=1枚撮る   v=solve   p=camera-sourceへ登録   space=やめる',
  '角度と距離を変えて撮ること。傾けずにずらすだけでは解けません。',
].join('   /   ');

const DISABLED_STATUS =
  'この配布物に校正は入っていません。config/feature-flags.ts の captureAndSolveV1 をONにして pnpm source:update してください。';

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
  const board = BOARDS[0] ?? { columns: 9, rows: 6 };
  const opening = embedExtensions ? IDLE_STATUS : DISABLED_STATUS;

  const blocks: BlockMap = {
    ...script('start', 48, 48, whenFlagClicked(), [
      setVariable(VARIABLES.board, 'board', `${board.columns}x${board.rows}`),
      setVariable(VARIABLES.columns, 'columns', String(board.columns)),
      setVariable(VARIABLES.rows, 'rows', String(board.rows)),
      setVariable(VARIABLES.status, 'status', `${title}: ${opening}`),
      showVariable(VARIABLES.board, 'board'),
      showVariable(VARIABLES.status, 'status'),
      switchBackdrop(backdropName),
    ]),
  };

  if (embedExtensions) {
    BOARDS.forEach((choice, index) => {
      Object.assign(
        blocks,
        // The board is named by its inner corner counts, which is what the
        // calibration block is given. No picture of it appears anywhere in
        // this project: a drawing of the target is a thing the finder can
        // find, and the numbers are what the operator has to get right.
        script(
          `board-${index}`,
          48 + index * 240,
          280,
          whenKeyPressed(String(index + 1)),
          [
            setVariable(
              VARIABLES.board,
              'board',
              `${choice.columns}x${choice.rows}`,
            ),
            setVariable(VARIABLES.columns, 'columns', String(choice.columns)),
            setVariable(VARIABLES.rows, 'rows', String(choice.rows)),
            setVariable(VARIABLES.status, 'status', IDLE_STATUS),
          ],
        ),
      );
    });

    Object.assign(
      blocks,
      // Taking the camera and opening a session are one step. A camera held
      // without a session is a camera taken from whoever else wanted it for
      // nothing, and the operator has no way to see that it happened.
      script('capture', 48, 480, whenKeyPressed('c'), [
        extensionStep(CAMERA_SOURCE, 'startSharedCamera', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        extensionStep(CAMERA_SOURCE, 'showCameraPreview', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        {
          ...extensionStep(CAMERA_CALIBRATION, 'startCameraCalibration', {
            CAMERA_ID: CAPTURE_CAMERA,
            CALIBRATION_ID: 'session-1',
            SQUARE_METERS: '0.025',
            MAX_ERROR_PX: '1.5',
          }),
          reporters: {
            COLUMNS: readVariableReporter(VARIABLES.columns, 'columns'),
            ROWS: readVariableReporter(VARIABLES.rows, 'rows'),
          },
        },
        setVariable(VARIABLES.status, 'status', CAPTURE_STATUS),
        showVariable(VARIABLES.samples, 'samples'),
        showVariable(VARIABLES.quality, 'quality'),
        showVariable(VARIABLES.reprojection, 'error px'),
        showVariable(VARIABLES.code, 'code'),
      ]),
      script('sample', 360, 480, whenKeyPressed('s'), [
        extensionStep(CAMERA_CALIBRATION, 'addCameraCalibrationSample', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      script('solve', 600, 480, whenKeyPressed('v'), [
        extensionStep(CAMERA_CALIBRATION, 'solveCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      script('publish', 840, 480, whenKeyPressed('p'), [
        extensionStep(CAMERA_CALIBRATION, 'publishCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      // Leaving has to hand the camera back. Resetting the display and
      // leaving the lease held would strand a shared camera for every other
      // consumer, with nothing on screen to say it had happened.
      script('leave', 1080, 480, whenKeyPressed('space'), [
        extensionStep(CAMERA_CALIBRATION, 'cancelCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        extensionStep(CAMERA_SOURCE, 'hideCameraPreview', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        extensionStep(CAMERA_SOURCE, 'stopSharedCamera', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        setVariable(VARIABLES.status, 'status', IDLE_STATUS),
        hideVariable(VARIABLES.samples, 'samples'),
        hideVariable(VARIABLES.quality, 'quality'),
        hideVariable(VARIABLES.reprojection, 'error px'),
        hideVariable(VARIABLES.code, 'code'),
      ]),
      // The reporters are mirrored into variables rather than shown as their
      // own monitors. A monitor on an extension reporter is addressed by an ID
      // the VM derives from the block's arguments, and one written by hand
      // that does not match shows nothing at all -- with no error to say so.
      script('watch', 48, 760, whenFlagClicked(), [
        forever([
          setVariableFrom(
            VARIABLES.samples,
            'samples',
            extensionReporter(
              CAMERA_CALIBRATION,
              'cameraCalibrationSampleCount',
              { CAMERA_ID: CAPTURE_CAMERA },
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
              { CAMERA_ID: CAPTURE_CAMERA },
            ),
          ),
        ]),
      ]),
    );
  }

  const costumes = backdrops();
  return {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: {
          [VARIABLES.board]: ['board', `${board.columns}x${board.rows}`],
          [VARIABLES.columns]: ['columns', board.columns],
          [VARIABLES.rows]: ['rows', board.rows],
          [VARIABLES.status]: ['status', opening],
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
      monitor(
        VARIABLES.board,
        'board',
        10,
        10,
        `${board.columns}x${board.rows}`,
      ),
      monitor(VARIABLES.status, 'status', 10, 34, opening),
      ...(embedExtensions
        ? [
            monitor(VARIABLES.samples, 'samples', 10, 58, 0),
            monitor(VARIABLES.quality, 'quality', 10, 82, 0),
            monitor(VARIABLES.reprojection, 'error px', 10, 106, 0),
            monitor(VARIABLES.code, 'code', 10, 130, ''),
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

function readVariableReporter(id: string, name: string) {
  return { opcode: 'data_variable', fields: { VARIABLE: [name, id] } };
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
