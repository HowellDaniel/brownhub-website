/*
  Customer experience rail: twilio lets you grab their customer-story cards and
  throw them sideways (cursor:grab, then a transform driven by the pointer).
  Native scroll-snap already does the movement, so this adds only what CSS
  cannot: the dragging hand, pointer capture across the card edges, and
  Left/Right keys on the region. With scripting off the rail still scrolls by
  touch, trackpad and wheel.
*/
(() => {
  "use strict";
  const rails = document.querySelectorAll(".exp");
  rails.forEach((rail) => {
    const strip = rail.querySelector(".exp__items");
    if (!strip) return;
    let down = false, x0 = 0, left0 = 0, moved = 0;

    rail.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      down = true; moved = 0;
      x0 = e.clientX; left0 = strip.scrollLeft;
      rail.classList.add("is-dragging");
    });
    rail.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 4 && !rail.hasPointerCapture?.(e.pointerId)) {
        try { rail.setPointerCapture(e.pointerId); } catch (err) { /* not capturable yet */ }
      }
      moved = Math.max(moved, Math.abs(dx));
      strip.scrollLeft = left0 - dx;
    });
    const up = () => { down = false; rail.classList.remove("is-dragging"); };
    rail.addEventListener("pointerup", up);
    rail.addEventListener("pointercancel", up);
    rail.addEventListener("pointerleave", up);

    /* a drag must not turn into a click on whatever was under the pointer */
    rail.addEventListener("click", (e) => { if (moved > 8) { e.preventDefault(); e.stopPropagation(); } }, true);

    rail.addEventListener("keydown", (e) => {
      const step = Math.min(strip.clientWidth * 0.8, 440);
      if (e.key === "ArrowRight") { strip.scrollBy({ left: step, behavior: "smooth" }); e.preventDefault(); }
      if (e.key === "ArrowLeft") { strip.scrollBy({ left: -step, behavior: "smooth" }); e.preventDefault(); }
    });
  });
})();
