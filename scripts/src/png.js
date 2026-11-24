// Reads and writes the kind of PNG the extension's icons are: 8 bits per
// channel, not interlaced, RGBA or gray with alpha. Enough for the dev copy's
// marked icons (dev-icon.js) without an image package; any other PNG throws.
import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// Channels per pixel by color type: 4 is gray with alpha, 6 is RGBA.
const CHANNELS = { 4: 2, 6: 4 };

const paeth = (left, up, upLeft) => {
  const guess = left + up - upLeft;
  const toLeft = Math.abs(guess - left);
  const toUp = Math.abs(guess - up);
  const toUpLeft = Math.abs(guess - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
};

// Undoes each row's filter (PNG spec, section 9) in place of a copy.
const unfilter = (raw, width, height, channels) => {
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[row + x - channels] : 0;
      const up = y > 0 ? out[row - stride + x] : 0;
      const upLeft = x >= channels && y > 0
        ? out[row - stride + x - channels]
        : 0;
      const predictor = filter === 0
        ? 0
        : filter === 1
        ? left
        : filter === 2
        ? up
        : filter === 3
        ? (left + up) >> 1
        : filter === 4
        ? paeth(left, up, upLeft)
        : NaN;
      if (Number.isNaN(predictor)) throw new Error(`bad PNG filter ${filter}`);
      out[row + x] = (raw[line + x] + predictor) & 255;
    }
  }
  return out;
};

// { width, height, pixels }: pixels is RGBA, 4 bytes a pixel, row by row.
export const readPng = (buffer) => {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let header;
  const data = [];
  for (let at = 8; at < buffer.length;) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString("latin1", at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        color: body[9],
        interlace: body[12],
      };
    } else if (type === "IDAT") data.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  const { width, height, depth, color, interlace } = header;
  const channels = CHANNELS[color];
  if (depth !== 8 || !channels || interlace !== 0) {
    throw new Error(
      `unsupported PNG: depth ${depth}, color type ${color}, interlace ${interlace}`,
    );
  }
  const samples = unfilter(
    inflateSync(Buffer.concat(data)),
    width,
    height,
    channels,
  );
  if (channels === 4) return { width, height, pixels: samples };
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels.fill(samples[i * 2], i * 4, i * 4 + 3);
    pixels[i * 4 + 3] = samples[i * 2 + 1];
  }
  return { width, height, pixels };
};

const chunk = (type, body) => {
  const typed = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const out = Buffer.alloc(typed.length + 8);
  out.writeUInt32BE(body.length, 0);
  typed.copy(out, 4);
  out.writeUInt32BE(crc32(typed), typed.length + 4);
  return out;
};

// An RGBA PNG tagged sRGB, every row unfiltered.
export const writePng = ({ width, height, pixels }) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4;
  const rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    rows.set(
      pixels.subarray(y * stride, (y + 1) * stride),
      y * (stride + 1) + 1,
    );
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("sRGB", Buffer.from([0])),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
