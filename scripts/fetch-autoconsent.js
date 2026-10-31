// Vendors DuckDuckGo's autoconsent (MPL-2.0) at one pinned release, unmodified:
// the library bundle, its licence and its rules.
const PACKAGE = "@duckduckgo/autoconsent";
const VERSION = "17.2.0";

const resolveRelative = (path) => new URL(path, import.meta.url).pathname;

const FILES = {
  "dist/autoconsent.esm.js":
    "../WebExtension/vendor/autoconsent/autoconsent.esm.js",
  "LICENSE": "../WebExtension/vendor/autoconsent/LICENSE",
  "rules/rules.json": "../data/vendor/autoconsent-rules.json",
};

await Deno.mkdir(resolveRelative("../WebExtension/vendor/autoconsent"), {
  recursive: true,
});
await Promise.all(
  Object.entries(FILES).map(async ([path, destination]) => {
    const url = `https://cdn.jsdelivr.net/npm/${PACKAGE}@${VERSION}/${path}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetching ${url} failed with status ${response.status}`);
    }
    await Deno.writeTextFile(
      resolveRelative(destination),
      await response.text(),
    );
    console.info(`Saved ${url} to ${resolveRelative(destination)}`);
  }),
);
await Deno.writeTextFile(
  resolveRelative("../WebExtension/vendor/autoconsent/SOURCE"),
  `https://www.npmjs.com/package/${PACKAGE}/v/${VERSION}\n`,
);
