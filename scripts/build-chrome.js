// Writes Chrome's manifest into an extension built by `make extension`:
// build-chrome.js <extension dir> dev <commit> | store.
// dev makes it the unpacked dev copy: devManifest's name and version_name,
// and the mark from dev-icon.js on every icon the manifest names. store leaves
// it as the Chrome Web Store item ships; chrome-store.js finishes the upload.
import { readFileSync, writeFileSync } from "node:fs";
import { chromeManifest, devManifest, iconPaths } from "./src/chrome.js";
import { markIcon } from "./src/dev-icon.js";
import { readPng, writePng } from "./src/png.js";

const [extensionDir, copy, commit] = process.argv.slice(2);
if (copy !== "dev" && copy !== "store") {
  throw new Error(`build-chrome.js: the copy is dev or store, not "${copy}"`);
}
const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

let manifest = chromeManifest(
  read("../WebExtension/manifest.json"),
  read("../WebExtension/manifest.chrome.json"),
);
if (copy === "dev") {
  manifest = devManifest(manifest, commit);
  // `make extension` copied the repo's icons in just before, so each is
  // marked once.
  for (const path of iconPaths(manifest)) {
    const file = `${extensionDir}/${path}`;
    writeFileSync(file, writePng(markIcon(readPng(readFileSync(file)))));
  }
}
writeFileSync(
  `${extensionDir}/manifest.json`,
  JSON.stringify(manifest, null, 2),
);
