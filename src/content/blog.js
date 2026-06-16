import { createSeoMetadata } from "../seo/share.js";
import {
  createBlogPostingSchema,
  createBreadcrumbSchema,
  createWebSiteSchema,
} from "../seo/structured-data.js";
import { createExcerpt, normalizeText, slugify } from "../utils/text.js";

function joinUrl(baseUrl, path = "") {
  if (!normalizeText(baseUrl)) {
    return normalizeText(path);
  }

  return new URL(path || "", baseUrl).toString();
}

function createBlogIndexMetadata(config = {}) {
  const siteUrl = normalizeText(config.siteUrl);
  const path = normalizeText(config.path || "/blog/");
  const canonicalUrl = joinUrl(siteUrl, path);
  const title = normalizeText(config.title || "Blog");
  const description = createExcerpt(
    config.description || "Articles, guides, and updates.",
    config.descriptionLength || 160,
  );

  return createSeoMetadata({
    baseUrl: canonicalUrl,
    canonicalUrl,
    title,
    description,
    imageUrl: config.imageUrl,
    siteName: config.siteName,
    appName: config.siteName,
    ogType: "website",
  });
}

function createBlogPostMetadata(config = {}) {
  const siteUrl = normalizeText(config.siteUrl);
  const slug = normalizeText(config.slug || slugify(config.title));
  const path = normalizeText(config.path || `/blog/${slug}/`);
  const canonicalUrl = joinUrl(siteUrl, path);
  const description = createExcerpt(
    config.description || config.excerpt || config.summary || "",
    config.descriptionLength || 160,
  );
  const title = normalizeText(config.title);

  return createSeoMetadata({
    baseUrl: canonicalUrl,
    canonicalUrl,
    title,
    description,
    imageUrl: config.imageUrl,
    imageAlt: config.imageAlt || title,
    siteName: config.siteName,
    appName: config.siteName,
    ogType: "article",
    twitterCard: config.twitterCard,
  });
}

function createBlogPostSeoBundle(config = {}) {
  const siteUrl = normalizeText(config.siteUrl);
  const path = normalizeText(config.path || `/blog/${slugify(config.title)}/`);
  const canonicalUrl = joinUrl(siteUrl, path);
  const metadata = createBlogPostMetadata({
    ...config,
    path,
  });
  const websiteSchema = createWebSiteSchema({
    name: config.siteName,
    url: siteUrl,
    description: config.siteDescription,
    language: config.language,
    publisher: config.publisher,
  });
  const blogPostingSchema = createBlogPostingSchema({
    baseUrl: siteUrl,
    url: canonicalUrl,
    title: config.title,
    description: metadata.description,
    image: config.image || config.imageUrl,
    datePublished: config.datePublished,
    dateModified: config.dateModified,
    authors: config.authors || config.author,
    publisher: config.publisher,
    keywords: config.keywords || config.tags,
    section: config.section || config.category,
  });
  const breadcrumbs = createBreadcrumbSchema(
    [
      { name: config.homeLabel || "Home", path: "/" },
      { name: config.blogLabel || "Blog", path: "/blog/" },
      { name: config.title, path },
    ],
    { baseUrl: siteUrl },
  );

  return {
    metadata,
    schemas: [websiteSchema, blogPostingSchema, breadcrumbs],
  };
}

export {
  createBlogIndexMetadata,
  createBlogPostMetadata,
  createBlogPostSeoBundle,
};
