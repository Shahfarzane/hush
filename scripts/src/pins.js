// The engine versions Hush vendors, kept in data/vendor/pins.json so a rule
// refresh shows up as a one-line diff. `--latest` on a fetch script moves
// its pin to the newest release before fetching.
const PINS = new URL("../../data/vendor/pins.json", import.meta.url).pathname;

export const wantsLatest = (args) => args.includes("--latest");

export const readPin = async (name) =>
  JSON.parse(await Deno.readTextFile(PINS))[name];

export const writePin = async (name, value) => {
  const pins = JSON.parse(await Deno.readTextFile(PINS));
  pins[name] = value;
  await Deno.writeTextFile(PINS, JSON.stringify(pins, null, 2) + "\n");
};

export const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetching ${url} failed with status ${response.status}`);
  }
  return response.json();
};
