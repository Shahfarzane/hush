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

const cases = [
  ["toolbar-16.png", "bottom"],
  ["toolbar-32.png", "bottom"],
  ["icon-48.png", "top"],
  ["icon-128.png", "top"],
];
for (const [name, corner] of cases) {
  test(`${name}: a blue dot ${corner} right, the other half untouched`, () => {
    const icon = repoIcon(name);
    const before = Uint8Array.from(icon.pixels);
    const marked = markIcon(icon, corner);
    assert.deepEqual(icon.pixels, before);
    assert.deepEqual([marked.width, marked.height], [icon.width, icon.height]);
    const size = icon.width;
    // Inside the dot, a little in from the corner.
    const x = Math.round(size * 0.82);
    const y = corner === "top" ? Math.round(size * 0.18) : x;
    assert.deepEqual(pixel(marked, x, y), [...DOT_COLOR, 255]);
    // The half away from the dot keeps every pixel.
    const half = size * size * 2;
    const [start, end] = corner === "top" ? [half, half * 2] : [0, half];
    assert.deepEqual(
      marked.pixels.subarray(start, end),
      icon.pixels.subarray(start, end),
    );
    assert.notDeepEqual(marked.pixels, icon.pixels);
  });
}

test("An icon that draws nothing cannot be marked", () => {
  assert.throws(
    () => markIcon({ width: 2, height: 2, pixels: new Uint8Array(16) }, "top"),
    { message: /draws nothing/ },
  );
});

test("The mark goes top or bottom right only", () => {
  assert.throws(() => markIcon(repoIcon("icon-48.png"), "left"), {
    message: /top or bottom right/,
  });
});
