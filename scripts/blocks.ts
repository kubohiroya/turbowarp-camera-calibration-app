// SPDX-License-Identifier: MPL-2.0
/**
 * A small writer for the block graph an SB3 stores.
 *
 * The format is a flat map keyed by block ID, where order and nesting are
 * carried by `next`, `parent` and input pointers that all have to agree with
 * each other. Written by hand that is a list of opportunities to link a script
 * to itself, and the damage does not show up until TurboWarp loads the project.
 * These helpers build the links from the shape the blocks are written in.
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

/** A block that reports a value or a truth, dropped into another block's input. */
export interface Reporter {
  opcode: string;
  inputs?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  /** Reporters nested in this one's inputs, such as the operands of a comparison. */
  reporters?: Record<string, Reporter>;
  /** Boolean-shaped reporters nested in this one's inputs. */
  booleans?: Record<string, Reporter>;
}

export interface Step {
  opcode: string;
  inputs?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  /** Shadow blocks this step's inputs point at, keyed by input name. */
  menus?: Record<string, { opcode: string; fields: Record<string, unknown> }>;
  /** Reporter blocks dropped into this step's inputs, keyed by input name. */
  reporters?: Record<string, Reporter>;
  /** Boolean reporters dropped into this step's inputs, such as a condition. */
  booleans?: Record<string, Reporter>;
  /** Blocks nested inside this one, for a C-shaped block such as forever. */
  substack?: readonly Step[];
  /** The second mouth of an if/else. */
  substack2?: readonly Step[];
}

/** A literal string, as a block input takes one. */
export function text(value: string): unknown {
  return [1, [10, value]];
}

/** Names a variable in a field. The ID is the name this project gives it. */
export function variable(id: string, name: string): unknown {
  return [name, id];
}

export function readVariable(id: string, name: string): Reporter {
  return { opcode: 'data_variable', fields: { VARIABLE: variable(id, name) } };
}

export function setVariable(id: string, name: string, value: string): Step {
  return {
    opcode: 'data_setvariableto',
    inputs: { VALUE: text(value) },
    fields: { VARIABLE: variable(id, name) },
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

function list(id: string, name: string): [string, string] {
  return [name, id];
}

/**
 * Lists, for the one thing a variable cannot do: leave the project.
 *
 * A list monitor has import and export in its own context menu, so a list is
 * the only place in a Scratch project from which bytes can reach a file and
 * come back. The profile is the app's product, and this is how it is handed
 * over.
 */
export function emptyList(id: string, name: string): Step {
  return {
    opcode: 'data_deletealloflist',
    fields: { LIST: list(id, name) },
  };
}

export function appendToList(
  id: string,
  name: string,
  value: Reporter | string,
): Step {
  const base = {
    opcode: 'data_addtolist',
    fields: { LIST: list(id, name) },
  };
  return typeof value === 'string'
    ? { ...base, inputs: { ITEM: text(value) } }
    : { ...base, reporters: { ITEM: value } };
}

/**
 * Turns a sprite. Used to flip the handle, not to animate anything.
 *
 * A second costume would say the same thing and cost a second asset, a second
 * hash and a line in every place that counts them; the handle is one chevron
 * and the open state is the same chevron the other way up.
 */
export function switchCostume(name: string): Step {
  return {
    opcode: 'looks_switchcostumeto',
    inputs: { COSTUME: [1, null] },
    menus: {
      COSTUME: {
        opcode: 'looks_costume',
        fields: { COSTUME: [name, null] },
      },
    },
  };
}

/** `ghost` for transparency, `brightness` for the flash. */
export function setEffect(effect: 'GHOST' | 'BRIGHTNESS', value: number): Step {
  return {
    opcode: 'looks_seteffectto',
    inputs: { VALUE: [1, [4, String(value)]] },
    fields: { EFFECT: [effect, null] },
  };
}

/** Puts a variable's monitor on screen, or takes it off. */
export function hideVariable(id: string, name: string): Step {
  return {
    opcode: 'data_hidevariable',
    fields: { VARIABLE: variable(id, name) },
  };
}

export function pointInDirection(degrees: number): Step {
  return {
    opcode: 'motion_pointindirection',
    inputs: { DIRECTION: [1, [8, String(degrees)]] },
  };
}

export function showList(id: string, name: string): Step {
  return { opcode: 'data_showlist', fields: { LIST: list(id, name) } };
}

export function hideList(id: string, name: string): Step {
  return { opcode: 'data_hidelist', fields: { LIST: list(id, name) } };
}

export function lengthOfList(id: string, name: string): Reporter {
  return { opcode: 'data_lengthoflist', fields: { LIST: list(id, name) } };
}

/** Everything in the list, run together. What was exported, read back. */
export function listContents(id: string, name: string): Reporter {
  return {
    opcode: 'data_itemoflist',
    fields: { LIST: list(id, name) },
    inputs: { INDEX: text('1') },
  };
}

export function showVariable(id: string, name: string): Step {
  return {
    opcode: 'data_showvariable',
    fields: { VARIABLE: variable(id, name) },
  };
}

/**
 * Starts a sound and carries on.
 *
 * Not `sound_playuntildone`: the script that reaches this is the watch loop,
 * and a loop that stops for six hundred milliseconds stops mirroring the
 * reporters for six hundred milliseconds.
 */
/** Sleeps for a computed number of seconds. */
export function waitFor(seconds: Reporter): Step {
  return {
    opcode: 'control_wait',
    inputs: { DURATION: [1, [5, '0']] },
    reporters: { DURATION: seconds },
  };
}

export function playSound(name: string): Step {
  return {
    opcode: 'sound_play',
    inputs: { SOUND_MENU: [1, null] },
    menus: {
      SOUND_MENU: {
        opcode: 'sound_sounds_menu',
        fields: { SOUND_MENU: [name, null] },
      },
    },
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

export const show: Step = { opcode: 'looks_show' };
export const hide: Step = { opcode: 'looks_hide' };

/**
 * Sleeps until the next frame.
 *
 * The block a polling loop cannot do without. A `forever` whose body never
 * asks to wait is re-entered by the sequencer until the frame's work budget is
 * gone -- measured at thirty thousand passes per frame for this project's watch
 * loop, which is thirty thousand times more often than a monitor can be read.
 * The budget spent on that is budget the camera preview and the frame grab do
 * not get.
 */
export function waitSeconds(seconds: number): Step {
  return {
    opcode: 'control_wait',
    inputs: { DURATION: [1, [5, String(seconds)]] },
  };
}

export function forever(body: readonly Step[]): Step {
  return { opcode: 'control_forever', substack: body };
}

/** A plain `if`, for the case where nothing happens when the answer is no. */
export function ifThen(condition: Reporter, then: readonly Step[]): Step {
  return {
    opcode: 'control_if',
    booleans: { CONDITION: condition },
    substack: then,
  };
}

export function ifElse(
  condition: Reporter,
  then: readonly Step[],
  otherwise: readonly Step[],
): Step {
  return {
    opcode: 'control_if_else',
    booleans: { CONDITION: condition },
    substack: then,
    substack2: otherwise,
  };
}

export function equals(
  left: Reporter | string,
  right: Reporter | string,
): Reporter {
  return operator('operator_equals', 'OPERAND1', 'OPERAND2', left, right);
}

export function greaterThan(
  left: Reporter | string,
  right: Reporter | string,
): Reporter {
  return operator('operator_gt', 'OPERAND1', 'OPERAND2', left, right);
}

export function both(left: Reporter, right: Reporter): Reporter {
  return {
    opcode: 'operator_and',
    booleans: { OPERAND1: left, OPERAND2: right },
  };
}

export function either(left: Reporter, right: Reporter): Reporter {
  return {
    opcode: 'operator_or',
    booleans: { OPERAND1: left, OPERAND2: right },
  };
}

export function not(value: Reporter): Reporter {
  return { opcode: 'operator_not', booleans: { OPERAND: value } };
}

export function join(
  left: Reporter | string,
  right: Reporter | string,
): Reporter {
  return operator('operator_join', 'STRING1', 'STRING2', left, right);
}

export function divide(
  left: Reporter | string | number,
  right: Reporter | string | number,
): Reporter {
  return operator('operator_divide', 'NUM1', 'NUM2', left, right);
}

export function multiply(
  left: Reporter | string | number,
  right: Reporter | string | number,
): Reporter {
  return operator('operator_multiply', 'NUM1', 'NUM2', left, right);
}

/** Rounds to the nearest whole number. */
export function round(value: Reporter | string | number): Reporter {
  const settled = typeof value === 'number' ? String(value) : value;
  return typeof settled === 'string'
    ? { opcode: 'operator_round', inputs: { NUM: text(settled) } }
    : { opcode: 'operator_round', inputs: {}, reporters: { NUM: settled } };
}

export function add(
  left: Reporter | string | number,
  right: Reporter | string | number,
): Reporter {
  return operator('operator_add', 'NUM1', 'NUM2', left, right);
}

export function subtract(
  left: Reporter | string,
  right: Reporter | string,
): Reporter {
  return operator('operator_subtract', 'NUM1', 'NUM2', left, right);
}

function operator(
  opcode: string,
  leftName: string,
  rightName: string,
  left: Reporter | string | number,
  right: Reporter | string | number,
): Reporter {
  const inputs: Record<string, unknown> = {};
  const reporters: Record<string, Reporter> = {};
  const literal = (value: Reporter | string | number) =>
    typeof value === 'number' ? String(value) : value;
  const at = (name: string, value: Reporter | string | number) => {
    const settled = literal(value);
    if (typeof settled === 'string') inputs[name] = text(settled);
    else reporters[name] = settled;
  };
  at(leftName, left);
  at(rightName, right);
  return { opcode, inputs, reporters };
}

/** An extension's block, which the SB3 names by extension ID and opcode. */
export function extensionStep(
  extensionId: string,
  opcode: string,
  args: Record<string, string> = {},
): Step {
  return { opcode: `${extensionId}_${opcode}`, inputs: literalArguments(args) };
}

export function extensionReporter(
  extensionId: string,
  opcode: string,
  args: Record<string, string> = {},
): Reporter {
  return { opcode: `${extensionId}_${opcode}`, inputs: literalArguments(args) };
}

function literalArguments(
  args: Record<string, string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([name, value]) => [name, text(value)]),
  );
}

export function whenFlagClicked(): Step {
  return { opcode: 'event_whenflagclicked' };
}

/** Runs when the stage itself is clicked -- anywhere a sprite is not. */
export function whenStageClicked(): Step {
  return { opcode: 'event_whenstageclicked' };
}

export function whenKeyPressed(key: string): Step {
  return {
    opcode: 'event_whenkeypressed',
    fields: { KEY_OPTION: [key, null] },
  };
}

export function whenSpriteClicked(): Step {
  return { opcode: 'event_whenthisspriteclicked' };
}

export function whenBroadcastReceived(id: string, name: string): Step {
  return {
    opcode: 'event_whenbroadcastreceived',
    fields: { BROADCAST_OPTION: [name, id] },
  };
}

export function broadcast(id: string, name: string): Step {
  return {
    opcode: 'event_broadcast',
    inputs: { BROADCAST_INPUT: [1, [11, name, id]] },
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
    const inputs = writeInputs(blocks, id, step);

    if (step.substack !== undefined) {
      const first = writeStack(blocks, `${id}-do`, step.substack, id);
      if (first !== undefined) inputs.SUBSTACK = [2, first];
    }
    if (step.substack2 !== undefined) {
      const first = writeStack(blocks, `${id}-else`, step.substack2, id);
      if (first !== undefined) inputs.SUBSTACK2 = [2, first];
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

/** Writes the blocks a step or reporter carries in its inputs, and links them. */
function writeInputs(
  blocks: BlockMap,
  owner: string,
  node: Step | Reporter,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = { ...node.inputs };

  for (const [name, menu] of Object.entries((node as Step).menus ?? {})) {
    const menuId = `${owner}-${name.toLowerCase()}`;
    inputs[name] = [1, menuId];
    blocks[menuId] = {
      opcode: menu.opcode,
      next: null,
      parent: owner,
      inputs: {},
      fields: menu.fields,
      shadow: true,
      topLevel: false,
    };
  }

  for (const [name, reporter] of Object.entries(node.reporters ?? {})) {
    // The trailing literal is the shadow a reporter covers: it is what the
    // input falls back to if the reporter is ever pulled out, and leaving it
    // off makes the input unreadable to the editor.
    inputs[name] = [3, writeReporter(blocks, owner, name, reporter), [10, '']];
  }

  for (const [name, condition] of Object.entries(node.booleans ?? {})) {
    // A boolean input has no shadow: an empty one is a hole, not a default.
    inputs[name] = [2, writeReporter(blocks, owner, name, condition)];
  }

  return inputs;
}

function writeReporter(
  blocks: BlockMap,
  owner: string,
  name: string,
  reporter: Reporter,
): string {
  const id = `${owner}-${name.toLowerCase()}`;
  const inputs = writeInputs(blocks, id, reporter);
  blocks[id] = {
    opcode: reporter.opcode,
    next: null,
    parent: owner,
    inputs,
    fields: { ...reporter.fields },
    shadow: false,
    topLevel: false,
  };
  return id;
}
