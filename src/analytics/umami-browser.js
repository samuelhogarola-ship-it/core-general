(function installUmamiAnalyticsCore(global) {
  "use strict";

  if (global.UmamiAnalyticsCore) {
    global.WFAnalytics = global.UmamiAnalyticsCore;
    return;
  }

  var DEFAULT_THRESHOLDS = [15, 30, 60, 120];
  var state = createState();

  function createState() {
    return {
      config: null,
      queue: [],
      script: null,
      consent: true,
      autoEventsBound: false,
      clickListener: null,
      visibilityListener: null,
      engagementTimer: null,
      visibleMilliseconds: 0,
      lastVisibleAt: null,
      emittedThresholds: Object.create(null),
      inferEvent: null,
    };
  }

  function isValidWebsiteId(value) {
    var id = String(value || "").trim();
    if (!id || /placeholder|replace|{{|umami_website_id/i.test(id))
      return false;
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      id,
    );
  }

  function tracker() {
    return global.umami && typeof global.umami.track === "function"
      ? global.umami
      : null;
  }

  function flush() {
    var client = tracker();
    if (!client || !state.consent) return false;
    while (state.queue.length) {
      var entry = state.queue.shift();
      if (entry.type === "pageview") client.track(entry.payload);
      else client.track(entry.name, entry.data);
    }
    return true;
  }

  function send(entry) {
    if (!state.consent || !state.config) return false;
    var client = tracker();
    if (!client) {
      state.queue.push(entry);
      return true;
    }
    if (entry.type === "pageview") client.track(entry.payload);
    else client.track(entry.name, entry.data);
    return true;
  }

  function normalizePath(value) {
    var path = String(value || "/").split(/[?#]/)[0] || "/";
    if (path.charAt(0) !== "/") path = "/" + path;
    return path === "/" ? path : path.replace(/\/+$/, "");
  }

  function normalizePageviewPath(value) {
    var path = String(value || "/").split(/[?#]/)[0] || "/";
    return path.charAt(0) === "/" ? path : "/" + path;
  }

  function resolveDimension(items, pathname) {
    var exact = [];
    var prefixes = [];
    (items || []).forEach(function addRules(item) {
      var routes = item && item.routes ? item.routes : {};
      (routes.exact || []).forEach(function addExact(path) {
        exact.push({ key: item.key, path: normalizePath(path) });
      });
      (routes.prefixes || []).forEach(function addPrefix(path) {
        var normalized = normalizePath(path);
        prefixes.push({
          key: item.key,
          path: normalized === "/" ? "/" : normalized + "/",
        });
      });
    });
    exact.sort(function bySpecificity(left, right) {
      return right.path.length - left.path.length;
    });
    prefixes.sort(function bySpecificity(left, right) {
      return right.path.length - left.path.length;
    });
    var exactMatch = exact.find(function matches(rule) {
      return pathname === rule.path;
    });
    if (exactMatch) return exactMatch.key;
    var prefixMatch = prefixes.find(function matches(rule) {
      return (
        rule.path === "/" ||
        pathname === rule.path.slice(0, -1) ||
        pathname.indexOf(rule.path) === 0
      );
    });
    return prefixMatch ? prefixMatch.key : "";
  }

  function context() {
    var profile = state.config.profile || {};
    var pathname = normalizePath(global.location && global.location.pathname);
    var language = resolveDimension(profile.languages, pathname);
    if (!language) {
      var documentLanguage = String(
        document.documentElement && document.documentElement.lang,
      )
        .trim()
        .toLowerCase()
        .split("-")[0];
      if (
        (profile.languages || []).some(function isSupported(item) {
          return item.key === documentLanguage;
        })
      ) {
        language = documentLanguage;
      }
    }
    return {
      schemaVersion: Number(profile.schemaVersion) || 1,
      contentLanguage: language,
      section: resolveDimension(profile.sections, pathname),
    };
  }

  function allowedEvent(name) {
    var events =
      (state.config.profile && state.config.profile.allowedEvents) || [];
    return events.some(function matches(event) {
      return event && event.key === name;
    });
  }

  function safeValue(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") return value.slice(0, 120);
    return undefined;
  }

  function safeEventData(data) {
    var output = context();
    var keys =
      (state.config.profile && state.config.profile.allowedContextKeys) || [];
    keys.forEach(function copyAllowed(key) {
      var value = safeValue(data && data[key]);
      if (value !== undefined) output[key] = value;
    });
    return output;
  }

  function isExcludedDestination(element) {
    if (!element || !element.href) return false;
    var destination;
    try {
      destination = new URL(
        element.href,
        global.location && global.location.href,
      );
    } catch {
      return true;
    }
    var value = (destination.origin + destination.pathname).replace(/\/$/, "");
    var exclusions =
      (state.config.profile && state.config.profile.excludedDestinations) || [];
    return exclusions.some(function matches(excluded) {
      var normalized = String(excluded || "").replace(/\/$/, "");
      return value === normalized || value.indexOf(normalized + "/") === 0;
    });
  }

  function dataFromElement(element) {
    var output = {};
    var keys =
      (state.config.profile && state.config.profile.allowedContextKeys) || [];
    keys.forEach(function readAllowed(key) {
      var datasetKey = "analytics" + key.charAt(0).toUpperCase() + key.slice(1);
      if (element.dataset && element.dataset[datasetKey] !== undefined) {
        output[key] = element.dataset[datasetKey];
      }
    });
    return output;
  }

  function onClick(event) {
    var target = event && event.target;
    var element =
      target && typeof target.closest === "function"
        ? target.closest("[data-analytics-event], a[href]")
        : target;
    if (!element || isExcludedDestination(element)) return;
    var inferred = state.inferEvent ? state.inferEvent(element, event) : null;
    var name =
      (inferred && inferred.name) ||
      (element.dataset && element.dataset.analyticsEvent);
    var data =
      (inferred && inferred.data) ||
      (element.dataset ? dataFromElement(element) : {});
    if (name) api.trackEvent(name, data);
  }

  function updateVisibleElapsed() {
    var now = Date.now();
    if (document.visibilityState === "visible") {
      if (state.lastVisibleAt !== null) {
        state.visibleMilliseconds += Math.max(0, now - state.lastVisibleAt);
      }
      state.lastVisibleAt = now;
    } else {
      if (state.lastVisibleAt !== null) {
        state.visibleMilliseconds += Math.max(0, now - state.lastVisibleAt);
      }
      state.lastVisibleAt = null;
    }
  }

  function emitReachedThresholds() {
    updateVisibleElapsed();
    var thresholds = state.config.engagementThresholds || DEFAULT_THRESHOLDS;
    thresholds.forEach(function emit(seconds) {
      var value = Number(seconds);
      if (
        value > 0 &&
        !state.emittedThresholds[value] &&
        state.visibleMilliseconds >= value * 1000
      ) {
        state.emittedThresholds[value] = true;
        api.trackEvent("engagement_" + value + "s", {
          thresholdSeconds: value,
        });
      }
    });
  }

  function onVisibilityChange() {
    updateVisibleElapsed();
  }

  function addTrackerScript(config) {
    var existing = document.querySelector("script[data-umami-analytics-core]");
    if (existing) {
      state.script = existing;
      return existing;
    }
    var script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = String(config.scriptSrc || "").trim();
    script.dataset.umamiAnalyticsCore = "true";
    script.dataset.websiteId = String(config.websiteId).trim();
    if (config.hostUrl) script.dataset.hostUrl = String(config.hostUrl).trim();
    if (Array.isArray(config.domains) && config.domains.length) {
      script.dataset.domains = config.domains.join(",");
    }
    if (config.autoTrack === false) script.dataset.autoTrack = "false";
    script.addEventListener("load", flush);
    document.head.appendChild(script);
    state.script = script;
    return script;
  }

  var api = {
    init: function init(config) {
      if (!config || !isValidWebsiteId(config.websiteId)) return false;
      if (state.config) return true;
      state.config = {
        websiteId: String(config.websiteId).trim(),
        scriptSrc: String(config.scriptSrc || "").trim(),
        hostUrl: config.hostUrl,
        domains: config.domains,
        autoTrack: config.autoTrack,
        profile: config.profile || {},
        engagementThresholds: Array.isArray(config.engagementThresholds)
          ? config.engagementThresholds
          : DEFAULT_THRESHOLDS,
      };
      addTrackerScript(state.config);
      flush();
      return true;
    },

    trackEvent: function trackEvent(name, data) {
      var eventName = String(name || "").trim();
      if (!allowedEvent(eventName)) return false;
      return send({
        type: "event",
        name: eventName,
        data: safeEventData(data || {}),
      });
    },

    trackPageview: function trackPageview(path, title) {
      var payload = { url: normalizePageviewPath(path) };
      var safeTitle = String(title || "").trim();
      if (safeTitle) payload.title = safeTitle.slice(0, 200);
      return send({ type: "pageview", payload: payload });
    },

    bindAutoEvents: function bindAutoEvents(options) {
      if (!state.config) return false;
      if (options && typeof options.inferEvent === "function") {
        state.inferEvent = options.inferEvent;
      }
      if (state.autoEventsBound) return true;
      state.autoEventsBound = true;
      state.clickListener = onClick;
      state.visibilityListener = onVisibilityChange;
      document.addEventListener("click", state.clickListener);
      document.addEventListener("visibilitychange", state.visibilityListener);
      state.lastVisibleAt =
        document.visibilityState === "visible" ? Date.now() : null;
      state.engagementTimer = global.setInterval(emitReachedThresholds, 1000);
      return true;
    },

    grantConsent: function grantConsent() {
      state.consent = true;
      flush();
      return true;
    },

    revokeConsent: function revokeConsent() {
      state.consent = false;
      state.queue.length = 0;
      return true;
    },

    _reset: function reset() {
      if (state.clickListener)
        document.removeEventListener("click", state.clickListener);
      if (state.visibilityListener)
        document.removeEventListener(
          "visibilitychange",
          state.visibilityListener,
        );
      if (state.engagementTimer !== null)
        global.clearInterval(state.engagementTimer);
      if (state.script && typeof state.script.remove === "function")
        state.script.remove();
      state = createState();
      return true;
    },
  };

  global.UmamiAnalyticsCore = api;
  global.WFAnalytics = api;
})(window);
