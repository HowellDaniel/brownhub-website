/*
  The pinned collection bands.

  Three bands — Customer experience, Portfolio and the website catalog — borrow the
  stage the process story already uses: the heading holds on one screenful while its
  cards turn past it in pages of three, and the same diamond rail along the bottom
  names the page you are on. The cards themselves are untouched: the grid, the
  filters, the search box and click-to-order all keep working, because the only
  thing that moves is the window they are seen through.

  Everything is opt-in. The markup ships as a plain grid; this script builds the
  stage, and only over a band that has more than one page to show. A phone, a short
  window, a visitor who asked for less motion, a filtered set of three cards or
  fewer, and a visitor with scripting off all keep the plain grid.

  A band that says data-pin-dir="x" turns its pages sideways instead of lifting them
  past the heading, which is how twilio.com's own pinned band moves: the heading holds
  still and the next page arrives from off the right edge of the screen. Same stage,
  same rail, same gating; only the axis of the turn changes.
*/
(() => {
  "use strict";
  const doc = document, root = doc.documentElement;
  const PAGE = 3;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const room = matchMedia("(min-width:900px) and (min-height:760px)");
  const navH = () => parseFloat(root.style.getPropertyValue("--nav-h")) || 72;
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const el = (t, c) => { const n = doc.createElement(t); n.className = c; return n; };
  /* The stone wears the first card's own name, and every card name is already a
     dictionary key because it is printed on the card. The rail costs no new words. */
  const name = (card) => {
    const t = card && (card.querySelector("h3") || card.querySelector(".chip"));
    return t ? t.textContent.trim() : "";
  };

  function Band(band) {
    this.band = band;
    this.block = band.querySelector(band.dataset.pin);
    if (!this.block) return;
    this.strip = band.dataset.pinCards ? this.block.querySelector(band.dataset.pinCards) : this.block;
    if (!this.strip) return;
    this.head = band.querySelector(".section__head");
    this.controls = (band.dataset.pinControls || "").split(",")
      .map((s) => s.trim()).filter(Boolean).map((s) => band.querySelector(s)).filter(Boolean);
    this.paged = false;
    this.index = -1;
    this.axis = band.dataset.pinDir === "x" ? "x" : "y";
    this.rtl = false;
    this.build();
    this.watch();
  }

  /* The stage is assembled out of nodes that already exist, in the order the band
     already reads: heading, controls, whatever the band sold a place above the shelf,
     one page of cards, rail. Whatever the band still has below the fold — the order
     button, the empty notice — stays where it was, and the pin takes the place of the
     block that moved. */
  Band.prototype.build = function () {
    const anchor = this.band.querySelector(":scope > .container") || this.block;
    this.pin = el("div", "pinband__pin");
    this.body = el("div", "pinband__body container");
    this.win = el("div", "pinband__window");
    this.rail = el("nav", "pstory__rail");
    this.run = el("div", "pinband__run");
    this.band.insertBefore(this.pin, anchor);
    this.band.insertBefore(this.run, this.pin.nextSibling);
    this.pin.appendChild(this.body);
    this.pin.appendChild(this.rail);
    if (this.head) this.body.appendChild(this.head);
    this.controls.forEach((c) => this.body.appendChild(c));
    /* A bought placement is sold a spot in this band's reading order, and the stage
       swallows the container it was sitting in. It comes up with everything else the
       stage holds, or the top of the shelf ends up printed after the tail of it. */
    [].slice.call(this.band.querySelectorAll(".container > .featured:not(.featured--mid)"))
      .forEach((slot) => this.body.appendChild(slot));
    this.body.appendChild(this.win);
    this.win.appendChild(this.block);
    this.band.classList.add("pinband");
    if (this.axis === "x") this.band.classList.add("pinband--x");
    this.rail.addEventListener("keydown", (e) => this.arrow(e));
  };

  /* The grid's own box is the only reliable signal that the card set changed: both
     the filters and the search hide cards, and a hidden card takes its row with it. */
  Band.prototype.watch = function () {
    const relayout = () => { if (root.classList.contains("js-pinband")) this.layout(); };
    if (typeof ResizeObserver === "function") new ResizeObserver(relayout).observe(this.strip);
    new MutationObserver(relayout).observe(this.strip, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
    addEventListener("resize", () => {
      /* Only a window that actually changed size is allowed to ask for its picture
         back: a pass that both took the height and gave it back would never settle. */
      this.strip.style.removeProperty("--pin-media-h");
      relayout();
    }, { passive: true });
    addEventListener("i18n-applied", relayout);
  };

  /* Three at a time, unless that would leave one card alone on a whole screen — then
     the pages share the set out evenly and never go over three. */
  Band.prototype.pagesOf = function (total, n) {
    const each = Math.floor(total / n), extra = total % n, out = [];
    let at = 0;
    for (let i = 0; i < n; i++) {
      const size = each + (i < extra ? 1 : 0);
      out.push(this.cards.slice(at, at + size));
      at += size;
    }
    return out;
  };

  /* A short page leaves the last column of its row empty, so the page after it has to
     be told to start a new row instead of filling that hole. Cleared on every pass and
     whenever the stage is off, because an inline break would follow the card into the
     plain grid, where the columns are not three. */
  Band.prototype.breaks = function (list) {
    [].slice.call(this.strip.children).forEach((c) => { c.style.gridColumnStart = ""; });
    if (!list) return;
    for (let i = 1; i < list.length; i++) list[i][0].style.gridColumnStart = "1";
  };

  /* The stage is a flex column, so the window gets exactly whatever the heading, the
     controls, their margins, the gaps and the padding leave behind. Measured rather
     than guessed: a filter row with a bottom margin is the kind of thing a constant
     misses, and a window taller than the stage clips the heading off the top. */
  Band.prototype.spare = function () {
    const b = getComputedStyle(this.body);
    let used = parseFloat(b.paddingTop) + parseFloat(b.paddingBottom);
    let n = 0;
    for (const c of this.body.children) {
      const m = getComputedStyle(c);
      /* A slot nobody has bought, and a notice that only shows when the shelf is
         empty, take up no room; charging the stage for their margins would shrink the
         window to pay for a row of cards that is not there. */
      if (c === this.win || m.display === "none") continue;
      const r = c.getBoundingClientRect();
      used += r.height + parseFloat(m.marginTop) + parseFloat(m.marginBottom);
      n++;
    }
    return this.body.clientHeight - used - n * (parseFloat(b.rowGap) || parseFloat(b.gap) || 0);
  };

  /* The shortfall comes off the picture, which is the only part of a card free to
     shrink without losing a word. Measured off the first card of the set and handed to
     CSS as one number, so a band whose picture fills its card (the experience rail)
     trims its card instead of its frame. Only ever set while the row overflows: the
     shortened row then fits, the pass asks for nothing more, and the observer that the
     change itself wakes finds nothing left to change. Growing back is a deliberate
     non-event — a stale cut reads as a slightly wider crop, while a value that traded
     places with its own effect on the row would never settle. */
  Band.prototype.trim = function (over) {
    if (over <= 0) return;
    const card = this.cards[0];
    const m = card && (card.querySelector(".media") || card);
    const h = m.getBoundingClientRect().height;
    const next = Math.max(120, Math.round(h - over));
    if (next !== h) this.strip.style.setProperty("--pin-media-h", next + "px");
  };

  /* How far the window has to reach past the container to touch both edges of the
     screen. Read off the container, which the window's own margins never move, and
     published as one number the CSS spends on both sides — 50vw is the guess this
     avoids, because the scrollbar belongs to the viewport and not to the column. */
  Band.prototype.bleed = function () {
    const c = this.band.querySelector(":scope > .container");
    if (!c) return;
    const r = c.getBoundingClientRect();
    const g = parseFloat(getComputedStyle(c).paddingLeft) || 0;
    const reach = Math.min(r.left + g, innerWidth - (r.right - g));
    this.win.style.setProperty("--pin-bleed", Math.max(0, Math.round(reach)) + "px");
  };

  /* Sideways: the track is one unbroken row, so a card takes an exact share of the
     window's own content column and a page begins wherever its first card does. The
     share is measured in pixels rather than left as a percentage because the track is
     as wide as its content — a third of that would be three screens of card. Every
     page is sized to the widest one, so the last short page simply ends early instead
     of stretching its two cards across the whole stage. */
  Band.prototype.row = function () {
    const w = getComputedStyle(this.win);
    const gap = parseFloat(getComputedStyle(this.strip).columnGap) || 0;
    const avail = this.win.clientWidth - (parseFloat(w.paddingLeft) || 0) - (parseFloat(w.paddingRight) || 0);
    const wide = this.groups.reduce((m, g) => Math.max(m, g.length), 1);
    const basis = (avail - (wide - 1) * gap) / wide;
    this.cards.forEach((c) => { c.style.flexBasis = basis + "px"; });
    this.rtl = getComputedStyle(this.strip).direction === "rtl";
    this.at = this.groups.map((g) => Math.round(this.lead(g[0])));
    return Math.max.apply(null, this.cards.map((c) => c.offsetHeight));
  };

  /* How far the card that leads a page sits inside the track, counted from the edge the
     row reads from. offsetLeft is the tempting answer and is wrong on half the page: a
     right-to-left row numbers its cards backwards from the far edge, so the pan it
     produces pulls the shelf clean off the stage. Two rects are used instead, and since
     the track travels with its own cards, their difference is the one number a sliding
     shelf cannot corrupt. */
  Band.prototype.lead = function (card) {
    const s = this.strip.getBoundingClientRect(), r = card.getBoundingClientRect();
    return this.rtl ? s.right - r.right : r.left - s.left;
  };

  /* Upright: the pages are rows of the same grid, stacked, and the window shows one
     row at a time. */
  Band.prototype.stack = function () {
    this.at = [];
    let h = 0;
    for (let i = 0; i < this.groups.length; i++) {
      const row = this.groups[i];
      const top = row[0].offsetTop;
      const bottom = Math.max.apply(null, row.map((c) => c.offsetTop + c.offsetHeight));
      this.at.push(top);
      h = Math.max(h, bottom - top);
    }
    return h;
  };

  Band.prototype.uncard = function () {
    [].slice.call(this.strip.children).forEach((c) => { c.style.flexBasis = ""; });
  };

  Band.prototype.layout = function () {
    const wasRun = this.run.offsetHeight, wasIndex = this.index;
    const anchor = this.top(), inside = scrollY >= anchor - 2 && scrollY <= anchor + wasRun + 2;
    this.cards = [].slice.call(this.strip.children).filter((c) => c.nodeType === 1 && !c.hidden);
    const n = Math.ceil(this.cards.length / PAGE);
    this.setPaged(n > 1);
    if (n < 2) {
      this.breaks();
      this.uncard();
      this.strip.style.translate = "";
      /* The window's height is only a clamp for the stage, and a stage that is gone
         must not leave one behind: the plain grid would spill out of it and whatever
         the band still has below would sit on top of the cards. */
      this.win.style.height = "";
      this.strip.style.removeProperty("--pin-media-h");
      if (wasRun && inside) scrollTo({top: anchor, behavior: "auto"});
      return;
    }
    this.pages = n;
    this.groups = this.pagesOf(this.cards.length, n);
    let h;
    if (this.axis === "x") {
      this.breaks();
      this.bleed();
      h = this.row();
    } else {
      /* A row starts wherever its own first card says it does, so a two-line title in
         one card cannot push the next page half a row out of the window. */
      this.breaks(this.groups);
      h = this.stack();
    }
    /* The window is one row tall: any taller and the next page leaks in under the
       current one, which is not a turn, it is a stack. When the stage is shorter than
       the row, the picture gives up the difference — a card cut through its own price
       line is a worse trade than a slightly wider crop. Setting the cut only while the
       row overflows keeps the pass converging: the shortened row fits, and a value that
       does not change the layout schedules no second pass. */
    const room = this.spare();
    this.trim(h - room);
    this.win.style.height = Math.max(200, Math.min(h, room)) + "px";
    /* Every extra page buys one more screenful of scroll, at the rate the process
       story already turns. The count is handed to CSS rather than multiplied out
       here, because --nav-h shrinks while the header condenses and the stage grows
       with it — a run measured at the top would be short by the end of the scroll. */
    this.run.style.setProperty("--pin-pages", String(n - 1));
    this.stamp();
    this.index = -1;
    this.follow();
    /* A filter that changes the page count changes how far this band runs, and the
       document grows or shrinks under the visitor's feet while the stage is on screen.
       Put the stage back where it was and hand it the page it was showing. */
    if (wasRun && wasRun !== this.run.offsetHeight && inside) {
      const i = Math.max(0, Math.min(wasIndex < 0 ? 0 : wasIndex, n - 1));
      scrollTo({top: this.top() + (n > 1 ? (i / (n - 1)) * this.span() : 0), behavior: "auto"});
      this.index = -1;
      this.follow();
    }
  };

  Band.prototype.stamp = function () {
    const title = this.band.querySelector("h2");
    if (title) this.rail.setAttribute("aria-label", title.textContent.trim());
    const names = this.groups.map((g, i) => name(g[0]) || String(i + 1));
    /* A filtered set can keep the same page count and change every card, so the count
       alone cannot say whether the stones still read true. */
    if (this.rail.childElementCount === names.length && names.join("|") === this.keys) return;
    this.keys = names.join("|");
    this.rail.textContent = "";
    for (let i = 0; i < names.length; i++) {
      const b = el("button", "pstory__step");
      b.type = "button";
      const label = el("span", "pstory__step-label");
      label.textContent = names[i];
      const stone = el("span", "pstory__diamond");
      const face = el("span", "pstory__diamond-in");
      const icon = el("span", "pstory__icon");
      icon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
        'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M9 5l7 7-7 7"/></svg>';
      face.appendChild(icon);
      stone.appendChild(face);
      b.appendChild(label);
      b.appendChild(stone);
      b.setAttribute("aria-label", label.textContent);
      b.addEventListener("click", () => this.goTo(i));
      this.rail.appendChild(b);
    }
    this.steps = [].slice.call(this.rail.children);
  };

  Band.prototype.set = function (i) {
    if (i === this.index || !this.steps) return;
    this.index = i;
    /* The track is pulled back by exactly how far its own page sits inside it. Upright
     * that is always a pull upward; sideways the sign belongs to the row, because a
     * right-to-left shelf has to be pushed the other way to bring its next page in. */
    this.strip.style.translate = this.axis === "x"
      ? (this.rtl ? this.at[i] : -this.at[i]) + "px 0" : "0 " + (-this.at[i]) + "px";
    for (let k = 0; k < this.steps.length; k++) {
      const on = k === i;
      this.steps[k].dataset.active = on ? "true" : "false";
      if (on) this.steps[k].setAttribute("aria-current", "step");
      else this.steps[k].removeAttribute("aria-current");
    }
    /* A card clipped out of the window is also out of the tab order: invisible but
     * landable is a trap for the keyboard. */
    if ("inert" in HTMLElement.prototype) {
      for (let p = 0; p < this.groups.length; p++) {
        for (let k = 0; k < this.groups[p].length; k++) this.groups[p][k].inert = p !== i;
      }
    }
  };

  /* The pin is sticky, so once it is stuck its own rect has stopped telling the
     story — it sits at --nav-h for the whole scroll. The run is the sibling that
     keeps moving, and the stage began exactly one stage-height above where the run
     starts, so the run is what the progress has to be read off. */
  Band.prototype.top = function () {
    return this.run.getBoundingClientRect().top + scrollY - this.pin.offsetHeight - navH();
  };

  Band.prototype.span = function () {
    return this.run.offsetHeight || 1;
  };

  Band.prototype.follow = function () {
    if (!this.paged) return;
    this.set(Math.round(clamp((scrollY - this.top()) / this.span()) * (this.pages - 1)));
  };

  /* Landing a hair inside the page's own window stops the rounding in follow() from
     handing back the page you meant to leave. */
  Band.prototype.goTo = function (i) {
    scrollTo({ top: this.top() + (i / (this.pages - 1)) * this.span() + 2,
      behavior: reduce.matches ? "auto" : "smooth" });
  };

  Band.prototype.arrow = function (e) {
    /* On a shelf that reads right to left, the arrow that means 'onwards' points the
       other way. Up and down are never sideways, so they keep their meaning everywhere. */
    const back = this.axis === "x" && this.rtl;
    const fwd = back ? "ArrowLeft" : "ArrowRight", away = back ? "ArrowRight" : "ArrowLeft";
    const d = e.key === fwd || e.key === "ArrowDown" ? 1
      : e.key === away || e.key === "ArrowUp" ? -1 : 0;
    if (!d || !this.steps) return;
    e.preventDefault();
    const i = Math.min(this.pages - 1, Math.max(0, (this.index < 0 ? 0 : this.index) + d));
    /* Focus the stone first, and without the browser's own scroll: moving focus is a
       scroll request even when the stone is already on screen, and it cancels the
       smooth turn the key just asked for. */
    this.steps[i].focus({ preventScroll: true });
    this.goTo(i);
  };

  Band.prototype.setPaged = function (want) {
    if (want === this.paged) return;
    this.paged = want;
    this.band.classList.toggle("pinband--paged", want);
    this.run.hidden = !want;
    this.rail.hidden = !want;
    if (want) return;
    this.index = -1;
    this.keys = "";
    this.breaks();
    this.uncard();
    this.win.style.removeProperty("--pin-bleed");
    this.strip.style.removeProperty("--pin-media-h");
    if (this.steps) {
      this.steps.forEach((s) => { s.removeAttribute("data-active"); s.removeAttribute("aria-current"); });
    }
    if ("inert" in HTMLElement.prototype) {
      [].slice.call(this.strip.children).forEach((c) => { c.inert = false; });
    }
  };

  const bands = [].slice.call(doc.querySelectorAll("[data-pin]")).map((b) => new Band(b)).filter((b) => b.block);
  if (!bands.length) return;
  let queued = false;
  const follow = () => { queued = false; bands.forEach((b) => b.follow()); };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(follow); } }, { passive: true });

  /* Turning the stage off is a switch, not a rebuild: the grid, its filters and its
     cards are the same nodes either way. */
  function evaluate() {
    const on = room.matches && !reduce.matches;
    root.classList.toggle("js-pinband", on);
    bands.forEach((b) => { if (on) b.layout(); else b.setPaged(false); });
    if (on) follow();
  }
  room.addEventListener("change", evaluate);
  reduce.addEventListener("change", evaluate);
  /* Fonts and pictures both land after this script runs, and a card measured before
     its picture arrives is measured at the wrong height. */
  addEventListener("load", () => { if (root.classList.contains("js-pinband")) bands.forEach((b) => b.layout()); }, { once: true });
  evaluate();
})();
