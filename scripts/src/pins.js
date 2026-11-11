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

// GitHub's API allows 60 anonymous requests an hour per IP, which runners
// share, so a GITHUB_TOKEN in the environment goes along when there is one.
export const fetchJson = async (url) => {
  const token = url.startsWith("https://api.github.com/") &&
    Deno.env.get("GITHUB_TOKEN");
  const response = await fetch(
    url,
    token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  );
  if (!response.ok) {
    throw new Error(`Fetching ${url} failed with status ${response.status}`);
  }
  return response.json();
};
