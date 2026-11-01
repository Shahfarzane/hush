import { assertEquals } from "jsr:@std/assert@1";
import { mismatches, readers } from "./consent-readers.js";

const FUNCTIONAL_ONLY = {
  functional: true,
  performance: false,
  advertising: false,
  other: false,
};

const jar = (entries) =>
  Object.entries(entries).map(([name, value]) => ({ name, value }));

Deno.test("Cookiebot preferences count as functional", () => {
  const cookies = jar({
    CookieConsent:
      "{stamp:%27x%27%2Cnecessary:true%2Cpreferences:true%2Cstatistics:false%2Cmarketing:false%2Cmethod:%27explicit%27}",
  });
  assertEquals(readers.cookiebot({ cookies }), {
    functional: true,
    performance: false,
    advertising: false,
  });
});

Deno.test("OneTrust groups map with and without the C000 prefix", () => {
  assertEquals(
    readers.onetrust({
      cookies: jar({
        OptanonConsent:
          "isGpcEnabled=0&groups=C0001%3A1%2CC0002%3A0%2CC0003%3A1%2CC0004%3A0%2CC0005%3A1",
      }),
    }),
    { performance: false, functional: true, advertising: true },
  );
  assertEquals(
    readers.onetrust({
      cookies: jar({ OptanonConsent: "groups=1%3A1%2C2%3A0%2C3%3A1%2C4%3A0" }),
    }),
    { performance: false, functional: true, advertising: false },
  );
});

Deno.test("OneTrust classifies renamed groups by name and skips always active", () => {
  const onetrustGroups = [
    { id: "f00", name: "First Party Functional Cookies", status: "inactive" },
    { id: "m00", name: "First Party Performance Cookies", status: "inactive" },
    { id: "t00", name: " First Party Targeting Cookies", status: "inactive" },
    { id: "m03", name: "Match and combine data", status: "always active" },
  ];
  assertEquals(
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

Deno.test("Didomi and Cookie Information read their purpose lists", () => {
  assertEquals(
    readers.didomi({
      didomi: {
        enabled: ["functional_cookies"],
        disabled: ["select_basic_ads", "measure_ad_performance", "analytics"],
      },
    }),
    { functional: true, advertising: false, performance: false },
  );
  assertEquals(
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

Deno.test("Usercentrics categories classify by name", () => {
  assertEquals(
    readers.usercentrics({
      usercentrics: [
        { category: "Functional", status: true },
        { category: "Marketing", status: false },
        { category: "Analytics", status: false },
      ],
    }),
    { functional: true, advertising: false, performance: false },
  );
  assertEquals(
    readers.usercentrics({
      usercentrics: [
        { category: "Funktional", status: true },
        { category: "Statistiken", status: false },
      ],
    }),
    { functional: true, performance: false },
  );
});

Deno.test("TCF purposes split into advertising, performance and other", () => {
  assertEquals(
    readers.tcf({ tcData: { purposes: { 1: false, 7: true, 9: false } } }),
    { advertising: true, performance: false, other: false },
  );
});

Deno.test("CookieYes, Complianz and TrustArc use their own field names", () => {
  assertEquals(
    readers.cookieyes({
      cookies: jar({
        "cookieyes-consent":
          "consentid:abc,consent:yes,action:yes,necessary:yes,functional:yes,analytics:no,performance:no,advertisement:no",
      }),
    }),
    { functional: true, performance: false, advertising: false },
  );
  assertEquals(
    readers.complianz({
      cookies: jar({
        cmplz_preferences: "allow",
        cmplz_statistics: "deny",
        cmplz_marketing: "deny",
      }),
    }),
    { functional: true, performance: false, advertising: false },
  );
  assertEquals(
    readers.trustarc({ cookies: jar({ notice_preferences: "1:" }) }),
    { functional: true, advertising: false },
  );
});

Deno.test("Nothing stored reads as null", () => {
  for (const read of Object.values(readers)) {
    assertEquals(
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

Deno.test("Mismatches list only categories that differ from the level", () => {
  assertEquals(
    mismatches({ functional: true, advertising: true }, FUNCTIONAL_ONLY),
    ["advertising=true"],
  );
  assertEquals(mismatches({ other: false }, FUNCTIONAL_ONLY), []);
});

Deno.test("Fallback platforms read their own consent records", () => {
  assertEquals(
    readers.cookiefirst({
      cookies: jar({
        "cookiefirst-consent": encodeURIComponent(
          '{"necessary":true,"performance":false,"functional":false,"advertising":false}',
        ),
      }),
    }),
    { functional: false, performance: false, advertising: false },
  );
  assertEquals(
    readers.osano({
      osano: {
        ANALYTICS: "DENY",
        MARKETING: "DENY",
        PERSONALIZATION: "ACCEPT",
      },
    }),
    { performance: false, advertising: false, functional: true },
  );
  assertEquals(
    readers.ketch({
      ketch: { analytics: false, targeted_advertising: false, essential: true },
    }),
    { performance: false, advertising: false },
  );
  assertEquals(
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

Deno.test("Yahoo's EuConsent string reads as a full refusal", () => {
  // Stored by consent.yahoo.com after "Reject all": no purpose consented.
  const refused = "CQs89sAQs89sAAOACKSVC1FgAAAAAAAAACiQAAAAAAAA.IMytB9G7";
  assertEquals(readers.yahoo({ cookies: jar({ EuConsent: refused }) }), {
    advertising: false,
    performance: false,
    other: false,
  });
  assertEquals(readers.yahoo({ cookies: [] }), null);
});

Deno.test("Bing's BCP cookie maps analytics and social media", () => {
  assertEquals(
    readers.bing({ cookies: jar({ BCP: "AD=0&AL=1&SM=0" }) }),
    { performance: true, advertising: false },
  );
  assertEquals(
    readers.bing({ cookies: jar({ BCP: "AD=0&AL=0&SM=1" }) }),
    { performance: false, advertising: true },
  );
  assertEquals(readers.bing({ cookies: [] }), null);
});

Deno.test("MediaMarkt's pwaconsent maps comfort and marketing", () => {
  const cookie = (comfort, marketing) =>
    encodeURIComponent(
      `v:1.1&id:789f3a&createdMs:1793517599174~required:1&clf:1,gtm:1|comfort:${comfort}&aic:0,aid:0|marketing:${marketing}&fb:0`,
    );
  assertEquals(
    readers.mediamarkt({ cookies: jar({ pwaconsent: cookie(0, 0) }) }),
    {
      functional: false,
      performance: false,
      advertising: false,
    },
  );
  assertEquals(
    readers.mediamarkt({ cookies: jar({ pwaconsent: cookie(1, 0) }) }),
    { functional: true, performance: true, advertising: false },
  );
  assertEquals(readers.mediamarkt({ cookies: [] }), null);
});

Deno.test("X's d_prefs tells Accept all from Refuse non-essential", () => {
  const refused = "MjoxLGNvbnNlbnRfdmVyc2lvbjoyLHRleHRfdmVyc2lvbjoxMDAw";
  const accepted = "MToxLGNvbnNlbnRfdmVyc2lvbjoyLHRleHRfdmVyc2lvbjoxMDAw";
  assertEquals(readers.x({ cookies: jar({ d_prefs: refused }) }), {
    performance: false,
    advertising: false,
  });
  assertEquals(readers.x({ cookies: jar({ d_prefs: accepted }) }), {
    performance: true,
    advertising: true,
  });
});

Deno.test("iubenda's purposes map to Hush categories", () => {
  const rejected = encodeURIComponent(
    '{"version":"1.109.0","purposes":{"1":true,"2":false,"3":false,"4":false,"5":false},"id":252372}',
  );
  assertEquals(readers.iubenda({ cookies: jar({ "_iub_cs-s1": rejected }) }), {
    functional: false,
    other: false,
    performance: false,
    advertising: false,
  });
  const functional = encodeURIComponent(
    '{"purposes":{"1":true,"2":true,"3":false,"4":false,"5":false}}',
  );
  assertEquals(
    readers.iubenda({ cookies: jar({ "_iub_cs-123": functional }) }).functional,
    true,
  );
  const flagOnly = encodeURIComponent(
    '{"version":"1.109.0","consent":false,"id":82108305}',
  );
  assertEquals(
    readers.iubenda({
      cookies: jar({
        "_iub_cs-s1-granular": '{"gac":"Mn5"}',
        "_iub_cs-1": flagOnly,
      }),
    }),
    { functional: false, other: false, performance: false, advertising: false },
  );
  assertEquals(readers.iubenda({ cookies: [] }), null);
});
