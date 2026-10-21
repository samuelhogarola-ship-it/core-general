import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { onboardSite } from "../scripts/site-onboard.mjs";

const execFileAsync = promisify(execFile);
const command = fileURLToPath(
  new URL("../scripts/site-onboard.mjs", import.meta.url),
);

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
    "--auth-module",
    "/assets/js/admin-blogger-auth.js",
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
    const entryHtml = await readFile(
      path.join(siteRoot, "admin", "blogger", "index.html"),
      "utf8",
    );

    assert.equal(manifest.blogger.enabled, true);
    assert.equal(registry.length, 1);
    assert.equal(registry[0].key, "example");
    assert.match(
      entryHtml,
      /https:\/\/admin\.webfuengirola\.com\/acceso\/blogger\/example/,
    );
    assert.doesNotMatch(entryHtml, /bloggerConfig|admin-blogger-auth\.js/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Blogger onboarding generates a public redirect to the exact Studio site route", async () => {
  const workspace = await mkdtemp(
    path.join(tmpdir(), "web-core-direct-blogger-"),
  );
  const siteRoot = path.join(workspace, "sites", "future-site");
  const panelRoot = path.join(workspace, "panel");

  try {
    const result = await onboardSite({
      root: siteRoot,
      "panel-root": panelRoot,
      key: "future-site",
      name: "Future Site",
      domain: "future-site.example.com",
      blogger: true,
    });
    const entry = await readFile(
      path.join(siteRoot, "admin", "blogger", "index.html"),
      "utf8",
    );
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    const registry = JSON.parse(await readFile(result.registryPath, "utf8"));
    const target = "https://admin.webfuengirola.com/acceso/blogger/future-site";

    assert.equal(result.bloggerInstalled, true);
    assert.equal(manifest.key, "future-site");
    assert.equal(
      manifest.blogger.url,
      "https://future-site.example.com/admin/blogger/",
    );
    assert.equal(registry[0].key, "future-site");
    assert.equal(registry[0].blogger.url, manifest.blogger.url);
    assert.ok(entry.includes(`content="0; url=${target}"`));
    assert.ok(entry.includes(`href="${target}"`));
    assert.doesNotMatch(
      entry,
      /bloggerConfig|editor\/app\.js|cliente\/proyectos/,
    );
    await assert.rejects(
      () => readFile(path.join(siteRoot, "admin", "blogger", "app.js")),
      { code: "ENOENT" },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
