// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import config from '../config/app.json' with { type: 'json' };
import {
  boardBackdropName,
  titleBackdrop,
  titleBackdropName,
} from '../src/title.ts';
import {
  TITLE_BUTTON_SIZE,
  boardButton,
  startButton,
} from '../src/title-buttons.ts';

const own = createRequire(import.meta.url)('../package.json') as {
  version: string;
  author: string;
  license: string;
};
const appVersion = own.version;
const appAuthor = own.author;
const appLicense = own.license;
import {
  BOARDS,
  MARKER_RATIO,
  patternSvg,
  printedCellMillimetres,
} from '../src/board.ts';
import {
  CLICK_SOUND,
  DIRECTION_SOUNDS,
  SOLVED_SOUND,
  sounds,
  stepSoundName,
} from '../src/sounds.ts';
import { EMBEDS_EXTENSIONS, EXTENSION_PINS } from './extensions.ts';
import {
  both,
  broadcast,
  equals,
  extensionReporter,
  extensionStep,
  forever,
  greaterThan,
  add,
  appendToList,
  divide,
  emptyList,
  ifElse,
  ifThen,
  join,
  listContents,
  multiply,
  playSound,
  not,
  readVariable,
  script,
  setVariable,
  setVariableFrom,
  hideVariable,
  showList,
  showVariable,
  switchBackdrop,
  waitSeconds,
  waitFor,
  whenFlagClicked,
  whenKeyPressed,
  type BlockMap,
  type Reporter,
  type Step,
} from './blocks.ts';
import {
  guideTarget,
  onBroadcast,
  titleButtonTarget,
  uiIs,
} from './sprites.ts';
import { guideCostumes } from '../src/guide.ts';

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

/**
 * Every backdrop the stage can wear.
 *
 * The plain one during a calibration, the opening screen before it, and one
 * per board. The boards are drawn by the extension that looks for them, so the
 * sheet on screen and the thing being searched for cannot disagree.
 */
export function backdrops(
  embedExtensions = EMBEDS_EXTENSIONS,
): ReadonlyArray<{ name: string; contents: string }> {
  if (!embedExtensions)
    return [{ name: backdropName, contents: stageBackdrop }];
  return [
    { name: backdropName, contents: stageBackdrop },
    { name: titleBackdropName, contents: titleBackdrop(titleFacts()) },
    ...BOARDS.map((board) => ({
      name: boardBackdropName(board.columns, board.rows),
      contents: patternSvg(board),
    })),
  ];
}

function titleFacts() {
  return {
    title: config.title,
    version: appVersion,
    author: appAuthor,
    license: appLicense,
    // Fixed at build time rather than read from a clock: a copyright line that
    // changes on New Year's Day changes the SB3's bytes with it, and a
    // deterministic build is worth more than a current year.
    year: 2026,
  };
}

const CAMERA_SOURCE = 'kubohiroyacamerasource';
const CAMERA_CALIBRATION = 'kubohiroyacameracalibration';

/** The camera this project calibrates. Shared with every other consumer. */
const CAPTURE_CAMERA = 'default';

/** One message per action, so a click and the key beside it run one script. */
/**
 * What is left to say, now that nothing is pressed.
 *
 * The green flag starts a calibration and the red stop button ends one -- the
 * extension releases its camera on `PROJECT_STOP_ALL` -- so every control this
 * project used to draw was a second way to do something TurboWarp already
 * does, or a fallback for the automatic path failing. A fallback nobody can
 * find is not a fallback; it is a strip of buttons over the camera picture.
 *
 * `adopt` is not part of the loop: it reads a profile the operator put into
 * the list themselves.
 */
const MESSAGES = {
  start: { id: 'msg-start', name: 'start' },
  register: { id: 'msg-register', name: 'register' },
  adopt: { id: 'msg-adopt', name: 'adopt' },
  repaint: { id: 'msg-repaint', name: 'repaint' },
  flash: { id: 'msg-flash', name: 'flash' },
  hunt: { id: 'msg-hunt', name: 'hunt' },
  begin: { id: 'msg-begin', name: 'begin' },
  showBoard: BOARDS.map((board) => ({
    id: `msg-show-${board.columns}x${board.rows}`,
    name: `show ${board.columns}x${board.rows}`,
  })),
} as const;

const VARIABLES = {
  ui: 'ui',
  state: 'state',
  panel: 'panel',
  painted: 'painted',
  translated: 'translated',
  announced: 'announced',
  novelty: 'novelty',
  turn: 'turn',
  turnWords: 'turn-words',
  cued: 'cued',
  hunted: 'hunted',
  screen: 'screen',
  progress: 'progress',
  sounded: 'sounded',
  fit: 'fit',
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

/**
 * The profile, in the one container that can leave a Scratch project.
 *
 * A list monitor carries import and export in its own context menu, and those
 * run from the operator's own click -- which a block cannot do, because a
 * block runs on a timer and a browser will not open a file dialog for one. So
 * the product of this whole app leaves through a list, and comes back the same
 * way.
 */
const PROFILE_LIST = { id: 'list-profile', name: 'profile' } as const;

/** Shown once the profile exists and has been handed to Camera Source. */
const EXPORT_STATUS = [
  '校正できました。camera-source に登録済みです。',
  'ステージ左の profile リストを右クリック → 書き出す で、ファイルに保存できます。',
  '読み込むときは、同じリストに 読み込む → i キー。',
].join('   /   ');

/** While this machine is the one showing a board. */
const DISPLAY_STATUS = [
  'この画面をカメラに見せてください。',
  '全画面ボタンで大きくなります。緑の旗で最初の画面に戻ります。',
].join('   ');

const IDLE_STATUS = [
  '緑の旗で始まります。停止ボタンでカメラを返します。',
  '模様はこのページで表示・印刷します。板はどれでも構いません — かざした板を見つけます。',
].join('   ');

const CAPTURE_STATUS = [
  'ボードを持って、画面の絵のとおりに傾けてください。',
  '撮る・解く・登録まで自動です。押すものはありません。',
  'やめるときは停止ボタン、やり直すときは緑の旗。',
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
  ['move-or-tilt', '同じ見え方です。位置を変えるか、傾け方を変えてください'],
  // The one instruction people get wrong, so it says what does not work as
  // well as what does. Sliding the board keeps every view the same shape, and
  // a set of same-shaped views cannot separate focal length from distance.
  // Names the direction the extension asked for, so the instruction is one
  // the operator can carry out rather than interpret. The sound says the same
  // thing at the same moment, for the times they are not looking.
  // Names the direction the extension asked for, so the instruction is one
  // the operator can carry out rather than interpret. The sound says the same
  // thing at the same moment, for the times they are not looking at all.
  [
    'tilt-more',
    join(
      '板を ',
      join(readVariable('turn-words', 'turn words'), ' 傾けてください'),
    ),
  ],
  ['keep-going', 'そのまま、角度と距離を変えながら続けてください'],
  // Not "keep going": more of the same is the thing that is not working.
  [
    'vary-more',
    '見え方が似すぎています。カメラに近づける・遠ざける、大きく傾ける、画面の端に寄せる、を試してください',
  ],
  ['solving', '計算しています'],
  [
    'complete',
    '完了しました。camera-source に登録し、profile リストに書き出しました',
  ],
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
            setVariable(VARIABLES.announced, 'announced', ''),
            setVariable(VARIABLES.cued, 'cued', ''),
            setVariable(VARIABLES.sounded, 'sounded', '0'),
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
      // The flag opens the app, and the app opens on a screen that says what
      // it is and what the operator has to fetch. One decision is asked there
      // and nowhere else: whether this machine shows the board or calibrates a
      // camera. Nothing in the app was asking it, and the operator arrives
      // knowing neither.
      ...(embedExtensions
        ? [
            setVariable(VARIABLES.screen, 'screen', 'title'),
            switchBackdrop(titleBackdropName),
          ]
        : [switchBackdrop(backdropName)]),
    ]),
  };

  if (embedExtensions) {
    Object.assign(
      blocks,
      // The keys send the same messages the buttons do, so the work lives in
      // one place per action and the two cannot drift apart.
      script('key-adopt', 1800, 480, whenKeyPressed('i'), [
        broadcast(MESSAGES.adopt.id, MESSAGES.adopt.name),
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
      onBroadcast('do-register', 840, 640, MESSAGES.register, [
        extensionStep(CAMERA_CALIBRATION, 'publishCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
        // And put it where it can be taken away. This app exists to produce
        // this one document; a calibration that only ever lives inside a
        // running project has not been handed to anybody.
        emptyList(PROFILE_LIST.id, PROFILE_LIST.name),
        appendToList(
          PROFILE_LIST.id,
          PROFILE_LIST.name,
          extensionReporter(CAMERA_CALIBRATION, 'cameraCalibrationJson', {
            CAMERA_ID: CAPTURE_CAMERA,
          }),
        ),
        showList(PROFILE_LIST.id, PROFILE_LIST.name),
        setVariable(VARIABLES.status, 'status', EXPORT_STATUS),
      ]),
      // Taking one back. The list is filled by the operator through its own
      // context menu -- the only door in a Scratch project that opens onto a
      // file -- and this reads whatever came through it.
      onBroadcast('do-adopt', 1800, 640, MESSAGES.adopt, [
        {
          ...extensionStep(CAMERA_CALIBRATION, 'importCameraCalibration', {
            CAMERA_ID: CAPTURE_CAMERA,
            JSON: '',
          }),
          reporters: {
            JSON: listContents(PROFILE_LIST.id, PROFILE_LIST.name),
          },
        },
        // Handing it to Camera Source is what makes it answerable: the
        // conditions it has to fit are the ones Camera Source is holding.
        extensionStep(CAMERA_CALIBRATION, 'publishCameraCalibration', {
          CAMERA_ID: CAPTURE_CAMERA,
        }),
      ]),
      // Leaving has to hand the camera back. Resetting the display and leaving
      // the lease held would strand a shared camera for every other consumer,
      // with nothing on screen to say it had happened.

      // Show a board on this machine, and stop being the machine that
      // calibrates. Both roles in one project was the plan from the start;
      // what was missing was anywhere to choose between them.
      ...BOARDS.flatMap((board, index) => {
        const message = MESSAGES.showBoard[index];
        if (!message) return [];
        return [
          onBroadcast(`do-show-${index}`, 2280 + index * 240, 640, message, [
            setVariable(VARIABLES.screen, 'screen', 'board'),
            setVariable(
              VARIABLES.board,
              'board',
              `${board.columns}x${board.rows}`,
            ),
            switchBackdrop(boardBackdropName(board.columns, board.rows)),
            setVariable(VARIABLES.status, 'status', DISPLAY_STATUS),
            broadcast(MESSAGES.repaint.id, MESSAGES.repaint.name),
          ]),
        ];
      }),
      // And the other role.
      onBroadcast('do-begin', 3000, 640, MESSAGES.begin, [
        setVariable(VARIABLES.screen, 'screen', 'capture'),
        switchBackdrop(backdropName),
        broadcast(MESSAGES.repaint.id, MESSAGES.repaint.name),
        broadcast(MESSAGES.start.id, MESSAGES.start.name),
      ]),

      // The board finds itself.
      //
      // Three sheets come out of the page and only the chosen one is looked
      // for, which used to mean three keys and a line of text explaining
      // them. But holding the wrong one is not silence: the markers are seen
      // and they do not make this board, which the extension says as
      // `wrong-board`. That is enough to work out which sheet is in front of
      // the camera -- try the next one.
      //
      // Only on `wrong-board`. An empty frame says nothing about which board
      // the operator has, so cycling then would be guessing, and would keep
      // restarting a session that was about to be handed a board.
      onBroadcast('do-hunt', 2040, 640, MESSAGES.hunt, [
        ...BOARDS.flatMap((choice, index) => {
          const next = BOARDS[(index + 1) % BOARDS.length] ?? choice;
          return [
            ifThen(
              equals(
                readVariable(VARIABLES.board, 'board'),
                `${choice.columns}x${choice.rows}`,
              ),
              [
                setVariable(
                  VARIABLES.board,
                  'board',
                  `${next.columns}x${next.rows}`,
                ),
                setVariable(VARIABLES.columns, 'columns', String(next.columns)),
                setVariable(VARIABLES.rows, 'rows', String(next.rows)),
                setVariable(
                  VARIABLES.square,
                  'square',
                  declaredSizes(next).square,
                ),
                setVariable(
                  VARIABLES.marker,
                  'marker',
                  declaredSizes(next).marker,
                ),
              ],
            ),
          ];
        }),
        // A session is fixed to one board when it starts, so trying another
        // means starting again. Nothing is lost: this only runs while nothing
        // has been collected.
        broadcast(MESSAGES.start.id, MESSAGES.start.name),
      ]),

      // Guidance for the ear, on a loop of its own.
      //
      // Separate from the watch loop because it sleeps, and for a length that
      // changes: a loop that mirrors reporters cannot also be the loop that
      // paces a sound. The two would have to agree on an interval and neither
      // wants the other's.
      script('guide', 48, 1040, whenFlagClicked(), [
        forever([
          // Only while the shutter is watching and something usable is in
          // frame. Ticking at an empty frame would be the machine talking
          // about itself.
          ifThen(
            both(
              uiIs('auto'),
              greaterThan(readVariable(VARIABLES.novelty, 'novelty'), '0'),
            ),
            [
              // Said when it changes, not on a loop: a direction repeated
              // every second is noise, and the operator already knows.
              ifThen(
                not(
                  equals(
                    readVariable(VARIABLES.turn, 'turn'),
                    readVariable(VARIABLES.cued, 'cued'),
                  ),
                ),
                [
                  setVariableFrom(
                    VARIABLES.cued,
                    'cued',
                    readVariable(VARIABLES.turn, 'turn'),
                  ),
                  ...directionCues(),
                ],
              ),
              playSound(CLICK_SOUND),
            ],
          ),
          // Holding the wrong sheet: try the next board. Once per pass of this
          // loop, which is slow enough that a session gets a moment to look
          // before it is restarted again.
          ifThen(
            both(
              equals(
                readVariable(VARIABLES.guidance, 'guidance'),
                'wrong-board',
              ),
              equals(readVariable(VARIABLES.samples, 'samples'), '0'),
            ),
            [broadcast(MESSAGES.hunt.id, MESSAGES.hunt.name)],
          ),
          // Faster the closer the view is to one worth keeping: about twice a
          // second at nothing, twenty at everything. The number is how much
          // this view would add, so the operator hears themselves getting
          // warmer without looking away from the board.
          waitFor(
            divide(
              1,
              add(2, multiply(readVariable(VARIABLES.novelty, 'novelty'), 18)),
            ),
          ),
        ]),
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
          // How much the view being looked at would add, and which way the
          // board still has to go. Both are for the ear rather than the eye:
          // the operator is holding the board and looking at it.
          setVariableFrom(
            VARIABLES.novelty,
            'novelty',
            extensionReporter(CAMERA_CALIBRATION, 'cameraCalibrationNovelty', {
              CAMERA_ID: CAPTURE_CAMERA,
            }),
          ),
          setVariableFrom(
            VARIABLES.progress,
            'progress',
            extensionReporter(CAMERA_CALIBRATION, 'cameraCalibrationProgress', {
              CAMERA_ID: CAPTURE_CAMERA,
            }),
          ),
          setVariableFrom(
            VARIABLES.turn,
            'turn',
            extensionReporter(
              CAMERA_CALIBRATION,
              'cameraCalibrationTiltDirection',
              { CAMERA_ID: CAPTURE_CAMERA },
            ),
          ),
          // The same instruction the cue plays, in words. Written from where
          // the operator stands, because that is the only frame they have:
          // the board is in their hands and the camera is in front of them.
          ...chain(
            () => readVariable(VARIABLES.turn, 'turn'),
            [
              ['top-near', '上side を手前に'],
              ['top-far', '上side を奥に'],
              ['left-near', '左side を手前に'],
              ['right-near', '右side を手前に'],
            ],
            VARIABLES.turnWords,
            'turn words',
          ),
          // Whether a profile fits the camera it is being used on.
          //
          // Three answers, and the third is not a softer no: `undetermined`
          // means the check could not be made, and a profile that cannot be
          // checked must not be described as usable. Camera Source withholds
          // the intrinsics in that case; saying anything warmer here would be
          // the app disagreeing with the thing that decides.
          ...chain(
            () =>
              extensionReporter(CAMERA_SOURCE, 'cameraProfileCompatibility', {
                CAMERA_ID: CAPTURE_CAMERA,
              }),
            [
              ['compatible', 'このカメラに使えます'],
              ['incompatible', '合いません（撮影条件が校正時と違います）'],
              ['undetermined', '判定できません。使えるとは言えません'],
            ],
            VARIABLES.fit,
            'fit',
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
                  join(
                    readVariable(VARIABLES.board, 'board'),
                    readVariable(VARIABLES.turn, 'turn'),
                  ),
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
                  join(
                    readVariable(VARIABLES.board, 'board'),
                    readVariable(VARIABLES.turn, 'turn'),
                  ),
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
                  join(
                    readVariable(VARIABLES.panel, 'panel'),
                    readVariable(VARIABLES.turn, 'turn'),
                  ),
                ),
              ),
            ),
            [
              setVariableFrom(
                VARIABLES.painted,
                'painted',
                join(
                  readVariable(VARIABLES.ui, 'ui'),
                  join(
                    readVariable(VARIABLES.panel, 'panel'),
                    readVariable(VARIABLES.turn, 'turn'),
                  ),
                ),
              ),
              broadcast(MESSAGES.repaint.id, MESSAGES.repaint.name),
            ],
          ),
          // One step of sixteen, said as it is reached.
          //
          // A whole calibration is four gates of four steps. The chord says
          // how far into a gate -- one note, two, three, then a different
          // three -- and a note in front says which gate. Both read off the
          // same rule, so there are sixteen sounds and nothing to learn.
          ifThen(
            greaterThan(
              readVariable(VARIABLES.progress, 'progress'),
              readVariable(VARIABLES.sounded, 'sounded'),
            ),
            [
              setVariableFrom(
                VARIABLES.sounded,
                'sounded',
                readVariable(VARIABLES.progress, 'progress'),
              ),
              ...stepCues(),
              // The sound says it happened; the overlay says where to keep
              // looking. Both at the same moment, because they are the same
              // fact.
              broadcast(MESSAGES.flash.id, MESSAGES.flash.name),
            ],
          ),
          // Shown when there is something to read, hidden when there is not.
          // A reason that is always on screen is furniture; one that appears
          // is a message.
          ifElse(
            equals(readVariable(VARIABLES.reason, 'reason'), ''),
            [hideVariable(VARIABLES.reason, 'reason')],
            [showVariable(VARIABLES.reason, 'reason')],
          ),
          ifElse(
            equals(readVariable(VARIABLES.fit, 'fit'), ''),
            [hideVariable(VARIABLES.fit, 'fit')],
            [showVariable(VARIABLES.fit, 'fit')],
          ),
          // Said out loud, once, when it becomes true.
          //
          // The operator is holding a board at arm's length and moving it,
          // which is the posture in which a message appearing somewhere is
          // least likely to be read. Keyed on `ui` alone rather than on the
          // repaint key, so opening the strip afterwards does not play it
          // again.
          ifThen(
            not(
              equals(
                readVariable(VARIABLES.ui, 'ui'),
                readVariable(VARIABLES.announced, 'announced'),
              ),
            ),
            [
              setVariableFrom(
                VARIABLES.announced,
                'announced',
                readVariable(VARIABLES.ui, 'ui'),
              ),
              ifThen(equals(readVariable(VARIABLES.ui, 'ui'), 'solved'), [
                playSound(SOLVED_SOUND),
                // Not a button. The session just produced the one thing this
                // app exists to produce, for the camera it was produced from;
                // there is no version of "no thanks" worth asking about. It
                // used to say "press p", and pressing p did its work in
                // silence, which is two mistakes in one line.
                broadcast(MESSAGES.register.id, MESSAGES.register.name),
              ]),
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

  const costumes = backdrops(embedExtensions);
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
                [VARIABLES.announced]: ['announced', ''],
                [VARIABLES.novelty]: ['novelty', 0],
                [VARIABLES.turn]: ['turn', ''],
                [VARIABLES.turnWords]: ['turn words', ''],
                [VARIABLES.cued]: ['cued', ''],
                [VARIABLES.hunted]: ['hunted', ''],
                [VARIABLES.screen]: ['screen', 'title'],
                [VARIABLES.progress]: ['progress', 0],
                [VARIABLES.sounded]: ['sounded', 0],
                [VARIABLES.fit]: ['fit', ''],
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
        lists: embedExtensions
          ? { [PROFILE_LIST.id]: [PROFILE_LIST.name, []] }
          : {},
        broadcasts: embedExtensions
          ? Object.fromEntries(
              // One entry per board as well, since showing a board is a
              // message like any other.
              Object.values(MESSAGES)
                .flatMap((message) =>
                  Array.isArray(message) ? message : [message],
                )
                .map((message) => [message.id, message.name]),
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
        sounds: embedExtensions ? soundEntries() : [],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: 'off',
        textToSpeechLanguage: null,
      },
      ...(embedExtensions
        ? titleButtons().map((button, index) =>
            titleButtonTarget(
              button.name,
              button.costume,
              md5(button.costume.contents),
              { x: button.x, y: button.y },
              button.message,
              index + 1,
              MESSAGES.repaint,
              button.size,
            ),
          )
        : []),
      ...(embedExtensions
        ? [
            guideTarget(
              guideCostumes(),
              guideCostumes().map((costume) => md5(costume.contents)),
              titleButtons().length + 1,
              MESSAGES.repaint,
              MESSAGES.flash,
              // Only while the shutter is collecting. Once it is solved, or
              // the camera is not running, there is nothing to tilt.
              uiIs('auto'),
            ),
          ]
        : []),
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
            // Off at the start and shown only when they have something to
            // say. The numbers were on screen because they were useful to
            // whoever was debugging, which is not who is holding the board:
            // the progress they were being read for is now a sound, and what
            // is left of them is a reason for a failure, which is worth the
            // space exactly when there is one.
            monitor(VARIABLES.reason, 'reason', 10, 58, '', false),
            monitor(VARIABLES.fit, 'fit', 10, 82, '', false),
            monitor(VARIABLES.samples, 'samples', 10, 106, 0, false),
            monitor(VARIABLES.quality, 'quality', 10, 130, 0, false),
            monitor(VARIABLES.reprojection, 'error px', 10, 154, 0, false),
            monitor(VARIABLES.code, 'code', 10, 178, '', false),
            monitor(VARIABLES.camera, 'camera', 10, 202, '', false),
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

/**
 * The sixteen step sounds, chosen by the step just reached.
 *
 * A chain rather than a computed name: a sound is named by a field on the
 * block, which nothing can build at run time. Sixteen branches cost nothing
 * here because the whole thing runs only when the step changes, which is
 * sixteen times in a session.
 */
function stepCues(): Step[] {
  const chain = (step: number): Step[] => {
    if (step > 16) return [];
    return [
      ifElse(
        equals(readVariable(VARIABLES.progress, 'progress'), String(step)),
        [playSound(stepSoundName(step))],
        chain(step + 1),
      ),
    ];
  };
  return chain(1);
}

/**
 * One cue per direction, chosen when the direction changes.
 *
 * Four timbres would be four things to learn, so these are not four of
 * anything: the timbre says which axis and the contour says which way along
 * it. Two facts, one bit each.
 */
function directionCues(): Step[] {
  const cases = Object.entries(DIRECTION_SOUNDS);
  const chain = (rest: typeof cases): Step[] => {
    const [head, ...tail] = rest;
    if (!head) return [];
    return [
      ifElse(
        equals(readVariable(VARIABLES.turn, 'turn'), head[0]),
        [playSound(head[1])],
        chain(tail),
      ),
    ];
  };
  return chain(cases);
}

/**
 * The opening screen's controls, with where they sit.
 *
 * Laid out against the backdrop's own labels: the three boards under "ボードを
 * 表示", the start under "校正を始める". Stage coordinates put the origin in the
 * middle, and the backdrop is drawn from its top left, so these are the same
 * places counted the other way.
 */
export function titleButtons(): ReadonlyArray<{
  name: string;
  costume: { name: string; contents: string };
  x: number;
  y: number;
  message: { id: string; name: string };
  size: { width: number; height: number };
}> {
  const boards = BOARDS.map((board, index) => {
    const message = MESSAGES.showBoard[index];
    return {
      name: `title-board-${board.columns}x${board.rows}`,
      costume: {
        name: `board-${board.columns}x${board.rows}`,
        contents: boardButton(board.columns, board.rows),
      },
      x: -184 + index * 104,
      y: 72,
      message: message ?? MESSAGES.begin,
      size: TITLE_BUTTON_SIZE,
    };
  });
  return [
    ...boards,
    {
      name: 'title-begin',
      costume: { name: 'begin', contents: startButton() },
      x: -156,
      y: 12,
      message: MESSAGES.begin,
      size: { width: 160, height: TITLE_BUTTON_SIZE.height },
    },
  ];
}

/** The sounds, with the file names the source directory stores them under. */
export function soundFiles(): ReadonlyArray<{
  name: string;
  bytes: Uint8Array;
  file: string;
}> {
  return sounds().map((generated) => ({
    ...generated,
    file: `${createHash('md5').update(generated.bytes).digest('hex')}.wav`,
  }));
}

function soundEntries() {
  return sounds().map((generated) => {
    const assetId = createHash('md5').update(generated.bytes).digest('hex');
    return {
      assetId,
      name: generated.name,
      dataFormat: 'wav',
      format: '',
      rate: generated.rate,
      sampleCount: generated.sampleCount,
      md5ext: `${assetId}.wav`,
    };
  });
}

function monitor(
  id: string,
  name: string,
  x: number,
  y: number,
  value: string | number = '',
  visible = true,
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
    visible,
    sliderMin: 0,
    sliderMax: 100,
    isDiscrete: true,
  };
}
