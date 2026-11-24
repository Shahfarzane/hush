import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readPng, writePng } from "./png.js";

const repoIcon = (name) =>
  readPng(
    readFileSync(new URL(`../../WebExtension/images/${name}`, import.meta.url)),
  );

test("An RGBA image comes back from writePng as it went in", () => {
  const image = {
    width: 3,
    height: 2,
    pixels: Uint8Array.from({ length: 24 }, (_, i) => (i * 37) % 256),
  };
  assert.deepEqual(readPng(writePng(image)), image);
});

test("The repo's RGBA and gray icons read at their own sizes", () => {
  const tile = repoIcon("icon-128.png");
  assert.deepEqual([tile.width, tile.height], [128, 128]);
  assert.deepEqual(tile.pixels.length, 128 * 128 * 4);
  const glyph = repoIcon("toolbar-16.png");
  assert.deepEqual([glyph.width, glyph.height], [16, 16]);
  // Gray with alpha: every pixel's red, green and blue are its gray.
  for (let i = 0; i < 16 * 16 * 4; i += 4) {
    assert.deepEqual(glyph.pixels[i], glyph.pixels[i + 1]);
    assert.deepEqual(glyph.pixels[i], glyph.pixels[i + 2]);
  }
  // The corner is clear and the tape across the middle is drawn.
  assert.deepEqual(glyph.pixels[3], 0);
  assert.ok(glyph.pixels[(8 * 16 + 8) * 4 + 3] > 191);
});

test("A PNG it cannot read stops with the reason", () => {
  assert.throws(() => readPng(Buffer.from("GIF89a")), { message: "not a PNG" });
  const png = writePng({ width: 1, height: 1, pixels: new Uint8Array(4) });
  png[8 + 8 + 9] = 2; // IHDR color type: RGB without alpha
  assert.throws(() => readPng(png), { message: /color type 2/ });
});
