import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readPost, savePost } from "../src/blogger/content-store.js";

test("content store creates portable Markdown posts with caller defaults", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "web-core-blogger-"));
  try {
    await savePost(
      root,
      null,
      { title: "Post reusable", description: "Descripcion", body: "Contenido" },
      { defaultAuthor: "Example Studio", defaultLanguage: "de" },
    );

    const post = await readPost(root, "post-reusable");
    const markdown = await readFile(
      path.join(root, "blog-posts", "post-reusable.md"),
      "utf8",
    );
    assert.equal(post.meta.author, "Example Studio");
    assert.equal(post.meta.lang, "de");
    assert.doesNotMatch(markdown, /Samuel Coach/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
