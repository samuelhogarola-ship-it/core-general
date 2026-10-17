import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createBloggerConfig,
  renderBloggerRuntimeConfig,
} from "../src/blogger/config.js";

test("Blogger runtime config derives portable site defaults", () => {
  const config = createBloggerConfig({
    key: "example",
    name: "Example Site",
    domain: "example.com",
    blogger: { enabled: true },
  });

  assert.deepEqual(config, {
    siteName: "Example Site",
    defaultAuthor: "Example Site",
    defaultLanguage: "es",
    apiBase: "/api/posts",
    buildEndpoint: "/api/build",
    publicPostBase: "/f/",
    authModule: "/assets/js/blogger-auth.js",
  });
});

test("Blogger runtime config can be embedded without closing its script tag", () => {
  const output = renderBloggerRuntimeConfig({
    siteName: "Demo </script><script>alert(1)</script>",
  });
  assert.doesNotMatch(output, /<\/script>/i);
  assert.match(output, /\\u003c\/script>/i);
});

test("reusable editor keeps final contextual and inline-image tools without Samuel coupling", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../blogger/editor/index.html", import.meta.url), "utf8"),
    readFile(new URL("../blogger/editor/app.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="selectionToolbar"/);
  assert.match(html, /id="inlineImageUpload"/);
  assert.match(app, /moveSelectedEditorImage/);
  assert.match(app, /loadBloggerRuntime/);
  assert.doesNotMatch(`${html}\n${app}`, /Samuel Coach|\/assets\/js\/auth\.js/);
});
