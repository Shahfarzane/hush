// Vendors the Consent-O-Matic engine and rules at one pinned commit, so the
// engine code and the rules it interprets always match. `--latest` first
// moves the pin to the newest commit on its default branch.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchJson, fetchText } from "./src/fetch.js";
import { readPin, wantsLatest, writePin } from "./src/pins.js";

const REPO = "cavi-au/Consent-O-Matic";

if (wantsLatest(process.argv.slice(2))) {
  const [latest] = await fetchJson(
    `https://api.github.com/repos/${REPO}/commits?per_page=1`,
  );
  await writePin("consent-o-matic", latest.sha);
}
const REF = await readPin("consent-o-matic");

const ENGINE_FILES = [
  "Action.js",
  "CMP.js",
  "Consent.js",
  "ConsentEngine.js",
  "Detector.js",
  "Matcher.js",
  "Tools.js",
];

const resolveRelative = (path) => fileURLToPath(new URL(path, import.meta.url));

const ENGINE_DIR = resolveRelative("../WebExtension/vendor/consent-o-matic");
const RULES_DESTINATION = resolveRelative(
  "../data/vendor/consent-o-matic-rules.json",
);

const raw = (path) =>
  `https://raw.githubusercontent.com/${REPO}/${REF}/${path}`;

await mkdir(ENGINE_DIR, { recursive: true });
await Promise.all(
  [...ENGINE_FILES.map((file) => `Extension/${file}`), "LICENSE"].map(
    async (path) => {
      const destination = `${ENGINE_DIR}/${path.split("/").pop()}`;
      await writeFile(destination, await fetchText(raw(path)));
    },
  ),
);
await writeFile(
  `${ENGINE_DIR}/SOURCE`,
  `https://github.com/${REPO}/tree/${REF}\n`,
);
console.info(`Saved engine at ${REF} to ${ENGINE_DIR}`);

// rules-list.json references rule files on master; read them at REF instead.
const { references } = JSON.parse(await fetchText(raw("rules-list.json")));
const ruleFiles = references.map((url) => `rules/${url.split("/").pop()}`);
const rules = {};
for (const path of ruleFiles) {
  const { $schema: _, ...cmps } = JSON.parse(await fetchText(raw(path)));
  Object.assign(rules, cmps);
}
await writeFile(RULES_DESTINATION, JSON.stringify(rules, null, 2));
console.info(
  `Saved ${
    Object.keys(rules).length
  } CMP rules from ${ruleFiles.length} files to ${RULES_DESTINATION}`,
);
