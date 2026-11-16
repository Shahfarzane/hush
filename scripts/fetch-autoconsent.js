// Vendors DuckDuckGo's autoconsent (MPL-2.0) at one pinned release, unmodified:
// the library bundle, its licence and its rules. `--latest` first moves the
// pin to npm's latest release.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchJson, fetchText } from "./src/fetch.js";
import { readPin, wantsLatest, writePin } from "./src/pins.js";

const PACKAGE = "@duckduckgo/autoconsent";

if (wantsLatest(process.argv.slice(2))) {
  const { "dist-tags": tags } = await fetchJson(
    `https://registry.npmjs.org/${PACKAGE}`,
  );
  await writePin("autoconsent", tags.latest);
}
const VERSION = await readPin("autoconsent");

const resolveRelative = (path) => fileURLToPath(new URL(path, import.meta.url));

const FILES = {
  "dist/autoconsent.esm.js":
    "../WebExtension/vendor/autoconsent/autoconsent.esm.js",
  "LICENSE": "../WebExtension/vendor/autoconsent/LICENSE",
  "rules/rules.json": "../data/vendor/autoconsent-rules.json",
};

await mkdir(resolveRelative("../WebExtension/vendor/autoconsent"), {
  recursive: true,
});
await Promise.all(
  Object.entries(FILES).map(async ([path, destination]) => {
    const url = `https://cdn.jsdelivr.net/npm/${PACKAGE}@${VERSION}/${path}`;
    await writeFile(
      resolveRelative(destination),
      await fetchText(url),
    );
    console.info(`Saved ${url} to ${resolveRelative(destination)}`);
  }),
);
await writeFile(
  resolveRelative("../WebExtension/vendor/autoconsent/SOURCE"),
  `https://www.npmjs.com/package/${PACKAGE}/v/${VERSION}\n`,
);
