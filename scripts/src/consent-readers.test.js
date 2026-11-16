import assert from "node:assert/strict";
import { test } from "node:test";
import { mismatches, readers } from "./consent-readers.js";

const FUNCTIONAL_ONLY = {
  functional: true,
  performance: false,
  advertising: false,
  other: false,
};

const jar = (entries) =>
  Object.entries(entries).map(([name, value]) => ({ name, value }));

test("Cookiebot preferences count as functional", () => {
  const cookies = jar({
    CookieConsent:
      "{stamp:%27x%27%2Cnecessary:true%2Cpreferences:true%2Cstatistics:false%2Cmarketing:false%2Cmethod:%27explicit%27}",
  });
  assert.deepEqual(readers.cookiebot({ cookies }), {
    functional: true,
    performance: false,
    advertising: false,
  });
});

test("OneTrust groups map with and without the C000 prefix", () => {
  assert.deepEqual(
    readers.onetrust({
      cookies: jar({
        OptanonConsent:
          "isGpcEnabled=0&groups=C0001%3A1%2CC0002%3A0%2CC0003%3A1%2CC0004%3A0%2CC0005%3A1",
      }),
    }),
    { performance: false, functional: true, advertising: true },
  );
  assert.deepEqual(
    readers.onetrust({
      cookies: jar({ OptanonConsent: "groups=1%3A1%2C2%3A0%2C3%3A1%2C4%3A0" }),
    }),
    { performance: false, functional: true, advertising: false },
  );
});

test("OneTrust classifies renamed groups by name and skips always active", () => {
  const onetrustGroups = [
    { id: "f00", name: "First Party Functional Cookies", status: "inactive" },
    { id: "m00", name: "First Party Performance Cookies", status: "inactive" },
    { id: "t00", name: " First Party Targeting Cookies", status: "inactive" },
    { id: "m03", name: "Match and combine data", status: "always active" },
  ];
  assert.deepEqual(
    readers.onetrust({
      cookies: jar({
        OptanonConsent:
          "groups=s00%3A1%2Cf00%3A1%2Cm00%3A0%2Ct00%3A0%2Cm03%3A1",
      }),
      onetrustGroups,
    }),
    { functional: true, performance: false, advertising: false },
  );
});

test("Didomi and Cookie Information read their purpose lists", () => {
  assert.deepEqual(
    readers.didomi({
      didomi: {
        enabled: ["functional_cookies"],
        disabled: ["select_basic_ads", "measure_ad_performance", "analytics"],
      },
    }),
    { functional: true, advertising: false, performance: false },
  );
  assert.deepEqual(
    readers.cookieinformation({
      cookies: jar({
        CookieInformationConsent: encodeURIComponent(JSON.stringify({
          consents_approved: ["cookie_cat_necessary", "cookie_cat_functional"],
          consents_denied: ["cookie_cat_statistic", "cookie_cat_marketing"],
        })),
      }),
    }),
    {
      functional: true,
      performance: false,
      advertising: false,
      other: false,
    },
  );
});

test("Usercentrics categories classify by name", () => {
  assert.deepEqual(
    readers.usercentrics({
      usercentrics: [
        { category: "Functional", status: true },
        { category: "Marketing", status: false },
        { category: "Analytics", status: false },
      ],
    }),
    { functional: true, advertising: false, performance: false },
  );
  assert.deepEqual(
    readers.usercentrics({
      usercentrics: [
        { category: "Funktional", status: true },
        { category: "Statistiken", status: false },
      ],
    }),
    { functional: true, performance: false },
  );
});

test("TCF purposes split into advertising, performance and other", () => {
  assert.deepEqual(
    readers.tcf({ tcData: { purposes: { 1: false, 7: true, 9: false } } }),
    { advertising: true, performance: false, other: false },
  );
});

test("CookieYes, Complianz and TrustArc use their own field names", () => {
  assert.deepEqual(
    readers.cookieyes({
      cookies: jar({
        "cookieyes-consent":
          "consentid:abc,consent:yes,action:yes,necessary:yes,functional:yes,analytics:no,performance:no,advertisement:no",
      }),
    }),
    { functional: true, performance: false, advertising: false },
  );
  assert.deepEqual(
    readers.complianz({
      cookies: jar({
        cmplz_preferences: "allow",
        cmplz_statistics: "deny",
        cmplz_marketing: "deny",
      }),
    }),
    { functional: true, performance: false, advertising: false },
  );
  assert.deepEqual(
    readers.trustarc({ cookies: jar({ notice_preferences: "1:" }) }),
    { functional: true, advertising: false },
  );
});

test("Nothing stored reads as null", () => {
  for (const read of Object.values(readers)) {
    assert.deepEqual(
      read({
        cookies: [],
        tcData: null,
        usercentrics: null,
        didomi: null,
        osano: null,
        termly: null,
        ketch: null,
        consentmanager: null,
      }),
      null,
    );
  }
});

test("Mismatches list only categories that differ from the level", () => {
  assert.deepEqual(
    mismatches({ functional: true, advertising: true }, FUNCTIONAL_ONLY),
    ["advertising=true"],
  );
  assert.deepEqual(mismatches({ other: false }, FUNCTIONAL_ONLY), []);
});

// With Global Privacy Control on (Safari's setting), these platforms refuse
// without showing a banner and record it in their own way.
test("Global Privacy Control refusals read back as refusals", () => {
  const refused = { functional: false, performance: false, advertising: false };
  const cases = [
    // CookieFirst writes no cookie; the refusal is only in its API.
    [
      "cookiefirst",
      {
        cookies: [],
        cookiefirst: {
          necessary: true,
          performance: false,
          functional: false,
          advertising: false,
        },
      },
      refused,
    ],
    // Before any choice CookieFirst's API holds null, which is no refusal.
    ["cookiefirst", { cookies: [], cookiefirst: null }, null],
    // Complianz saves only a do_not_track marker.
    [
      "complianz",
      {
        cookies: jar({
          cmplz_saved_categories: '["do_not_track"]',
          cmplz_saved_services: "{}",
        }),
      },
      refused,
    ],
  ];
  for (const [reader, data, expected] of cases) {
    assert.deepEqual(readers[reader](data), expected, reader);
  }
});

test("Fallback platforms read their own consent records", () => {
  assert.deepEqual(
    readers.cookiefirst({
      cookies: jar({
        "cookiefirst-consent": encodeURIComponent(
          '{"necessary":true,"performance":false,"functional":false,"advertising":false}',
        ),
      }),
    }),
    { functional: false, performance: false, advertising: false },
  );
  assert.deepEqual(
    readers.osano({
      osano: {
        ANALYTICS: "DENY",
        MARKETING: "DENY",
        PERSONALIZATION: "ACCEPT",
      },
    }),
    { performance: false, advertising: false, functional: true },
  );
  assert.deepEqual(
    readers.ketch({
      ketch: { analytics: false, targeted_advertising: false, essential: true },
    }),
    { performance: false, advertising: false },
  );
  assert.deepEqual(
    readers.axeptio({
      cookies: jar({
        axeptio_cookies: encodeURIComponent(
          '{"$$completed":true,"google_analytics":false,"facebook_pixel":false}',
        ),
      }),
    }),
    { other: false },
  );
});

test("Yahoo's EuConsent string reads as a full refusal", () => {
  // Stored by consent.yahoo.com after "Reject all": no purpose consented.
  const refused = "CQs89sAQs89sAAOACKSVC1FgAAAAAAAAACiQAAAAAAAA.IMytB9G7";
  assert.deepEqual(readers.yahoo({ cookies: jar({ EuConsent: refused }) }), {
    advertising: false,
    performance: false,
    other: false,
  });
  assert.deepEqual(readers.yahoo({ cookies: [] }), null);
});

test("Bing's BCP cookie maps analytics and social media", () => {
  assert.deepEqual(
    readers.bing({ cookies: jar({ BCP: "AD=0&AL=1&SM=0" }) }),
    { performance: true, advertising: false },
  );
  assert.deepEqual(
    readers.bing({ cookies: jar({ BCP: "AD=0&AL=0&SM=1" }) }),
    { performance: false, advertising: true },
  );
  assert.deepEqual(readers.bing({ cookies: [] }), null);
});

test("MediaMarkt's pwaconsent maps comfort and marketing", () => {
  const cookie = (comfort, marketing) =>
    encodeURIComponent(
      `v:1.1&id:789f3a&createdMs:1793517599174~required:1&clf:1,gtm:1|comfort:${comfort}&aic:0,aid:0|marketing:${marketing}&fb:0`,
    );
  assert.deepEqual(
    readers.mediamarkt({ cookies: jar({ pwaconsent: cookie(0, 0) }) }),
    {
      functional: false,
      performance: false,
      advertising: false,
    },
  );
  assert.deepEqual(
    readers.mediamarkt({ cookies: jar({ pwaconsent: cookie(1, 0) }) }),
    { functional: true, performance: true, advertising: false },
  );
  assert.deepEqual(readers.mediamarkt({ cookies: [] }), null);
});

test("Revolut's rev_cookie_consent maps its three categories", () => {
  const cookie = encodeURIComponent(
    '{"preferences":true,"analytics":false,"advertising":false}',
  );
  assert.deepEqual(
    readers.revolut({ cookies: jar({ rev_cookie_consent: cookie }) }),
    {
      functional: true,
      performance: false,
      advertising: false,
    },
  );
  assert.deepEqual(readers.revolut({ cookies: [] }), null);
});

test("X's d_prefs tells Accept all from Refuse non-essential", () => {
  const refused = "MjoxLGNvbnNlbnRfdmVyc2lvbjoyLHRleHRfdmVyc2lvbjoxMDAw";
  const accepted = "MToxLGNvbnNlbnRfdmVyc2lvbjoyLHRleHRfdmVyc2lvbjoxMDAw";
  assert.deepEqual(readers.x({ cookies: jar({ d_prefs: refused }) }), {
    performance: false,
    advertising: false,
  });
  assert.deepEqual(readers.x({ cookies: jar({ d_prefs: accepted }) }), {
    performance: true,
    advertising: true,
  });
});

test("iubenda's purposes map to Hush categories", () => {
  const rejected = encodeURIComponent(
    '{"version":"1.109.0","purposes":{"1":true,"2":false,"3":false,"4":false,"5":false},"id":252372}',
  );
  assert.deepEqual(
    readers.iubenda({ cookies: jar({ "_iub_cs-s1": rejected }) }),
    {
      functional: false,
      other: false,
      performance: false,
      advertising: false,
    },
  );
  const functional = encodeURIComponent(
    '{"purposes":{"1":true,"2":true,"3":false,"4":false,"5":false}}',
  );
  assert.deepEqual(
    readers.iubenda({ cookies: jar({ "_iub_cs-123": functional }) }).functional,
    true,
  );
  const flagOnly = encodeURIComponent(
    '{"version":"1.109.0","consent":false,"id":82108305}',
  );
  assert.deepEqual(
    readers.iubenda({
      cookies: jar({
        "_iub_cs-s1-granular": '{"gac":"Mn5"}',
        "_iub_cs-1": flagOnly,
      }),
    }),
    { functional: false, other: false, performance: false, advertising: false },
  );
  assert.deepEqual(readers.iubenda({ cookies: [] }), null);
});

test("GetTerms' getterms_cookie_consent maps its categories", () => {
  const cookie = encodeURIComponent(JSON.stringify({
    widget_preferences_set: true,
    cookie_preferences: {
      "Essential Cookies": true,
      Functional: true,
      Marketing: false,
      Analytics: false,
      Unclassified: false,
    },
  }));
  assert.deepEqual(
    readers.getterms({ cookies: jar({ getterms_cookie_consent: cookie }) }),
    { functional: true, performance: false, advertising: false, other: false },
  );
  assert.deepEqual(readers.getterms({ cookies: [] }), null);
});

test("Nordiblinds' cookie_prefs_new maps its categories", () => {
  const cookie = encodeURIComponent(
    '{"essential":true,"functional":true,"analytics":false,"marketing":false}',
  );
  assert.deepEqual(
    readers.nordiblinds({ cookies: jar({ cookie_prefs_new: cookie }) }),
    { functional: true, performance: false, advertising: false },
  );
  assert.deepEqual(readers.nordiblinds({ cookies: [] }), null);
});

test("Snap keeps one cookie per category", () => {
  assert.deepEqual(
    readers.snap({
      cookies: jar({
        "sc-cookies-accepted": "true",
        Preferences: "true",
        Performance: "false",
        Marketing: "false",
      }),
    }),
    { functional: true, performance: false, advertising: false },
  );
  assert.deepEqual(readers.snap({ cookies: [] }), null);
});

test("Universal AV's CookieConsent groups say granted or denied", () => {
  const cookie = encodeURIComponent(JSON.stringify({
    accepted: true,
    groups: { necessary: "granted", analytics: "denied", marketing: "denied" },
  }));
  assert.deepEqual(
    readers.uniav({ cookies: jar({ CookieConsent: cookie }) }),
    { performance: false, advertising: false },
  );
  assert.deepEqual(readers.uniav({ cookies: [] }), null);
});

test("BeTheme's mfnConsent holds Google consent mode values", () => {
  const cookie = encodeURIComponent(JSON.stringify({
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  }));
  assert.deepEqual(
    readers.betheme({ cookies: jar({ mfnConsent: cookie }) }),
    { performance: false, advertising: false },
  );
  assert.deepEqual(readers.betheme({ cookies: [] }), null);
});

test("Audible's TrustArc lists each category it allows", () => {
  const stored = (value) => ({
    cookies: [{ name: "notice_gdpr_prefs", value }],
  });
  assert.deepEqual(readers.audible(stored("0%7C2%3A")), {
    performance: false,
    functional: true,
    advertising: false,
  });
  assert.deepEqual(readers.audible(stored("0:")), {
    performance: false,
    functional: false,
    advertising: false,
  });
  assert.deepEqual(readers.audible(stored("0|1|2|3:")), {
    performance: true,
    functional: true,
    advertising: true,
  });
  assert.deepEqual(readers.audible({ cookies: [] }), null);
});

test("adidas' notice_preferences lists the categories it allows", () => {
  const stored = (value) => ({
    cookies: [{ name: "notice_preferences", value }],
  });
  assert.deepEqual(readers.adidas(stored("%5B0%5D")), {
    functional: false,
    performance: false,
    advertising: false,
  });
  // "Functional" also turns on analytics, so it counts as both.
  assert.deepEqual(readers.adidas(stored("%5B0%2C1%5D")), {
    functional: true,
    performance: true,
    advertising: false,
  });
  assert.deepEqual(readers.adidas(stored("%5B0%2C1%2C2%5D")), {
    functional: true,
    performance: true,
    advertising: true,
  });
  // TrustArc's own format is not adidas'.
  assert.deepEqual(readers.adidas(stored("2:")), null);
  assert.deepEqual(readers.adidas({ cookies: [] }), null);
});

test("Brandfetch's bf_consent has one flag per switch", () => {
  const stored = (value) => ({ cookies: [{ name: "bf_consent", value }] });
  assert.deepEqual(readers.brandfetch(stored("1.001.1794378997")), {
    performance: false,
    advertising: false,
    functional: true,
  });
  assert.deepEqual(
    mismatches(readers.brandfetch(stored("1.001.1794378997")), FUNCTIONAL_ONLY),
    [],
  );
  assert.deepEqual(readers.brandfetch(stored("1.110.1794379014")), {
    performance: true,
    advertising: true,
    functional: false,
  });
  assert.deepEqual(readers.brandfetch(stored("1.111.1794379042")), {
    performance: true,
    advertising: true,
    functional: true,
  });
  assert.deepEqual(readers.brandfetch({ cookies: [] }), null);
});
