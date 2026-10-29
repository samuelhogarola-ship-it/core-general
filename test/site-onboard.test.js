import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const command = fileURLToPath(
  new URL("../scripts/site-onboard.mjs", import.meta.url),
);
const canonicalAnalyticsRuntime = fileURLToPath(
  new URL("../src/analytics/umami-browser.js", import.meta.url),
);

function analyticsProfile() {
  return {
    schemaVersion: 1,
    languages: [
      {
        key: "en",
        label: "English",
        routes: { exact: ["/en"], prefixes: ["en/"] },
      },
    ],
    sections: [
      {
        key: "blog",
        label: "Blog",
        routes: { exact: [], prefixes: ["en/blog/"] },
      },
    ],
    allowedEvents: [
      { key: "form_start", label: "Form start", category: "commercial" },
    ],
    allowedContextKeys: ["market"],
    excludedDestinations: ["https://portal.example.com/"],
  };
}

test("site onboarding works from any directory and stays idempotent", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "web-core-onboard-"));
  const siteRoot = path.join(workspace, "sites", "example");
  const panelRoot = path.join(workspace, "panel");
  await mkdir(path.join(panelRoot, "src", "config"), { recursive: true });
  await mkdir(siteRoot, { recursive: true });
  await writeFile(
    path.join(panelRoot, "src", "config", "sites.json"),
    "[]\n",
    "utf8",
  );

  const args = [
    command,
    "--root",
    siteRoot,
    "--panel-root",
    panelRoot,
    "--key",
    "example",
    "--name",
    "Example Site",
    "--domain",
    "example.com",
    "--repository",
    "https://github.com/example/site",
    "--panel-key",
    "example",
    "--blogger",
    "--blogger-variant",
    "static",
    "--blogger-runtime",
    "central-multisite",
    "--blogger-custom-origin",
    "https://blogger.example.com",
    "--blogger-url",
    "https://portal.webfuengirola.com/acceso/blogger/example",
    "--blogger-logo-path",
    "/brands/example/logo.png",
    "--blogger-preview-image-path",
    "/brands/example/wf-blogger-preview.png",
  ];

  try {
    await execFileAsync(process.execPath, args, { cwd: workspace });
    await execFileAsync(process.execPath, args, { cwd: tmpdir() });

    const manifest = JSON.parse(
      await readFile(path.join(siteRoot, ".web-core", "site.json"), "utf8"),
    );
    const registry = JSON.parse(
      await readFile(
        path.join(panelRoot, "src", "config", "sites.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.blogger.enabled, true);
    assert.equal(manifest.blogger.variant, "static");
    assert.equal(manifest.blogger.runtime, "central-multisite");
    assert.equal(manifest.blogger.customOrigin, "https://blogger.example.com");
    assert.equal(manifest.blogger.logoPath, "/brands/example/logo.png");
    assert.equal(
      manifest.blogger.previewImagePath,
      "/brands/example/wf-blogger-preview.png",
    );
    assert.equal(registry.length, 1);
    assert.equal(registry[0].key, "example");
    assert.equal(registry[0].blogger.runtime, "central-multisite");
    await assert.rejects(
      access(path.join(siteRoot, "admin", "blogger", "index.html")),
      /ENOENT/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("legacy Blogger onboarding without an explicit variant keeps the copied editor", async () => {
  const workspace = await mkdtemp(
    path.join(tmpdir(), "web-core-legacy-onboard-"),
  );
  const siteRoot = path.join(workspace, "site");
  const panelRoot = path.join(workspace, "panel");
  await mkdir(path.join(panelRoot, "src", "config"), { recursive: true });
  await mkdir(siteRoot, { recursive: true });
  await writeFile(
    path.join(panelRoot, "src", "config", "sites.json"),
    "[]\n",
    "utf8",
  );

  try {
    await execFileAsync(process.execPath, [
      command,
      "--root",
      siteRoot,
      "--panel-root",
      panelRoot,
      "--key",
      "legacy",
      "--name",
      "Legacy Site",
      "--domain",
      "legacy.example.com",
      "--blogger",
      "--auth-module",
      "/assets/js/admin-blogger-auth.js",
    ]);

    const editorHtml = await readFile(
      path.join(siteRoot, "admin", "blogger", "index.html"),
      "utf8",
    );
    assert.match(editorHtml, /Legacy Site/);
    assert.match(editorHtml, /admin-blogger-auth\.js/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("site onboarding preserves existing Panel Blogger endpoints when optional CLI flags are omitted", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "web-core-panel-owned-"));
  const siteRoot = path.join(workspace, "site");
  const panelRoot = path.join(workspace, "panel");
  await mkdir(path.join(panelRoot, "src", "config"), { recursive: true });
  await mkdir(siteRoot, { recursive: true });
  await writeFile(
    path.join(panelRoot, "src", "config", "sites.json"),
    `${JSON.stringify(
      [
        {
          schemaVersion: 1,
          key: "agama",
          name: "Agama",
          domain: "agama.com.mx",
          productionUrl: "https://www.agama.com.mx",
          allowedOrigins: ["https://admin.agama.com.mx"],
          panel: { key: "reports-only", path: "/paneladmin/informes" },
          analytics: {
            source: "agama",
            envSuffix: "AGAMA",
            legacyDashboard: false,
          },
          blogger: {
            enabled: true,
            variant: "vps",
            runtime: "central-multisite",
            url: "https://admin.webfuengirola.com/paneladmin/blogger/agama",
            apiBase: "/api/blogger/agama/posts",
            buildEndpoint: "/api/blogger/agama/build",
            contentDir: "entrada-de-blog",
            publicPostBase: "/entrada-de-blog/",
          },
        },
      ],
      null,
      2,
    )}\n`,
    "utf8",
  );

  try {
    await execFileAsync(process.execPath, [
      command,
      "--root",
      siteRoot,
      "--panel-root",
      panelRoot,
      "--key",
      "agama",
      "--name",
      "Agama",
      "--domain",
      "agama.com.mx",
      "--url",
      "https://www.agama.com.mx",
      "--blogger",
      "--blogger-variant",
      "vps",
      "--blogger-runtime",
      "central-multisite",
      "--blogger-url",
      "https://admin.webfuengirola.com/paneladmin/blogger/agama",
    ]);

    const [registered] = JSON.parse(
      await readFile(
        path.join(panelRoot, "src", "config", "sites.json"),
        "utf8",
      ),
    );
    assert.equal(registered.analytics.source, "agama");
    assert.deepEqual(registered.allowedOrigins, ["https://admin.agama.com.mx"]);
    assert.equal(registered.panel.key, "reports-only");
    assert.equal(registered.blogger.apiBase, "/api/blogger/agama/posts");
    assert.equal(registered.blogger.buildEndpoint, "/api/blogger/agama/build");
    assert.equal(registered.blogger.contentDir, "entrada-de-blog");
    assert.equal(registered.blogger.publicPostBase, "/entrada-de-blog/");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("analytics profile onboarding installs the canonical runtime and updates both manifests idempotently", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "web-core-analytics-"));
  const siteRoot = path.join(workspace, "site");
  const panelRoot = path.join(workspace, "panel");
  const profilePath = path.join(workspace, "analytics-profile.json");
  await mkdir(path.join(panelRoot, "src", "config"), { recursive: true });
  await mkdir(siteRoot, { recursive: true });
  await writeFile(path.join(panelRoot, "src", "config", "sites.json"), "[]\n");
  await writeFile(profilePath, JSON.stringify(analyticsProfile()), "utf8");
  const args = [
    command,
    "--root",
    siteRoot,
    "--panel-root",
    panelRoot,
    "--key",
    "analytics-site",
    "--name",
    "Analytics Site",
    "--domain",
    "analytics.example.com",
    "--analytics-profile",
    profilePath,
  ];

  try {
    const first = await execFileAsync(process.execPath, args);
    const second = await execFileAsync(process.execPath, args);
    assert.equal(JSON.parse(first.stdout).analyticsInstalled, true);
    assert.equal(JSON.parse(second.stdout).analyticsInstalled, true);
    assert.equal(
      await readFile(path.join(siteRoot, "umami-analytics-core.js"), "utf8"),
      await readFile(canonicalAnalyticsRuntime, "utf8"),
    );
    const installedProfile = JSON.parse(
      await readFile(path.join(siteRoot, "analytics-profile.json"), "utf8"),
    );
    assert.deepEqual(installedProfile.languages[0].routes.prefixes, ["/en/"]);
    assert.deepEqual(installedProfile.excludedDestinations, [
      "https://portal.example.com",
    ]);
    const siteManifest = JSON.parse(
      await readFile(path.join(siteRoot, ".web-core", "site.json"), "utf8"),
    );
    const registry = JSON.parse(
      await readFile(
        path.join(panelRoot, "src", "config", "sites.json"),
        "utf8",
      ),
    );
    assert.deepEqual(siteManifest.analytics.profile, installedProfile);
    assert.equal(registry.length, 1);
    assert.deepEqual(registry[0].analytics.profile, installedProfile);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("invalid analytics profiles fail before any onboarding write", async () => {
  const workspace = await mkdtemp(
    path.join(tmpdir(), "web-core-invalid-analytics-"),
  );
  const siteRoot = path.join(workspace, "site");
  const panelRoot = path.join(workspace, "panel");
  const profilePath = path.join(workspace, "invalid-profile.json");
  const registryPath = path.join(panelRoot, "src", "config", "sites.json");
  await mkdir(path.dirname(registryPath), { recursive: true });
  await mkdir(siteRoot, { recursive: true });
  await writeFile(registryPath, "[]\n", "utf8");
  await writeFile(
    profilePath,
    JSON.stringify({ ...analyticsProfile(), privatePassword: "forbidden" }),
    "utf8",
  );

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        command,
        "--root",
        siteRoot,
        "--panel-root",
        panelRoot,
        "--key",
        "invalid-analytics",
        "--name",
        "Invalid Analytics",
        "--domain",
        "invalid.example.com",
        "--analytics-profile",
        profilePath,
      ]),
      /no est.*permitid/i,
    );
    assert.equal(await readFile(registryPath, "utf8"), "[]\n");
    await assert.rejects(
      access(path.join(siteRoot, ".web-core", "site.json")),
      /ENOENT/,
    );
    await assert.rejects(
      access(path.join(siteRoot, "umami-analytics-core.js")),
      /ENOENT/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
