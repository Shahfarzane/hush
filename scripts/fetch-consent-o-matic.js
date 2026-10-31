// Vendors the Consent-O-Matic engine and rules at one pinned commit, so the
// engine code and the rules it interprets always match.
const REPO = "cavi-au/Consent-O-Matic";
const REF = "8ca8500d26434c586039e126ad091e1bfccd205d";

const ENGINE_FILES = [
  "Action.js",
  "CMP.js",
  "Consent.js",
  "ConsentEngine.js",
  "Detector.js",
  "Matcher.js",
  "Tools.js",
];

const resolveRelative = (path) => new URL(path, import.meta.url).pathname;

const ENGINE_DIR = resolveRelative("../WebExtension/vendor/consent-o-matic");
const RULES_DESTINATION = resolveRelative(
  "../data/vendor/consent-o-matic-rules.json",
);

const raw = (path) =>
  `https://raw.githubusercontent.com/${REPO}/${REF}/${path}`;

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetching ${url} failed with status ${response.status}`);
  }
  return response.text();
};

await Deno.mkdir(ENGINE_DIR, { recursive: true });
await Promise.all(
  [...ENGINE_FILES.map((file) => `Extension/${file}`), "LICENSE"].map(
    async (path) => {
      const destination = `${ENGINE_DIR}/${path.split("/").pop()}`;
      await Deno.writeTextFile(destination, await fetchText(raw(path)));
    },
  ),
);
await Deno.writeTextFile(
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
await Deno.writeTextFile(RULES_DESTINATION, JSON.stringify(rules, null, 2));
console.info(
  `Saved ${
    Object.keys(rules).length
  } CMP rules from ${ruleFiles.length} files to ${RULES_DESTINATION}`,
);
