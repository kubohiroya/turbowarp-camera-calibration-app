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

export interface Step {
  opcode: string;
  inputs?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  /** Shadow blocks this step's inputs point at, keyed by input name. */
  menus?: Record<string, { opcode: string; fields: Record<string, unknown> }>;
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
  const steps = [hat, ...body];
  const blocks: BlockMap = {};
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
    blocks[id] = {
      opcode: step.opcode,
      next: index + 1 < steps.length ? idOf(index + 1) : null,
      parent: index === 0 ? null : idOf(index - 1),
      inputs,
      fields: { ...step.fields },
      shadow: false,
      topLevel: index === 0,
      ...(index === 0 ? { x, y } : {}),
    };
  });
  return blocks;
}
