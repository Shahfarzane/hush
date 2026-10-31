// Answer mode keeps the consent platforms Hush answers visible to the Safari
// web extension: block and hide rules that mention one of their markers are
// dropped. Exception rules only ever unblock or unhide, so they always stay.

const isComment = (line) => line.startsWith("!");
const isException = (line) => line.startsWith("@@") || line.includes("#@#");

export const parseMarkers = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isComment(line))
    .map((marker) => marker.toLowerCase());

// Hide rules are matched on their selector only, so a site list in front of
// "##" (such as "cookiebot.com##.some-widget") does not count.
export const isAnswerModeExcluded = (line, markers) => {
  if (!line || isComment(line) || isException(line)) return false;
  const hide = line.indexOf("##");
  const target = (hide === -1 ? line : line.slice(hide + 2)).toLowerCase();
  return markers.some((marker) => target.includes(marker));
};

export const stripAnswerModeExclusions = (text, markers) =>
  text
    .split("\n")
    .filter((line) => !isAnswerModeExcluded(line.trim(), markers))
    .join("\n");
