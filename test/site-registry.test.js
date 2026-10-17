import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSiteManifest,
  upsertSiteManifest,
  validateSiteManifest,
} from "../src/sites/registry.js";

test("site manifests normalize portable defaults and Blogger configuration", () => {
  assert.deepEqual(
    normalizeSiteManifest({
      key: " Example-Site ",
      name: " Example Site ",
      domain: "www.example.com",
      repository: "https://github.com/example/site",
      panel: { key: "example", path: "/paneladmin/example" },
      blogger: { enabled: true },
    }),
    {
      schemaVersion: 1,
      key: "example-site",
      name: "Example Site",
      domain: "example.com",
      productionUrl: "https://www.example.com",
      repository: "https://github.com/example/site",
      panel: { key: "example", path: "/paneladmin/example" },
      analytics: {
        source: "personal",
        envSuffix: "EXAMPLE_SITE",
        legacyDashboard: false,
      },
      blogger: {
        enabled: true,
        url: "https://www.example.com/admin/blogger/",
        apiBase: "/api/posts",
        buildEndpoint: "/api/build",
        publicPostBase: "/f/",
      },
    },
  );
});

test("site manifest validation rejects unknown secret-bearing and local path fields", () => {
  assert.throws(
    () =>
      validateSiteManifest({
        key: "demo",
        name: "Demo",
        domain: "demo.test",
        apiToken: "secret",
      }),
    /campo no permitido: apiToken/i,
  );
  assert.throws(
    () =>
      validateSiteManifest({
        key: "demo",
        name: "Demo",
        domain: "demo.test",
        rootPath: "/Users/name/site",
      }),
    /campo no permitido: rootPath/i,
  );
});

test("registry upsert replaces by key and returns deterministic ordering", () => {
  const registry = [
    { key: "zeta", name: "Zeta", domain: "zeta.test" },
    { key: "alpha", name: "Old Alpha", domain: "old-alpha.test" },
  ];
  const result = upsertSiteManifest(registry, {
    key: "alpha",
    name: "Alpha",
    domain: "alpha.test",
  });

  assert.deepEqual(
    result.map(({ key }) => key),
    ["alpha", "zeta"],
  );
  assert.equal(result[0].name, "Alpha");
  assert.equal(result.length, 2);
});

test("site manifests preserve explicit legacy analytics aliases", () => {
  const site = normalizeSiteManifest({
    key: "todoplastico",
    name: "TodoPlástico",
    domain: "todo-plastico.com",
    analytics: {
      source: "agama",
      legacyDashboard: true,
      legacyKey: "agama",
      legacyLabel: "Todo Plástico legacy",
      envSuffix: "TODOPLASTICO",
    },
  });

  assert.deepEqual(site.analytics, {
    source: "agama",
    envSuffix: "TODOPLASTICO",
    legacyDashboard: true,
    legacyKey: "agama",
    legacyLabel: "Todo Plástico legacy",
  });
});
