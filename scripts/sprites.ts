// SPDX-License-Identifier: MPL-2.0
/**
 * The buttons, as sprites.
 *
 * Sprites rather than a drawn overlay because Camera Source puts the preview in
 * Scratch's `video` render group, which sits above the backdrop and below
 * sprites. Anything painted on the backdrop would be behind the camera picture.
 *
 * Each button knows only its own condition. Which buttons make sense in which
 * state is a table, and a table in one place stays right; spread across six
 * scripts it drifts, and a button that is offered when it cannot work is worse
 * than one that is missing -- the operator presses it and gets a refusal for
 * doing the obvious thing.
 */
import {
  equals,
  hide,
  ifElse,
  readVariable,
  script,
  show,
  whenBroadcastReceived,
  whenFlagClicked,
  pointInDirection,
  setEffect,
  switchCostume,
  waitSeconds,
  whenSpriteClicked,
  type BlockMap,
  type Reporter,
  type Step,
} from './blocks.ts';

export interface ButtonSpec {
  /** Sprite name, and the prefix of its block IDs. */
  readonly name: string;
  /**
   * Whether this one turns over while the strip is open.
   *
   * Only the handle does. A control that looks the same before and after being
   * pressed does not say what pressing it did, and the handle is the only
   * thing on screen when everything else is hidden -- so it is the one that
   * most has to.
   */
  readonly flips?: boolean;
  readonly costume: { name: string; contents: string };
  readonly x: number;
  readonly y: number;
  /** The message a click sends. Shared with the key that does the same thing. */
  readonly broadcast?: { id: string; name: string };
  /** True when this button belongs on screen. Always, when absent. */
  readonly visibleWhen?: Reporter;
}

export function buttonTarget(
  button: ButtonSpec,
  layerOrder: number,
  assetId: string,
  repaint: { id: string; name: string },
): Record<string, unknown> {
  const settle = (): Step[] => [
    ...(button.visibleWhen
      ? [ifElse(button.visibleWhen, [show], [hide])]
      : [show]),
    ...(button.flips
      ? [
          ifElse(
            equals(readVariable('panel', 'panel'), 'open'),
            [pointInDirection(-90)],
            [pointInDirection(90)],
          ),
        ]
      : []),
  ];
  const blocks: BlockMap = {
    // Told when to look, rather than looking every frame.
    //
    // A `forever` per button reads as the obvious way to write this, and it is
    // what this did first. Eight of them then called `show` or `hide` on every
    // frame, and scratch-vm requests a redraw from each of those calls whether
    // or not anything changed -- which cuts the sequencer's pass over the
    // threads short for that frame. The stage knows when the answer can differ,
    // because it is the one deriving it, so it says so and nothing polls.
    //
    // Hidden rather than dimmed: a Scratch sprite has no disabled look, and a
    // dimmed one still takes the click.
    ...script(
      `${button.name}-show`,
      48,
      48,
      whenBroadcastReceived(repaint.id, repaint.name),
      settle(),
    ),
    // The green flag does not send that message, so each button also settles
    // itself once at the start. Without this a button would keep whatever
    // visibility the project was saved with until the first state change.
    ...script(`${button.name}-start`, 48, 200, whenFlagClicked(), settle()),
  };
  if (button.broadcast) {
    Object.assign(
      blocks,
      script(`${button.name}-click`, 48, 320, whenSpriteClicked(), [
        {
          opcode: 'event_broadcast',
          inputs: {
            BROADCAST_INPUT: [
              1,
              [11, button.broadcast.name, button.broadcast.id],
            ],
          },
        },
      ]),
    );
  }
  return {
    isStage: false,
    name: button.name,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks,
    comments: {},
    currentCostume: 0,
    costumes: [
      {
        assetId,
        name: button.costume.name,
        bitmapResolution: 1,
        md5ext: `${assetId}.svg`,
        dataFormat: 'svg',
        rotationCenterX: 32,
        rotationCenterY: 32,
      },
    ],
    sounds: [],
    volume: 100,
    layerOrder,
    visible: false,
    x: button.x,
    y: button.y,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around',
  };
}

/**
 * The tilt guide: one sprite, four costumes, over the camera picture.
 *
 * Not a button. It sits in the middle of the stage where the operator is
 * already looking -- at the preview, to see whether the board is in frame --
 * and it is translucent, because what is behind it is the thing being worked
 * on.
 *
 * It flashes when a step is reached. That is the only moment in a session
 * where something went right and nothing on screen would otherwise move, and
 * the operator's hands are busy: the sound says it happened, and this says
 * where to keep looking.
 */
export function guideTarget(
  costumes: ReadonlyArray<{ name: string; contents: string }>,
  assetIds: readonly string[],
  layerOrder: number,
  repaint: { id: string; name: string },
  flash: { id: string; name: string },
  ui: Reporter,
): Record<string, unknown> {
  const wear = (index: number): Step[] => {
    const costume = costumes[index];
    if (!costume) return [];
    const rest = wear(index + 1);
    return [
      ifElse(
        equals(
          readVariable('turn', 'turn'),
          costume.name.replace('guide-', ''),
        ),
        [switchCostume(costume.name)],
        rest,
      ),
    ];
  };
  return {
    isStage: false,
    name: 'guide-tilt',
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {
      ...script(
        `guide-tilt-show`,
        48,
        48,
        whenBroadcastReceived(repaint.id, repaint.name),
        [ifElse(ui, [show], [hide]), ...wear(0)],
      ),
      ...script(`guide-tilt-start`, 48, 200, whenFlagClicked(), [
        // Translucent from the start and never opaque: the picture underneath
        // is the one being worked on.
        setEffect('GHOST', 58),
        setEffect('BRIGHTNESS', 0),
        ifElse(ui, [show], [hide]),
        ...wear(0),
      ]),
      // Half a second of light, on its own script so the stage's loops do not
      // stop for it.
      ...script(
        `guide-tilt-flash`,
        48,
        360,
        whenBroadcastReceived(flash.id, flash.name),
        [
          setEffect('GHOST', 18),
          setEffect('BRIGHTNESS', 45),
          waitSeconds(0.5),
          setEffect('BRIGHTNESS', 0),
          setEffect('GHOST', 58),
        ],
      ),
    },
    comments: {},
    currentCostume: 0,
    costumes: costumes.map((costume, index) => ({
      assetId: assetIds[index] ?? '',
      name: costume.name,
      bitmapResolution: 1,
      md5ext: `${assetIds[index] ?? ''}.svg`,
      dataFormat: 'svg',
      rotationCenterX: 110,
      rotationCenterY: 110,
    })),
    sounds: [],
    volume: 100,
    layerOrder,
    visible: false,
    x: 0,
    y: 20,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around',
  };
}

/** `ui` is the one token every button tests against. */
export function uiIs(value: string): Reporter {
  return equals(readVariable('ui', 'ui'), value);
}

/** A script the stage runs when a button, or the key beside it, asks. */
export function onBroadcast(
  prefix: string,
  x: number,
  y: number,
  message: { id: string; name: string },
  body: readonly Step[],
): BlockMap {
  return script(
    prefix,
    x,
    y,
    whenBroadcastReceived(message.id, message.name),
    body,
  );
}
