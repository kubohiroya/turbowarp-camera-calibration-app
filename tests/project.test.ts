import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backdrops, createProject, md5 } from '../scripts/project.ts';
import {
  BOARDS,
  MARKER_RATIO,
  PRINT_HEIGHT_MM,
  PRINT_WIDTH_MM,
  boardName,
  layout,
  patternSvg,
  printedCellMillimetres,
} from '../src/checkerboard.ts';
import { DICT_4X4_50, MARKER_CELLS, markerCells } from '../src/aruco.ts';
import { featureFlags } from '../config/feature-flags.ts';
import { guideCostumes } from '../src/guide.ts';
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

const WIDTH = 1000;
const HEIGHT = 750;

describe('the ChArUco board', () => {
  it('counts squares, not inner corners', () => {
    // The calibration block is given inner corners. A 9x6 board shows 10x7
    // squares, and quoting the wrong number produces a board whose shape does
    // not match the one the finder is looking for.
    for (const board of BOARDS) {
      const squares = (board.columns + 1) * (board.rows + 1);
      const dark = Math.ceil(squares / 2);
      const light = squares - dark;
      const svg = patternSvg(board);
      const rects = (svg.match(/<rect x=/gu) ?? []).length;
      // One rectangle per dark square, plus the black cells of one marker in
      // each light square.
      const perMarker = Array.from(
        { length: light },
        (_, id) =>
          markerCells(id)
            .flat()
            .filter((white) => !white).length,
      ).reduce((total, count) => total + count, 0);
      expect(rects).toBe(dark + perMarker);
    }
  });

  it('has a marker for every light square, from a dictionary that has enough', () => {
    for (const board of BOARDS) {
      const squares = (board.columns + 1) * (board.rows + 1);
      const light = squares - Math.ceil(squares / 2);
      expect(light).toBeLessThanOrEqual(DICT_4X4_50.length);
    }
  });

  it('leaves white around every marker', () => {
    // The marker's black border is what the detector finds first. Running it to
    // the edge of its square would join it to the dark squares beside it, and
    // there would be no border left to find.
    expect(MARKER_RATIO).toBeGreaterThan(0);
    expect(MARKER_RATIO).toBeLessThan(1);
  });

  it('draws each marker as a bordered grid', () => {
    // The ring is part of the marker, not decoration: every outer cell is dark.
    for (const id of [0, 1, 25, 49]) {
      const cells = markerCells(id);
      expect(cells).toHaveLength(MARKER_CELLS);
      for (let index = 0; index < MARKER_CELLS; index += 1) {
        expect(cells[0]?.[index]).toBe(false);
        expect(cells[MARKER_CELLS - 1]?.[index]).toBe(false);
        expect(cells[index]?.[0]).toBe(false);
        expect(cells[index]?.[MARKER_CELLS - 1]).toBe(false);
      }
    }
  });

  it('carries fifty distinct markers', () => {
    // A dictionary is an arbitrary table; a duplicate would make two squares
    // claim the same corners.
    expect(DICT_4X4_50).toHaveLength(50);
    expect(new Set(DICT_4X4_50).size).toBe(50);
  });

  it('leaves at least one square of blank margin on every side', () => {
    // OpenCV traces the outer squares against the background. A board run to
    // the edge loses its outermost corners and is refused as incomplete rather
    // than found with fewer points.
    for (const board of BOARDS) {
      const fitted = layout(board, WIDTH, HEIGHT);
      expect(fitted.quietX).toBeGreaterThanOrEqual(fitted.cell);
      expect(fitted.quietY).toBeGreaterThanOrEqual(fitted.cell);
    }
  });

  it('keeps every square square', () => {
    // A board stretched to fill its box would calibrate a lens that is not
    // there: the solve reads the distortion of the drawing as the camera's.
    for (const board of BOARDS) {
      const fitted = layout(board, WIDTH, HEIGHT);
      expect(fitted.boardWidth / (board.columns + 1)).toBe(fitted.cell);
      expect(fitted.boardHeight / (board.rows + 1)).toBe(fitted.cell);
    }
  });

  it('scales uniformly and letterboxes the rest', () => {
    // This attribute is the whole defence against a viewer stretching one
    // axis, which turns the squares into rectangles. The resulting bias does
    // not raise the reprojection error, so nothing downstream would catch it.
    const svg = patternSvg(BOARDS[0] ?? { columns: 9, rows: 6 });
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain(`viewBox="0 0 ${WIDTH} ${HEIGHT}"`);
  });

  it('names a board by its inner corners', () => {
    expect(boardName({ columns: 9, rows: 6 })).toBe('board-9x6');
  });
});

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

  it('draws no chessboard anywhere', () => {
    // The board lives in the page, not here. Nothing this project puts on
    // screen should be findable as the target, because the one arrangement
    // where that matters -- a camera pointed at the screen running this -- is
    // also the one where the mistake is invisible: the solve succeeds.
    const costumes = backdrops();
    expect(costumes).toHaveLength(1);
    for (const costume of costumes) {
      expect(costume.contents).not.toContain('#000000');
    }
    expect(stage.costumes.map((costume) => costume.name)).toEqual(['stage']);
  });

  it('names each costume by the bytes it actually holds', () => {
    // The SB3 stores assets under the MD5 of their contents. A name that no
    // longer matches loads as a missing costume, and the stage goes blank with
    // no error a user can act on.
    for (const costume of stage.costumes) {
      const source = backdrops().find((entry) => entry.name === costume.name);
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
  it('asks for the two extensions as one permission', () => {
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

  it('finds the board the operator is holding, and carries its size', () => {
    // Three sheets, and only the chosen one is looked for -- which used to be
    // three keys and a line explaining them. Holding the wrong one is not
    // silence though: the markers are seen and do not make this board, and
    // that is enough to try the next one.
    const hunt = scriptOrder(blocks, 'do-hunt');
    expect(hunt[0]?.opcode).toBe('event_whenbroadcastreceived');
    const written = Object.values(blocks)
      .filter((block) => block.opcode === 'data_setvariableto')
      .map((block) => (block.fields.VARIABLE as [string, string])[0]);
    // Each hop sets the size along with the counts: a board left with the
    // previous sheet's millimetres measures a sheet nobody is holding.
    for (const name of ['board', 'columns', 'rows', 'square', 'marker']) {
      expect(written.filter((entry) => entry === name).length).toBeGreaterThan(
        1,
      );
    }
    // And the sizes really differ, or none of this would matter.
    const sizes = BOARDS.map((board) => printedCellMillimetres(board));
    expect(new Set(sizes).size).toBe(BOARDS.length);
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
    const adviceWrites = Object.values(blocks).filter(
      (block) =>
        block.opcode === 'data_setvariableto' &&
        (block.fields.VARIABLE as [string, string])[0] === 'advice',
    );
    expect(adviceWrites.length).toBeGreaterThan(0);
    expect(adviceWrites.some((block) => readsBoard(block))).toBe(true);
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

  it('starts calibrating from the green flag, with nothing to press first', () => {
    // There is no mode to pick. This project does one thing, the board it
    // defaults to is the one the page offers first, and the shutter watches by
    // itself -- so a button between the flag and the camera would only ask the
    // operator to confirm what pressing the flag already said.
    const startup = scriptOrder(blocks, 'start');
    expect(startup[0]?.opcode).toBe('event_whenflagclicked');
    const last = startup[startup.length - 1];
    expect(last?.opcode).toBe('event_broadcast');
    expect(
      (
        last?.inputs.BROADCAST_INPUT as [number, [number, string, string]]
      )[1][2],
    ).toBe('msg-start');
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
    // There are no buttons at all now, so there is certainly not one for
    // this.
    expect(sprites.map((sprite) => sprite.name)).toEqual(['guide-tilt']);
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

  it('shows only what the operator needs, and speaks when there is a reason', () => {
    // The numbers were on screen because they were useful to whoever was
    // debugging, which is not who is holding the board. What they were read
    // for -- progress -- is a sound now. What is left is a reason for a
    // failure, which is worth the space exactly when there is one.
    const monitors = (
      project as unknown as {
        monitors: Array<{ params: { VARIABLE: string }; visible: boolean }>;
      }
    ).monitors;
    const showing = monitors
      .filter((entry) => entry.visible)
      .map((entry) => entry.params.VARIABLE);
    expect(showing).toEqual(['board', 'status']);

    const stageBlocks = stage.blocks as Record<string, ScratchBlock>;
    const toggled = new Set(
      Object.values(stageBlocks)
        .filter(
          (block) =>
            block.opcode === 'data_showvariable' ||
            block.opcode === 'data_hidevariable',
        )
        .map((block) => (block.fields.VARIABLE as [string, string])[0]),
    );
    expect(toggled).toContain('reason');
    expect(toggled).toContain('fit');
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
    expect(messages).toContain('判定できません。使えるとは言えません');
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
