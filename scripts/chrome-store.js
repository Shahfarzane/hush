// Turns a Chrome build into the Chrome Web Store upload, in place:
// chrome-store.js <extension dir> <build number>. Drops the manifest's `key`,
// sets the version to <Safari version>.<build number>, and prints it (it
// names the zip). Stops, before anything is written, when the build carries
// any mark of the dev copy (devMarks), so the store never gets "(dev)".
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { devMarks, storeManifest } from "./src/chrome.js";

const [extensionDir, build] = process.argv.slice(2);
const path = `${extensionDir}/manifest.json`;
const built = JSON.parse(readFileSync(path, "utf8"));
const repo = new URL("../WebExtension/", import.meta.url);
const safari = JSON.parse(readFileSync(new URL("manifest.json", repo), "utf8"));
const marks = devMarks(built, safari, (icon) => {
  const original = new URL(icon, repo);
  return existsSync(original) &&
    readFileSync(`${extensionDir}/${icon}`).equals(readFileSync(original));
});
if (marks.length > 0) {
  throw new Error(
    `${extensionDir} is the dev copy, not a store build: ${marks.join(", ")}`,
  );
}
const manifest = storeManifest(built, Number(build));
writeFileSync(path, JSON.stringify(manifest, null, 2));
console.log(manifest.version);
