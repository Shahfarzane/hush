// Turns what a consent platform stored after Hush answered its banner into
// Hush categories, so the corpus can compare it with the chosen level. Each
// reader returns only the categories that platform can express, or null when
// nothing was stored.

const cookieValue = (cookies, name) =>
  cookies.find((cookie) => cookie.name === name)?.value;

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const cookiebot = ({ cookies }) => {
  const value = cookieValue(cookies, "CookieConsent");
  if (!value) return null;
  const consent = decode(value);
  const flag = (key) => new RegExp(`${key}:(true|false)`).exec(consent)?.[1];
  if (!flag("preferences")) return null;
  return {
    functional: flag("preferences") === "true",
    performance: flag("statistics") === "true",
    advertising: flag("marketing") === "true",
  };
};

// Names consent platforms give their categories, mapped to Hush categories.
// Advertising is checked first so "Measure ad performance" counts as ads.
const classify = (name) => {
  const text = name.replaceAll("_", " ");
  if (/necessary|essential|required/i.test(text)) return null;
  if (/advertis|targeting|marketing|social|werbung|\bads?\b/i.test(text)) {
    return "advertising";
  }
  if (/performance|analytic|statisti|measure|audience|analyse/i.test(text)) {
    return "performance";
  }
  if (/functional|funktion|preference|präferenz|komfort/i.test(text)) {
    return "functional";
  }
  return null;
};

const merge = (entries) => {
  const result = {};
  for (const [category, consented] of entries) {
    if (category) result[category] = Boolean(result[category]) || consented;
  }
  return Object.keys(result).length ? result : null;
};

// OneTrust stores "groups=C0001:1,C0002:0,...". Sites can rename group ids
// (Spotify uses f00, m00, t00), so classify by the group names the page
// exposes and fall back to the standard C000x ids. Groups marked "always
// active" cannot be refused and are skipped.
const ONETRUST_GROUPS = {
  2: "performance",
  3: "functional",
  4: "advertising",
  5: "advertising",
};
const onetrust = ({ cookies, onetrustGroups }) => {
  const value = cookieValue(cookies, "OptanonConsent");
  const groups = value && /(?:^|&)groups=([^&]*)/.exec(decode(value))?.[1];
  if (!groups) return null;
  const names = onetrustGroups &&
    new Map(
      onetrustGroups
        .filter((group) => group.status !== "always active")
        .map((group) => [group.id, group.name]),
    );
  return merge(
    decode(groups).split(",").map((entry) => {
      const [id, state] = entry.split(":");
      const category = names
        ? names.has(id) ? classify(names.get(id)) : null
        : ONETRUST_GROUPS[Number(id.replace(/^C0*/, ""))];
      return [category, state === "1"];
    }),
  );
};

// IAB TCF has no "functional" purpose. Purposes 2-4 and 7 are advertising,
// 8-9 are measurement and research; purpose 1 (store or access information)
// is "other" in Hush.
const tcf = ({ tcData }) => {
  if (!tcData?.purposes) return null;
  const any = (ids) => ids.some((id) => tcData.purposes[id] === true);
  return {
    advertising: any([2, 3, 4, 7]),
    performance: any([8, 9]),
    other: any([1]),
  };
};

// Usercentrics categories carry a display name ("Functional", "Marketing",
// or site-specific ones such as "Analytics").
const usercentrics = ({ usercentrics }) =>
  usercentrics?.length
    ? merge(usercentrics.map(({ category, status }) => [
      classify(category),
      status === true,
    ]))
    : null;

// "consentid:...,consent:yes,action:yes,necessary:yes,functional:yes,..."
const cookieyes = ({ cookies }) => {
  const value = cookieValue(cookies, "cookieyes-consent");
  if (!value) return null;
  const fields = Object.fromEntries(
    decode(value).split(",").map((field) => field.split(":")),
  );
  if (fields.action !== "yes") return null;
  return {
    functional: fields.functional === "yes",
    performance: fields.analytics === "yes" || fields.performance === "yes",
    advertising: fields.advertisement === "yes",
  };
};

// Complianz always allows cmplz_functional (necessary); preferences is the
// optional functional category.
const complianz = ({ cookies }) => {
  const allowed = (name) => cookieValue(cookies, `cmplz_${name}`);
  if (!allowed("marketing")) return null;
  return {
    functional: allowed("preferences") === "allow",
    performance: allowed("statistics") === "allow",
    advertising: allowed("marketing") === "allow",
  };
};

const borlabs = ({ cookies }) => {
  const value = cookieValue(cookies, "borlabs-cookie");
  if (!value) return null;
  const { consents } = JSON.parse(decode(value));
  return {
    performance: Boolean(consents.statistics?.length),
    advertising: Boolean(consents.marketing?.length),
  };
};

// TrustArc "notice_preferences" is "0:" (required), "1:" (functional) or
// "2:" (advertising), each level including the ones below it.
const trustarc = ({ cookies }) => {
  const value = cookieValue(cookies, "notice_preferences");
  if (!value) return null;
  const level = Number(decode(value).split(":")[0]);
  return { functional: level >= 1, advertising: level >= 2 };
};

// Didomi.getUserStatus() lists purpose ids such as "select_basic_ads".
const didomi = ({ didomi }) =>
  didomi
    ? merge([
      ...didomi.enabled.map((id) => [classify(id), true]),
      ...didomi.disabled.map((id) => [classify(id), false]),
    ])
    : null;

const COOKIE_INFORMATION_CATEGORIES = {
  cookie_cat_functional: "functional",
  cookie_cat_statistic: "performance",
  cookie_cat_marketing: "advertising",
  cookie_cat_unclassified: "other",
};
const cookieinformation = ({ cookies }) => {
  const value = cookieValue(cookies, "CookieInformationConsent");
  if (!value) return null;
  const { consents_approved: approved = [], consents_denied: denied = [] } =
    JSON.parse(decode(value));
  // Sites often store only what was approved; the rest was refused.
  return merge(
    Object.entries(COOKIE_INFORMATION_CATEGORIES).map(([id, category]) => [
      category,
      approved.includes(id) && !denied.includes(id),
    ]),
  );
};

export const readers = {
  cookiebot,
  onetrust,
  tcf,
  usercentrics,
  cookieyes,
  complianz,
  borlabs,
  trustarc,
  didomi,
  cookieinformation,
};

// Categories the reader reported that differ from the chosen level.
export const mismatches = (stored, categories) =>
  Object.entries(stored)
    .filter(([category, value]) => value !== Boolean(categories[category]))
    .map(([category, value]) => `${category}=${value}`);
