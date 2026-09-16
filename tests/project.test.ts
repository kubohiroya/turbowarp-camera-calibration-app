import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backdrops,
  boardKey,
  chooserName,
  createProject,
  md5,
} from '../scripts/project.ts';
import {
  BOARDS,
  backdrop,
  boardName,
  layout,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '../scripts/checkerboard.ts';
import { featureFlags } from '../config/feature-flags.ts';
import type { ScratchBlock } from '../scripts/blocks.ts';
import {
  EXTENSION_PINS,
  integrity,
  resolveExtension,
} from '../scripts/extensions.ts';

function stageOf(project: ReturnType<typeof createProject>) {
  return project.targets[0];
}

describe('the chessboard backdrops', () => {
  it('counts squares, not inner corners', () => {
    // The calibration blocks are given inner corners. A 9x6 board shows 10x7
    // squares, and quoting the wrong number produces a board whose shape does
    // not match the one the finder is looking for.
    for (const board of BOARDS) {
      const dark = backdrop(board).match(/<rect x=/gu) ?? [];
      const squares = (board.columns + 1) * (board.rows + 1);
      expect(dark).toHaveLength(Math.ceil(squares / 2));
    }
  });

  it('leaves at least one square of blank margin on every side', () => {
    // OpenCV traces the outer squares against the background. A board run to
    // the edge loses its outermost corners and is refused as incomplete rather
    // than found with fewer points.
    for (const board of BOARDS) {
      const fitted = layout(board);
      expect(fitted.quietX).toBeGreaterThanOrEqual(fitted.cell);
      expect(fitted.quietY).toBeGreaterThanOrEqual(fitted.cell);
      expect(fitted.boardWidth).toBeLessThanOrEqual(STAGE_WIDTH);
      expect(fitted.boardHeight).toBeLessThanOrEqual(STAGE_HEIGHT);
    }
  });

  it('keeps every square square', () => {
    // A board stretched to fill the stage would calibrate a lens that is not
    // there: the solve reads the distortion of the drawing as the camera's.
    for (const board of BOARDS) {
      const fitted = layout(board);
      expect(fitted.boardWidth / (board.columns + 1)).toBe(fitted.cell);
      expect(fitted.boardHeight / (board.rows + 1)).toBe(fitted.cell);
    }
  });
});

describe('the project', () => {
  const project = createProject('Test');
  const stage = stageOf(project);
  const blocks = stage.blocks as Record<string, ScratchBlock>;

  it('links every script in both directions', () => {
    for (const [id, block] of Object.entries(blocks)) {
      if (block.next !== null) {
        expect(blocks[block.next]?.parent, `${id}.next`).toBe(id);
      }
      if (block.parent !== null && !blocks[block.parent]?.shadow) {
        const parent = blocks[block.parent];
        const linked = parent?.next === id || parent?.shadow === true;
        expect(linked || block.shadow, `${id}.parent`).toBe(true);
      }
      expect(block.topLevel).toBe(block.parent === null);
    }
  });

  it('switches only to backdrops it ships', () => {
    const costumes = new Set(stage.costumes.map((costume) => costume.name));
    for (const block of Object.values(blocks)) {
      if (block.opcode !== 'looks_backdrops') continue;
      const [name] = block.fields.BACKDROP as [string, null];
      expect(costumes, `backdrop ${name}`).toContain(name);
    }
    expect(costumes).toContain(chooserName);
    for (const board of BOARDS) expect(costumes).toContain(boardName(board));
  });

  it('hides every monitor before it puts a board on screen', () => {
    // This is the whole reason the display role touches the monitors at all. A
    // monitor left showing covers the squares underneath it, and the finder
    // reports the board as missing rather than as partly covered -- which reads
    // as a camera problem and sends the operator to the wrong place.
    const monitored = new Set(project.monitors.map((entry) => entry.id));
    for (let index = 0; index < BOARDS.length; index += 1) {
      const order = scriptOrder(blocks, `display-${index}`);
      const hidden = new Set<string>();
      let shown = -1;
      order.forEach((block, position) => {
        if (block.opcode === 'data_hidevariable') {
          const [, id] = block.fields.VARIABLE as [string, string];
          hidden.add(id);
        }
        if (block.opcode === 'looks_switchbackdropto') shown = position;
      });
      expect(shown).toBeGreaterThan(-1);
      expect([...hidden].sort()).toEqual([...monitored].sort());
      const lastHide = order.findLastIndex(
        (block) => block.opcode === 'data_hidevariable',
      );
      expect(lastHide).toBeLessThan(shown);
    }
  });

  it('brings the monitors back when the role is given up', () => {
    for (const prefix of ['start', 'choose']) {
      const order = scriptOrder(blocks, prefix);
      const shown = order.filter(
        (block) => block.opcode === 'data_showvariable',
      );
      expect(shown).toHaveLength(project.monitors.length);
      expect(order.at(-1)?.opcode).toBe('looks_switchbackdropto');
    }
  });

  it('gives every board its own key', () => {
    const keys = BOARDS.map((_, index) => boardKey(index));
    expect(new Set(keys).size).toBe(keys.length);
    for (let index = 0; index < BOARDS.length; index += 1) {
      const [key] = scriptOrder(blocks, `display-${index}`)[0]?.fields
        .KEY_OPTION as [string, null];
      expect(key).toBe(boardKey(index));
    }
  });

  it('names each costume by the bytes it actually holds', () => {
    // The SB3 stores assets under the MD5 of their contents. A name that no
    // longer matches loads as a missing costume, and the stage goes blank with
    // no error a user can act on.
    for (const costume of stage.costumes) {
      const source = backdrops().find((entry) => entry.name === costume.name);
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

  it('takes the camera and opens a session in one step', () => {
    // A camera held without a session is a camera taken from whoever else
    // wanted it, for nothing, with no sign to the operator that it happened.
    const order = scriptOrder(blocks, 'capture').map((block) => block.opcode);
    expect(order).toContain('kubohiroyacamerasource_startSharedCamera');
    expect(order).toContain(
      'kubohiroyacameracalibration_startCameraCalibration',
    );
    expect(
      order.indexOf('kubohiroyacamerasource_startSharedCamera'),
    ).toBeLessThan(
      order.indexOf('kubohiroyacameracalibration_startCameraCalibration'),
    );
  });

  it('asks the board for inner corners, matching what it displays', () => {
    const start = scriptOrder(blocks, 'capture').find(
      (block) =>
        block.opcode === 'kubohiroyacameracalibration_startCameraCalibration',
    );
    const columns = (start?.inputs.COLUMNS as [number, [number, string]])[1][1];
    const rows = (start?.inputs.ROWS as [number, [number, string]])[1][1];
    expect(columns).toBe(String(BOARDS[0]?.columns));
    expect(rows).toBe(String(BOARDS[0]?.rows));
  });

  it('shows the refusal code, not just the state', () => {
    // "sample-too-similar" is the one the operator has to see, and it is the
    // one the state reporter hides: the session goes straight back to ready.
    const watched = scriptOrder(blocks, 'watch')
      .flatMap((block) => (block.opcode === 'control_forever' ? [block] : []))
      .flatMap((block) => {
        const first = (block.inputs.SUBSTACK as [number, string])[1];
        return innerOrder(blocks, first);
      })
      .flatMap((block) =>
        Object.values(block.inputs).flatMap((input) =>
          Array.isArray(input) && input[0] === 3 ? [String(input[1])] : [],
        ),
      )
      .map((id) => blocks[id]?.opcode);
    expect(watched).toContain(
      'kubohiroyacameracalibration_cameraCalibrationErrorCode',
    );
    expect(watched).toContain(
      'kubohiroyacameracalibration_cameraCalibrationSampleCount',
    );
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

/** The blocks of a nested run, in the order they run. */
function innerOrder(
  blocks: Record<string, ScratchBlock>,
  first: string,
): ScratchBlock[] {
  const order: ScratchBlock[] = [];
  let id: string | null = first;
  while (id !== null) {
    const block: ScratchBlock | undefined = blocks[id];
    if (!block) break;
    order.push(block);
    id = block.next;
  }
  return order;
}
