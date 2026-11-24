import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DOT_COLOR, markIcon } from "./dev-icon.js";
import { readPng } from "./png.js";

const repoIcon = (name) =>
  readPng(
    readFileSync(new URL(`../../WebExtension/images/${name}`, import.meta.url)),
  );
const pixel = ({ width, pixels }, x, y) => [
  ...pixels.subarray((y * width + x) * 4, (y * width + x + 1) * 4),
];

for (const name of ["toolbar-16.png", "toolbar-32.png", "icon-128.png"]) {
  test(`${name}: a blue dot on the bottom right, the rest untouched`, () => {
    const icon = repoIcon(name);
    const before = Uint8Array.from(icon.pixels);
    const marked = markIcon(icon);
    assert.deepEqual(icon.pixels, before);
    assert.deepEqual([marked.width, marked.height], [icon.width, icon.height]);
    const size = icon.width;
    // Inside the dot, a little in from the corner.
    const inDot = Math.round(size * 0.82);
    assert.deepEqual(pixel(marked, inDot, inDot), [...DOT_COLOR, 255]);
    // The top half, eyes included, keeps every pixel.
    const half = size * size * 2;
    assert.deepEqual(
      marked.pixels.subarray(0, half),
      icon.pixels.subarray(0, half),
    );
  });
}

test("An icon that draws nothing cannot be marked", () => {
  assert.throws(
    () => markIcon({ width: 2, height: 2, pixels: new Uint8Array(16) }),
    { message: /draws nothing/ },
  );
});
