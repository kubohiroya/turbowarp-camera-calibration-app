import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backdrops, createProject, md5 } from '../scripts/project.ts';
import { BOARDS, boardName, layout, patternSvg } from '../src/checkerboard.ts';
import { featureFlags } from '../config/feature-flags.ts';
import type { ScratchBlock } from '../scripts/blocks.ts';
import {
  EXTENSION_PINS,
  integrity,
  resolveExtension,
} from '../scripts/extensions.ts';

const WIDTH = 1000;
const HEIGHT = 750;

describe('the chessboard', () => {
  it('counts squares, not inner corners', () => {
    // The calibration block is given inner corners. A 9x6 board shows 10x7
    // squares, and quoting the wrong number produces a board whose shape does
    // not match the one the finder is looking for.
    for (const board of BOARDS) {
      const dark = patternSvg(board).match(/<rect x=/gu) ?? [];
      const squares = (board.columns + 1) * (board.rows + 1);
      expect(dark).toHaveLength(Math.ceil(squares / 2));
    }
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
  const stage = project.targets[0];
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
    expect(
      order.indexOf('kubohiroyacamerasource_startSharedCamera'),
    ).toBeGreaterThan(-1);
    expect(
      order.indexOf('kubohiroyacamerasource_startSharedCamera'),
    ).toBeLessThan(
      order.indexOf('kubohiroyacameracalibration_startCameraCalibration'),
    );
  });

  it('hands the camera back when the operator stops', () => {
    // Resetting the display and leaving the lease held would strand a shared
    // camera for every other consumer, with nothing on screen to say so. The
    // extensions release on the red stop button; this is the path that leaves
    // a session while the project keeps running, and it had to be said here.
    const order = scriptOrder(blocks, 'leave').map((block) => block.opcode);
    expect(order).toContain(
      'kubohiroyacameracalibration_cancelCameraCalibration',
    );
    expect(order).toContain('kubohiroyacamerasource_hideCameraPreview');
    expect(order).toContain('kubohiroyacamerasource_stopSharedCamera');
  });

  it('asks for the board the operator selected, not a fixed one', () => {
    const start = scriptOrder(blocks, 'capture').find(
      (block) =>
        block.opcode === 'kubohiroyacameracalibration_startCameraCalibration',
    );
    for (const name of ['COLUMNS', 'ROWS']) {
      const input = start?.inputs[name] as [number, string, unknown];
      expect(input[0], name).toBe(3);
      expect(blocks[input[1]]?.opcode, name).toBe('data_variable');
    }
  });

  it('gives every board a key that sets both counts together', () => {
    // Setting the columns without the rows would ask for a board nobody is
    // holding, and the finder reports that as "board not found".
    BOARDS.forEach((board, index) => {
      const order = scriptOrder(blocks, `board-${index}`);
      const written = order
        .filter((block) => block.opcode === 'data_setvariableto')
        .map((block) => (block.fields.VARIABLE as [string, string])[1]);
      expect(written).toContain('columns');
      expect(written).toContain('rows');
      expect((order[0]?.fields.KEY_OPTION as [string, null])[0]).toBe(
        String(index + 1),
      );
      expect(board.columns).toBeGreaterThan(0);
    });
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
