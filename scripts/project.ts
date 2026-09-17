// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import {
  BOARDS,
  MARKER_RATIO,
  printedCellMillimetres,
} from '../src/checkerboard.ts';
import { EMBEDS_EXTENSIONS, EXTENSION_PINS } from './extensions.ts';
import {
  both,
  broadcast,
  either,
  equals,
  extensionReporter,
  extensionStep,
  forever,
  greaterThan,
  ifElse,
  ifThen,
  join,
  not,
  readVariable,
  script,
  setVariable,
  setVariableFrom,
  showVariable,
  switchBackdrop,
  waitSeconds,
  whenFlagClicked,
  whenKeyPressed,
  type BlockMap,
  type Reporter,
  type Step,
} from './blocks.ts';
import { buttonTarget, onBroadcast, uiIs, type ButtonSpec } from './sprites.ts';
import {
  handleIcon,
  leaveIcon,
  manualIcon,
  registerIcon,
  restartIcon,
  sampleIcon,
  solveIcon,
  startIcon,
  workingIcon,
} from '../src/icons.ts';

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

/**
 * The strip, left to right, with the slots deliberately reused.
 *
 * Start and restart share a slot, and so do solve and register: they are never
 * both available, and giving each its own place would make the row jump as the
 * session moves through its states. At most four are on screen at once.
 */
export function buttons(): readonly ButtonSpec[] {
  const y = -140;
  const capture = both(panelOpen(), either(uiIs('ready'), uiIs('ready+')));
  return [
    {
      name: 'btn-start',
      costume: { name: 'start', contents: startIcon() },
      x: -120,
      y,
      broadcast: MESSAGES.start,
      visibleWhen: both(panelOpen(), uiIs('idle')),
    },
    {
      name: 'btn-restart',
      costume: { name: 'restart', contents: restartIcon() },
      x: -120,
      y,
      broadcast: MESSAGES.start,
      visibleWhen: both(panelOpen(), not(either(uiIs('idle'), uiIs('busy')))),
    },
    {
      name: 'btn-sample',
      costume: { name: 'sample', contents: sampleIcon() },
      x: -40,
      y,
      broadcast: MESSAGES.sample,
      visibleWhen: capture,
    },
    {
      // Shares the sample slot: the shutter is either being pressed by a
      // person or by the extension, so these two are never both on offer.
      name: 'btn-manual',
      costume: { name: 'manual', contents: manualIcon() },
      x: -40,
      y,
      broadcast: MESSAGES.manual,
      visibleWhen: both(panelOpen(), uiIs('auto')),
    },
    {
      name: 'btn-solve',
      costume: { name: 'solve', contents: solveIcon() },
      x: 40,
      y,
      broadcast: MESSAGES.solve,
      visibleWhen: both(panelOpen(), uiIs('ready+')),
    },
    {
      name: 'btn-register',
      costume: { name: 'register', contents: registerIcon() },
      x: 40,
      y,
      broadcast: MESSAGES.register,
      visibleWhen: both(panelOpen(), uiIs('solved')),
    },
    {
      name: 'btn-leave',
      costume: { name: 'leave', contents: leaveIcon() },
      x: 120,
      y,
      broadcast: MESSAGES.leave,
      // Hidden while an operation runs, like the rest. The key still works, so
      // there is always a way out of something that will not finish -- it just
      // is not a button that invites a second press mid-operation.
      visibleWhen: both(panelOpen(), not(either(uiIs('idle'), uiIs('busy')))),
    },
    {
      // Shown while an operation is running, in the slot the buttons vacate,
      // so the strip does not simply go empty and look broken.
      name: 'indicator-working',
      costume: { name: 'working', contents: workingIcon() },
      x: -40,
      y,
      visibleWhen: uiIs('busy'),
    },
    {
      // The only thing on screen when the strip is closed, and it carries no
      // board artwork: nothing the detector could find.
      name: 'btn-handle',
      costume: { name: 'handle', contents: handleIcon(false) },
      x: 200,
      y,
      broadcast: MESSAGES.panel,
    },
  ];
}

const CAMERA_SOURCE = 'kubohiroyacamerasource';
const CAMERA_CALIBRATION = 'kubohiroyacameracalibration';

/** The camera this project calibrates. Shared with every other consumer. */
const CAPTURE_CAMERA = 'default';

/** One message per action, so a click and the key beside it run one script. */
const MESSAGES = {
  start: { id: 'msg-start', name: 'start' },
  sample: { id: 'msg-sample', name: 'sample' },
  solve: { id: 'msg-solve', name: 'solve' },
  register: { id: 'msg-register', name: 'register' },
  manual: { id: 'msg-manual', name: 'manual' },
  leave: { id: 'msg-leave', name: 'leave' },
  repaint: { id: 'msg-repaint', name: 'repaint' },
  panel: { id: 'msg-panel', name: 'panel' },
} as const;

const VARIABLES = {
  ui: 'ui',
  state: 'state',
  panel: 'panel',
  painted: 'painted',
  translated: 'translated',
  board: 'board',
  columns: 'columns',
  rows: 'rows',
  square: 'square',
  marker: 'marker',
  status: 'status',
  guidance: 'guidance',
  advice: 'advice',
  automatic: 'automatic',
  samples: 'samples',
  quality: 'quality',
  reprojection: 'reprojection',
  code: 'code',
  reason: 'reason',
  camera: 'camera',
} as const;

const IDLE_STATUS = [
  'c=もう一度始める',
  '1/2/3=板を選ぶ',
  'tab=ボタンを開く',
  '模様はアプリのページで表示・印刷します',
].join('   ');

const CAPTURE_STATUS = [
  'ボードを持って、角度と距離を変えながらカメラに見せてください。',
  '撮るのは拡張がやります。指示は下に出ます。',
  'tab=ボタンを開く   a=自分で撮る   space=やめる',
].join('   /   ');

/** Once the operator has taken the shutter back. */
const MANUAL_STATUS = [
  's=1枚撮る   v=solve   p=camera-sourceへ登録   space=やめる',
  '角度と距離を変えて撮ること。傾けずにずらすだけでは解けません。',
].join('   /   ');

/**
 * The guidance codes, as something to do.
 *
 * Instructions rather than the codes themselves: the person reading this is
 * holding a board in front of a camera, and is in no position to translate a
 * diagnosis into a remedy. The two movement cases stay separate on purpose --
 * sliding the board sideways answers `move-or-tilt` and does nothing for
 * `tilt-more`, because focal length and distance stay inseparable until the
 * board is turned.
 */
/** The board this session is looking for, for the messages that need to say. */
const selectedBoard = () => readVariable(VARIABLES.board, 'board');

const ADVICE: ReadonlyArray<readonly [string, string | Reporter]> = [
  // Named rather than described. Three sheets come out of the page and they
  // look alike at arm's length, so "the board" is not enough to pick one --
  // and the selected one is the only one that will be found.
  ['show-the-board', join(selectedBoard(), ' の板をカメラに写してください')],
  [
    'wrong-board',
    join(
      join('別の板のようです。選択中は ', selectedBoard()),
      ' です。その板をかざすか、1/2/3 で選び直してください',
    ),
  ],
  ['hold-steadier', 'ぶれています。少し止めるか、近づけてください'],
  ['move-or-tilt', '同じ見え方です。動かすか傾けてください'],
  ['tilt-more', '傾けてください。横にずらすだけでは解けません'],
  ['keep-going', 'そのまま、角度と距離を変えながら続けてください'],
  ['solving', '計算しています'],
  ['limit-reached', '上限まで撮りました。vで解いてください'],
  ['complete', '完了しました。pでcamera-sourceへ登録できます'],
];

const DISABLED_STATUS =
  'この配布物に校正は入っていません。config/feature-flags.ts の captureAndSolveV1 をONにして pnpm source:update してください。';

/**
 * A nested if/else chain over one variable, written out as blocks.
 *
 * Scratch has no case statement, so a table like this becomes a stack of
 * if/else blocks whichever way it is written. Generating it keeps the table
 * readable here and keeps the order of the branches from drifting.
 */
function chain(
  read: () => Reporter,
  cases: ReadonlyArray<readonly [string, string | Reporter]>,
  target: string,
  label: string,
): Step[] {
  const [head, ...rest] = cases;
  if (!head) return [setVariable(target, label, '')];
  const [when, message] = head;
  return [
    ifElse(
      equals(read(), when),
      [
        typeof message === 'string'
          ? setVariable(target, label, message)
          : setVariableFrom(target, label, message),
      ],
      chain(read, rest, target, label),
    ),
  ];
}

/**
 * The square and marker sizes to declare for a board, in metres.
 *
 * Taken from the sheet the app writes rather than written down, so choosing a
 * different board cannot leave the calibration measuring the previous one: the
 * three boards print at 23.2, 26.0 and 30.0 mm, and a single figure covering
 * all three would be wrong for two of them.
 *
 * Intrinsic calibration is unaffected by any of this -- scale drops out of the
 * fit -- but a board pose is metric and takes its distance from here.
 */
function declaredSizes(board: (typeof BOARDS)[number]): {
  square: string;
  marker: string;
} {
  const millimetres = printedCellMillimetres(board);
  return {
    square: (millimetres / 1000).toFixed(4),
    marker: ((millimetres * MARKER_RATIO) / 1000).toFixed(4),
  };
}

/** The strip is closed unless the operator opened it. */
function equalsPanel(state: 'open' | 'closed'): Reporter {
  return equals(readVariable(VARIABLES.panel, 'panel'), state);
}

const panelOpen = () => equalsPanel('open');

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
      // Only the calibration build has a state to be in, a strip to open, or a
      // board whose printed size it has to declare.
      ...(embedExtensions
        ? [
            setVariable(
              VARIABLES.square,
              'square',
              declaredSizes(board).square,
            ),
            setVariable(
              VARIABLES.marker,
              'marker',
              declaredSizes(board).marker,
            ),
            setVariable(VARIABLES.painted, 'painted', ''),
            setVariable(VARIABLES.translated, 'translated', ''),
            setVariable(VARIABLES.ui, 'ui', 'idle'),
            setVariable(VARIABLES.state, 'state', 'idle'),
            // Closed to begin with. The strip sits over the camera picture,
            // and the operator is usually holding a board rather than reading
            // buttons.
            setVariable(VARIABLES.panel, 'panel', 'closed'),
          ]
        : []),
      setVariable(VARIABLES.status, 'status', `${title}: ${opening}`),
      showVariable(VARIABLES.board, 'board'),
      showVariable(VARIABLES.status, 'status'),
      // The one thing the operator reads while their hands are busy.
      ...(embedExtensions ? [showVariable(VARIABLES.advice, 'advice')] : []),
      switchBackdrop(backdropName),
      // The flag starts the calibration. There is no mode to pick first: this
      // project does one thing, the board it defaults to is the one the page
      // offers first, and the shutter watches by itself -- so anything the
      // operator had to press before the camera came on would be a step that
      // asks them to confirm what they already said by pressing the flag.
      //
      // Only in the build that has a camera path. With it off there is nothing
      // to start, and a message nobody receives.
      ...(embedExtensions
        ? [broadcast(MESSAGES.start.id, MESSAGES.start.name)]
        : []),
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
            // The three boards print at different square sizes, so these
            // travel with the choice. Left behind, a session would be
            // measuring the board the operator stopped using.
            setVariable(
              VARIABLES.square,
              'square',
              declaredSizes(choice).square,
            ),
            setVariable(
              VARIABLES.marker,
              'marker',
              declaredSizes(choice).marker,
            ),
            setVariable(VARIABLES.status, 'status', IDLE_STATUS),
          ],
        ),
      );
    });

    Object.assign(
      blocks,
      // The keys send the same messages the buttons do, so the work lives in
      // one place per action and the two cannot drift apart.
      script('key-start', 48, 480, whenKeyPressed('c'), [
        broadcast(MESSAGES.start.id, MESSAGES.start.name),
      ]),
      script('key-sample', 360, 480, whenKeyPressed('s'), [
        broadcast(MESSAGES.sample.id, MESSAGES.sample.name),
      ]),
      script('key-solve', 600, 480, whenKeyPressed('v'), [
        broadcast(MESSAGES.solve.id, MESSAGES.solve.name),
      ]),
      script('key-register', 840, 480, whenKeyPressed('p'), [
        broadcast(MESSAGES.register.id, MESSAGES.register.name),
      ]),
      script('key-leave', 1080, 480, whenKeyPressed('space'), [
        broadcast(MESSAGES.leave.id, MESSAGES.leave.name),
      ]),
      script('key-manual', 1560, 480, whenKeyPressed('a'), [
        broadcast(MESSAGES.manual.id, MESSAGES.manual.name),
      ]),
      script('key-panel', 1320, 480, whenKeyPressed('tab'), [
        broadcast(MESSAGES.panel.id, MESSAGES.panel.name),
      ]),

      // Taking the camera and opening a session are one step. A camera held
      // without a session is a camera taken from whoever else wanted it for
      // nothing, and the operator has no way to see that it happened.
      onBroadcast('do-start', 48, 640, MESSAGES.start, [
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
            MAX_ERROR_PX: '1.5',
          }),
          reporters: {
            COLUMNS: readVariable(VARIABLES.columns, 'columns'),
            ROWS: readVariable(VARIABLES.rows, 'rows'),
            SQUARE_METERS: readVariable(VARIABLES.square, 'square'),
            MARKER_METERS: readVariable(VARIABLES.marker, 'marker'),
          },
        },
        // Handed over as part of starting, not as a mode to switch into. The
        // extension measures every frame anyway to decide whether a press
        // would have been accepted; leaving the press to the person who is
        // also holding the board asks them to make a judgement that has
        // already been made.
        extensionStep(CAMERA_CALIBRATION, 'startAutomaticCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        setVariable(VARIABLES.status, 'status', CAPTURE_STATUS),
      ]),
      // Taking it back is one-way: the strip then offers the manual buttons,
      // and handing it over again is what restarting a session does. A control
      // to flip back and forth would be a fifth button on the strip for a
      // choice nobody makes twice in one session.
      onBroadcast('do-manual', 1560, 640, MESSAGES.manual, [
        extensionStep(CAMERA_CALIBRATION, 'stopAutomaticCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        setVariable(VARIABLES.status, 'status', MANUAL_STATUS),
        setVariable(VARIABLES.advice, 'advice', ''),
      ]),
      onBroadcast('do-sample', 360, 640, MESSAGES.sample, [
        extensionStep(CAMERA_CALIBRATION, 'addCameraCalibrationSample', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      onBroadcast('do-solve', 600, 640, MESSAGES.solve, [
        extensionStep(CAMERA_CALIBRATION, 'solveCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      onBroadcast('do-register', 840, 640, MESSAGES.register, [
        extensionStep(CAMERA_CALIBRATION, 'publishCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      // Leaving has to hand the camera back. Resetting the display and leaving
      // the lease held would strand a shared camera for every other consumer,
      // with nothing on screen to say it had happened.
      onBroadcast('do-leave', 1080, 640, MESSAGES.leave, [
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
      ]),
      onBroadcast('do-panel', 1320, 640, MESSAGES.panel, [
        ifElse(
          equalsPanel('open'),
          [setVariable(VARIABLES.panel, 'panel', 'closed')],
          [setVariable(VARIABLES.panel, 'panel', 'open')],
        ),
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
          // What the operator should do next, while the shutter watches. Kept
          // apart from `code` on purpose: a frame the shutter declines is the
          // ordinary case, so these would be errors several times a second,
          // and an error that is always showing says nothing.
          setVariableFrom(
            VARIABLES.guidance,
            'guidance',
            extensionReporter(CAMERA_CALIBRATION, 'cameraCalibrationGuidance', {
              CAMERA_ID: CAPTURE_CAMERA,
            }),
          ),
          // Translated only when it changes. The table is eight branches deep,
          // and the guidance holds still for seconds at a time while the
          // operator moves the board.
          ifThen(
            not(
              equals(
                // The board is in the key because it is in the message. With
                // the guidance alone, switching boards while it held still
                // would leave the previous board's name on screen -- naming
                // the wrong sheet is worse than naming none.
                join(
                  readVariable(VARIABLES.guidance, 'guidance'),
                  readVariable(VARIABLES.board, 'board'),
                ),
                readVariable(VARIABLES.translated, 'translated'),
              ),
            ),
            [
              setVariableFrom(
                VARIABLES.translated,
                'translated',
                join(
                  readVariable(VARIABLES.guidance, 'guidance'),
                  readVariable(VARIABLES.board, 'board'),
                ),
              ),
              ...chain(
                () => readVariable(VARIABLES.guidance, 'guidance'),
                ADVICE,
                VARIABLES.advice,
                'advice',
              ),
            ],
          ),
          setVariableFrom(
            VARIABLES.automatic,
            'automatic',
            extensionReporter(
              CAMERA_CALIBRATION,
              'automaticCameraCalibration',
              { CAMERA_ID: CAPTURE_CAMERA },
            ),
          ),
          // What Camera Source thinks it is holding, in one line.
          //
          // A black preview has more than one cause and they are not
          // distinguishable by looking at it: no camera, a camera with no
          // frame size yet, or a camera that was handed back. The size is what
          // separates them, and nothing on screen was saying it -- so every
          // report of "the preview is black" needed a browser console to
          // answer.
          setVariableFrom(
            VARIABLES.camera,
            'camera',
            join(
              join(
                join(
                  extensionReporter(CAMERA_SOURCE, 'cameraFrameWidth', {
                    CAMERA_ID: CAPTURE_CAMERA,
                  }),
                  '×',
                ),
                extensionReporter(CAMERA_SOURCE, 'cameraFrameHeight', {
                  CAMERA_ID: CAPTURE_CAMERA,
                }),
              ),
              join(
                ' ',
                extensionReporter(CAMERA_SOURCE, 'cameraErrorCode', {
                  CAMERA_ID: CAPTURE_CAMERA,
                }),
              ),
            ),
          ),
          // The code says which refusal; this says what happened. The
          // extension has had the sentence all along and the project was
          // throwing it away, leaving the operator -- and anyone they ask for
          // help -- with eleven characters of kebab case.
          setVariableFrom(
            VARIABLES.reason,
            'reason',
            extensionReporter(CAMERA_CALIBRATION, 'cameraCalibrationError', {
              CAMERA_ID: CAPTURE_CAMERA,
            }),
          ),
          // One token the whole interface is decided from. Which buttons make
          // sense in which state is a table, and a table in one place stays
          // right; spread across six scripts it drifts, and a button offered
          // when it cannot work is worse than one that is missing.
          setVariableFrom(
            VARIABLES.state,
            'state',
            extensionReporter(CAMERA_CALIBRATION, 'cameraCalibrationState', {
              CAMERA_ID: CAPTURE_CAMERA,
            }),
          ),
          ifElse(
            equals(readVariable(VARIABLES.state, 'state'), 'ready'),
            [
              ifElse(
                equals(readVariable(VARIABLES.automatic, 'automatic'), 'true'),
                // Collecting by itself. Sampling and solving are not offered,
                // because pressing them would be asking for something already
                // happening; what is offered is a way to take it back.
                [setVariable(VARIABLES.ui, 'ui', 'auto')],
                // Eight is the fewest a solve accepts, so below it the solve
                // button is not offered at all: pressing it would earn a
                // refusal for doing the obvious thing.
                [
                  ifElse(
                    greaterThan(
                      readVariable(VARIABLES.samples, 'samples'),
                      '7',
                    ),
                    [setVariable(VARIABLES.ui, 'ui', 'ready+')],
                    [setVariable(VARIABLES.ui, 'ui', 'ready')],
                  ),
                ],
              ),
            ],
            [
              ifElse(
                equals(readVariable(VARIABLES.state, 'state'), 'solved'),
                [setVariable(VARIABLES.ui, 'ui', 'solved')],
                [
                  ifElse(
                    equals(readVariable(VARIABLES.state, 'state'), 'error'),
                    [setVariable(VARIABLES.ui, 'ui', 'error')],
                    [
                      ifElse(
                        equals(readVariable(VARIABLES.state, 'state'), 'idle'),
                        [setVariable(VARIABLES.ui, 'ui', 'idle')],
                        // acquiring-camera, sampling, solving, cancelling: brief,
                        // and the buttons go away rather than inviting a second
                        // press on an operation already running.
                        [setVariable(VARIABLES.ui, 'ui', 'busy')],
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          // The buttons are told to look only when the answer can differ from
          // the one they are already showing. In the steady state -- which is
          // most of a session, since `ui` changes a handful of times -- this
          // sends nothing, and no sprite touches its visibility.
          ifThen(
            not(
              equals(
                readVariable(VARIABLES.painted, 'painted'),
                join(
                  readVariable(VARIABLES.ui, 'ui'),
                  readVariable(VARIABLES.panel, 'panel'),
                ),
              ),
            ),
            [
              setVariableFrom(
                VARIABLES.painted,
                'painted',
                join(
                  readVariable(VARIABLES.ui, 'ui'),
                  readVariable(VARIABLES.panel, 'panel'),
                ),
              ),
              broadcast(MESSAGES.repaint.id, MESSAGES.repaint.name),
            ],
          ),
          // One pass per frame. Everything above mirrors extension reporters
          // into variables so the monitors can show them, and a monitor is
          // read by a person: thirty times a second is already more than that
          // needs. Without this the sequencer re-enters the loop until the
          // frame's work budget is gone -- thirty thousand passes -- and the
          // budget it spends there is the budget the camera preview and the
          // frame grab do not get.
          waitSeconds(0),
        ]),
      ]),
    );
  }

  const costumes = backdrops();
  const strip = embedExtensions ? buttons() : [];
  return {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: {
          ...(embedExtensions
            ? {
                [VARIABLES.ui]: ['ui', 'idle'],
                [VARIABLES.state]: ['state', 'idle'],
                [VARIABLES.panel]: ['panel', 'closed'],
              }
            : {}),
          [VARIABLES.board]: ['board', `${board.columns}x${board.rows}`],
          [VARIABLES.columns]: ['columns', board.columns],
          [VARIABLES.rows]: ['rows', board.rows],
          [VARIABLES.status]: ['status', opening],
          ...(embedExtensions
            ? {
                [VARIABLES.painted]: ['painted', ''],
                [VARIABLES.translated]: ['translated', ''],
                [VARIABLES.square]: ['square', declaredSizes(board).square],
                [VARIABLES.marker]: ['marker', declaredSizes(board).marker],
                [VARIABLES.guidance]: ['guidance', ''],
                [VARIABLES.advice]: ['advice', ''],
                [VARIABLES.automatic]: ['automatic', 'false'],
                [VARIABLES.samples]: ['samples', 0],
                [VARIABLES.quality]: ['quality', 0],
                [VARIABLES.reprojection]: ['error px', 0],
                [VARIABLES.code]: ['code', ''],
                [VARIABLES.reason]: ['reason', ''],
                [VARIABLES.camera]: ['camera', ''],
              }
            : {}),
        },
        lists: {},
        broadcasts: embedExtensions
          ? Object.fromEntries(
              Object.values(MESSAGES).map((message) => [
                message.id,
                message.name,
              ]),
            )
          : {},
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
      ...strip.map((button, index) =>
        buttonTarget(
          button,
          index + 1,
          md5(button.costume.contents),
          MESSAGES.repaint,
        ),
      ),
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
            monitor(VARIABLES.camera, 'camera', 10, 154, ''),
            monitor(VARIABLES.reason, 'reason', 10, 178, ''),
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
