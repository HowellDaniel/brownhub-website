/*
  The pinned process story.

  One viewport holds the picture while the four steps turn past it, and the
  diamond rail under the stage names the step you are on. The reference site
  drives this with a slider library; this file does the same job with the sticky
  element the markup already has, one rect read per frame, and no dependency.

  Everything is opt-in: the band ships as a plain stacked list, and the pinned
  arrangement only appears once this script adds .js-pstory to <html>. A visitor
  who asked for less motion, a short window, a phone, or scripting turned off all
  keep the stack.
*/
(() => {
  "use strict";
  const doc = document, root = doc.documentElement;
  const band = doc.querySelector(".pstory");
  if (!band) return;
  const slides = [].slice.call(band.querySelectorAll(".pstory__slide"));
  const steps = [].slice.call(band.querySelectorAll(".pstory__step"));
  const run = band.querySelector(".pstory__run");
  const skip = band.querySelector(".pstory__skip");
  const N = slides.length;
  if (N < 2 || steps.length !== N || !run) return;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const room = matchMedia("(min-width:900px) and (min-height:600px)");
  let pinned = false, index = -1, queued = false;

  /* The nav condenses as you scroll and js/scroll.js keeps --nav-h on its real
     height, so the sticky offset is read rather than guessed. */
  const navH = () => parseFloat(root.style.getPropertyValue("--nav-h")) || 72;
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  function set(i) {
    if (i === index) return;
    index = i;
    for (let k = 0; k < N; k++) {
      const on = k === i;
      slides[k].dataset.on = on ? "true" : "false";
      steps[k].dataset.active = on ? "true" : "false";
      /* aria-current, not aria-selected: these are steps of a process, not tabs,
         and a screen reader should read the position out loud. */
      if (on) steps[k].setAttribute("aria-current", "step");
      else steps[k].removeAttribute("aria-current");
    }
  }

  function progress() {
    const span = run.offsetHeight || 1;
    return clamp((navH() - band.getBoundingClientRect().top) / span);
  }

  function follow() {
    queued = false;
    if (!pinned) return;
    set(Math.round(progress() * (N - 1)));
  }
  function onScroll() {
    if (pinned && !queued) { queued = true; requestAnimationFrame(follow); }
  }

  /* Jumping to a step lands a hair inside that step's own window, so the rounding
     in follow() cannot hand the frame back to its neighbour. */
  function goTo(i) {
    const y = band.getBoundingClientRect().top + scrollY - navH() + (i / (N - 1)) * run.offsetHeight + 2;
    scrollTo({ top: y, behavior: reduce.matches ? "auto" : "smooth" });
  }

  steps.forEach((b, i) => b.addEventListener("click", () => goTo(i)));
  /* The rail is a row of buttons, so arrow keys should walk it the way they walk
     any other group rather than leaving the page behind. */
  band.querySelector(".pstory__rail").addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = Math.min(N - 1, Math.max(0, (index < 0 ? 0 : index) + d));
    goTo(i);
    steps[i].focus();
  });

  if (skip) {
    skip.addEventListener("click", () => {
      const y = band.getBoundingClientRect().top + scrollY + band.offsetHeight - navH();
      scrollTo({ top: y, behavior: reduce.matches ? "auto" : "smooth" });
    });
  }

  function evaluate() {
    const want = room.matches && !reduce.matches;
    if (want === pinned) return;
    pinned = want;
    root.classList.toggle("js-pstory", pinned);
    if (!pinned) {
      /* Back to the stack: every step shows, and the rail stops pretending to be
         a position indicator it cannot move. */
      index = -1;
      slides.forEach((s) => { s.removeAttribute("data-on"); });
      steps.forEach((s) => { s.removeAttribute("data-active"); s.removeAttribute("aria-current"); });
      return;
    }
    follow();
  }

  addEventListener("scroll", onScroll, { passive: true });
  room.addEventListener("change", evaluate);
  reduce.addEventListener("change", evaluate);
  addEventListener("resize", () => { if (pinned) evaluate(); }, { passive: true });
  /* Translation rewrites the rail labels and can wrap a headline onto a second
     line, which changes nothing about the geometry but does mean the current
     index should be re-read once the paint settles. */
  addEventListener("i18n-applied", () => { if (pinned) { index = -1; follow(); } });

  evaluate();
  if (pinned) addEventListener("load", follow, { once: true });
})();
