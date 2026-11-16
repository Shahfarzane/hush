// The engine versions Hush vendors, kept in data/vendor/pins.json so a rule
// refresh shows up as a one-line diff. `--latest` on a fetch script moves
// its pin to the newest release before fetching.
import { readFile, writeFile } from "node:fs/promises";

const PINS = new URL("../../data/vendor/pins.json", import.meta.url);

export const wantsLatest = (args) => args.includes("--latest");

export const readPin = async (name) =>
  JSON.parse(await readFile(PINS, "utf8"))[name];

export const writePin = async (name, value) => {
  const pins = JSON.parse(await readFile(PINS, "utf8"));
  pins[name] = value;
  await writeFile(PINS, JSON.stringify(pins, null, 2) + "\n");
};
