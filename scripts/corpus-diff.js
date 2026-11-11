// Compares two corpus runs (build/corpus-results.json from before and after a
// rule refresh) and prints Markdown for the refresh pull request: the count
// per status and every site whose result changed. Both runs come from the
// same machine, so sites a bot wall stops show up the same way in both.
const [beforePath, afterPath] = Deno.args;
const read = async (path) => JSON.parse(await Deno.readTextFile(path));
const before = await read(beforePath);
const after = await read(afterPath);

const STATUSES = [
  "pass",
  "stricter",
  "no-readback",
  "unanswered",
  "wrong",
  "regressed",
  "error",
];
const counts = (results) =>
  STATUSES.map((status) =>
    `${results.filter((result) => result.status === status).length} ${status}`
  ).join(", ");
const describe = (result) =>
  result ? `${result.status}${result.cmp ? ` (${result.cmp})` : ""}` : "-";

const previous = new Map(before.map((result) => [result.name, result]));
const changed = after.filter((result) =>
  describe(previous.get(result.name)) !== describe(result)
);
const wrong = after.filter((result) => result.status === "wrong");

console.log(`Corpus before: ${counts(before)}`);
console.log(`Corpus after: ${counts(after)}`);
if (wrong.length) {
  console.log(
    `\nStores consent the level did not grant: ${
      wrong.map((result) => result.name).join(", ")
    }`,
  );
}
if (!changed.length) {
  console.log("\nNo site changed.");
} else {
  console.log("\n| Site | Before | After |\n|---|---|---|");
  for (const result of changed) {
    console.log(
      `| ${result.name} | ${describe(previous.get(result.name))} | ${
        describe(result)
      } |`,
    );
  }
}
