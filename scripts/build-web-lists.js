// Writes the lists the Safari web extension loads in place of a content
// blocker: build-web-lists.js <extension dir> <per-site JSON path>.
import { buildWebLists } from "./src/web-lists.js";
import { parseMarkers } from "./src/answer-mode.js";

const LISTS = [
  "../data/vendor/fanboy-cookiemonster.txt",
  "../data/generic.txt",
  "../data/third-party.txt",
  "../data/site-specific.txt",
];
const IGNORE_LIST = "../data/ignored.txt";
const ANSWER_MODE_EXCLUSIONS = "../data/answer-mode-exclusions.txt";

const [extensionDir, perSitePath] = Deno.args;
const resolveRelative = (path) => new URL(path, import.meta.url).pathname;
const read = (path) => Deno.readTextFileSync(resolveRelative(path));

const ignored = new Set(read(IGNORE_LIST).split("\n"));
const text = LISTS.map(read).join("\n").split("\n")
  .filter((line) => !ignored.has(line)).join("\n");
const lists = buildWebLists(text, parseMarkers(read(ANSWER_MODE_EXCLUSIONS)));

Deno.mkdirSync(`${extensionDir}/rules`, { recursive: true });
Deno.writeTextFileSync(
  `${extensionDir}/rules/block-answer.json`,
  JSON.stringify(lists.rules.answer),
);
Deno.writeTextFileSync(
  `${extensionDir}/rules/block-hide-only.json`,
  JSON.stringify(lists.rules.hideOnly),
);
Deno.writeTextFileSync(`${extensionDir}/hide.css`, lists.css);
Deno.writeTextFileSync(perSitePath, JSON.stringify(lists.perSite));
console.error(
  `rules: ${lists.rules.answer.length} + ${lists.rules.hideOnly.length} hide-only, ` +
    `generic CSS: ${lists.css.length} bytes, per-site: ${
      Object.keys(lists.perSite.sites).length
    } domains, generic hide off: ${lists.genericHideOff.join(", ")}`,
);
