// The dev copy's mark on an icon: a blue dot on the bottom right corner of
// what the icon draws, set apart from it by a clear ring, so the unpacked dev
// copy's toolbar button and card are told apart from the store item's at a
// glance. Everything else keeps the icon's own shapes and colors.

// Apple's system blue: apart from the icons' yellow and black, and readable
// on a light or a dark toolbar.
export const DOT_COLOR = [10, 132, 255];
// The dot's radius and the clear ring around it, as shares of the longer side
// of what the icon draws (its transparent margin left out).
const DOT = 0.19;
const RING = 0.06;
// Samples per pixel side, for smooth edges at 16 pixels.
const SAMPLES = 4;

// The box around the pixels that are at least half opaque.
const drawnBox = ({ width, height, pixels }) => {
  const box = { left: width, top: height, right: 0, bottom: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 128) continue;
      box.left = Math.min(box.left, x);
      box.top = Math.min(box.top, y);
      box.right = Math.max(box.right, x + 1);
      box.bottom = Math.max(box.bottom, y + 1);
    }
  }
  if (box.right === 0) throw new Error("the icon draws nothing to mark");
  return box;
};

// The share of the pixel at (x, y) inside a circle around (cx, cy).
const coverage = (x, y, cx, cy, radius) => {
  let inside = 0;
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const dx = x + (sx + 0.5) / SAMPLES - cx;
      const dy = y + (sy + 0.5) / SAMPLES - cy;
      if (dx * dx + dy * dy <= radius * radius) inside++;
    }
  }
  return inside / (SAMPLES * SAMPLES);
};

// A copy of { width, height, pixels } (RGBA) with the mark drawn on it.
export const markIcon = (image) => {
  const { width, height, pixels } = image;
  const box = drawnBox(image);
  const side = Math.max(box.right - box.left, box.bottom - box.top);
  const dot = side * DOT;
  const ring = dot + Math.max(side * RING, 1);
  // Hanging a little past the drawing's corner where the canvas has room.
  const cx = Math.min(box.right - dot * 0.7, width - dot);
  const cy = Math.min(box.bottom - dot * 0.7, height - dot);
  const out = Uint8Array.from(pixels);
  for (let y = Math.floor(cy - ring); y < Math.ceil(cy + ring); y++) {
    for (let x = Math.floor(cx - ring); x < Math.ceil(cx + ring); x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const cut = coverage(x, y, cx, cy, ring);
      if (cut === 0) continue;
      const fill = coverage(x, y, cx, cy, dot);
      const i = (y * width + x) * 4;
      // The icon with the ring cut out, then the dot over it.
      const under = pixels[i + 3] / 255 * (1 - cut);
      const alpha = fill + under * (1 - fill);
      for (let c = 0; c < 3; c++) {
        out[i + c] = alpha === 0 ? 0 : Math.round(
          (DOT_COLOR[c] * fill + pixels[i + c] * under * (1 - fill)) / alpha,
        );
      }
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return { width, height, pixels: out };
};
