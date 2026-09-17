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

/**
 * The way back to the opening screen, once a session is over.
 *
 * Offered only when `when` holds -- the session solved or failed, and its
 * screen up -- so it is never a way to stop a session that is still running.
 * It says "back" rather than "stop" for that reason.
 */
export function backButtonTarget(
  costume: { name: string; contents: string },
  assetId: string,
  at: { x: number; y: number },
  message: { id: string; name: string },
  layerOrder: number,
  repaint: { id: string; name: string },
  when: Reporter,
): Record<string, unknown> {
  return screenButtonTarget(
    'back',
    costume,
    assetId,
    at,
    message,
    layerOrder,
    repaint,
    when,
  );
}

/**
 * A button shown only while `when` holds, and hidden at the flag.
 *
 * For controls that belong to one moment of the app rather than to the
 * opening screen: the way back once a session is over, applying a profile on
 * the screen that reads one.
 */
export function screenButtonTarget(
  name: string,
  costume: { name: string; contents: string },
  assetId: string,
  at: { x: number; y: number },
  message: { id: string; name: string },
  layerOrder: number,
  repaint: { id: string; name: string },
  when: Reporter,
): Record<string, unknown> {
  const target = titleButtonTarget(
    name,
    costume,
    assetId,
    at,
    message,
    layerOrder,
    repaint,
    { width: 96, height: 40 },
  ) as { blocks: BlockMap };
  const settle = [ifElse(when, [show], [hide])];
  return {
    ...target,
    blocks: {
      ...script(
        `${name}-show`,
        48,
        48,
        whenBroadcastReceived(repaint.id, repaint.name),
        settle,
      ),
      ...script(`${name}-start`, 48, 200, whenFlagClicked(), [hide]),
      ...script(`${name}-click`, 48, 320, whenSpriteClicked(), [
        {
          opcode: 'event_broadcast',
          inputs: { BROADCAST_INPUT: [1, [11, message.name, message.id]] },
        },
      ]),
    },
  };
}

/**
 * The profile, as a QR code another machine can read off this screen.
 *
 * The list's export is a file, and a file has to be carried: to another
 * machine, into another project, through a download folder. A camera pointed
 * at this screen carries it in the time it takes to hold a phone up. The
 * sprite wears the code in place of its own costume -- the extension swaps the
 * picture and puts it back -- so nothing about the code is saved into the
 * project.
 *
 * Shown on the repaint that follows registration, which is the first moment
 * the list holds the profile, and taken off on every repaint after that when
 * `when` no longer holds.
 */
export function profileQrTarget(
  costume: { name: string; contents: string },
  assetId: string,
  at: { x: number; y: number },
  size: number,
  layerOrder: number,
  repaint: { id: string; name: string },
  when: Reporter,
  text: Reporter,
  extensionId: string,
  maxSize: number,
): Record<string, unknown> {
  const takeOff: Step[] = [
    { opcode: `${extensionId}_hideQrCode`, inputs: {} },
    hide,
  ];
  return {
    isStage: false,
    name: 'profile-qr',
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {
      ...script(
        'profile-qr-show',
        48,
        48,
        whenBroadcastReceived(repaint.id, repaint.name),
        [
          ifElse(
            when,
            [
              {
                // Within a size rather than scaled to one: the extension
                // draws each module a whole number of units, and the sprite
                // stays at 100% so they stay whole on stage.
                opcode: `${extensionId}_showQrCodeWithin`,
                // L, the lowest. A screen does not get scratched or folded,
                // which is what the higher levels pay for, and a profile is
                // around 700 bytes: at L the modules stay large enough to read
                // from arm's length at the size the stage leaves for them.
                inputs: {
                  LEVEL: [1, [10, 'L']],
                  SIZE: [1, [4, String(maxSize)]],
                },
                reporters: { TEXT: text },
              },
              show,
            ],
            takeOff,
          ),
        ],
      ),
      ...script('profile-qr-start', 48, 260, whenFlagClicked(), takeOff),
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
        rotationCenterX: 1,
        rotationCenterY: 1,
      },
    ],
    sounds: [],
    volume: 100,
    layerOrder,
    visible: false,
    x: at.x,
    y: at.y,
    size,
    direction: 90,
    draggable: false,
    rotationStyle: "don't rotate",
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
