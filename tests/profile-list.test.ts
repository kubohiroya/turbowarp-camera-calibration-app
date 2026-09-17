// SPDX-License-Identifier: MPL-2.0
/**
 * The profile's way out of the project and back in, run as blocks.
 *
 * `do-register` cuts the YAML into the profile list a letter at a time, and
 * `do-adopt` puts the list back together. Scratch has no split and no line
 * break literal a person would notice, so these scripts are the kind that look
 * right and drop a character. They are run here by a small evaluator that
 * follows Scratch's own rules for the blocks they use -- including how `=`
 * compares a line break -- with Camera Source and Camera Calibration stubbed.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createProject } from '../scripts/project.ts';
import type { ScratchBlock } from '../scripts/blocks.ts';

type Value = string | number | boolean;

const exported = readFileSync(
  new URL('./fixtures/profile-default.yaml', import.meta.url),
  'utf8',
);

/** scratch-vm's Cast.compare. */
function compare(left: Value, right: Value): number {
  let n1 = Number(left);
  let n2 = Number(right);
  const blank = (value: Value) =>
    typeof value === 'string' && value.trim().length === 0;
  if (n1 === 0 && blank(left)) n1 = NaN;
  else if (n2 === 0 && blank(right)) n2 = NaN;
  if (isNaN(n1) || isNaN(n2)) {
    const s1 = String(left).toLowerCase();
    const s2 = String(right).toLowerCase();
    return s1 < s2 ? -1 : s1 > s2 ? 1 : 0;
  }
  return n1 - n2;
}

class Evaluator {
  public readonly variables = new Map<string, Value>();
  public readonly lists = new Map<string, Value[]>();
  public readonly calls: Array<{
    opcode: string;
    args: Record<string, Value>;
  }> = [];

  private readonly blocks: Record<string, ScratchBlock>;
  private readonly reporters: Record<string, Value>;

  public constructor(
    blocks: Record<string, ScratchBlock>,
    reporters: Record<string, Value>,
  ) {
    this.blocks = blocks;
    this.reporters = reporters;
  }

  public run(firstId: string): void {
    let id: string | null = firstId;
    while (id !== null) {
      const block: ScratchBlock = this.blocks[id]!;
      this.step(block);
      id = block.next;
    }
  }

  private step(block: ScratchBlock): void {
    const field = (name: string) => (block.fields[name] as [string, string])[1];
    switch (block.opcode) {
      case 'data_setvariableto':
        this.variables.set(field('VARIABLE'), this.input(block, 'VALUE'));
        return;
      case 'data_changevariableby':
        this.variables.set(
          field('VARIABLE'),
          Number(this.variables.get(field('VARIABLE')) ?? 0) +
            Number(this.input(block, 'VALUE')),
        );
        return;
      case 'data_deletealloflist':
        this.lists.set(field('LIST'), []);
        return;
      case 'data_addtolist':
        this.list(field('LIST')).push(this.input(block, 'ITEM'));
        return;
      case 'control_repeat': {
        const times = Math.round(Number(this.input(block, 'TIMES')));
        for (let index = 0; index < times; index += 1)
          this.substack(block, 'SUBSTACK');
        return;
      }
      case 'control_if':
        if (this.input(block, 'CONDITION') === true)
          this.substack(block, 'SUBSTACK');
        return;
      case 'control_if_else':
        this.substack(
          block,
          this.input(block, 'CONDITION') === true ? 'SUBSTACK' : 'SUBSTACK2',
        );
        return;
      case 'event_whenbroadcastreceived':
      case 'event_broadcast':
        return;
      default:
        if (!block.opcode.startsWith('kubohiroya')) {
          throw new Error(`The evaluator does not run ${block.opcode}.`);
        }
        this.calls.push({
          opcode: block.opcode,
          args: Object.fromEntries(
            Object.keys(block.inputs).map((name) => [
              name,
              this.input(block, name),
            ]),
          ),
        });
    }
  }

  private substack(block: ScratchBlock, name: string): void {
    const input = block.inputs[name] as [number, string] | undefined;
    if (input) this.run(input[1]);
  }

  private list(id: string): Value[] {
    if (!this.lists.has(id)) this.lists.set(id, []);
    return this.lists.get(id)!;
  }

  private input(block: ScratchBlock, name: string): Value {
    const input = block.inputs[name] as [number, unknown, unknown?] | undefined;
    if (!input) return '';
    const [kind, value] = input;
    if (Array.isArray(value)) return value[1] as Value;
    if (kind === 2 || kind === 3)
      return this.reporter(this.blocks[value as string]!);
    return '';
  }

  private reporter(block: ScratchBlock): Value {
    const field = (name: string) => (block.fields[name] as [string, string])[1];
    const arg = (name: string) => this.input(block, name);
    switch (block.opcode) {
      case 'data_variable':
        return this.variables.get(field('VARIABLE')) ?? '';
      case 'data_lengthoflist':
        return this.list(field('LIST')).length;
      case 'data_itemoflist':
        return (
          this.list(field('LIST'))[Math.round(Number(arg('INDEX'))) - 1] ?? ''
        );
      case 'operator_join':
        return `${String(arg('STRING1'))}${String(arg('STRING2'))}`;
      case 'operator_length':
        return String(arg('STRING')).length;
      case 'operator_letter_of':
        return (
          String(arg('STRING'))[Math.round(Number(arg('LETTER'))) - 1] ?? ''
        );
      case 'operator_equals':
        return compare(arg('OPERAND1'), arg('OPERAND2')) === 0;
      case 'operator_not':
        return arg('OPERAND') !== true;
      case 'operator_and':
        return arg('OPERAND1') === true && arg('OPERAND2') === true;
      default:
        if (block.opcode in this.reporters)
          return this.reporters[block.opcode]!;
        throw new Error(`The evaluator does not report ${block.opcode}.`);
    }
  }
}

describe('the profile list', () => {
  const project = createProject('Test', { embedExtensions: true });
  const blocks = (
    project.targets[0] as unknown as { blocks: Record<string, ScratchBlock> }
  ).blocks;
  const LIST = 'list-profile';

  it('holds the exported YAML a line per item once a calibration is solved', () => {
    const evaluator = new Evaluator(blocks, {
      kubohiroyacamerasource_cameraProfileYaml: exported,
    });
    evaluator.run('do-register-0');
    const items = evaluator.lists.get(LIST);
    expect(items).toEqual(exported.split('\n').slice(0, -1));
    // And the QR code is drawn from the whole text.
    expect(evaluator.variables.get('profile-text')).toBe(exported);
  });

  it('hands the importer the file it was exported as, after TurboWarp writes and reads it', () => {
    const register = new Evaluator(blocks, {
      kubohiroyacamerasource_cameraProfileYaml: exported,
    });
    register.run('do-register-0');
    // scratch-gui joins items with CRLF on export and splits on LF, dropping
    // CR, on import.
    const file = (register.lists.get(LIST) ?? []).join('\r\n');
    const adopt = new Evaluator(blocks, {});
    adopt.lists.set(LIST, file.replace(/\r/g, '').split('\n'));
    adopt.run('do-adopt-0');
    const imported = adopt.calls.find(
      (call) =>
        call.opcode === 'kubohiroyacameracalibration_importCameraCalibration',
    );
    expect(imported?.args.JSON).toBe(exported);
  });

  it('keeps a line that is a single character, and one made of digits', () => {
    // `=` in Scratch compares "0" with a line break as strings only because a
    // line break is blank; a digit line is the case that would go wrong.
    const text = 'a\n0\n  1\n}\n';
    const evaluator = new Evaluator(blocks, {
      kubohiroyacamerasource_cameraProfileYaml: text,
    });
    evaluator.run('do-register-0');
    expect(evaluator.lists.get(LIST)).toEqual(['a', '0', '  1', '}']);
  });
});
