/*
  The pinned collection bands.

  Three bands — Customer experience, Portfolio and the website catalog — borrow the
  stage the process story already uses: the heading holds on one screenful while its
  cards turn past it, and the same diamond rail along the bottom names the page you are
  on. The cards themselves are untouched: the grid, the filters, the search box and
  click-to-order all keep working, because the only thing that moves is the window they
  are seen through.

  Everything is opt-in. The markup ships as a plain grid; this script builds the
  stage, and only over a band that has more than one page to show. A short window, a
  visitor who asked for less motion, a filtered set too small to fill a second page, and
  a visitor with scripting off all keep the plain grid. A phone gets the stage too, but
  spends less scroll per page than a wide screen does — see --pin-page-h in layout().

  Every band on this site says data-pin-dir="x" and turns sideways, which is how
  twilio.com's own pinned band moves: the heading holds still and the next page arrives
  from off the right edge of the screen. The axis stays an attribute rather than a law
  because a band whose page is a row of words, not one picture, would do better to lift
  its rows past the heading — and that route is still the default.

  A band that says data-pin-page="1" gives every picture its own turn of the stage —
  one card held on screen at a time, centred in the column, with its neighbours waiting
  in the bleed at either side. The page size is a number rather than a switch because a
  band can be asked for two to a page just as easily as for one.

  A band that says data-pin-auto keeps turning when nobody is scrolling it: the shelf
  travels right to left on its own clock, one picture at a time, and the visitor's own
  scroll takes the wheel back the moment they move. The stage, the turn and the rail are
  the same as they were — only the hand that moves the shelf changes.
*/
(() => {
  "use strict";
  const doc = document, root = doc.documentElement;
  const PAGE = 3;
  /* The narrowest frame trim() is allowed to leave a picture. css/style.css names it per
     width as --pin-floor: a phone cuts a picture narrower than a desktop will, because the
     alternative to the crop is the band standing aside and no story at all. */
  const FLOOR = 120;
  /* A self-turning band keeps its own clock. A picture gets a step to travel in and a
     hold to be read in; the last page holds longer, because the row is cut back to the
     first card instead of sliding the whole way back. The stage is asked for twice a
     second, which is far more often than a band turns and far less than it is drawn. */
  const BEAT = 200, STEP = 1600, LAST = 3200, IDLE = 1400;
  const GLIDE = "translate .8s var(--ease-out)";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  /* A phone gets the stage too. The old gate asked for 900px of width because the band
     was built to show three cards at once, and three cards across a pocket is a stripe.
     Every band on this site turns one picture to a page now, and one picture centred in
     a column is exactly what a phone already does — the difference is that the stage
     makes the next one arrive from the side instead of falling below the last. What
     still keeps the plain grid is a window too short to stand a screenful in, a visitor
     who asked for less motion, and scripting turned off. */
  const room = matchMedia("(min-width:340px) and (min-height:520px)");
  /* The pointer hold is a mouse idea: a finger that taps a picture to order it is not
     asking the shelf to wait, and on a touch screen pointerenter fires on the tap and
     leaves no pointerleave behind, so a band that pauses for it stays paused until the
     visitor leaves the page. Only a device that can actually hover gets held. */
  const canHover = matchMedia("(hover: hover)");
  const navH = () => parseFloat(root.style.getPropertyValue("--nav-h")) || 72;
  /* How much of the screen the bottom queue charges the stage. Only a phone asks the stage
     to pay: --rail-h is named inside that media query, and it is the rail's payment and the
     body's padding that the number buys back. Where the notices lift over a lane of their
     own instead, they charge nothing, and a notice arriving changes nothing this band has
     to know about. */
  const charge = () => {
    const r = getComputedStyle(root);
    if (!(parseFloat(r.getPropertyValue("--rail-h")) || 0)) return 0;
    return parseFloat(r.getPropertyValue("--queue-h")) || 0;
  };
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
    this.decided = false;
    this.pending = undefined;
    this.index = -1;
    this.axis = band.dataset.pinDir === "x" ? "x" : "y";
    this.page = Math.max(1, parseInt(band.dataset.pinPage, 10) || PAGE);
    this.rtl = false;
    this.lead0 = 0;
    this.auto = band.hasAttribute("data-pin-auto");
    this.walk = 0;
    this.touched = 0;
    this.beat = 0;
    this.paused = false;
    this.lastY = scrollY;
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
    if (this.page === 1) this.band.classList.add("pinband--one");
    this.rail.addEventListener("keydown", (e) => this.arrow(e));
  };

  /* The grid's own box is the only reliable signal that the card set changed: both
     the filters and the search hide cards, and a hidden card takes its row with it.

     Both observers are answered on the next frame rather than where they fire: one
     keystroke hides and shows a dozen cards, and a synchronous pass ran the whole
     layout once for the mutation and again for the size it left behind. A stage that
     is asked for twice in a frame is only ever rebuilt once. */
  Band.prototype.watch = function () {
    const relayout = () => this.ask();
    if (typeof ResizeObserver === "function") new ResizeObserver(relayout).observe(this.strip);
    new MutationObserver(relayout).observe(this.strip, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
    let seen = this.pin.offsetHeight, owed = charge(), box = innerWidth + "x" + innerHeight;
    const refill = (grown) => {
      /* Only a window that actually changed size is allowed to ask for its picture back: a
         pass that both took the height and gave it back would never settle. A queue that
         merely changed shape is not — handing the picture its natural height grows the card
         and slides whatever is printed along the bottom of it down the screen, which at
         390x844 on the home page measured 119px of movement and 0.088 of the shift score
         for a chat teaser arriving at the bottom edge. A stale cut reads as a picture
         cropped a little wider, and that is the lesser of the two. */
      seen = this.pin.offsetHeight;
      owed = charge();
      if (grown || this.belowReader()) this.strip.style.removeProperty("--pin-media-h");
      relayout();
    };
    addEventListener("resize", () => {
      const now = innerWidth + "x" + innerHeight;
      const grown = now !== box;
      box = now;
      refill(grown);
    }, { passive: true });
    /* The bottom of the screen belongs to a queue the page did not build — the install
       pill, the chat bubble, a notice that arrives a second after the stage is laid
       out — and on a phone the stage now stands on a screenful shorter than the whole
       window. When that edge moves, the picture is asked for back and the row is
       measured against the room the stage has now.

       Where the stage is never asked to pay the queue, neither number moves and a notice
       arriving changes nothing about this band. Asking anyway was not free: measured at
       1440x900 on the catalog, one pass fired by the consent bar lifted the window four
       pixels and moved the card's own text block sixty-seven, for 0.045 of the shift
       score and no visible reason. So the queue is only answered when the room the stage
       got out of it actually changed. */
    addEventListener("queue-change", () => {
      if (this.pin.offsetHeight === seen && charge() === owed) return;
      refill();
    });
    addEventListener("i18n-applied", relayout);
    if (this.auto) this.hold();
  };

  /* A pointer that lands on the picture or on the stones is a request to look at that
     page, so the clock waits until it leaves. It is held off the stage as a whole
     because the stage is a screenful tall and the window inside it is a row: a mouse
     parked by the heading would otherwise park the shelf with it, and the band would
     look dead rather than patient. A caret is taken anywhere in the stage — it is in a
     card's own button or in the search box, and neither should have the floor move
     under it. */
  Band.prototype.hold = function () {
    const stop = () => { this.paused = true; };
    const go = () => { this.paused = false; };
    if (canHover.matches) {
      [this.win, this.rail].forEach((n) => {
        n.addEventListener("pointerenter", stop);
        n.addEventListener("pointerleave", go);
        /* A pointer that is taken away mid-gesture — the browser moving to the
           compositor, a second finger arriving — never says goodbye on its way out. */
        n.addEventListener("pointercancel", go);
      });
    }
    this.pin.addEventListener("focusin", stop);
    this.pin.addEventListener("focusout", go);
  };

  Band.prototype.ask = function () {
    if (this.scheduled || !root.classList.contains("js-pinband")) return;
    this.scheduled = true;
    requestAnimationFrame(() => { this.scheduled = false; this.layout(); });
  };

  /* The band's own page size, unless that would leave one card alone on a whole screen
     — then the pages share the set out evenly and never go over the size asked for. A
     band turned to one card a page has no hole to fill, so the split is already even. */
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
    if (over <= 0) return 0;
    const card = this.cards[0];
    const m = card && (card.querySelector(".media") || card);
    const h = m.getBoundingClientRect().height;
    const floor = parseFloat(getComputedStyle(this.band).getPropertyValue("--pin-floor")) || FLOOR;
    const next = Math.max(floor, Math.round(h - over));
    if (next !== h) this.strip.style.setProperty("--pin-media-h", next + "px");
    /* Whatever the picture could not give up is the row's own debt, and a debt the picture
       cannot pay is a page that cannot be shown whole. */
    return Math.max(0, Math.round(over - Math.max(0, h - next)));
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
     of stretching its two cards across the whole stage.

     A band showing one card to a page sizes it to the band's own --pin-one-w rather
     than to the whole column, and parks it in the middle: the card is then held where
     the eye already is, and the next picture waits in the bleed at the edge instead of
     arriving out of a hard cut. */
  Band.prototype.row = function () {
    const w = getComputedStyle(this.win);
    const gap = parseFloat(getComputedStyle(this.strip).columnGap) || 0;
    const avail = this.win.clientWidth - (parseFloat(w.paddingLeft) || 0) - (parseFloat(w.paddingRight) || 0);
    const one = this.page === 1;
    const cap = one ? parseFloat(getComputedStyle(this.band).getPropertyValue("--pin-one-w")) || 0 : 0;
    const wide = one ? 1 : this.groups.reduce((m, g) => Math.max(m, g.length), 1);
    const basis = one ? Math.min(avail, cap || avail) : (avail - (wide - 1) * gap) / wide;
    this.cards.forEach((c) => { c.style.flexBasis = basis + "px"; });
    /* The track is told how long it is, in pixels, rather than left to size itself to
       its content. A WebKit row resolves that max-content off the picture — a 16/9 frame
       with a measured height hands back a card 186 wide when the row asked for 342 — and
       an engine that shrinks what it cannot fit does the same damage from the other end.
       One number from this function settles both: the row is as long as the cards it
       holds, and no engine has anything left to decide. */
    const count = this.cards.length;
    this.strip.style.width = Math.ceil(count * basis + Math.max(0, count - 1) * gap) + "px";
    this.rtl = getComputedStyle(this.strip).direction === "rtl";
    this.lead0 = one ? (avail - basis) / 2 : 0;
    /* The track's own box is asked for once, after every write this pass makes: a
       shelf of thirty cards read it thirty times, and a read that follows a write is
       the page being rebuilt to answer it. */
    const s = this.strip.getBoundingClientRect();
    this.at = this.groups.map((g) => Math.round(this.lead(g[0], s) - this.lead0));
    return Math.max.apply(null, this.cards.map((c) => c.offsetHeight));
  };

  /* How far the card that leads a page sits inside the track, counted from the edge the
     row reads from. offsetLeft is the tempting answer and is wrong on half the page: a
     right-to-left row numbers its cards backwards from the far edge, so the pan it
     produces pulls the shelf clean off the stage. Two rects are used instead, and since
     the track travels with its own cards, their difference is the one number a sliding
     shelf cannot corrupt. */
  Band.prototype.lead = function (card, s) {
    const r = card.getBoundingClientRect();
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

  /* Giving the cards back their plain style means giving the track back its own place
     too: a shelf left panned two screens to the left would follow the grid onto a phone,
     where it has no window to travel inside. */
  Band.prototype.uncard = function () {
    [].slice.call(this.strip.children).forEach((c) => { c.style.flexBasis = ""; });
    this.strip.style.width = "";
    this.strip.style.translate = "";
    this.strip.style.transition = "";
  };

  /* A band the window cannot hold whole is no use to anybody: the cards go back to the
     plain grid, every clamp this driver wrote comes off, and a visitor standing inside a
     run that no longer exists is put back at the band's top rather than left in the air. */
  Band.prototype.standAside = function (wasRun, inside, anchor) {
    this.setPaged(false);
    this.breaks();
    this.uncard();
    this.win.style.height = "";
    this.strip.style.removeProperty("--pin-media-h");
    if (wasRun && inside) scrollTo({top: anchor, behavior: "auto"});
  };

  /* The one place an arrangement swap cannot be felt. A stage and a plain grid are nowhere
     near the same height, so the swap rewrites the document under everyone: measured at
     390x844 on the home page, the Customer experience band was allowed to stand aside after
     the reader had scrolled past it and the section they had reached jumped a whole screen —
     a shift of 1.0, worse than the 0.62 the first pass was meant to cure. Only a band that
     still lies below the viewport can change its shape, because everything it moves is off
     the screen. A band the reader is standing in, or has left behind, keeps its shape. */
  Band.prototype.belowReader = function () {
    return this.band.getBoundingClientRect().top >= innerHeight;
  };

  Band.prototype.layout = function () {
    this.release();
    const wasRun = this.run.offsetHeight, wasIndex = this.index;
    const wasMedia = this.strip.style.getPropertyValue("--pin-media-h");
    const anchor = this.top(), inside = scrollY >= anchor - 2 && scrollY <= anchor + wasRun + 2;
    this.cards = [].slice.call(this.strip.children).filter((c) => c.nodeType === 1 && !c.hidden);
    const n = Math.ceil(this.cards.length / this.page);
    /* The one number that says whether this band is still being asked the same question:
       the room a stage has is a product of the window, the card set, the page size and,
       on a phone, the notices at the bottom of the screen — and nothing else may overturn
       a measured decision until one of those moves. */
    const ctx = innerWidth + "x" + innerHeight + "/" + this.cards.length + "/" + this.page +
      "/" + charge();
    if (ctx !== this.ctx) { this.ctx = ctx; this.aside = false; }
    if (this.aside) return;
    const below = !this.decided || this.belowReader();
    if (this.decided && this.paged !== (n >= 2) && !below) {
      this.pending = n >= 2;
      return;
    }
    this.setPaged(n > 1);
    if (n < 2) {
      this.decided = true;
      this.pending = undefined;
      this.standAside(wasRun, inside, anchor);
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
    const cut = this.trim(h - room);
    /* And if the picture gives up everything it is allowed to and the row still does not
       stand, the stage is not cramped, it is impossible: a 1024x600 window and a phone
       holding five hundred pixels of notices both leave less screen than one card needs.
       What the band does about it is not to show the card cut through its own words — it
       is to stop pretending and lay the set out as the plain grid the rest of the site
       uses, where every card is whole and the notices just keep the bottom. The answer is
       re-asked whenever the window, the set or the queue moves. */
    if (cut > 0) {
      /* The debt only shows up on a pass that measured the shortfall — and a pass that
         measured it with the reader anywhere but below the band has no right to answer it
         by tearing the stage down. The picture is put back exactly as the last applied pass
         left it, so this pass changed nothing anybody can see. */
      if (this.decided && !below) {
        if (wasMedia) this.strip.style.setProperty("--pin-media-h", wasMedia);
        else this.strip.style.removeProperty("--pin-media-h");
        this.pending = false;
        return;
      }
      this.aside = true;
      this.decided = true;
      this.pending = undefined;
      this.standAside(wasRun, inside, anchor);
      return;
    }
    this.decided = true;
    this.pending = undefined;
    const page = Math.max(200, Math.min(h, room));
    this.win.style.height = page + "px";
    /* On a phone the stage is a whole screenful tall while a single card may be only
       half of it, and a page of scroll that is mostly air is a page the visitor has to
       drag their thumb through for nothing. The page's own measured height is handed to
       CSS so the narrow layout can spend that — plus a little air to read in — per page
       instead of a screen. Wide screens ignore the number and keep the screenful. */
    this.run.style.setProperty("--pin-page-h", Math.round(page + Math.min(120, page * 0.3)) + "px");
    /* Every extra page buys one more screenful of scroll, at the rate the process
       story already turns. The count is handed to CSS rather than multiplied out
       here, because --nav-h shrinks while the header condenses and the stage grows
       with it — a run measured at the top would be short by the end of the scroll. */
    this.run.style.setProperty("--pin-pages", String(n - 1));
    /* Everything above wrote the page's own geometry, so the hold is dropped and the
       next read pays for the stage as it now stands. */
    this.release();
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

  Band.prototype.set = function (i, glide) {
    if (i === this.index || !this.steps) return;
    this.index = i;
    /* The page the clock hands over travels; the page the wheel hands over is held
       exactly where the scroll put it, so a scrub stays tight. The glide is written on
       the same pass that moves the shelf, and taken back off it the moment the scroll
       takes the wheel, because a shelf that lags half a second behind the wheel is a
       shelf that never catches up. */
    this.strip.style.transition = glide ? GLIDE : "";
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
     starts, so the run is what the progress has to be read off.

     The run's place in the document is a number that only changes when the document
     is re-laid-out, and four bands asked for it twice every frame. Held for a quarter
     second instead: a picture arriving above the stage, a filter that changes the
     card count, or a window that changes size all drop the hold, and the header's own
     condense is never part of it — --nav-h is added at the end, so the stage keeps up
     with the nav without re-reading the document. */
  Band.prototype.anchor = function () {
    if (this.held === undefined || Date.now() - this.held > 250) {
      this.held = Date.now();
      this.abs = this.run.getBoundingClientRect().top + scrollY - this.pin.offsetHeight;
      this.runH = this.run.offsetHeight;
    }
    return this.abs;
  };

  Band.prototype.release = function () { this.held = undefined; };

  Band.prototype.top = function () {
    return this.anchor() - navH();
  };

  Band.prototype.span = function () {
    this.anchor();
    return this.runH || 1;
  };

  Band.prototype.follow = function () {
    /* The scroll is the only thing that says the band has come back below the reader, so
       it is what pays an arrangement debt. A quarter of a second is the same hold the
       anchor already keeps, which leaves an ordinary frame free of extra reads. */
    if (this.pending !== undefined && Date.now() - (this.paidAt || 0) > 250) {
      this.paidAt = Date.now();
      if (this.belowReader()) { this.pending = undefined; this.aside = false; this.ask(); return; }
    }
    if (!this.paged) return;
    const i = Math.round(clamp((scrollY - this.top()) / this.span()) * (this.pages - 1));
    if (!this.auto) { this.set(i); return; }
    /* Scrolling is the visitor taking the wheel, so the clock waits a beat after the
       last one. A band that turns by itself can be showing a page the scroll has not
       reached yet: scrolling down must never rewind it, since the visitor is travelling
       forward either way, while scrolling up is a request for that exact page and so
       hands the shelf back. A hand-over of more than one page travels rather than cuts. */
    const down = scrollY >= this.lastY;
    this.lastY = scrollY;
    this.touched = Date.now();
    this.walk = Math.max(0, Math.min(this.pages - 1, down && i < this.walk ? this.walk : i));
    this.set(this.walk, this.index >= 0 && Math.abs(this.walk - this.index) > 1);
  };

  /* One beat of the band's own clock. Nobody driving, the stage on screen, the page
     behind it for a whole hold, and the next picture arrives from the right edge. */
  Band.prototype.turn = function () {
    if (!this.auto || !this.paged || reduce.matches) return;
    const now = Date.now();
    /* A held or hidden band re-seeds its own clock instead of banking a debt: the
       shelf starts turning a full step after the pointer leaves, rather than leaping
       the moment it does. */
    if (this.paused || doc.hidden) { this.beat = now; return; }
    if (!this.onStage()) return;
    if (now - this.touched < IDLE) return;
    if (now - this.beat < (this.walk >= this.pages - 1 ? LAST : STEP)) return;
    this.beat = now;
    /* The row travels one way, so the last page is cut back to the first card instead
       of sliding backwards across every page it has already turned. */
    const next = this.walk >= this.pages - 1 ? 0 : this.walk + 1;
    this.walk = next;
    this.set(next, next !== 0);
  };

  /* The run ends exactly where the stage stops being a stage, so a band is only worth
     turning while the scroll sits inside it. Off stage the clock asks for nothing —
     which is also what makes a printed page show the first picture rather than whichever
     one the timer had reached. The anchor's own hold keeps this to a few reads a second. */
  Band.prototype.onStage = function () {
    const top = this.top();
    return scrollY >= top - 40 && scrollY <= top + this.span() + 40;
  };

  /* Landing a hair inside the page's own window stops the rounding in follow() from
     handing back the page you meant to leave. */
  Band.prototype.goTo = function (i) {
    /* On a band that turns by itself a stone is asked for a picture, not for a journey:
       the clock may be showing a page further along than the wheel has reached, so the
       shelf comes to the page that was picked and the viewport stays where the visitor
       left it. Their own scroll still takes over the moment they move. */
    if (this.auto) { this.walk = i; this.set(i, true); return; }
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
    this.release();
    this.band.classList.toggle("pinband--paged", want);
    this.run.hidden = !want;
    this.rail.hidden = !want;
    if (want) return;
    this.index = -1;
    this.keys = "";
    this.breaks();
    this.uncard();
    this.win.style.removeProperty("--pin-bleed");
    this.run.style.removeProperty("--pin-page-h");
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

  /* A band that turns by itself is driven by a clock and not by a second
     requestAnimationFrame loop: a picture that changes once every second and a half has
     nothing to decide sixty times a second, and the page keeps its frames for the
     scroll. The timer is only ever started on a page that asks for it. */
  const autos = bands.filter((b) => b.auto);
  if (autos.length) setInterval(() => autos.forEach((b) => b.turn()), BEAT);

  /* Turning the stage off is a switch, not a rebuild: the grid, its filters and its
     cards are the same nodes either way. */
  function evaluate() {
    const on = room.matches && !reduce.matches;
    root.classList.toggle("js-pinband", on);
    /* The phone rules for this stage were written against `js-pstory`, because the
       process story was the first band to pin and the collection rails were built
       with its rail classes. A page that ships only collection bands — the catalog's
       shelf, the engineering page — never ran pstory.js, so it never got the class and
       its rail kept the desktop arrangement on a phone: the page name printed over the
       card title it names. Same gate, same predicate, so on the home page the two
       scripts only ever agree. */
    root.classList.toggle("js-pstory", on);
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
