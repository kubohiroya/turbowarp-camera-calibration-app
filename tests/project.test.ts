import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SOLVED_LAYOUT,
  backdrops,
  createProject,
  md5,
  titleButtons,
} from '../scripts/project.ts';
import {
  BOARDS,
  MARKER_RATIO,
  PRINT_HEIGHT_MM,
  PRINT_WIDTH_MM,
  layout,
  printedCellMillimetres,
} from '../src/board.ts';
import { featureFlags } from '../config/feature-flags.ts';
import { guideCostumes } from '../src/guide.ts';
import { TITLE_LAYOUT } from '../src/title.ts';
import type { ScratchBlock } from '../scripts/blocks.ts';

/**
 * What these tests read off the stage target.
 *
 * `targets` holds the stage and the button sprites, which are different
 * shapes, so indexing it gives a union rather than the stage. The tests only
 * ever ask the stage for its blocks and its costumes.
 */
type StageTarget = {
  blocks: unknown;
  costumes: Array<{ name: string; assetId: string; md5ext: string }>;
};
import {
  EXTENSION_BUNDLE,
  EXTENSION_PINS,
  embeddedExtensions,
  integrity,
  resolveExtension,
} from '../scripts/extensions.ts';

describe('the project', () => {
  const project = createProject('Test', { embedExtensions: true });
  const stage = project.targets[0] as StageTarget;
  const blocks = stage.blocks as Record<string, ScratchBlock>;

  it('links every script in both directions', () => {
    for (const [id, block] of Object.entries(blocks)) {
      if (block.next !== null) {
        expect(blocks[block.next]?.parent, `${id}.next`).toBe(id);
      }
      expect(block.topLevel).toBe(block.parent === null);
    }
  });

  it('draws a chessboard only where one is meant to be found', () => {
    const calibrating = createProject('Test', { embedExtensions: true });
    // It used to draw none at all, and that was right while the board lived
    // in the page: a grid anywhere else is one a camera pointed at this screen
    // could find, and the mistake is invisible because the solve succeeds.
    //
    // The display role brings one back, deliberately, as a backdrop. The rule
    // that remains is that nothing else carries one -- not a button, not the
    // tilt guide, not the opening screen. Those are on screen while a camera
    // is looking at it, and none of them is the target.
    const named = (
      calibrating.targets[0] as unknown as { costumes: Array<{ name: string }> }
    ).costumes.map((costume) => costume.name);
    expect(named).toContain('stage');
    expect(named).toContain('title');
    for (const board of BOARDS) {
      expect(named).toContain(`board-${board.columns}x${board.rows}`);
    }
    const hasGrid = (svg: string) =>
      (svg.match(/<rect x="\d+" y="\d+" width="11"/gu) ?? []).length > 3;
    const plain = backdrops(true).find((entry) => entry.name === 'stage');
    expect(hasGrid(plain?.contents ?? '')).toBe(false);
    const title = backdrops(true).find((entry) => entry.name === 'title');
    expect(hasGrid(title?.contents ?? '')).toBe(false);
    const sprites = calibrating.targets.filter((target) => !target.isStage);
    expect(sprites.length).toBeGreaterThan(0);
  });

  it('puts each opening-screen button under its own label, and on the stage', () => {
    // The labels are drawn in SVG, where y grows downward from the top; the
    // buttons are sprites, where y grows upward from the middle. The first
    // layout worked the two out separately and got the sign wrong, which put
    // every button over the text it was meant to sit under. So this checks
    // the result in the backdrop's coordinates, where both are measured.
    const svgY = (stageY: number) => 180 - stageY;
    const buttons = titleButtons();
    const rows = {
      board: buttons.filter((button) => button.name.startsWith('title-board')),
      begin: buttons.filter((button) => button.name.startsWith('title-begin')),
    };
    expect(rows.board).toHaveLength(3);
    expect(rows.begin).toHaveLength(3);
    const edges = (button: (typeof buttons)[number]) => ({
      top: svgY(button.y) - button.size.height / 2,
      bottom: svgY(button.y) + button.size.height / 2,
      left: button.x + 240 - button.size.width / 2,
      right: button.x + 240 + button.size.width / 2,
    });
    for (const button of rows.board) {
      const box = edges(button);
      expect(box.top, button.name).toBeGreaterThan(TITLE_LAYOUT.boardLabelY);
      expect(box.bottom, button.name).toBeLessThan(
        TITLE_LAYOUT.beginLabelY - 11,
      );
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(480);
    }
    for (const button of rows.begin) {
      const box = edges(button);
      expect(box.top, button.name).toBeGreaterThan(TITLE_LAYOUT.beginLabelY);
      expect(box.bottom, button.name).toBeLessThanOrEqual(360);
      expect(box.right).toBeLessThanOrEqual(480);
    }
    // The same board in the same column on both rows, so the sheet the
    // operator printed is found by looking straight down.
    for (const [index, board] of rows.board.entries()) {
      expect(rows.begin[index]?.x).toBe(board.x);
    }
  });

  it('gives every costume a size Scratch can read', () => {
    // A percentage is a size only relative to a container, and a costume has
    // none. Scratch falls back to the viewBox, centres the stage on it, and
    // shows whatever corner of the drawing lands there -- which is how the
    // board went on screen as its own top-left quarter.
    const calibrating = createProject('Test', { embedExtensions: true });
    const svgs = [
      ...backdrops(true).map((entry) => [entry.name, entry.contents] as const),
      ...titleButtons().map(
        (button) => [button.name, button.costume.contents] as const,
      ),
      ...guideCostumes().map((entry) => [entry.name, entry.contents] as const),
    ];
    expect(svgs.length).toBeGreaterThan(5);
    for (const [name, svg] of svgs) {
      const open = svg.match(/<svg\b[^>]*>/u)?.[0] ?? '';
      const width = open.match(/\bwidth="([^"]+)"/u)?.[1] ?? '';
      const height = open.match(/\bheight="([^"]+)"/u)?.[1] ?? '';
      expect(width, `${name} width`).toMatch(/^\d+(\.\d+)?$/u);
      expect(height, `${name} height`).toMatch(/^\d+(\.\d+)?$/u);
    }
    // And the boards fill the stage rather than overflow it.
    for (const board of BOARDS) {
      const svg =
        backdrops(true).find(
          (entry) => entry.name === `board-${board.columns}x${board.rows}`,
        )?.contents ?? '';
      expect(svg).toContain('width="480" height="360"');
    }
    expect(calibrating.targets.length).toBeGreaterThan(1);
  });

  it('names each costume by the bytes it actually holds', () => {
    const calibrating = createProject('Test', { embedExtensions: true });
    // The SB3 stores assets under the MD5 of their contents. A name that no
    // longer matches loads as a missing costume, and the stage goes blank with
    // no error a user can act on.
    const drawn = backdrops(true);
    for (const costume of (
      calibrating.targets[0] as unknown as {
        costumes: Array<{ name: string; assetId: string; md5ext: string }>;
      }
    ).costumes) {
      const source = drawn.find((entry) => entry.name === costume.name);
      expect(source, costume.name).toBeDefined();
      expect(costume.assetId).toBe(md5(source?.contents ?? ''));
      expect(costume.md5ext).toBe(`${costume.assetId}.svg`);
    }
  });

  it('is deterministic and leaves the calibration path disabled', () => {
    expect(createProject('Test')).toEqual(createProject('Test'));
    expect(featureFlags.captureAndSolveV1).toBe(false);
  });
});

describe('the extension bundle', () => {
  // TurboWarp asks before running each unsandboxed extension a project
  // carries. Two prompts invite the operator to allow one and deny the other,
  // and a denied extension's opcodes are simply absent -- the project loads
  // and then does nothing, with no error to say why.
  it('asks for every extension as one permission', () => {
    const manifest = embeddedExtensions(
      EXTENSION_PINS.map(resolveExtension),
    ) as {
      extensionBundles?: Array<{ id: string; members: string[]; name: string }>;
    };
    expect(manifest.extensionBundles).toHaveLength(1);
    expect(manifest.extensionBundles?.[0]?.id).toBe(EXTENSION_BUNDLE.id);
    expect(manifest.extensionBundles?.[0]?.members).toEqual(
      EXTENSION_PINS.map((pin) => pin.id),
    );
  });

  it('asks for no bundle when there is nothing to bundle', () => {
    // A bundle takes at least two members, and the pattern-only build embeds
    // none at all.
    const manifest = embeddedExtensions([]) as { extensionBundles?: unknown };
    expect(manifest.extensionBundles).toBeUndefined();
  });
});

describe('the embedded extensions', () => {
  it('keeps the list and the URL map in the same order', () => {
    // A reader that walks the object rather than the array must not get a
    // different answer, so neither reading can be the wrong one.
    const project = createProject('Test', { embedExtensions: true });
    expect(Object.keys(project.extensionURLs)).toEqual(project.extensions);
    for (const [id, url] of Object.entries(project.extensionURLs)) {
      expect(url).toBe(`embedded-extension:extensions/${id}.js`);
    }
  });

  it('pins every installed extension to an exact published version', () => {
    // An extension that has not been published cannot be installed at an exact
    // version, so this is where an unpublished dependency is refused rather
    // than at review time.
    for (const pin of EXTENSION_PINS) {
      const resolved = resolveExtension(pin);
      expect(resolved.version).toMatch(/^\d+\.\d+\.\d+/u);
      expect(integrity(resolved.javascript)).toMatch(/^sha256-/u);
      expect(resolved.javascript.subarray(0, 512).toString('utf8')).toContain(
        `// ID: ${pin.id}`,
      );
    }
  });

  it('refuses an artifact that does not declare the ID being embedded', () => {
    // The project lists extensions by ID. Embedding a file that names a
    // different one produces a project whose blocks are all missing, reported
    // as a load failure with nothing pointing at the mismatch.
    expect(() =>
      resolveExtension({
        id: 'kubohiroyacamerasource',
        packageName: '@kubohiroya/turbowarp-app-shell',
        artifact: 'dist/index.js',
        apiManifest: 'package.json',
      }),
    ).toThrowError(/declares extension ID/u);
  });
});

describe('the calibration path', () => {
  const enabled = createProject('Test', { embedExtensions: true });
  const blocks = enabled.targets[0].blocks as Record<string, ScratchBlock>;
  const used = [
    ...new Set(
      Object.values(blocks)
        .map((block) => block.opcode)
        .filter((opcode) => opcode.startsWith('kubohiroya')),
    ),
  ];

  /**
   * Every block the extensions actually publish, read from the API manifests
   * of the installed packages.
   *
   * An opcode TurboWarp does not recognise is dropped when the project loads.
   * There is no error: the script is simply shorter than it was written, and
   * the first sign is a calibration that never takes a sample.
   */
  const published = new Map<string, { arguments?: Array<{ id: string }> }>();
  for (const pin of EXTENSION_PINS) {
    const root = new URL(
      '.',
      `file://${createRequire(import.meta.url).resolve(`${pin.packageName}/package.json`)}`,
    );
    const manifest = JSON.parse(
      readFileSync(new URL(pin.apiManifest, root), 'utf8'),
    ) as {
      blocks: Array<{ opcode: string; arguments?: Array<{ id: string }> }>;
    };
    for (const block of manifest.blocks) {
      published.set(`${pin.id}_${block.opcode}`, block);
    }
  }

  it('places only blocks the pinned extensions publish', () => {
    expect(used.length).toBeGreaterThan(0);
    for (const opcode of used) {
      expect(published.has(opcode), opcode).toBe(true);
    }
  });

  it('passes only argument names those blocks declare', () => {
    // A misspelled input is as quiet as a misspelled opcode: the block runs
    // with the argument at its default and reports nothing.
    for (const block of Object.values(blocks)) {
      if (!block.opcode.startsWith('kubohiroya')) continue;
      const declared = (published.get(block.opcode)?.arguments ?? []).map(
        (argument) => argument.id,
      );
      for (const name of Object.keys(block.inputs)) {
        expect(declared, `${block.opcode}.${name}`).toContain(name);
      }
    }
  });

  it('declares the size the sheet actually prints at', () => {
    // Intrinsic calibration is unaffected -- scale drops out of the fit -- but
    // a board pose is metric, and its distance is wrong by exactly however
    // much this figure is wrong. The three boards print at different sizes, so
    // one number written down would be wrong for two of them.
    const start = scriptOrder(blocks, 'do-start').find(
      (block) =>
        block.opcode === 'kubohiroyacameracalibration_startCameraCalibration',
    );
    const named = (input: string) =>
      (
        (start?.inputs?.[input] as [number, string] | undefined)?.[1] ?? ''
      ).toString();
    // Read from variables rather than written into the block, so choosing a
    // different board carries its size along.
    for (const input of ['SQUARE_METERS', 'MARKER_METERS']) {
      expect(start?.inputs, input).toHaveProperty(input);
    }
    expect(named('SQUARE_METERS')).not.toMatch(/^\d/u);

    const board = BOARDS[0]!;
    const drawn = layout(board);
    const scale = Math.min(PRINT_WIDTH_MM / 1000, PRINT_HEIGHT_MM / 750);
    expect(printedCellMillimetres(board)).toBeCloseTo(drawn.cell * scale, 6);

    const stageVariables = (
      enabled.targets[0] as unknown as {
        variables: Record<string, [string, string]>;
      }
    ).variables;
    const declared = Object.values(stageVariables);
    const square = declared.find(([name]) => name === 'square')?.[1];
    const marker = declared.find(([name]) => name === 'marker')?.[1];
    expect(Number(square)).toBeCloseTo(printedCellMillimetres(board) / 1000, 4);
    expect(Number(marker)).toBeCloseTo(Number(square) * MARKER_RATIO, 4);
  });

  it('names the board the operator is meant to be holding', () => {
    // Three sheets come out of the page and they look alike at arm's length.
    // "Show the board" does not pick one, and only the selected one will be
    // found -- so the messages that are about the board read its name rather
    // than spelling one in.
    const readsBoard = (block: ScratchBlock): boolean => {
      if (block.opcode === 'data_variable') {
        return (block.fields.VARIABLE as [string, string])[0] === 'board';
      }
      return Object.values(block.inputs).some(
        (input) =>
          Array.isArray(input) &&
          input
            .slice(1)
            .some(
              (slot) =>
                typeof slot === 'string' &&
                blocks[slot] !== undefined &&
                readsBoard(blocks[slot]),
            ),
      );
    };
    const statusWrites = Object.values(blocks).filter(
      (block) =>
        block.opcode === 'data_setvariableto' &&
        (block.fields.VARIABLE as [string, string])[0] === 'status',
    );
    expect(statusWrites.length).toBeGreaterThan(0);
    expect(statusWrites.some((block) => readsBoard(block))).toBe(true);
  });

  it('says the finish out loud', () => {
    // The operator is holding a board at arm's length and moving it, which is
    // the posture in which a message appearing somewhere is least likely to be
    // read. And there is nothing left for them to press: the shutter solves in
    // the background and ends the session itself.
    const sounds = (
      enabled.targets[0] as unknown as {
        sounds: Array<{ name: string; md5ext: string }>;
      }
    ).sounds;
    expect(sounds.map((sound) => sound.name)).toEqual([
      ...Array.from({ length: 16 }, (_, index) => `step-${index + 1}`),
      'solved',
      'click',
      'turn-top-near',
      'turn-top-far',
      'turn-left-near',
      'turn-right-near',
    ]);
    // Every sound the project carries is played by something, and everything
    // played is carried: a cue nothing reaches is dead weight in a two
    // megabyte download, and one that is played and missing is silence where
    // an instruction should be.
    const played = new Set(
      Object.values(blocks)
        .filter((block) => block.opcode === 'sound_sounds_menu')
        .map((block) => (block.fields.SOUND_MENU as [string, string])[0]),
    );
    expect([...played].sort()).toEqual(
      sounds.map((sound) => sound.name).sort(),
    );
  });

  it('paces the ticking by how much the view would add', () => {
    // The operator is holding the board and looking at it. A rate they can
    // hear getting faster is the one channel that reaches them there.
    const guide = scriptOrder(blocks, 'guide').map((block) => block.opcode);
    expect(guide[0]).toBe('event_whenflagclicked');
    expect(guide).toContain('control_forever');
    const waits = Object.values(blocks).filter(
      (block) => block.opcode === 'control_wait',
    );
    // One in the watch loop, one here -- and this one's length is computed
    // rather than fixed, which is the whole point.
    expect(waits.length).toBe(2);
    expect(
      waits.some((block) => {
        const duration = block.inputs.DURATION as [number, unknown] | undefined;
        return Array.isArray(duration) && typeof duration[1] === 'string';
      }),
    ).toBe(true);
  });

  it('never tells the operator to press a key the shutter already handles', () => {
    // It used to stop at the sample limit and say "press v to solve", and
    // pressing v earned a refusal: the set it stopped on was the set it could
    // not solve. The shutter makes room and keeps going now, so there is no
    // such message and no such state.
    const messages = Object.values(blocks)
      .filter((block) => block.opcode === 'data_setvariableto')
      .map((block) => {
        const value = block.inputs.VALUE as
          [number, [number, string]] | undefined;
        return Array.isArray(value) && Array.isArray(value[1])
          ? value[1][1]
          : '';
      })
      .join(' ');
    expect(messages).not.toContain('上限');
    expect(messages).not.toContain('vで解いて');
  });

  it('puts the reason on screen, not only the code', () => {
    // A black preview has several causes and they look identical. The
    // extension has the sentence that separates them and the project was
    // throwing it away, so every report of "it does not work" needed a browser
    // console to answer -- which is not a thing to ask of someone holding a
    // board in front of a camera.
    // The reporter can sit several blocks down, inside a join, so the whole
    // subtree under each assignment is walked rather than its first child.
    const reachable = (id: string | undefined): string[] => {
      const block = id ? blocks[id] : undefined;
      if (!block) return [];
      return [
        block.opcode,
        ...Object.values(block.inputs).flatMap((input) =>
          Array.isArray(input)
            ? input
                .slice(1)
                .flatMap((slot) =>
                  typeof slot === 'string' ? reachable(slot) : [],
                )
            : [],
        ),
      ];
    };
    const mirrored = Object.values(blocks)
      .filter((block) => block.opcode === 'data_setvariableto')
      .flatMap((block) => {
        const value = block.inputs.VALUE as [number, unknown] | undefined;
        const child = Array.isArray(value) ? value[1] : undefined;
        return typeof child === 'string' ? reachable(child) : [];
      });
    expect(mirrored).toContain(
      'kubohiroyacameracalibration_cameraCalibrationError',
    );
    // And what the camera itself reports, which is what says whether a black
    // preview has a camera behind it at all.
    expect(mirrored.join(' ')).toContain(
      'kubohiroyacamerasource_cameraFrameWidth',
    );
  });

  it('opens on a screen that says what this is and what to fetch', () => {
    // The operator arrives knowing nothing and has one decision to make --
    // does this machine show the board, or calibrate a camera, and against
    // which sheet. The flag opens that screen; a button there starts.
    const startup = scriptOrder(blocks, 'start');
    expect(startup[0]?.opcode).toBe('event_whenflagclicked');
    expect(startup.map((block) => block.opcode)).toContain(
      'looks_switchbackdropto',
    );
    for (const [index] of BOARDS.entries()) {
      const begin = scriptOrder(blocks, `do-begin-${index}`).map(
        (block) => block.opcode,
      );
      expect(begin[0]).toBe('event_whenbroadcastreceived');
      expect(begin).toContain('event_broadcast');
    }
  });

  it('starts against the board the operator chose', () => {
    // It used to start on the first board and hunt for the right one, which
    // gave no way to say up front which sheet was in hand.
    for (const [index, board] of BOARDS.entries()) {
      const written = new Map(
        scriptOrder(blocks, `do-begin-${index}`)
          .filter((block) => block.opcode === 'data_setvariableto')
          .map((block) => [
            (block.fields.VARIABLE as [string, string])[0],
            (block.inputs.VALUE as [number, [number, string]])[1][1],
          ]),
      );
      // Named by its squares, which is what the operator can count; the
      // corners are what the block is given.
      expect(written.get('board')).toBe(
        `${board.columns + 1}x${board.rows + 1}`,
      );
      expect(written.get('columns')).toBe(String(board.columns));
      expect(Number(written.get('square'))).toBeCloseTo(
        printedCellMillimetres(board) / 1000,
        4,
      );
    }
  });

  it('goes back to the opening screen when the board is clicked', () => {
    // Full screen hides the green flag, and the board hides the buttons, so
    // the board itself is the way back. Only while a board is up: a click
    // during a calibration must not end it.
    const click = scriptOrder(blocks, 'stage-click');
    expect(click[0]?.opcode).toBe('event_whenstageclicked');
    const guard = click[1];
    expect(guard?.opcode).toBe('control_if');
    // Walk the body of the `if` from its first block, which scriptOrder
    // cannot do: it starts from a script's hat by name.
    const inside: string[] = [];
    let at: string | null =
      (guard?.inputs.SUBSTACK as [number, string] | undefined)?.[1] ?? null;
    while (at) {
      const block: ScratchBlock | undefined = blocks[at];
      if (!block) break;
      inside.push(block.opcode);
      at = block.next;
    }
    expect(inside).toContain('looks_switchbackdropto');
  });

  it('decides what is on screen in one place', () => {
    // It was decided in six, and between them some monitors stayed on screens
    // they had no business on -- over the opening screen, and over a board,
    // where a monitor covers the corner a camera on another machine is trying
    // to read. Nothing shows or hides a monitor outside the one rule now.
    const toggles = Object.entries(blocks).filter(([, block]) =>
      [
        'data_showvariable',
        'data_hidevariable',
        'data_showlist',
        'data_hidelist',
      ].includes(block.opcode),
    );
    expect(toggles.length).toBeGreaterThan(0);
    for (const [id] of toggles) {
      expect(id.startsWith('watch-'), id).toBe(true);
    }
  });

  it('can be the machine that shows the board, as well as the one that looks', () => {
    // Both roles in one project was the plan from the start. What was missing
    // was anywhere to choose between them.
    for (const [index, board] of BOARDS.entries()) {
      const shown = scriptOrder(blocks, `do-show-${index}`).map(
        (block) => block.opcode,
      );
      expect(shown).toContain('looks_switchbackdropto');
      const backdrops = (
        enabled.targets[0] as unknown as {
          costumes: Array<{ name: string }>;
        }
      ).costumes.map((costume) => costume.name);
      expect(backdrops).toContain(`board-${board.columns}x${board.rows}`);
    }
  });

  it('takes the camera and opens a session in one step', () => {
    // A camera held without a session is a camera taken from whoever else
    // wanted it, for nothing, with no sign to the operator that it happened.
    const order = scriptOrder(blocks, 'do-start').map((block) => block.opcode);
    expect(
      order.indexOf('kubohiroyacamerasource_startSharedCamera'),
    ).toBeGreaterThan(-1);
    expect(
      order.indexOf('kubohiroyacamerasource_startSharedCamera'),
    ).toBeLessThan(
      order.indexOf('kubohiroyacameracalibration_startCameraCalibration'),
    );
  });

  it('carries no second way to hand the camera back', () => {
    // It used to, and the button and the key for it were two more ways to do
    // what the red stop button already does: the extension cancels every
    // session on PROJECT_STOP_ALL, which is proved on its side, not here. A
    // project that also draws a control for it is offering the operator a
    // choice between two identical outcomes and charging them a slot on the
    // screen for it.
    expect(Object.keys(blocks).some((id) => id.startsWith('do-leave'))).toBe(
      false,
    );
    const used = new Set(Object.values(blocks).map((block) => block.opcode));
    expect(used).not.toContain(
      'kubohiroyacameracalibration_cancelCameraCalibration',
    );
  });

  it('asks for the board the operator selected, not a fixed one', () => {
    const start = scriptOrder(blocks, 'do-start').find(
      (block) =>
        block.opcode === 'kubohiroyacameracalibration_startCameraCalibration',
    );
    for (const name of ['COLUMNS', 'ROWS']) {
      const input = start?.inputs[name] as [number, string, unknown];
      expect(input[0], name).toBe(3);
      expect(blocks[input[1]]?.opcode, name).toBe('data_variable');
    }
  });

  it('keeps the profile in browser storage as soon as it is published', () => {
    // A camera app on the same origin opened this one and restores what lands
    // there, so a solved or adopted profile has to reach it without a file.
    for (const name of ['do-register', 'do-adopt']) {
      const order = scriptOrder(blocks, name).map((block) => block.opcode);
      const published = order.indexOf(
        'kubohiroyacameracalibration_publishCameraCalibration',
      );
      const saved = order.indexOf('kubohiroyacamerasource_saveCameraProfile');
      expect(published, name).toBeGreaterThan(-1);
      expect(saved, name).toBe(published + 1);
    }
  });

  it('puts the camera away once the profile is out', () => {
    // A live picture after the finish invites the operator to keep holding
    // the board up, and a running camera keeps its light on for nothing.
    const order = scriptOrder(blocks, 'do-register').map(
      (block) => block.opcode,
    );
    const published = order.indexOf(
      'kubohiroyacameracalibration_publishCameraCalibration',
    );
    expect(published).toBeGreaterThan(-1);
    // Inside an `if`, after the publish: a profile brought in from a file
    // reaches the same script, and its fit is judged against the running
    // camera, so for that one the camera stays on.
    const guard = scriptOrder(blocks, 'do-register').find(
      (block, index) =>
        index > published &&
        block.opcode === 'control_if' &&
        texts(blocks, block.inputs.CONDITION).includes('adopted'),
    );
    expect(texts(blocks, guard?.inputs.CONDITION)).toContain('adopted');
    const inside: string[] = [];
    let at: string | null =
      (guard?.inputs.SUBSTACK as [number, string] | undefined)?.[1] ?? null;
    while (at) {
      const block: ScratchBlock | undefined = blocks[at];
      if (!block) break;
      inside.push(block.opcode);
      at = block.next;
    }
    expect(inside).toEqual([
      'kubohiroyacamerasource_hideCameraPreview',
      'kubohiroyacamerasource_stopSharedCamera',
    ]);
  });

  it('shows the profile as a QR code once it is in the list, and only when solved', () => {
    // A file has to be carried to the next machine; a code on this screen is
    // carried by holding a phone up to it.
    const sprite = enabled.targets.find(
      (target) => (target as { name?: string }).name === 'profile-qr',
    ) as unknown as { blocks: Record<string, ScratchBlock> };
    const shown = sprite.blocks['profile-qr-show-1'];
    expect(shown?.opcode).toBe('control_if_else');
    const condition = texts(sprite.blocks, shown?.inputs.CONDITION);
    expect(condition).toContain('solved');
    expect(condition).toContain('profile');
    expect(condition).not.toContain('error');
    // Not for a profile brought in from a file: its fit verdict sits where
    // the code would be.
    expect(condition).toContain('adopted');
    const drawn = Object.values(sprite.blocks).find(
      (block) => block.opcode === 'kubohiroyaqrdisplay_showQrCodeWithin',
    );
    // Fitted within the box at whole-unit modules, not scaled into it.
    expect(
      (drawn?.inputs.SIZE as [number, [number, string]] | undefined)?.[1][1],
    ).toBe(String(SOLVED_LAYOUT.qr.maxSize));
    // The whole document, line breaks and all. The list holds it a line per
    // item, which is right for the file and wrong for a code.
    const text = drawn?.inputs.TEXT as [number, string, unknown] | undefined;
    const reporter = sprite.blocks[text?.[1] ?? ''];
    expect(reporter?.opcode).toBe('data_variable');
    expect(reporter?.fields.VARIABLE).toEqual(['profile text', 'profile-text']);
    // Taken off on the flag as well as when the screen changes: the extension
    // restores the costume on a stop, and a flag is a stop.
    expect(
      Object.values(sprite.blocks).filter(
        (block) => block.opcode === 'kubohiroyaqrdisplay_hideQrCode',
      ),
    ).toHaveLength(2);
    // The repaint that draws it has to come after the list is filled.
    const register = scriptOrder(blocks, 'do-register').map((block) =>
      block.opcode === 'event_broadcast'
        ? (
            block.inputs.BROADCAST_INPUT as [number, [number, string, string]]
          )[1][2]
        : block.opcode,
    );
    expect(register.lastIndexOf('msg-repaint')).toBeGreaterThan(
      register.indexOf('data_addtolist'),
    );
    expect(enabled.extensions).toContain('kubohiroyaqrdisplay');
  });

  it('takes the tilt picture down while the answer is being worked out', () => {
    // The line says it is calculating. A picture asking for a turn at the
    // same moment says the opposite.
    const sprite = enabled.targets.find(
      (target) => (target as { name?: string }).name === 'guide-tilt',
    ) as unknown as { blocks: Record<string, ScratchBlock> };
    const shown = sprite.blocks['guide-tilt-show-1'];
    const condition = texts(sprite.blocks, shown?.inputs.CONDITION);
    expect(condition).toContain('auto');
    expect(condition).toContain('solving');
    // And the sprites are told to look again when that changes, which the
    // repaint key has to include for them to be told at all.
    const keys = Object.values(blocks).filter(
      (block) =>
        block.opcode === 'data_setvariableto' &&
        (block.fields.VARIABLE as [string, string])[0] === 'painted',
    );
    expect(
      keys.some((block) =>
        texts(blocks, block.inputs.VALUE).includes('solving'),
      ),
    ).toBe(true);
  });

  it('names every board by the squares a person can count on it', () => {
    // "9x6" under a board of ten squares by seven reads as the wrong board.
    for (const button of titleButtons().filter(
      (entry) => entry.name !== 'title-import',
    )) {
      const board = BOARDS.find((entry) =>
        button.name.endsWith(`-${entry.columns}x${entry.rows}`),
      );
      expect(board, button.name).toBeDefined();
      if (!board) continue;
      expect(button.costume.contents).toContain(
        `>${board.columns + 1}x${board.rows + 1}<`,
      );
      expect(button.costume.contents).not.toContain(
        `>${board.columns}x${board.rows}<`,
      );
    }
  });

  it('lays the solved screen out so nothing covers the QR code', () => {
    // A code with a monitor over one of its corner squares cannot be read,
    // and that is what the first layout did: the status wrapped over it.
    type Box = { left: number; top: number; right: number; bottom: number };
    const overlaps = (a: Box, b: Box) =>
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom;
    const sprite = (name: string) =>
      enabled.targets.find(
        (target) => (target as { name?: string }).name === name,
      ) as unknown as { x: number; y: number; size: number };
    const qr = sprite('profile-qr');
    // The largest the code can come out: the box it is fitted within, at the
    // 100% size that keeps its modules whole. One unit of slack for the
    // whole-unit centre.
    expect(qr.size).toBe(100);
    expect(Math.abs(qr.x % 2)).toBe(1);
    expect(Math.abs(qr.y % 2)).toBe(1);
    const half = SOLVED_LAYOUT.qr.maxSize / 2 + 1;
    const qrBox = {
      left: qr.x + 240 - half,
      right: qr.x + 240 + half,
      top: 180 - qr.y - half,
      bottom: 180 - qr.y + half,
    };
    const back = sprite('back');
    const backBox = {
      left: back.x + 240 - 48,
      right: back.x + 240 + 48,
      top: 180 - back.y - 20,
      bottom: 180 - back.y + 20,
    };
    const list = (
      enabled as unknown as {
        monitors: Array<{
          id: string;
          x: number;
          y: number;
          width: number;
          height: number;
        }>;
      }
    ).monitors.find((entry) => entry.id === 'list-profile');
    expect(list).toBeDefined();
    const listBox = {
      left: list?.x ?? 0,
      top: list?.y ?? 0,
      right: (list?.x ?? 0) + (list?.width ?? 0),
      bottom: (list?.y ?? 0) + (list?.height ?? 0),
    };
    const status = {
      left: 0,
      top: 0,
      right: 480,
      bottom: SOLVED_LAYOUT.statusBottom,
    };
    for (const box of [qrBox, backBox, listBox]) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(480);
      expect(box.bottom).toBeLessThanOrEqual(360);
      expect(overlaps(box, status)).toBe(false);
    }
    expect(overlaps(qrBox, backBox)).toBe(false);
    // The fit and the reason sit below the status, clear of the list and the
    // way back. The fit is shown only when the code is not, so it may use the
    // code's place.
    const monitors = (
      enabled as unknown as {
        monitors: Array<{ id: string; x: number; y: number }>;
      }
    ).monitors;
    const placed = (id: string, width: number, height: number) => {
      const entry = monitors.find((monitor) => monitor.id === id);
      expect(entry, id).toBeDefined();
      return {
        left: entry?.x ?? 0,
        top: entry?.y ?? 0,
        right: 480,
        bottom: (entry?.y ?? 0) + height,
      };
    };
    // Measured in TurboWarp with the longest texts: the undetermined verdict
    // is 44 pixels tall, a three-part capture-condition reason 64. The
    // allowances here are larger, for fonts that set a little bigger.
    // Two lines of errors measured 210 by 44 pixels in TurboWarp.
    const errorsEntry = monitors.find((monitor) => monitor.id === 'errors');
    expect(errorsEntry).toBeDefined();
    const errorsBox = {
      left: errorsEntry?.x ?? 0,
      top: errorsEntry?.y ?? 0,
      right: (errorsEntry?.x ?? 0) + 215,
      bottom: (errorsEntry?.y ?? 0) + 50,
    };
    for (const other of [qrBox, backBox, listBox, status]) {
      expect(overlaps(errorsBox, other)).toBe(false);
    }
    const fitBox = placed('fit', 0, 60);
    const reasonBox = placed('reason', 0, 80);
    for (const box of [fitBox, reasonBox]) {
      expect(overlaps(box, status)).toBe(false);
      expect(overlaps(box, listBox)).toBe(false);
      expect(overlaps(box, backBox)).toBe(false);
    }
    expect(overlaps(fitBox, reasonBox)).toBe(false);
    expect(overlaps(qrBox, listBox)).toBe(false);
    expect(overlaps(backBox, listBox)).toBe(false);
  });

  it('reads a saved profile without calibrating first', () => {
    // The list was the only way in, and it appeared only once a session had
    // produced a profile. The opening screen now leads to a screen that holds
    // the list from the start.
    const entry = titleButtons().find(
      (button) => button.name === 'title-import',
    );
    expect(entry?.message.id).toBe('msg-open-import');
    const svgY = 180 - (entry?.y ?? 0);
    expect(svgY - 20).toBeGreaterThan(TITLE_LAYOUT.beginLabelY);
    expect((entry?.x ?? 0) + 240 + 48).toBeLessThanOrEqual(480);
    const opened = scriptOrder(blocks, 'do-open-import');
    const written = new Map(
      opened
        .filter((block) => block.opcode === 'data_setvariableto')
        .map((block) => [
          (block.fields.VARIABLE as [string, string])[0],
          (block.inputs.VALUE as [number, [number, string]])[1][1],
        ]),
    );
    expect(written.get('screen')).toBe('import');
    expect(written.get('adopted')).toBe('');
    expect(opened.map((block) => block.opcode)).toContain(
      'data_deletealloflist',
    );
    // The list, the status, and the way back are on that screen; the apply
    // button sends the same message as the i key.
    const rule = Object.entries(blocks).filter(([id]) =>
      id.startsWith('watch-'),
    );
    const listShow = rule.find(
      ([, block]) =>
        block.opcode === 'data_showlist' &&
        JSON.stringify(block.fields).includes('"profile"'),
    );
    let parent = listShow?.[1].parent ?? null;
    while (parent && blocks[parent]?.opcode !== 'control_if_else') {
      parent = blocks[parent]?.parent ?? null;
    }
    expect(
      texts(blocks, parent ? blocks[parent]?.inputs.CONDITION : undefined),
    ).toContain('import');
    const sprite = (name: string) =>
      enabled.targets.find(
        (target) => (target as { name?: string }).name === name,
      ) as unknown as { blocks: Record<string, ScratchBlock> };
    expect(
      texts(
        sprite('back').blocks,
        sprite('back').blocks['back-show-1']?.inputs.CONDITION,
      ),
    ).toContain('import');
    const click = Object.values(sprite('apply').blocks).find(
      (block) => block.opcode === 'event_broadcast',
    );
    expect(
      (
        click?.inputs.BROADCAST_INPUT as [number, [number, string, string]]
      )[1][2],
    ).toBe('msg-adopt');
  });

  it('does not treat an imported profile as a calibration that just finished', () => {
    // Importing makes the state solved. Read as a fresh solve, that played the
    // fanfare and registered again -- which rewrote the status and turned off
    // the camera the fit is judged against.
    const adopt = scriptOrder(blocks, 'do-adopt');
    const firstWrite = adopt.find(
      (block) => block.opcode === 'data_setvariableto',
    );
    expect((firstWrite?.fields.VARIABLE as [string, string])[0]).toBe(
      'adopted',
    );
    expect(adopt.findIndex((block) => block === firstWrite)).toBeLessThan(
      adopt.findIndex(
        (block) =>
          block.opcode ===
          'kubohiroyacameracalibration_importCameraCalibration',
      ),
    );
    const announce = Object.values(blocks).find(
      (block) =>
        block.opcode === 'control_if' &&
        JSON.stringify(block.inputs.SUBSTACK ?? '').length > 0 &&
        (() => {
          let at = (block.inputs.SUBSTACK as [number, string] | undefined)?.[1];
          while (at) {
            if (
              blocks[at]?.opcode === 'sound_playuntildone' ||
              blocks[at]?.opcode === 'sound_play'
            )
              return true;
            at = blocks[at]?.next ?? undefined;
          }
          return false;
        })() &&
        texts(blocks, block.inputs.CONDITION).includes('solved'),
    );
    expect(announce).toBeDefined();
    expect(texts(blocks, announce?.inputs.CONDITION)).toContain('adopted');
  });

  it('shows both errors a solved profile is judged by', () => {
    // The session ends on the error over views the fit never saw, and the
    // screen showed neither that nor the fit error it is compared with.
    const errorsWrite = Object.values(blocks).find(
      (block) =>
        block.opcode === 'data_setvariableto' &&
        (block.fields.VARIABLE as [string, string])[1] === 'errors',
    );
    expect(errorsWrite).toBeDefined();
    const read = (id: string | undefined): string[] => {
      const block = id ? blocks[id] : undefined;
      if (!block) return [];
      return [
        block.opcode,
        ...Object.values(block.fields).flatMap((field) =>
          Array.isArray(field) && typeof field[0] === 'string'
            ? [field[0]]
            : [],
        ),
        ...Object.values(block.inputs).flatMap((input) =>
          Array.isArray(input)
            ? input
                .slice(1)
                .flatMap((slot) =>
                  typeof slot === 'string'
                    ? read(slot)
                    : Array.isArray(slot)
                      ? slot.filter((x): x is string => typeof x === 'string')
                      : [],
                )
            : [],
        ),
      ];
    };
    const value = errorsWrite?.inputs.VALUE as [number, string] | undefined;
    const parts = read(value?.[1]);
    expect(parts).toContain('error px');
    expect(parts).toContain('holdout px');
    expect(parts).toContain('holdout count');
    expect(parts).toContain('operator_round');
    expect(parts.some((part) => part.includes('使っていない'))).toBe(true);
    const mirrored = Object.values(blocks).map((block) => block.opcode);
    expect(mirrored).toContain(
      'kubohiroyacameracalibration_cameraCalibrationHoldoutErrorPx',
    );
    expect(mirrored).toContain(
      'kubohiroyacameracalibration_cameraCalibrationHoldoutSampleCount',
    );
    // Only for a profile this session solved.
    const show = Object.entries(blocks).find(
      ([id, block]) =>
        id.startsWith('watch-') &&
        block.opcode === 'data_showvariable' &&
        JSON.stringify(block.fields).includes('"errors"'),
    );
    let parent = show?.[1].parent ?? null;
    while (parent && blocks[parent]?.opcode !== 'control_if_else') {
      parent = blocks[parent]?.parent ?? null;
    }
    const condition = texts(
      blocks,
      parent ? blocks[parent]?.inputs.CONDITION : undefined,
    );
    expect(condition).toContain('solved');
    expect(condition).toContain('adopted');
  });

  it('takes the old code down when a profile is read from a file', () => {
    // The code was drawn from the profile this session solved. `ui` is solved
    // before and after an import, so only an explicit repaint tells the
    // sprite that the list now holds another profile.
    const adopt = scriptOrder(blocks, 'do-adopt');
    const last = adopt.at(-1);
    expect(last?.opcode).toBe('event_broadcast');
    expect(
      (
        last?.inputs.BROADCAST_INPUT as [number, [number, string, string]]
      )[1][2],
    ).toBe('msg-repaint');
    const written = adopt
      .filter((block) => block.opcode === 'data_setvariableto')
      .map((block) => (block.fields.VARIABLE as [string, string])[0]);
    expect(written).toContain('adopted');
    expect(written).toContain('status');
  });

  it('offers the way back when the shutter stops on a changed camera', () => {
    // A new resolution or another camera is refused frame by frame: the
    // shutter stops and the session waits, neither solved nor failed. Without
    // this the only way out was the green flag.
    const sprite = enabled.targets.find(
      (target) => (target as { name?: string }).name === 'back',
    ) as unknown as { blocks: Record<string, ScratchBlock> };
    const condition = texts(
      sprite.blocks,
      sprite.blocks['back-show-1']?.inputs.CONDITION,
    );
    expect(condition).toContain('ready');
    expect(condition).toContain('ready+');
    expect(condition).toContain('reason');
    // And the line stops asking for a board to be moved.
    const failedWrites = Object.values(blocks).filter(
      (block) =>
        block.opcode === 'data_setvariableto' &&
        (block.fields.VARIABLE as [string, string])[0] === 'status' &&
        JSON.stringify(block.inputs.VALUE).includes(
          '校正を続けられませんでした',
        ),
    );
    expect(failedWrites.length).toBe(1);
  });

  it('starts a new session with an empty profile list', () => {
    for (const index of BOARDS.keys()) {
      expect(
        scriptOrder(blocks, `do-begin-${index}`).map((block) => block.opcode),
      ).toContain('data_deletealloflist');
    }
  });

  it('offers a way back once a session is over, and only then', () => {
    // Full screen hides the green flag, which was the only way back. The
    // button is not a second stop sign: it is offered after the session has
    // solved or failed, never while one is running.
    const back = scriptOrder(blocks, 'do-back').map((block) => block.opcode);
    expect(back).toContain('looks_switchbackdropto');
    expect(back).toContain('kubohiroyacamerasource_stopSharedCamera');
    expect(back).toContain(
      'kubohiroyacameracalibration_cleanupCameraCalibration',
    );
    const sprite = enabled.targets.find(
      (target) => (target as { name?: string }).name === 'back',
    ) as unknown as { blocks: Record<string, ScratchBlock> };
    const shown = sprite.blocks['back-show-1'];
    expect(shown?.opcode).toBe('control_if_else');
    const condition = texts(sprite.blocks, shown?.inputs.CONDITION);
    expect(condition).toContain('solved');
    expect(condition).toContain('error');
    expect(condition).not.toContain('auto');
    expect(sprite.blocks['back-start-1']?.opcode).toBe('looks_hide');
  });

  it('starts a second session in the same run from nothing', () => {
    // The step sounds are said as progress passes what was last heard. Left
    // at sixteen from the first session, the second one is silent.
    for (const index of BOARDS.keys()) {
      const written = new Map(
        scriptOrder(blocks, `do-begin-${index}`)
          .filter((block) => block.opcode === 'data_setvariableto')
          .map((block) => [
            (block.fields.VARIABLE as [string, string])[0],
            (block.inputs.VALUE as [number, [number, string]])[1][1],
          ]),
      );
      expect(written.get('sounded')).toBe('0');
      expect(written.get('translated')).toBe('');
    }
  });

  it('shows the operator one line while the shutter works', () => {
    // The status used to say at length what the advice under it said again.
    // There is one line now, and the profile and a fit verdict are not on it.
    const stageVariables = Object.values(
      (
        enabled.targets[0] as unknown as {
          variables: Record<string, [string, unknown]>;
        }
      ).variables,
    ).map(([name]) => name);
    expect(stageVariables).not.toContain('advice');
    const rule = Object.entries(blocks).filter(([id]) =>
      id.startsWith('watch-'),
    );
    const guardOf = (opcode: string, name: string) => {
      const toggle = rule.find(
        ([, block]) =>
          block.opcode === opcode &&
          JSON.stringify(block.fields).includes(`"${name}"`),
      );
      let parent = toggle?.[1].parent ?? null;
      while (parent && blocks[parent]?.opcode !== 'control_if_else') {
        parent = blocks[parent]?.parent ?? null;
      }
      return texts(
        blocks,
        parent ? blocks[parent]?.inputs.CONDITION : undefined,
      );
    };
    // A fit only for a profile brought in from a file: one this session
    // solved fits by construction.
    expect(guardOf('data_showvariable', 'プロファイルの適合')).toContain(
      'adopted',
    );
    // The profile only once the shutter has stopped.
    expect(guardOf('data_showlist', 'profile')).toContain('auto');
  });

  it('carries no extension block when the extensions are not embedded', () => {
    // The committed build. Placing a block whose extension is absent would
    // load as a project with holes in its scripts.
    const off = createProject('Test', { embedExtensions: false });
    const offBlocks = off.targets[0].blocks as Record<string, ScratchBlock>;
    expect(
      Object.values(offBlocks).filter((block) =>
        block.opcode.startsWith('kubohiroya'),
      ),
    ).toEqual([]);
    expect(off.extensions).toEqual([]);
    expect(off.extensionURLs).toEqual({});
  });
});

/** Every field value and literal under an input, for reading a condition. */
function texts(blocks: Record<string, ScratchBlock>, input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.slice(1).flatMap((slot): string[] => {
    if (Array.isArray(slot)) return slot.filter((x) => typeof x === 'string');
    if (typeof slot !== 'string') return [];
    const block = blocks[slot];
    if (!block) return [];
    return [
      ...Object.values(block.fields).flatMap((field) =>
        Array.isArray(field) && typeof field[0] === 'string' ? [field[0]] : [],
      ),
      ...Object.values(block.inputs).flatMap((child) => texts(blocks, child)),
    ];
  });
}

/** The blocks of one script, in the order they run. */
function scriptOrder(
  blocks: Record<string, ScratchBlock>,
  prefix: string,
): ScratchBlock[] {
  const order: ScratchBlock[] = [];
  let id: string | null = `${prefix}-0`;
  while (id !== null) {
    const block: ScratchBlock | undefined = blocks[id];
    if (!block) break;
    order.push(block);
    id = block.next;
  }
  return order;
}

describe('what the operator is given', () => {
  const project = createProject('Test', { embedExtensions: true });
  const stage = project.targets[0] as StageTarget;
  const sprites = project.targets.filter(
    (target) => !target.isStage,
  ) as unknown as Array<{
    name: string;
    visible: boolean;
    costumes: unknown[];
    blocks: Record<string, ScratchBlock>;
  }>;

  it('offers no button for the thing that is not a decision', () => {
    // Registering the profile with Camera Source used to be a button, and a
    // key, and a line of text telling the operator to press it. The session
    // has just produced the one document this app exists to produce, for the
    // camera it was produced from: there is no version of "no thanks" worth
    // asking about. It happens when the solve lands.
    // The only buttons left are on the opening screen, where a decision is
    // actually being made. None of them is this one.
    expect(sprites.map((sprite) => sprite.name)).toEqual([
      'title-board-9x6',
      'title-board-7x5',
      'title-board-5x4',
      'title-begin-9x6',
      'title-begin-7x5',
      'title-begin-5x4',
      'title-import',
      'back',
      'apply',
      'profile-qr',
      'guide-tilt',
    ]);
    const stageBlocks = stage.blocks as Record<string, ScratchBlock>;
    const solved = Object.values(stageBlocks).filter(
      (block) => block.opcode === 'event_broadcast',
    );
    expect(
      solved.some(
        (block) =>
          (
            block.inputs.BROADCAST_INPUT as
              [number, [number, string, string]] | undefined
          )?.[1][2] === 'msg-register',
      ),
    ).toBe(true);
  });

  it('hands the profile somewhere it can be taken from', () => {
    // A list monitor carries import and export in its own context menu, and
    // those run from the operator's click. A block cannot open a file dialog:
    // it runs on a timer, and a browser will not treat that as someone asking.
    const stageBlocks = stage.blocks as Record<string, ScratchBlock>;
    const stageLists = (
      project.targets[0] as unknown as {
        lists: Record<string, [string, unknown[]]>;
      }
    ).lists;
    expect(Object.values(stageLists).map(([name]) => name)).toEqual([
      'profile',
    ]);
    const writes = Object.values(stageBlocks).filter(
      (block) => block.opcode === 'data_addtolist',
    );
    expect(writes.length).toBeGreaterThan(0);
    const reads = Object.values(stageBlocks).filter(
      (block) => block.opcode === 'data_itemoflist',
    );
    expect(reads.length).toBeGreaterThan(0);
  });

  it('shows nothing until a calibration starts', () => {
    // The opening screen says what it needs to in its own drawing, so every
    // monitor starts hidden in this build and the rule shows them once a
    // calibration is under way.
    const monitors = (
      project as unknown as {
        monitors: Array<{ params: { VARIABLE: string }; visible: boolean }>;
      }
    ).monitors;
    expect(monitors.filter((entry) => entry.visible)).toEqual([]);
  });

  it('never calls an unchecked profile usable', () => {
    // Three answers, and the third is not a softer no. Camera Source withholds
    // the intrinsics when it cannot decide, so anything warmer here would be
    // the app disagreeing with the thing that decides.
    const stageBlocks = stage.blocks as Record<string, ScratchBlock>;
    const messages = Object.values(stageBlocks)
      .filter((block) => block.opcode === 'data_setvariableto')
      .map((block) => {
        const value = block.inputs.VALUE as
          [number, [number, string]] | undefined;
        return Array.isArray(value) && Array.isArray(value[1])
          ? value[1][1]
          : '';
      });
    expect(messages).toContain(
      '確かめられません（撮影条件が分かりません）。このプロファイルは適用されません',
    );
    expect(messages).toContain('このカメラに使えます');
  });

  it('gives the frame back on every pass of the watch loop', () => {
    // A `forever` whose body never asks to wait is re-entered by the sequencer
    // until the frame's work budget is gone. Measured in TurboWarp against
    // this project: thirty thousand passes per frame, 25.0 ms of a 33.3 ms
    // frame, with the camera off. With the wait it is 8 passes and 0.19 ms.
    //
    // The budget spent spinning here is the budget the camera preview and the
    // frame grab do not get, and this project is nothing but a camera preview
    // and a frame grab.
    const stageBlocks = stage.blocks as Record<string, ScratchBlock>;
    const loops = Object.values(stageBlocks).filter(
      (block) => block.opcode === 'control_forever',
    );
    const walk = (id: string | null | undefined): string[] => {
      const found: string[] = [];
      let at = id;
      while (at) {
        const block = stageBlocks[at];
        if (!block) break;
        found.push(block.opcode);
        at = block.next;
      }
      return found;
    };
    expect(loops.length).toBeGreaterThan(0);
    for (const loop of loops) {
      const substack = (
        loop.inputs.SUBSTACK as [number, string] | undefined
      )?.[1];
      expect(walk(substack), 'every stage loop').toContain('control_wait');
    }
  });

  it('draws the instruction where the operator is already looking', () => {
    // On the camera picture, translucent, and never a grid: this is the one
    // drawing in the project that the camera it guides is certainly pointed
    // at, so a chessboard here would be found and solved against.
    const guide = sprites.find((sprite) => sprite.name === 'guide-tilt');
    expect(guide).toBeDefined();
    for (const costume of guideCostumes()) {
      expect(costume.contents).not.toMatch(/<rect x="\d+" y="\d+" width="11"/u);
      expect(costume.contents).not.toContain('#000000');
    }
    const effects = Object.values(
      guide?.blocks as Record<string, ScratchBlock>,
    ).filter((block) => block.opcode === 'looks_seteffectto');
    // Ghost to see through it, brightness for the half second when a step
    // lands -- the one moment something goes right and nothing would move.
    expect(
      effects.map((block) => (block.fields.EFFECT as [string, null])[0]),
    ).toContain('GHOST');
    expect(
      effects.map((block) => (block.fields.EFFECT as [string, null])[0]),
    ).toContain('BRIGHTNESS');
  });
});
