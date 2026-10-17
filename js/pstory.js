/*
  The pinned process story.

  One viewport holds the stage while the four steps pan past it sideways, and the
  diamond rail under the stage names the step you are on. The reference site
  drives this with a slider library; this file does the same job with the sticky
  element the markup already has, one rect read per frame, and no dependency.

  The steps travel the same axis the collection shelves now do, so the whole
  pinned layer of the page reads left to right — or right to left, on a shelf that
  does. This file only ever names the step; CSS lays the row out and moves it.

  Everything is opt-in: the band ships as a plain stacked list, and the pinned
  arrangement only appears once this script adds .js-pstory to <html>. A visitor
  who asked for less motion, a short window, or scripting turned off all keep
  the stack.
*/
(() => {
  "use strict";
  const doc = document, root = doc.documentElement;
  const band = doc.querySelector(".pstory");
  if (!band) return;
  const slides = [].slice.call(band.querySelectorAll(".pstory__slide"));
  const steps = [].slice.call(band.querySelectorAll(".pstory__step"));
  const pin = band.querySelector(".pstory__pin");
  const run = band.querySelector(".pstory__run");
  const rail = band.querySelector(".pstory__rail");
  const skip = band.querySelector(".pstory__skip");
  const N = slides.length;
  if (N < 2 || steps.length !== N || !run) return;
  /* Each step is told its own place in the row; the CSS pans the track by however
     far that is from the step the scroll is on, so one number moves four slides. */
  slides.forEach((s, k) => s.style.setProperty("--at", String(k)));

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  /* The same gate the collection bands stand behind, so the pinned layer of the page
     arrives on a phone as it does on a desktop. A step is one screenful of story, and
     the CSS stacks its picture over its words when the screen is a column. */
  const room = matchMedia("(min-width:340px) and (min-height:520px)");
  let pinned = false, index = -1, queued = false, decided = false, pending;

  /* The nav condenses as you scroll and js/scroll.js keeps --nav-h on its real
     height, so the sticky offset is read rather than guessed. */
  const navH = () => parseFloat(root.style.getPropertyValue("--nav-h")) || 72;
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* What the bottom of the screen owns, asked the same way js/pinband asks it: the queue
     is only charged against a stage that stands on a phone's screenful, which is the one
     regime that names --rail-h. On a wide screen the notices keep a lane of their own and
     owe the stage nothing. */
  const charge = () => {
    const r = getComputedStyle(root);
    if (!(parseFloat(r.getPropertyValue("--rail-h")) || 0)) return 0;
    return parseFloat(r.getPropertyValue("--queue-h")) || 0;
  };

  /* Whether the standing stage holds a whole step in the room the queue left it. The
     container query already gives the step's picture up when the box runs out, so a
     hidden visual says the same thing the height does, from the CSS's own arithmetic;
     asking both means neither number is trusted alone. */
  function fits() {
    const vis = slides[0].querySelector(".pstory__visual");
    if (vis && getComputedStyle(vis).display === "none") return false;
    return pin.offsetHeight <= innerHeight - navH() - charge() + 1;
  }

  /* The one place an arrangement swap cannot be felt, and the reason js/pinband.js asks
     the same question: the stage and the stack are nowhere near the same height, so the
     swap moves every section below the story — including the one being read. */
  function belowReader() {
    return band.getBoundingClientRect().top >= innerHeight;
  }

  function set(i) {
    if (i === index) return;
    index = i;
    band.style.setProperty("--pstep", String(i));
    for (let k = 0; k < N; k++) {
      const on = k === i;
      slides[k].dataset.on = on ? "true" : "false";
      /* The steps are painted side by side now, so the ones off stage are still on
         screen. Out of the tab order and out of the accessibility tree is the least
         a story that walks sideways owes the visitor who cannot see the stage. */
      if ("inert" in HTMLElement.prototype) slides[k].inert = !on;
      steps[k].dataset.active = on ? "true" : "false";
      /* aria-current, not aria-selected: these are steps of a process, not tabs,
         and a screen reader should read the position out loud. */
      if (on) steps[k].setAttribute("aria-current", "step");
      else steps[k].removeAttribute("aria-current");
    }
  }

  /* The band's distance from the top of the document only moves when something above
     it is re-laid-out, and reading it every frame asks the page to settle every write
     that came before it. Held for a quarter second instead, and dropped by anything
     that can genuinely move it — a window that changed size, a language that changed
     how a headline wraps, a picture that arrived. The nav is never part of the hold:
     --nav-h is added at the end, so the stage keeps up with the condensing header
     without re-reading the document. */
  let absAt = 0, abs = 0, runH = 1;
  function release() { absAt = 0; }
  function hold() {
    if (absAt && Date.now() - absAt <= 250) return;
    absAt = Date.now();
    abs = band.getBoundingClientRect().top + scrollY;
    runH = run.offsetHeight || 1;
  }

  function progress() {
    hold();
    return clamp((navH() - (abs - scrollY)) / runH);
  }

  function follow() {
    queued = false;
    if (!pinned) return;
    set(Math.round(progress() * (N - 1)));
  }
  let paidAt = 0;
  function onScroll() {
    /* The scroll is what says the story has come back below the reader, so it is what pays
       the arrangement debt evaluate() kept. The rect is read at most four times a second
       and only while something is actually waiting. */
    if (pending !== undefined && Date.now() - paidAt > 250) {
      paidAt = Date.now();
      if (belowReader()) { pending = undefined; evaluate(); }
    }
    if (pinned && !queued) { queued = true; requestAnimationFrame(follow); }
  }

  /* Jumping to a step lands a hair inside that step's own window, so the rounding
     in follow() cannot hand the frame back to its neighbour. */
  function goTo(i) {
    hold();
    scrollTo({ top: abs - navH() + (i / (N - 1)) * runH + 2,
      behavior: reduce.matches ? "auto" : "smooth" });
  }

  steps.forEach((b, i) => b.addEventListener("click", () => goTo(i)));
  /* The rail is a row of buttons, so arrow keys should walk it the way they walk
     any other group rather than leaving the page behind — and on a row that reads
     right to left, the arrow that means onwards points the other way. */
  rail.addEventListener("keydown", (e) => {
    const back = root.dir === "rtl";
    const fwd = back ? "ArrowLeft" : "ArrowRight", away = back ? "ArrowRight" : "ArrowLeft";
    const d = e.key === fwd || e.key === "ArrowDown" ? 1
      : e.key === away || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = Math.min(N - 1, Math.max(0, (index < 0 ? 0 : index) + d));
    goTo(i);
    steps[i].focus();
  });

  if (skip) {
    skip.addEventListener("click", () => {
      hold();
      scrollTo({ top: abs + band.offsetHeight - navH(), behavior: reduce.matches ? "auto" : "smooth" });
    });
  }

  function evaluate() {
    release();
    let want = room.matches && !reduce.matches;
    /* A stage cannot say whether it fits until it is standing: the step's own height and
       the container query that guards its picture are both written against .js-pstory. So
       it is built, asked, and taken back down in the same frame — one extra pass at the
       few moments the page is re-laying itself out anyway. */
    if (want) {
      root.classList.add("js-pstory");
      want = fits();
      if (!want) root.classList.remove("js-pstory");
    }
    /* A stage collapsed into a stack, or a stack raised into a stage, moves every section
       below it by a screen or more — including the one the reader has reached. So the story
       only ever changes its arrangement while it still lies below the viewport, and the debt
       is paid from the scroll path when the reader comes back above it. The class is put
       back to whatever the reader was last shown, because the measuring pass above wrote it
       either way. */
    if (decided && want !== pinned && !belowReader()) {
      pending = want;
      root.classList.toggle("js-pstory", pinned);
      return;
    }
    pending = undefined;
    decided = true;
    if (want === pinned) return;
    pinned = want;
    root.classList.toggle("js-pstory", pinned);
    if (!pinned) {
      /* Back to the stack: every step shows again, so none of them may still be
         inert, and the track has no step to stand on any more. The rail stops
         pretending to be a position indicator it cannot move. */
      index = -1;
      band.style.removeProperty("--pstep");
      slides.forEach((s) => {
        s.removeAttribute("data-on");
        if ("inert" in HTMLElement.prototype) s.inert = false;
      });
      steps.forEach((s) => { s.removeAttribute("data-active"); s.removeAttribute("aria-current"); });
      return;
    }
    follow();
  }

  addEventListener("scroll", onScroll, { passive: true });
  room.addEventListener("change", evaluate);
  reduce.addEventListener("change", evaluate);
  /* Re-asked on every pass, pinned or not: a story that stood aside because the bottom
     queue left it no room comes back the moment the queue shrinks, and nothing else on
     the page would notice. */
  addEventListener("resize", evaluate, { passive: true });
  /* The stage now stands on a screenful shorter than the window, because the install
     pill and the chat bubble live at the bottom of a phone and the row of stones has
     to be above them. When that queue changes shape the run is a different length, so
     the held geometry is dropped and the step it is on is read again. */
  addEventListener("queue-change", evaluate);
  /* Translation rewrites the rail labels and can wrap a headline onto a second
     line, which changes nothing about the step it is on but does move the stage. */
  addEventListener("i18n-applied", () => { release(); if (pinned) { index = -1; follow(); } });
  /* Pictures do not bubble their load, and one that lands above the stage moves it. */
  doc.addEventListener("load", release, true);

  evaluate();
  if (pinned) addEventListener("load", follow, { once: true });
})();
