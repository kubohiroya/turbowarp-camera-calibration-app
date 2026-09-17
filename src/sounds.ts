// SPDX-License-Identifier: MPL-2.0
/**
 * Everything this app says without words.
 *
 * The operator is holding a board at arm's length and moving it, which is the
 * one posture in which a message appearing on a screen is least likely to be
 * read. What can reach them is sound.
 *
 * Generated rather than shipped as recordings, because a recording is bytes
 * nobody in this repository can review: a reader can see what these play by
 * reading the notes, and a reviewer can see that they are not something else.
 *
 * ## How the cues are told apart
 *
 * Four directions is too many timbres to learn by ear, so they are not four of
 * anything. Two things are said separately:
 *
 * The **timbre** says which axis. A soft tone means turn it about the
 * horizontal axis -- top toward you or away. A reedy tone means turn it about
 * the vertical one -- left edge or right edge toward you.
 *
 * The **contour** says which way along that axis. Rising means bring the near
 * name toward you; falling means push it away. Two facts, one bit each, rather
 * than four sounds to memorise.
 */

const RATE = 22050;

interface Voice {
  /** Relative amplitude of each harmonic, starting at the fundamental. */
  readonly harmonics: readonly number[];
  readonly decay: number;
}

/**
 * Rounded, with almost nothing above the fundamental. Heard as "front to back"
 * because it is the plainer of the two, and the front-to-back turn is the one
 * an operator reaches for first.
 */
const SOFT: Voice = { harmonics: [1, 0.12, 0.04], decay: 1.8 };

/**
 * Hollow: odd harmonics only, which is what makes a clarinet sound unlike a
 * flute at the same pitch. Different enough from SOFT to be told apart across
 * a room, by someone not listening for it.
 */
const REEDY: Voice = { harmonics: [1, 0, 0.5, 0, 0.3, 0, 0.18], decay: 1.2 };

/** Bright and short: not a note, a tick. Rate carries the meaning, not pitch. */
const TICK: Voice = { harmonics: [1, 0.6, 0.4, 0.25], decay: 9 };

interface Note {
  readonly hertz: number;
  readonly startSeconds: number;
  readonly seconds: number;
  readonly voice: Voice;
  readonly gain: number;
}

function render(notes: readonly Note[]): Float64Array {
  const end = notes.reduce(
    (latest, note) => Math.max(latest, note.startSeconds + note.seconds),
    0,
  );
  const out = new Float64Array(Math.max(1, Math.round(RATE * end)));
  for (const note of notes) {
    const from = Math.round(note.startSeconds * RATE);
    const length = Math.round(note.seconds * RATE);
    for (let at = 0; at < length && from + at < out.length; at += 1) {
      const seconds = at / RATE;
      const angle = 2 * Math.PI * note.hertz * seconds;
      let wave = 0;
      note.voice.harmonics.forEach((amplitude, index) => {
        if (amplitude !== 0) wave += amplitude * Math.sin(angle * (index + 1));
      });
      // A few milliseconds of attack so the start is not a click, and an
      // exponential decay after it.
      const attack = Math.min(1, at / (RATE * 0.004));
      const fade = Math.exp(-note.voice.decay * (at / length) * 3);
      out[from + at] = (out[from + at] ?? 0) + wave * attack * fade * note.gain;
    }
  }
  return out;
}

/** A mono 16-bit PCM WAV, which is what Scratch reads. */
function wav(samples: Float64Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[at + index] = text.charCodeAt(index);
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // uncompressed
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(clamped * 32767), true);
  }
  return bytes;
}

/** Two notes of one voice, rising or falling. */
function pair(
  voice: Voice,
  low: number,
  high: number,
  rising: boolean,
): Note[] {
  const order = rising ? [low, high] : [high, low];
  return order.map((hertz, index) => ({
    hertz,
    startSeconds: index * 0.1,
    seconds: 0.22,
    voice,
    gain: 0.45,
  }));
}

/**
 * The sixteen steps, as sixteen sounds.
 *
 * A calibration is one big achievement made of four gates, and each gate of
 * four steps. Two things have to be heard at once: how far into the gate, and
 * which gate. Counting is not an option -- the operator is holding a board.
 *
 * The chord says the step within the gate. One note, then two, then three,
 * then a different three: the first three grow, so "more notes" reads as
 * "further along" without being taught, and the fourth changes colour rather
 * than growing, so the end of a gate is heard as an arrival rather than as one
 * more of the same.
 *
 *   1  C        2  C E      3  C E G     4  C F A
 *
 * A note in front says which gate: nothing, then C, E, G -- rising, so the
 * same "further along" reading works across gates too.
 *
 * Sixteen sounds, and nothing to memorise: both dimensions are read off the
 * same rule.
 */
const C5 = 523.25;
const E5 = 659.25;
const F5 = 698.46;
const G5 = 783.99;
const A5 = 880;

/** The four chords of a gate, in order. */
const STEP_CHORDS: ReadonlyArray<readonly number[]> = [
  [C5],
  [C5, E5],
  [C5, E5, G5],
  // Not C E G again with another note: a different colour entirely, so
  // finishing a gate does not sound like another step inside it.
  [C5, F5, A5],
];

/** What goes in front, by gate. Nothing for the first: there is no prefix to hear yet. */
const GATE_PREFIXES: ReadonlyArray<number | undefined> = [
  undefined,
  C5,
  E5,
  G5,
];

export function stepSoundName(step: number): string {
  return `step-${step}`;
}

function stepNotes(gate: number, within: number): Note[] {
  const prefix = GATE_PREFIXES[gate];
  const chord = STEP_CHORDS[within] ?? [C5];
  const chordStart = prefix === undefined ? 0 : 0.17;
  return [
    ...(prefix === undefined
      ? []
      : [
          {
            hertz: prefix,
            startSeconds: 0,
            seconds: 0.15,
            voice: SOFT,
            gain: 0.3,
          },
        ]),
    ...chord.map((hertz) => ({
      hertz,
      startSeconds: chordStart,
      seconds: 0.34,
      voice: SOFT,
      // Shared out, so three notes together are not three times as loud as one.
      gain: 0.42 / Math.sqrt(chord.length),
    })),
  ];
}

export interface GeneratedSound {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly rate: number;
  readonly sampleCount: number;
}

function sound(name: string, notes: readonly Note[]): GeneratedSound {
  const bytes = wav(render(notes));
  return { name, bytes, rate: RATE, sampleCount: (bytes.length - 44) / 2 };
}

/** The name a direction's cue is stored under, matching the extension's own. */
export const DIRECTION_SOUNDS: Readonly<Record<string, string>> = Object.freeze(
  {
    'top-near': 'turn-top-near',
    'top-far': 'turn-top-far',
    'left-near': 'turn-left-near',
    'right-near': 'turn-right-near',
  },
);

export const CLICK_SOUND = 'click';
export const SOLVED_SOUND = 'solved';

export function sounds(): readonly GeneratedSound[] {
  const steps: GeneratedSound[] = [];
  for (let gate = 0; gate < GATE_PREFIXES.length; gate += 1) {
    for (let within = 0; within < STEP_CHORDS.length; within += 1) {
      const step = gate * STEP_CHORDS.length + within + 1;
      steps.push(sound(stepSoundName(step), stepNotes(gate, within)));
    }
  }
  return [
    ...steps,
    // C5, E5, G5, C6: the shortest phrase that sounds finished rather than cut
    // off. Nothing else here is a phrase, so it cannot be mistaken for a cue.
    sound(
      SOLVED_SOUND,
      [523.25, 659.25, 783.99, 1046.5].map((hertz, index) => ({
        hertz,
        startSeconds: index * 0.11,
        seconds: 0.39,
        voice: SOFT,
        gain: 0.3,
      })),
    ),
    // Twelve milliseconds. Played as often as several times a second, so it
    // has to end before the next one starts.
    sound(CLICK_SOUND, [
      { hertz: 1760, startSeconds: 0, seconds: 0.012, voice: TICK, gain: 0.35 },
    ]),
    // Soft: the front-to-back axis. Rising brings the top toward you.
    sound(DIRECTION_SOUNDS['top-near'] ?? '', pair(SOFT, 587.33, 880, true)),
    sound(DIRECTION_SOUNDS['top-far'] ?? '', pair(SOFT, 587.33, 880, false)),
    // Reedy: the left-to-right axis. Rising brings the left edge toward you.
    sound(
      DIRECTION_SOUNDS['left-near'] ?? '',
      pair(REEDY, 493.88, 739.99, true),
    ),
    sound(
      DIRECTION_SOUNDS['right-near'] ?? '',
      pair(REEDY, 493.88, 739.99, false),
    ),
  ];
}
