/*
  The numbers band and the milestone timeline. Both read data/metrics.json, where
  every figure is one the studio can point to in its own records — an entry whose
  value is still null is left out rather than guessed at, and a band with nothing
  renderable stays hidden instead of showing an empty frame.
  The JSON is a committed, reviewed file rather than user input, and every value is
  still escaped before it reaches the DOM.
*/
(() => {
  "use strict";
  const doc = document;
  const kpiBand = doc.getElementById("stats");
  const kpiHost = doc.getElementById("stats-items");
  const lineBand = doc.getElementById("milestones");
  const lineHost = doc.getElementById("milestones-items");
  if (!kpiHost || !lineHost) return;

  function esc(t) {
    return String(t).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* The count starts on screen at zero and is filled by BROWNHUB_COUNT when the
     band scrolls into view; a value that is not a number means the studio has not
     counted this yet, so no card is built for it at all. */
  function metric(m) {
    const n = Number(m && m.value);
    if (!m || !isFinite(n) || m.value === null || m.value === "" || n < 0) return "";
    return '<article class="kpi"><p class="kpi__num"><span data-count="' +
      n + '">0</span></p><h3 class="kpi__label">' + esc(m.label || "") + "</h3>" +
      (m.note ? '<p class="kpi__note">' + esc(m.note) + "</p>" : "") + "</article>";
  }

  function milestone(m) {
    if (!m || !m.title) return "";
    return '<li class="tl"><p class="tl__date">' + esc(m.date || "") + "</p>" +
      '<div class="tl__body"><h3 class="tl__title">' + esc(m.title) + "</h3>" +
      (m.text ? '<p class="tl__text">' + esc(m.text) + "</p>" : "") + "</div></li>";
  }

  // no-cache: the owner adds figures by editing that file, and a returning
  // visitor should see a new number without a hard refresh.
  fetch("data/metrics.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => {
      const cards = (Array.isArray(d.metrics) ? d.metrics : []).map(metric).join("");
      if (cards) {
        kpiHost.innerHTML = cards;
        if (kpiBand) kpiBand.hidden = false;
      }
      const stones = (Array.isArray(d.milestones) ? d.milestones : []).map(milestone).join("");
      if (stones) {
        lineHost.innerHTML = stones;
        if (lineBand) lineBand.hidden = false;
      }
      if (window.BROWNHUB_COUNT) window.BROWNHUB_COUNT.watch(doc.body);
    })
    .catch(() => {});
})();
