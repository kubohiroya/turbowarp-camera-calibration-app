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
  whenSpriteClicked,
  setEffect,
  switchCostume,
  waitSeconds,
  type BlockMap,
  type Reporter,
  type Step,
} from './blocks.ts';

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

/**
 * A control on the opening screen.
 *
 * Shown only while that screen is up. Buttons were taken out of this project
 * because the ones it had sat over the camera picture, offering to do what was
 * already being done, to someone holding a board in both hands. These are on a
 * still screen, before anything has started, in front of someone at a keyboard
 * who has a decision to make.
 */
export function titleButtonTarget(
  name: string,
  costume: { name: string; contents: string },
  assetId: string,
  at: { x: number; y: number },
  message: { id: string; name: string },
  layerOrder: number,
  repaint: { id: string; name: string },
  size: { width: number; height: number },
): Record<string, unknown> {
  const settle = [
    ifElse(equals(readVariable('screen', 'screen'), 'title'), [show], [hide]),
  ];
  return {
    isStage: false,
    name,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {
      ...script(
        `${name}-show`,
        48,
        48,
        whenBroadcastReceived(repaint.id, repaint.name),
        settle,
      ),
      ...script(`${name}-start`, 48, 200, whenFlagClicked(), settle),
      ...script(`${name}-click`, 48, 320, whenSpriteClicked(), [
        {
          opcode: 'event_broadcast',
          inputs: { BROADCAST_INPUT: [1, [11, message.name, message.id]] },
        },
      ]),
    },
    comments: {},
    currentCostume: 0,
    costumes: [
      {
        assetId,
        name: costume.name,
        bitmapResolution: 1,
        md5ext: `${assetId}.svg`,
        dataFormat: 'svg',
        rotationCenterX: size.width / 2,
        rotationCenterY: size.height / 2,
      },
    ],
    sounds: [],
    volume: 100,
    layerOrder,
    visible: false,
    x: at.x,
    y: at.y,
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
