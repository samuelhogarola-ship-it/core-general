import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const runtimeSource = readFileSync(
  new URL("../src/analytics/umami-browser.js", import.meta.url),
  "utf8",
);

function createBrowser({ pathname = "/en/blog/post/", visible = true } = {}) {
  let now = 0;
  let intervalId = 0;
  const intervals = new Map();
  const documentListeners = new Map();
  const scripts = [];
  const document = {
    documentElement: { lang: "en" },
    visibilityState: visible ? "visible" : "hidden",
    head: {
      appendChild(script) {
        scripts.push(script);
        script.parentNode = this;
      },
    },
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        dataset: {},
        addEventListener(name, callback) {
          this[`on${name}`] = callback;
        },
        remove() {
          const index = scripts.indexOf(this);
          if (index >= 0) scripts.splice(index, 1);
        },
      };
    },
    addEventListener(name, callback) {
      const callbacks = documentListeners.get(name) || [];
      callbacks.push(callback);
      documentListeners.set(name, callbacks);
    },
    removeEventListener(name, callback) {
      const callbacks = documentListeners.get(name) || [];
      documentListeners.set(
        name,
        callbacks.filter((entry) => entry !== callback),
      );
    },
    querySelector(selector) {
      if (selector === "script[data-umami-analytics-core]")
        return scripts[0] || null;
      return null;
    },
  };
  const window = {
    document,
    location: {
      pathname,
      href: `https://www.webfuengirola.com${pathname}`,
      origin: "https://www.webfuengirola.com",
    },
    setInterval(callback) {
      intervalId += 1;
      intervals.set(intervalId, callback);
      return intervalId;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
  };
  const context = vm.createContext({
    window,
    document,
    URL,
    console,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
  });
  vm.runInContext(runtimeSource, context);
  return {
    window,
    document,
    scripts,
    listeners: documentListeners,
    advance(milliseconds) {
      now += milliseconds;
      for (const callback of [...intervals.values()]) callback();
    },
    dispatch(name, event = {}) {
      for (const callback of documentListeners.get(name) || []) callback(event);
    },
  };
}

function profile() {
  return {
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
        routes: { exact: [], prefixes: ["/en/"] },
      },
    ],
    sections: [
      {
        key: "blog",
        label: "Blog",
        routes: { exact: [], prefixes: ["/blog/", "/en/blog/"] },
      },
    ],
    allowedEvents: [
      { key: "language_switch", label: "Language", category: "commercial" },
      { key: "blog_to_landing", label: "Blog CTA", category: "commercial" },
      ...[15, 30, 60, 120].map((seconds) => ({
        key: `engagement_${seconds}s`,
        label: `${seconds}s`,
        category: "engagement",
      })),
    ],
    allowedContextKeys: ["market", "targetLanguage"],
    excludedDestinations: ["https://portal.webfuengirola.com"],
  };
}

function config(overrides = {}) {
  return {
    websiteId: "11111111-2222-4333-8444-555555555555",
    scriptSrc: "https://stats.example.com/script.js",
    hostUrl: "https://stats.example.com",
    domains: ["webfuengirola.com", "www.webfuengirola.com"],
    profile: profile(),
    ...overrides,
  };
}

test("publishes the compatibility alias and adds one configured tracker script", () => {
  const browser = createBrowser();

  browser.window.UmamiAnalyticsCore.init(config());
  browser.window.UmamiAnalyticsCore.init(config());

  assert.equal(browser.window.WFAnalytics, browser.window.UmamiAnalyticsCore);
  assert.equal(browser.scripts.length, 1);
  assert.equal(browser.scripts[0].src, "https://stats.example.com/script.js");
  assert.equal(browser.scripts[0].dataset.websiteId, config().websiteId);
  assert.equal(browser.scripts[0].dataset.hostUrl, "https://stats.example.com");
  assert.equal(
    browser.scripts[0].dataset.domains,
    "webfuengirola.com,www.webfuengirola.com",
  );
});

test("missing and placeholder website ids remain inert", () => {
  for (const websiteId of ["", "UMAMI_WEBSITE_ID", "replace-me", "{{ id }}"]) {
    const browser = createBrowser();
    assert.equal(
      browser.window.UmamiAnalyticsCore.init(config({ websiteId })),
      false,
    );
    assert.equal(browser.scripts.length, 0);
  }
});

test("queues custom events and flushes safe contextual data after tracker load", () => {
  const browser = createBrowser();
  const calls = [];
  browser.window.UmamiAnalyticsCore.init(config());
  browser.window.WFAnalytics.trackEvent("language_switch", {
    market: "es",
    targetLanguage: "fi",
    email: "private@example.com",
  });
  assert.equal(calls.length, 0);

  browser.window.umami = { track: (...args) => calls.push(args) };
  browser.scripts[0].onload();

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    [
      "language_switch",
      {
        schemaVersion: 1,
        contentLanguage: "en",
        section: "blog",
        market: "es",
        targetLanguage: "fi",
      },
    ],
  ]);
});

test("drops disallowed event names and unsupported context fields", () => {
  const browser = createBrowser();
  const calls = [];
  browser.window.umami = { track: (...args) => calls.push(args) };
  browser.window.UmamiAnalyticsCore.init(config());

  assert.equal(
    browser.window.WFAnalytics.trackEvent("lead_with_email", {
      email: "x@y.test",
    }),
    false,
  );
  browser.window.WFAnalytics.trackEvent("language_switch", {
    market: "es",
    email: "x@y.test",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].email, undefined);
});

test("a route prefix classifies both its directory root and descendants", () => {
  const browser = createBrowser({ pathname: "/en/blog/" });
  const calls = [];
  browser.window.umami = { track: (...args) => calls.push(args) };
  browser.window.UmamiAnalyticsCore.init(config());

  browser.window.WFAnalytics.trackEvent("language_switch");

  assert.equal(calls[0][1].contentLanguage, "en");
  assert.equal(calls[0][1].section, "blog");
});

test("manual pageviews use an Umami pageview payload instead of a custom pageview event", () => {
  const browser = createBrowser();
  const calls = [];
  browser.window.umami = { track: (...args) => calls.push(args) };
  browser.window.UmamiAnalyticsCore.init(config({ autoTrack: false }));

  browser.window.UmamiAnalyticsCore.trackPageview("/en/services/", "Services");

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    [{ url: "/en/services/", title: "Services" }],
  ]);
  assert.notEqual(calls[0][0], "pageview");
  assert.equal(browser.scripts[0].dataset.autoTrack, "false");
});

test("auto events bind once and excluded Área cliente destinations never emit", () => {
  const browser = createBrowser();
  const calls = [];
  browser.window.umami = { track: (...args) => calls.push(args) };
  browser.window.UmamiAnalyticsCore.init(config());
  browser.window.UmamiAnalyticsCore.bindAutoEvents();
  browser.window.UmamiAnalyticsCore.bindAutoEvents();
  assert.equal(browser.listeners.get("click").length, 1);

  const portalLink = {
    dataset: { analyticsEvent: "blog_to_landing", market: "es" },
    href: "https://portal.webfuengirola.com/acceso",
    closest: () => portalLink,
  };
  browser.dispatch("click", { target: portalLink });
  assert.equal(calls.length, 0);

  const safeLink = {
    dataset: { analyticsEvent: "blog_to_landing", analyticsMarket: "es" },
    href: "https://www.webfuengirola.com/en/services/",
    closest: () => safeLink,
  };
  browser.dispatch("click", { target: safeLink });
  assert.equal(calls.length, 1);
});

test("site-owned event inference is supported without duplicate listeners", () => {
  const browser = createBrowser();
  const calls = [];
  browser.window.umami = { track: (...args) => calls.push(args) };
  browser.window.UmamiAnalyticsCore.init(config());
  const element = {
    dataset: {},
    href: "https://www.webfuengirola.com/en/services/",
    closest: () => element,
  };
  browser.window.UmamiAnalyticsCore.bindAutoEvents({
    inferEvent: () => ({ name: "blog_to_landing", data: { market: "es" } }),
  });
  browser.dispatch("click", { target: element });
  assert.equal(calls[0][0], "blog_to_landing");
});

test("engagement thresholds count visible time only and emit once", () => {
  const browser = createBrowser({ visible: false });
  const calls = [];
  browser.window.umami = { track: (...args) => calls.push(args) };
  browser.window.UmamiAnalyticsCore.init(config());
  browser.window.UmamiAnalyticsCore.bindAutoEvents();

  browser.advance(60_000);
  assert.deepEqual(calls, []);
  browser.document.visibilityState = "visible";
  browser.dispatch("visibilitychange");
  for (const milliseconds of [15_000, 15_000, 30_000, 60_000, 60_000]) {
    browser.advance(milliseconds);
  }

  assert.deepEqual(
    calls.map(([name]) => name),
    ["engagement_15s", "engagement_30s", "engagement_60s", "engagement_120s"],
  );
});

test("consent and reset stop tracking and remove runtime listeners", () => {
  const browser = createBrowser();
  const calls = [];
  browser.window.umami = { track: (...args) => calls.push(args) };
  browser.window.UmamiAnalyticsCore.init(config());
  browser.window.UmamiAnalyticsCore.bindAutoEvents();
  browser.window.UmamiAnalyticsCore.revokeConsent();
  assert.equal(
    browser.window.UmamiAnalyticsCore.trackEvent("language_switch"),
    false,
  );
  browser.window.UmamiAnalyticsCore.grantConsent();
  assert.equal(
    browser.window.UmamiAnalyticsCore.trackEvent("language_switch"),
    true,
  );
  browser.window.UmamiAnalyticsCore._reset();
  assert.equal(browser.listeners.get("click").length, 0);
  assert.equal(browser.listeners.get("visibilitychange").length, 0);
  assert.equal(calls.length, 1);
});
