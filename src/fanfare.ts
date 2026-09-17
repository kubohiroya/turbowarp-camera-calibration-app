// SPDX-License-Identifier: MPL-2.0
/**
 * The sound a finished calibration makes.
 *
 * Generated rather than shipped as a file, because a recording is bytes nobody
 * in this repository can review: a reader can see what this plays by reading
 * the notes, and a reviewer can see that it is not something else.
 *
 * It exists because the operator is not looking at the screen. They are
 * holding a board at arm's length and moving it, which is the one posture in
 * which a message appearing somewhere is the least likely thing to be noticed.
 */

const RATE = 22050;
/** C5, E5, G5, C6: the shortest phrase that sounds finished rather than cut off. */
const NOTES = [523.25, 659.25, 783.99, 1046.5];
const NOTE_SECONDS = 0.11;
const TAIL_SECONDS = 0.28;

function envelope(position: number, length: number): number {
  // A few milliseconds of attack, so the start is not a click, and a decay
  // over the rest.
  const attack = Math.min(1, position / (RATE * 0.005));
  const decay = (1 - position / length) ** 1.6;
  return attack * decay;
}

/** The samples, as signed 16-bit values in [-1, 1] before scaling. */
function samples(): Float64Array {
  const perNote = Math.round(RATE * NOTE_SECONDS);
  const total = perNote * (NOTES.length - 1) + Math.round(RATE * TAIL_SECONDS);
  const out = new Float64Array(total);
  NOTES.forEach((frequency, index) => {
    const start = perNote * index;
    const length = total - start;
    for (let at = 0; at < length; at += 1) {
      const seconds = at / RATE;
      const angle = 2 * Math.PI * frequency * seconds;
      // A third harmonic at a fifth of the amplitude: enough to carry over a
      // room with a camera and a person in it, without sounding like an alarm.
      const wave = Math.sin(angle) + 0.2 * Math.sin(3 * angle);
      out[start + at] += (wave * envelope(at, length)) / NOTES.length;
    }
  });
  return out;
}

/** A mono 16-bit PCM WAV, which is what Scratch reads. */
export function fanfareWav(): Uint8Array {
  const data = samples();
  const bytes = new Uint8Array(44 + data.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[at + index] = text.charCodeAt(index);
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + data.length * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // uncompressed
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, data.length * 2, true);
  for (let index = 0; index < data.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, data[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(clamped * 32767), true);
  }
  return bytes;
}

export const fanfareName = 'solved';
export const fanfareRate = RATE;
/** Frames, which is what Scratch means by a sound's sample count. */
export function fanfareSampleCount(): number {
  return (fanfareWav().length - 44) / 2;
}
