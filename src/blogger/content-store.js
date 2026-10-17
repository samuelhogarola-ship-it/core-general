import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_EXT_RE = /\.(avif|gif|jpe?g|png|svg|webp)$/i;
const IMAGE_META_FILE = ".images.json";

export function slugify(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function assertSafeSlug(slug) {
  if (!SLUG_RE.test(slug)) {
    throw Object.assign(
      new Error("Slug invalido: usa minusculas, numeros y guiones."),
      { status: 400 },
    );
  }
}

export function sanitizeImageName(fileName) {
  const base = path
    .basename(String(fileName || ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!base || base.includes("..") || !IMAGE_EXT_RE.test(base)) {
    throw Object.assign(
      new Error("Imagen invalida: usa jpg, png, webp, avif, gif o svg."),
      { status: 400 },
    );
  }

  return base;
}

export function parsePostMarkdown(content) {
  const match = String(content || "").match(FRONTMATTER_RE);
  if (!match) {
    return { meta: {}, body: String(content || "") };
  }

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const [key, ...valueParts] = line.split(":");
    if (!key || valueParts.length === 0) continue;
    meta[key.trim()] = valueParts
      .join(":")
      .trim()
      .replace(/^["']|["']$/g, "");
  }

  return { meta, body: match[2].trimStart() };
}

export function serializePostMarkdown(meta, body) {
  const orderedKeys = [
    "title",
    "slug",
    "description",
    "date",
    "author",
    "lang",
    "image",
    "tags",
    "category",
    "level",
    "status",
    "content_format",
  ];
  const allKeys = [
    ...orderedKeys,
    ...Object.keys(meta)
      .filter((key) => !orderedKeys.includes(key))
      .sort(),
  ];
  const frontmatter = allKeys
    .map((key) => [key, meta[key]])
    .filter(
      ([, value]) =>
        value !== undefined && value !== null && String(value).trim() !== "",
    )
    .map(([key, value]) => `${key}: ${String(value).trim()}`)
    .join("\n");

  return `---\n${frontmatter}\n---\n\n${String(body || "").trim()}\n`;
}

export function normalizePostInput(input, defaults = {}) {
  const title = String(input.title || "").trim();
  const slug = slugify(input.slug || title);
  assertSafeSlug(slug);

  return {
    meta: {
      title,
      slug,
      description: String(input.description || "").trim(),
      date: String(input.date || new Date().toISOString().slice(0, 10)).trim(),
      author: String(input.author || defaults.defaultAuthor || "").trim(),
      lang: String(input.lang || defaults.defaultLanguage || "es").trim(),
      image: String(input.image || "").trim(),
      tags: normalizeList(input.tags),
      category: String(input.category || "").trim(),
      level: String(input.level || "").trim(),
      status: String(input.status || "draft").trim(),
      content_format: input.content_format === "html" ? "html" : "markdown",
    },
    body: String(input.body || "").trim(),
  };
}

export async function listPosts(rootDir) {
  const postsDir = path.join(rootDir, "blog-posts");
  const files = await safeReadDir(postsDir);
  const posts = [];
  const seenSlugs = new Set();

  const markdownPosts = await Promise.all(
    files
      .filter((entry) => entry.endsWith(".md"))
      .map(async (file) => {
        const filePath = path.join(postsDir, file);
        const content = await readFile(filePath, "utf8");
        const { meta, body } = parsePostMarkdown(content);
        const slug = meta.slug || file.replace(/\.md$/, "");
        const images = await collectPostImages(
          rootDir,
          slug,
          meta.image,
          meta.title || slug,
        );
        return {
          slug,
          file,
          source: "markdown",
          title: meta.title || slug,
          description: meta.description || "",
          date: meta.date || "",
          lang: meta.lang || "es",
          image: meta.image || "",
          tags: splitList(meta.tags),
          category: meta.category || "",
          level: meta.level || "",
          status: meta.status || "draft",
          format: meta.content_format || "markdown",
          isPublished: await fileExists(
            path.join(rootDir, "f", slug, "index.html"),
          ),
          words: body.split(/\s+/).filter(Boolean).length,
          images,
        };
      }),
  );
  for (const post of markdownPosts) {
    seenSlugs.add(post.slug);
    posts.push(post);
  }

  for (const legacyPost of await listGeneratedPosts(rootDir)) {
    if (!seenSlugs.has(legacyPost.slug)) posts.push(legacyPost);
  }

  return posts.sort(
    (a, b) =>
      String(b.date).localeCompare(String(a.date)) ||
      a.title.localeCompare(b.title),
  );
}

export async function readPost(rootDir, slug, defaults = {}) {
  assertSafeSlug(slug);
  const fileName = await findPostFileBySlug(rootDir, slug);
  if (!fileName) return readGeneratedPost(rootDir, slug, defaults);
  const content = await readFile(
    path.join(rootDir, "blog-posts", fileName),
    "utf8",
  );
  const { meta, body } = parsePostMarkdown(content);
  return {
    slug,
    file: fileName,
    meta: { ...meta, slug: meta.slug || slug, status: meta.status || "draft" },
    body,
    format: meta.content_format || "markdown",
    isPublished: await fileExists(
      path.join(rootDir, "f", meta.slug || slug, "index.html"),
    ),
    images: await collectPostImages(
      rootDir,
      meta.slug || slug,
      meta.image,
      meta.title || slug,
    ),
  };
}

export async function savePost(rootDir, currentSlug, input, defaults = {}) {
  const { meta, body } = normalizePostInput(input, defaults);
  const nextSlug = meta.slug;
  if (!meta.title)
    throw Object.assign(new Error("El titulo es obligatorio."), {
      status: 400,
    });
  if (!meta.description)
    throw Object.assign(new Error("La meta description es obligatoria."), {
      status: 400,
    });

  await mkdir(path.join(rootDir, "blog-posts"), { recursive: true });

  const nextPath = path.join(rootDir, "blog-posts", `${nextSlug}.md`);
  const currentFile = currentSlug
    ? await findPostFileBySlug(rootDir, currentSlug)
    : null;
  const occupiedFile = await findPostFileBySlug(rootDir, nextSlug);
  const publishedTargetExists = await fileExists(
    path.join(rootDir, "f", nextSlug, "index.html"),
  );
  if (!currentSlug && (occupiedFile || publishedTargetExists)) {
    throw Object.assign(new Error("Ya existe un post con ese slug."), {
      status: 409,
    });
  }
  if (
    currentSlug &&
    ((occupiedFile && occupiedFile !== currentFile) ||
      (nextSlug !== currentSlug && publishedTargetExists))
  ) {
    throw Object.assign(new Error("Ya existe otro post con ese slug."), {
      status: 409,
    });
  }

  if (currentSlug) {
    assertSafeSlug(currentSlug);
    if (currentFile && currentFile !== `${nextSlug}.md`) {
      await renameIfExists(
        path.join(rootDir, "blog-posts", currentFile),
        nextPath,
      );
    }
    if (currentSlug !== nextSlug) {
      await renameIfExists(
        path.join(rootDir, "f", currentSlug),
        path.join(rootDir, "f", nextSlug),
      );
    }
  }

  await mkdir(path.join(rootDir, "f", nextSlug, "img"), { recursive: true });
  await writeFile(nextPath, serializePostMarkdown(meta, body), "utf8");
  return readPost(rootDir, nextSlug, defaults);
}

export async function listPostImages(rootDir, slug) {
  assertSafeSlug(slug);
  const imageDir = path.join(rootDir, "f", slug, "img");
  const files = await safeReadDir(imageDir);
  const metadata = await readImageMetadata(rootDir, slug);
  const images = [];

  for (const file of files.filter((entry) => IMAGE_EXT_RE.test(entry))) {
    const filePath = path.join(imageDir, file);
    const fileStat = await stat(filePath);
    images.push({
      file,
      url: `/f/${slug}/img/${file}`,
      bytes: fileStat.size,
      alt: metadata[file]?.alt || "",
      description: metadata[file]?.description || "",
      isFeatured: metadata[file]?.isFeatured || false,
      canDelete: true,
      source: "local",
    });
  }

  return images.sort((a, b) => a.file.localeCompare(b.file));
}

export async function savePostImage(rootDir, slug, fileName, base64Data) {
  assertSafeSlug(slug);
  const safeName = sanitizeImageName(fileName);
  const cleanData = String(base64Data || "").replace(/^data:[^;]+;base64,/, "");
  if (!cleanData) throw new Error("La imagen no contiene datos.");

  const imageDir = path.join(rootDir, "f", slug, "img");
  await mkdir(imageDir, { recursive: true });
  await writeFile(
    path.join(imageDir, safeName),
    Buffer.from(cleanData, "base64"),
  );
  await updateImageMetadata(rootDir, slug, safeName, {
    alt: "",
    description: "",
  });
  return { file: safeName, url: `/f/${slug}/img/${safeName}` };
}

export async function deletePostImage(rootDir, slug, fileName) {
  assertSafeSlug(slug);
  const safeName = sanitizeImageName(fileName);
  await rm(path.join(rootDir, "f", slug, "img", safeName), { force: true });
  const metadata = await readImageMetadata(rootDir, slug);
  delete metadata[safeName];
  await writeImageMetadata(rootDir, slug, metadata);
  return { deleted: safeName };
}

export async function saveImageMetadata(rootDir, slug, fileName, input) {
  assertSafeSlug(slug);
  const safeName = sanitizeImageName(fileName);
  const metadata = await readImageMetadata(rootDir, slug);
  const next = {
    alt: String(input.alt || "").trim(),
    description: String(input.description || "").trim(),
    isFeatured: Boolean(input.isFeatured),
  };

  if (next.isFeatured) {
    for (const image of Object.keys(metadata)) {
      metadata[image] = { ...metadata[image], isFeatured: false };
    }
  }

  metadata[safeName] = next;
  await writeImageMetadata(rootDir, slug, metadata);
  return { file: safeName, ...next };
}

async function safeReadDir(dir) {
  try {
    return await readdir(dir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readImageMetadata(rootDir, slug) {
  try {
    return JSON.parse(
      await readFile(
        path.join(rootDir, "f", slug, "img", IMAGE_META_FILE),
        "utf8",
      ),
    );
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeImageMetadata(rootDir, slug, metadata) {
  const imageDir = path.join(rootDir, "f", slug, "img");
  await mkdir(imageDir, { recursive: true });
  await writeFile(
    path.join(imageDir, IMAGE_META_FILE),
    JSON.stringify(metadata, null, 2) + "\n",
    "utf8",
  );
}

async function updateImageMetadata(rootDir, slug, fileName, patch) {
  const metadata = await readImageMetadata(rootDir, slug);
  metadata[fileName] = { ...(metadata[fileName] || {}), ...patch };
  await writeImageMetadata(rootDir, slug, metadata);
}

async function renameIfExists(from, to) {
  try {
    await rename(from, to);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function findPostFileBySlug(rootDir, slug) {
  const directFile = `${slug}.md`;
  const postsDir = path.join(rootDir, "blog-posts");
  try {
    await stat(path.join(postsDir, directFile));
    return directFile;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const files = await safeReadDir(postsDir);
  for (const file of files.filter((entry) => entry.endsWith(".md"))) {
    const content = await readFile(path.join(postsDir, file), "utf8");
    const { meta } = parsePostMarkdown(content);
    if ((meta.slug || file.replace(/\.md$/, "")) === slug) return file;
  }

  return null;
}

async function listGeneratedPosts(rootDir) {
  const outputDir = path.join(rootDir, "f");
  const entries = await safeReadDir(outputDir);
  const posts = [];

  const generatedPosts = await Promise.all(
    entries
      .filter((entry) => SLUG_RE.test(entry))
      .map(async (slug) => {
        const htmlPath = path.join(outputDir, slug, "index.html");
        try {
          const html = await readFile(htmlPath, "utf8");
          const meta = extractGeneratedMeta(html, slug);
          return {
            slug,
            file: "f/" + slug + "/index.html",
            source: "generated-html",
            title: meta.title,
            description: meta.description,
            date: meta.date,
            lang: meta.lang,
            image: meta.image,
            tags: meta.tags,
            category: meta.category,
            level: meta.level,
            status: "published",
            format: "html",
            isPublished: true,
            words: htmlToText(extractArticleHtml(html))
              .split(/\s+/)
              .filter(Boolean).length,
            images: await collectPostImages(
              rootDir,
              slug,
              meta.image,
              meta.title,
            ),
          };
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          return null;
        }
      }),
  );
  posts.push(...generatedPosts.filter(Boolean));

  return posts;
}

async function readGeneratedPost(rootDir, slug, defaults = {}) {
  const html = await readFile(
    path.join(rootDir, "f", slug, "index.html"),
    "utf8",
  );
  const meta = extractGeneratedMeta(html, slug);
  return {
    slug,
    file: "f/" + slug + "/index.html",
    source: "generated-html",
    meta: {
      title: meta.title,
      slug,
      description: meta.description,
      date: meta.date,
      author: defaults.defaultAuthor || "",
      lang: meta.lang || defaults.defaultLanguage || "es",
      image: meta.image,
      tags: meta.tags.join(", "),
      category: meta.category,
      level: meta.level,
      status: "published",
      content_format: "html",
    },
    body: extractArticleHtml(html),
    format: "html",
    isPublished: true,
    images: await collectPostImages(rootDir, slug, meta.image, meta.title),
  };
}

async function collectPostImages(rootDir, slug, featuredImage, title = "") {
  const images = await listPostImages(rootDir, slug);
  const featured = normalizeFeaturedImage(slug, featuredImage, title);
  if (!featured) return images;

  let hasFeatured = false;
  for (const image of images) {
    const isFeatured = isSameImageReference(image, featured);
    image.isFeatured = image.isFeatured || isFeatured;
    hasFeatured ||= isFeatured;
  }

  return hasFeatured ? images : [featured, ...images];
}

function normalizeFeaturedImage(slug, value, title = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let url = raw;
  try {
    new URL(raw);
  } catch {
    if (raw.startsWith("img/")) url = `/f/${slug}/${raw}`;
  }

  return {
    file: path.basename(url) || "imagen-principal",
    url,
    bytes: 0,
    alt: title,
    description: "Imagen principal del post",
    isFeatured: true,
    canDelete: false,
    source: "featured",
  };
}

function isSameImageReference(image, featured) {
  return (
    image.url === featured.url ||
    image.file === featured.file ||
    featured.url.endsWith(`/img/${image.file}`)
  );
}

function extractGeneratedMeta(html, slug) {
  const title = stripSiteSuffix(
    readTag(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      readTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
      slug,
  );
  const description =
    readTag(html, /<meta\s+name="description"\s+content="([^"]*)"/i) ||
    readTag(html, /<meta\s+property="og:description"\s+content="([^"]*)"/i) ||
    "";
  const image =
    readTag(html, /<meta\s+property="og:image"\s+content="([^"]*)"/i) || "";
  const lang = readTag(html, /<html\s+lang="([^"]*)"/i) || "es";
  const date = readTag(html, /"datePublished"\s*:\s*"([^"]*)"/i) || "";
  const level = readTag(html, /Nivel\s+([A-C][12](?:-[A-C][12])?)/i) || "";
  const tags = [
    ...html.matchAll(/<span class="blog-pill">([\s\S]*?)<\/span>/gi),
  ]
    .map((match) => htmlToText(match[1]))
    .filter(Boolean);

  return {
    title: htmlToText(title),
    description: decodeHtml(description),
    image,
    lang,
    date,
    tags,
    category: tags[0] || "",
    level,
  };
}

function extractArticleHtml(html) {
  return (
    readTag(
      html,
      /<div class="blog-post-card">([\s\S]*?)<\/div>\s*<\/article>/i,
    ) ||
    readTag(html, /<article[^>]*>([\s\S]*?)<\/article>/i) ||
    ""
  );
}

function htmlToText(html) {
  return decodeHtml(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function readTag(html, regex) {
  return (
    String(html || "")
      .match(regex)?.[1]
      ?.trim() || ""
  );
}

function stripSiteSuffix(value) {
  return String(value || "").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&uuml;/g, "ü")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeList(value) {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(", ");
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
