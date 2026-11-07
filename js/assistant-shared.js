(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BHAssistant = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function route(text, routeAs, matchIntent) {
    if (routeAs) return matchIntent(routeAs);
    const clean = String(text || "").trim().replace(/\s+/g, " ");
    if (!/^(hi|hello|hey|good morning|good afternoon|good evening|help|what can you do|assist|options|human|agent|real person|talk to someone|speak to someone|call you|phone|email|whatsapp|contact)$/i.test(clean)) return null;
    return matchIntent(clean);
  }

  function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function matchUrl(value) {
    return /^catalog\.html\?q=\S+$/.test(value);
  }

  function sourceUrl(value) {
    try {
      return new URL(value).protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  function normalizeMatches(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(record).map((item) => ({
      id: text(item.id),
      name: text(item.name),
      reason: text(item.reason),
      url: text(item.url)
    })).filter((item) => item.id && item.name && item.reason && matchUrl(item.url)).slice(0, 3);
  }

  function normalizeSources(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(record).map((item) => ({
      title: text(item.title),
      url: text(item.url)
    })).filter((item) => item.title && sourceUrl(item.url)).slice(0, 3);
  }

  function finiteAmount(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  function normalizeEstimate(value) {
    if (value === null || value === undefined) return null;
    if (!record(value)) throw new TypeError("Invalid assistant estimate.");
    const valid = text(value.category) && text(value.currency) && text(value.turnaround) &&
      finiteAmount(value.min) && (value.max === null || finiteAmount(value.max)) &&
      typeof value.fromOnly === "boolean" && typeof value.designOnly === "boolean" &&
      typeof value.printingExcluded === "boolean" && typeof value.requiresConfirmation === "boolean";
    if (!valid) throw new TypeError("Invalid assistant estimate.");
    return {
      category: value.category,
      currency: value.currency,
      min: value.min,
      max: value.max,
      fromOnly: value.fromOnly,
      turnaround: value.turnaround,
      designOnly: value.designOnly,
      printingExcluded: value.printingExcluded,
      requiresConfirmation: value.requiresConfirmation
    };
  }

  function envelope(raw) {
    if (!record(raw) || typeof raw.answer !== "string") throw new TypeError("Invalid assistant response.");
    const answer = raw.answer.trim().slice(0, 4000);
    if (!answer) throw new TypeError("Assistant response is missing an answer.");
    return {
      answer: answer,
      matches: normalizeMatches(raw.matches),
      sources: normalizeSources(raw.sources),
      estimate: normalizeEstimate(raw.estimate)
    };
  }

  return { route: route, envelope: envelope };
});
