/*
  Auto-flowing rails: the catalog items and the client wall drift from right to
  left on their own, the way twilio's proof bands do.

  All this file does is measure and pad the track; the movement, the pause on hover
  and the reduced-motion fallback live in CSS. One copy of the cards is a loop's
  period, so the shift is published in pixels (--flow-shift) instead of a fixed
  half-width, and the cards are cloned until a full period of content is left on
  screen at the moment the track wraps. Duration follows distance, so a long rail
  and a short one travel at the same speed rather than the long one sprinting.
*/
(() => {
  "use strict";
  const PX_PER_SECOND = 44;
  const MAX_COPIES = 6;
  const FOCUSABLE = "a[href], button, input, select, textarea, summary, [tabindex]";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rails = Array.prototype.slice.call(document.querySelectorAll(".flow"));
  if (!rails.length) return;

  function prepare(rail) {
    const items = rail.querySelector(".flow__items");
    if (!items) return;
    /* The first pass fixes what one copy is: everything loaded in the markup, in
       order. Clones are appended after it and stripped back to that length each
       time, so a re-measure can never mistake its own padding for content. */
    if (!items.dataset.srcCount) {
      if (!items.children.length) return;
      items.dataset.srcCount = String(items.children.length);
    }
    const count = Number(items.dataset.srcCount);
    while (items.children.length > count) items.lastElementChild.remove();
    const src = Array.prototype.slice.call(items.children);
    if (!src.length) return;

    const one = src.reduce((w, n) => w + n.getBoundingClientRect().width, 0) +
      (parseFloat(getComputedStyle(items).columnGap) || 0) * (src.length - 1);
    if (one < 1) return;

    const copies = Math.min(MAX_COPIES, Math.ceil(rail.clientWidth / one) + 1);
    for (let c = 1; c < copies; c++) {
      src.forEach((n) => {
        const clone = n.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        /* aria-hidden must not wrap a tab stop: a keyboard visitor would land on an
           invisible duplicate and get nothing in return. CSS already seals the
           duplicates off from the pointer; this seals them off from Tab as well. */
        [clone].concat(Array.prototype.slice.call(clone.querySelectorAll(FOCUSABLE)))
          .forEach((f) => { f.tabIndex = -1; });
        items.appendChild(clone);
      });
    }

    /* A wall too short to fill the screen even when repeated would only jitter, so
       it stays a plain row instead. */
    const live = copies >= 2 && one >= rail.clientWidth * 0.6 && !reduced();
    rail.classList.toggle("flow--live", live);
    rail.style.setProperty("--flow-shift", Math.round(one) + "px");
    rail.style.setProperty("--flow-dur", (one / PX_PER_SECOND).toFixed(1) + "s");
  }

  rails.forEach((rail) => {
    prepare(rail);
    /* A finger that lands on the rail holds it: hover cannot be relied on there,
       and the cards must stay put long enough to tap one. */
    rail.addEventListener("pointerdown", () => rail.classList.add("is-held"));
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
      rail.addEventListener(ev, () => rail.classList.remove("is-held")));
  });

  let timer = null;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => rails.forEach(prepare), 250);
  }, { passive: true });

  // A rail filled after page load (the client wall arrives by fetch) is measured
  // by its renderer asking for a refresh rather than knowing any of this.
  window.BROWNHUB_FLOW = { refresh: () => rails.forEach(prepare) };

  // Card labels change width when the page is re-applied in another language.
  document.addEventListener("i18n-applied", () => rails.forEach(prepare));
})();
