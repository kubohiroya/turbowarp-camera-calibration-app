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
  forever,
  hide,
  ifElse,
  readVariable,
  script,
  show,
  whenBroadcastReceived,
  whenFlagClicked,
  whenSpriteClicked,
  type BlockMap,
  type Reporter,
  type Step,
} from './blocks.ts';

export interface ButtonSpec {
  /** Sprite name, and the prefix of its block IDs. */
  readonly name: string;
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
): Record<string, unknown> {
  const blocks: BlockMap = {
    // Every button decides for itself whether it is on screen, from one
    // variable the stage keeps. Hidden rather than dimmed: a Scratch sprite has
    // no disabled look, and a dimmed one still takes the click.
    ...script(
      `${button.name}-watch`,
      48,
      48,
      whenFlagClicked(),
      button.visibleWhen
        ? [forever([ifElse(button.visibleWhen, [show], [hide])])]
        : [show],
    ),
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
