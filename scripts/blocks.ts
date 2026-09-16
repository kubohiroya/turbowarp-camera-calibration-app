// SPDX-License-Identifier: MPL-2.0
/**
 * A small writer for the block graph an SB3 stores.
 *
 * The format is a flat map keyed by block ID, where order is carried by `next`
 * and `parent` pointers that have to agree in both directions. Written by hand
 * that is a list of opportunities to link a script to itself, and the damage
 * does not show up until TurboWarp loads the project. These helpers build the
 * links from the order the blocks are written in.
 */

export interface ScratchBlock {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, unknown>;
  fields: Record<string, unknown>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
}

export type BlockMap = Record<string, ScratchBlock>;

export interface Reporter {
  opcode: string;
  inputs?: Record<string, unknown>;
  fields?: Record<string, unknown>;
}

export interface Step {
  opcode: string;
  inputs?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  /** Shadow blocks this step's inputs point at, keyed by input name. */
  menus?: Record<string, { opcode: string; fields: Record<string, unknown> }>;
  /** Reporter blocks dropped into this step's inputs, keyed by input name. */
  reporters?: Record<string, Reporter>;
  /** Blocks nested inside this one, for a C-shaped block such as forever. */
  substack?: readonly Step[];
}

/** A literal string, as a block input takes one. */
export function text(value: string): unknown {
  return [1, [10, value]];
}

/** Names a variable in a field. The ID is the name this project gives it. */
export function variable(id: string, name: string): unknown {
  return [name, id];
}

export function setVariable(id: string, name: string, value: string): Step {
  return {
    opcode: 'data_setvariableto',
    inputs: { VALUE: text(value) },
    fields: { VARIABLE: variable(id, name) },
  };
}

export function showVariable(id: string, name: string): Step {
  return {
    opcode: 'data_showvariable',
    fields: { VARIABLE: variable(id, name) },
  };
}

export function hideVariable(id: string, name: string): Step {
  return {
    opcode: 'data_hidevariable',
    fields: { VARIABLE: variable(id, name) },
  };
}

export function switchBackdrop(name: string): Step {
  return {
    opcode: 'looks_switchbackdropto',
    inputs: { BACKDROP: [1, null] },
    menus: {
      BACKDROP: {
        opcode: 'looks_backdrops',
        fields: { BACKDROP: [name, null] },
      },
    },
  };
}

/** An extension's block, which the SB3 names by extension ID and opcode. */
export function extensionStep(
  extensionId: string,
  opcode: string,
  args: Record<string, string> = {},
): Step {
  return {
    opcode: `${extensionId}_${opcode}`,
    inputs: Object.fromEntries(
      Object.entries(args).map(([name, value]) => [name, text(value)]),
    ),
  };
}

export function extensionReporter(
  extensionId: string,
  opcode: string,
  args: Record<string, string> = {},
): Reporter {
  return {
    opcode: `${extensionId}_${opcode}`,
    inputs: Object.fromEntries(
      Object.entries(args).map(([name, value]) => [name, text(value)]),
    ),
  };
}

/** Copies a reporter's current value into a variable, so a monitor can show it. */
export function setVariableFrom(
  id: string,
  name: string,
  reporter: Reporter,
): Step {
  return {
    opcode: 'data_setvariableto',
    fields: { VARIABLE: variable(id, name) },
    reporters: { VALUE: reporter },
  };
}

export function forever(body: readonly Step[]): Step {
  return { opcode: 'control_forever', substack: body };
}

export function whenFlagClicked(): Step {
  return { opcode: 'event_whenflagclicked' };
}

export function whenKeyPressed(key: string): Step {
  return {
    opcode: 'event_whenkeypressed',
    fields: { KEY_OPTION: [key, null] },
  };
}

/**
 * Writes one script: a hat block and the stack under it.
 *
 * IDs are derived from `prefix` and the position in the stack, so a project
 * built twice from the same input is byte-identical -- which is what lets the
 * committed source be compared against a rebuild instead of trusted.
 */
export function script(
  prefix: string,
  x: number,
  y: number,
  hat: Step,
  body: readonly Step[],
): BlockMap {
  const blocks: BlockMap = {};
  writeStack(blocks, prefix, [hat, ...body], null, { x, y });
  return blocks;
}

/**
 * Writes one run of blocks, linking each to the next and to its parent.
 *
 * `parent` is the block this run hangs off: null for a script at the top
 * level, or the C-shaped block whose mouth it sits in. A nested run is not a
 * child of the block before it, so the two cases cannot share one rule.
 */
function writeStack(
  blocks: BlockMap,
  prefix: string,
  steps: readonly Step[],
  parent: string | null,
  position?: { x: number; y: number },
): string | undefined {
  const idOf = (index: number) => `${prefix}-${index}`;
  steps.forEach((step, index) => {
    const id = idOf(index);
    const inputs: Record<string, unknown> = { ...step.inputs };

    for (const [name, menu] of Object.entries(step.menus ?? {})) {
      const menuId = `${id}-${name.toLowerCase()}`;
      inputs[name] = [1, menuId];
      blocks[menuId] = {
        opcode: menu.opcode,
        next: null,
        parent: id,
        inputs: {},
        fields: menu.fields,
        shadow: true,
        topLevel: false,
      };
    }

    for (const [name, reporter] of Object.entries(step.reporters ?? {})) {
      const reporterId = `${id}-${name.toLowerCase()}`;
      // The trailing literal is the shadow a reporter covers: it is what the
      // input falls back to if the reporter is ever pulled out, and leaving it
      // off makes the input unreadable to the editor.
      inputs[name] = [3, reporterId, [10, '']];
      blocks[reporterId] = {
        opcode: reporter.opcode,
        next: null,
        parent: id,
        inputs: { ...reporter.inputs },
        fields: { ...reporter.fields },
        shadow: false,
        topLevel: false,
      };
    }

    if (step.substack !== undefined) {
      const first = writeStack(blocks, `${id}-sub`, step.substack, id);
      if (first !== undefined) inputs.SUBSTACK = [2, first];
    }

    blocks[id] = {
      opcode: step.opcode,
      next: index + 1 < steps.length ? idOf(index + 1) : null,
      parent: index === 0 ? parent : idOf(index - 1),
      inputs,
      fields: { ...step.fields },
      shadow: false,
      topLevel: parent === null && index === 0,
      ...(index === 0 && position !== undefined ? position : {}),
    };
  });
  return steps.length > 0 ? idOf(0) : undefined;
}
