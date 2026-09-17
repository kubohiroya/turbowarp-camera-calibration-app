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
