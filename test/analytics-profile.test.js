import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYTICS_SCHEMA_VERSION,
  normalizeAnalyticsProfile,
  resolveAnalyticsContext,
} from "../src/analytics/profile.js";

const inputProfile = {
  schemaVersion: 1,
  languages: [
    {
      key: "es",
      label: "Español",
      routes: { exact: ["/"], prefixes: ["/"] },
    },
    {
      key: "en",
      label: "English",
      routes: { exact: ["/en"], prefixes: ["en/"] },
    },
  ],
  sections: [
    {
      key: "services",
      label: "Servicios",
      routes: { exact: ["/services"], prefixes: ["/en/"] },
    },
    {
      key: "blog",
      label: "Blog",
      routes: { exact: [], prefixes: ["/blog", "/en/blog/"] },
    },
    {
      key: "featured",
      label: "Destacado",
      routes: { exact: ["/en/blog/featured"], prefixes: [] },
    },
  ],
  allowedEvents: [
    {
      key: "language_switch",
      label: "Cambio de idioma",
      category: "commercial",
    },
    { key: "engagement_15s", label: "15 segundos", category: "engagement" },
  ],
  allowedContextKeys: ["market", "targetLanguage"],
  excludedDestinations: ["https://portal.webfuengirola.com"],
};

test("normalizes a safe reusable analytics profile", () => {
  const profile = normalizeAnalyticsProfile(inputProfile);

  assert.equal(ANALYTICS_SCHEMA_VERSION, 1);
  assert.equal(profile.schemaVersion, 1);
  assert.deepEqual(profile.languages[1].routes, {
    exact: ["/en"],
    prefixes: ["/en/"],
  });
  assert.deepEqual(profile.allowedContextKeys, ["market", "targetLanguage"]);
  assert.deepEqual(profile.excludedDestinations, [
    "https://portal.webfuengirola.com",
  ]);
  assert.equal(typeof profile.excludedDestinations[0], "string");
});

test("rejects invalid keys, unsafe paths, duplicate keys, and unknown properties", () => {
  assert.throws(
    () =>
      normalizeAnalyticsProfile({
        ...inputProfile,
        languages: [{ ...inputProfile.languages[0], key: "ES!" }],
      }),
    /key/i,
  );
  assert.throws(
    () =>
      normalizeAnalyticsProfile({
        ...inputProfile,
        sections: [
          { ...inputProfile.sections[0], routes: { exact: ["../admin"] } },
        ],
      }),
    /path|ruta/i,
  );
  assert.throws(
    () =>
      normalizeAnalyticsProfile({
        ...inputProfile,
        languages: [inputProfile.languages[0], inputProfile.languages[0]],
      }),
    /duplic/i,
  );
  assert.throws(
    () => normalizeAnalyticsProfile({ ...inputProfile, trackerSecret: "no" }),
    /no est.*permitid/i,
  );
  assert.throws(
    () =>
      normalizeAnalyticsProfile({
        ...inputProfile,
        sections: [{ ...inputProfile.sections[0], regex: ".*" }],
      }),
    /no est.*permitid/i,
  );
});

test("resolves exact rules before prefixes and the longest prefix first", () => {
  const profile = normalizeAnalyticsProfile(inputProfile);

  assert.deepEqual(
    resolveAnalyticsContext(profile, {
      pathname: "/en/blog/post/",
      documentLanguage: "es-ES",
    }),
    { contentLanguage: "en", section: "blog" },
  );
  assert.deepEqual(
    resolveAnalyticsContext(profile, {
      pathname: "/en/blog/",
      documentLanguage: "es-ES",
    }),
    { contentLanguage: "en", section: "blog" },
  );
  assert.deepEqual(
    resolveAnalyticsContext(profile, {
      pathname: "/en/blog/featured",
      documentLanguage: "es",
    }),
    { contentLanguage: "en", section: "featured" },
  );
});

test("uses a supported document language only when no route rule matches", () => {
  const profile = normalizeAnalyticsProfile({
    ...inputProfile,
    languages: inputProfile.languages.map((language) => ({
      ...language,
      routes:
        language.key === "es"
          ? { exact: ["/"], prefixes: ["/es/"] }
          : language.routes,
    })),
  });

  assert.deepEqual(
    resolveAnalyticsContext(profile, {
      pathname: "/unclassified",
      documentLanguage: "en-GB",
    }),
    { contentLanguage: "en", section: "" },
  );
  assert.deepEqual(
    resolveAnalyticsContext(profile, {
      pathname: "/unclassified",
      documentLanguage: "pt-BR",
    }),
    { contentLanguage: "", section: "" },
  );
});
