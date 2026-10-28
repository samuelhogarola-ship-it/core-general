import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

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
    "--blogger-variant",
    "static",
    "--blogger-custom-origin",
    "https://blogger.example.com",
    "--blogger-logo-path",
    "/brands/example/logo.png",
    "--blogger-preview-image-path",
    "/brands/example/wf-blogger-preview.png",
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
    const editorHtml = await readFile(
      path.join(siteRoot, "admin", "blogger", "index.html"),
      "utf8",
    );

    assert.equal(manifest.blogger.enabled, true);
    assert.equal(manifest.blogger.variant, "static");
    assert.equal(manifest.blogger.customOrigin, "https://blogger.example.com");
    assert.equal(manifest.blogger.logoPath, "/brands/example/logo.png");
    assert.equal(
      manifest.blogger.previewImagePath,
      "/brands/example/wf-blogger-preview.png",
    );
    assert.equal(registry.length, 1);
    assert.equal(registry[0].key, "example");
    assert.match(editorHtml, /Example Site/);
    assert.match(editorHtml, /admin-blogger-auth\.js/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
