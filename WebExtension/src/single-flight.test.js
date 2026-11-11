import { assertEquals } from "jsr:@std/assert@1";
import { singleFlight } from "./single-flight.js";

Deno.test("Overlapping calls share one run, later calls start another", async () => {
  let runs = 0;
  let finish;
  const read = singleFlight(() => {
    runs += 1;
    return new Promise((resolve) => (finish = resolve));
  });

  const overlapping = Array.from({ length: 5 }, () => read());
  finish("settings");
  assertEquals(await Promise.all(overlapping), Array(5).fill("settings"));
  assertEquals(runs, 1);

  const later = read();
  finish("newer");
  assertEquals(await later, "newer");
  assertEquals(runs, 2);
});

Deno.test("A failed run lets the next call try again", async () => {
  let runs = 0;
  const read = singleFlight(() => {
    runs += 1;
    return runs === 1
      ? Promise.reject(new Error("no host"))
      : Promise.resolve("settings");
  });

  await read().catch(() => {});
  assertEquals(await read(), "settings");
  assertEquals(runs, 2);
});
