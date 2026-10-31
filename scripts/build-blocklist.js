import { convert } from "./src/convert.js";
import { parseMarkers, stripAnswerModeExclusions } from "./src/answer-mode.js";

const LISTS = [
  "../data/vendor/fanboy-cookiemonster.txt",
  "../data/generic.txt",
  "../data/third-party.txt",
  "../data/site-specific.txt",
];

const IGNORE_LIST = "../data/ignored.txt";
const ANSWER_MODE_EXCLUSIONS = "../data/answer-mode-exclusions.txt";

// --answer-mode leaves out the platforms the Safari web extension answers.
const answerMode = Deno.args.includes("--answer-mode");

const stringify = (data) =>
  Deno.env.get("MINIFY") ? JSON.stringify(data) : JSON.stringify(data, null, 2);

const resolveRelative = (path) => new URL(path, import.meta.url).pathname;

const readTextFile = (path) =>
  new TextDecoder("utf-8").decode(Deno.readFileSync(path));

const decoder = new TextDecoder("utf-8");

const IGNORED = readTextFile(resolveRelative(IGNORE_LIST)).split("\n");

const stripIgnored = (string) =>
  string.split("\n").filter((rule) => !IGNORED.includes(rule)).join("\n");

const answerModeMarkers = answerMode
  ? parseMarkers(readTextFile(resolveRelative(ANSWER_MODE_EXCLUSIONS)))
  : [];

const converted = LISTS
  .map(resolveRelative)
  .map(readTextFile)
  .map(stripIgnored)
  .map((text) => stripAnswerModeExclusions(text, answerModeMarkers))
  .map(convert)
  .flat();

console.log(stringify(converted));
