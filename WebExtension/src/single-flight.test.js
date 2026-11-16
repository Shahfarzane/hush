import assert from "node:assert/strict";
import { test } from "node:test";
import { singleFlight } from "./single-flight.js";

test("Overlapping calls share one run, later calls start another", async () => {
  let runs = 0;
  let finish;
  const read = singleFlight(() => {
    runs += 1;
    return new Promise((resolve) => (finish = resolve));
  });

  const overlapping = Array.from({ length: 5 }, () => read());
  finish("settings");
  assert.deepEqual(await Promise.all(overlapping), Array(5).fill("settings"));
  assert.deepEqual(runs, 1);

  const later = read();
  finish("newer");
  assert.deepEqual(await later, "newer");
  assert.deepEqual(runs, 2);
});

test("A failed run lets the next call try again", async () => {
  let runs = 0;
  const read = singleFlight(() => {
    runs += 1;
    return runs === 1
      ? Promise.reject(new Error("no host"))
      : Promise.resolve("settings");
  });

  await read().catch(() => {});
  assert.deepEqual(await read(), "settings");
  assert.deepEqual(runs, 2);
});
