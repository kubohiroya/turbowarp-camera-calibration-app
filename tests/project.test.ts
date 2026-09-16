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

  it('is deterministic and leaves the experimental runtime disabled', () => {
    expect(createProject('Test')).toEqual(createProject('Test'));
    expect(featureFlags.experimentalRuntime).toBe(false);
  });

  it('declares no extensions yet', () => {
    // Calibration arrives with the camera extensions pinned by exact version
    // and hash. Until then the SB3 carries nothing it cannot verify.
    expect(project.extensions).toEqual([]);
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
