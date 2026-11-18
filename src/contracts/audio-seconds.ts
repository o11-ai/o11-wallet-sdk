/**
 * Playback length of a WAV or MP3 file, read the way a decoder plays it. A price settles on this number and the file
 * comes from the caller, so anything a decoder would read differently, or that cannot be read in full, has no length.
 */
export function audioSeconds(bytes: Uint8Array, contentType: string): number | undefined {
  const seconds = contentType === "audio/wav" ? wavSeconds(bytes) : contentType === "audio/mpeg" ? mp3Seconds(bytes) : undefined;
  return seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
/** Bytes allowed after the last MP3 frame: an ID3v1, Lyrics3 or APE tag. */
const TRAILER_BYTES = 8 * 1024;
/** Bytes allowed between a leading ID3v2 tag and the first MP3 frame. */
const LEAD_BYTES = 4 * 1024;

/** Uncompressed PCM only: its length is the data size over the frame rate a decoder uses, never the header's byte rate. */
function wavSeconds(bytes: Uint8Array) {
  if (bytes.byteLength < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let frameRate = 0;
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const id = ascii(bytes, at, 4), size = view.getUint32(at + 4, true), start = at + 8;
    if (id === "fmt ") {
      if (start + 16 > bytes.byteLength) return;
      const format = view.getUint16(start, true), channels = view.getUint16(start + 2, true), sampleRate = view.getUint32(start + 4, true);
      const byteRate = view.getUint32(start + 8, true), blockAlign = view.getUint16(start + 12, true), bits = view.getUint16(start + 14, true);
      // 1 is integer PCM, 3 float PCM, 0xFFFE the extensible form of either.
      if (![1, 3, 0xfffe].includes(format) || !channels || !sampleRate || !bits || bits % 8) return;
      if (blockAlign !== channels * bits / 8 || byteRate !== sampleRate * blockAlign) return;
      frameRate = sampleRate * blockAlign;
    }
    if (id === "data") {
      if (!frameRate) return;
      // A streamed file may declare no size, or more than it holds: the bytes present are what plays.
      return Math.min(size || Infinity, bytes.byteLength - start) / frameRate;
    }
    at = start + size + (size & 1);
  }
}

// Bitrates in kbit/s by [MPEG-1 or MPEG-2/2.5][layer I, II, III][index]. Index 0 (free format) and 15 cannot be measured.
const bitrates = [
  [[0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]],
  [[0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]],
] as const;
const sampleRates = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as const;

/** Sums every frame, so variable bitrate files measure correctly. Frames must follow one another to the end of the file. */
function mp3Seconds(bytes: Uint8Array) {
  let at = 0;
  if (bytes.byteLength >= 10 && ascii(bytes, 0, 3) === "ID3")
    at = 10 + ((bytes[6]! & 0x7f) << 21 | (bytes[7]! & 0x7f) << 14 | (bytes[8]! & 0x7f) << 7 | (bytes[9]! & 0x7f));
  // The first frame is the first position where two frames follow one another.
  const lead = at + LEAD_BYTES;
  for (;; at += 1) {
    if (at > lead || at + 4 > bytes.byteLength) return;
    const first = mp3Frame(bytes, at);
    if (first && mp3Frame(bytes, at + first.length)) break;
  }
  let seconds = 0;
  while (at + 4 <= bytes.byteLength) {
    const frame = mp3Frame(bytes, at);
    if (!frame) break;
    seconds += frame.samples / frame.sampleRate;
    at += frame.length;
  }
  // Audio hidden behind a gap, or in a form this cannot read, would play without being counted.
  return bytes.byteLength - at <= TRAILER_BYTES ? seconds : undefined;
}

function mp3Frame(bytes: Uint8Array, at: number) {
  if (at + 4 > bytes.byteLength || bytes[at] !== 0xff || (bytes[at + 1]! & 0xe0) !== 0xe0) return;
  const version = (bytes[at + 1]! >> 3) & 3, layerBits = (bytes[at + 1]! >> 1) & 3;
  const bitrateIndex = bytes[at + 2]! >> 4, rateIndex = (bytes[at + 2]! >> 2) & 3, padding = (bytes[at + 2]! >> 1) & 1;
  if (version === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return;
  const layer = 4 - layerBits, mpeg1 = version === 3;
  const bitrate = bitrates[mpeg1 ? 0 : 1][layer - 1]![bitrateIndex]! * 1000;
  const sampleRate = sampleRates[version as 0 | 2 | 3][rateIndex]!;
  const samples = layer === 1 ? 384 : layer === 2 || mpeg1 ? 1152 : 576;
  const length = layer === 1 ? (Math.floor(12 * bitrate / sampleRate) + padding) * 4 : Math.floor(samples / 8 * bitrate / sampleRate) + padding;
  return length >= 4 ? { length, samples, sampleRate } : undefined;
}
