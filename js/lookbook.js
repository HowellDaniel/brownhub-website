/*
  The lookbook: the sixteen pages authored inside #lookbook-book, shown two at a
  time and turned like a book. The document owns the content — captions, folios and
  pictures are all in the HTML, so with scripting off the band is a flat sheet of
  pages in reading order and every word is still translatable and crawlable. This
  file only decides which pages are on the table, animates the turn, and hands a
  tapped picture to the product modal that js/catalog.js already builds.
*/
(() => {
  "use strict";
  const book = document.getElementById("lookbook-book");
  if (!book) return;
  const pages = [].slice.call(book.querySelectorAll(".lookbook__page"));
  if (pages.length < 2) return;
  const bar = book.parentNode.querySelector(".lookbook__bar");
  const prev = document.getElementById("lookbook-prev");
  const next = document.getElementById("lookbook-next");
  const label = bar.querySelector(".lookbook__count-label");
  const num = bar.querySelector(".lookbook__count-num");
  const who = bar.querySelector(".lookbook__count-item");
  const track = document.getElementById("lookbook-track");
  const t = (s) => (window.I18N && window.I18N.t ? window.I18N.t(s) : s);

  /* Two pages at a time is only readable from the width where each half is still
     big enough to show a flyer. Below it the book turns one page at a time, which
     is what a phone does to a PDF of the same object. */
  const mq = matchMedia("(min-width:861px)");
  const reduced = matchMedia("(prefers-reduced-motion:reduce)");
  const rtl = () => getComputedStyle(book).direction === "rtl";
  const total = () => (mq.matches ? Math.ceil(pages.length / 2) : pages.length);
  const showOf = (v) => (mq.matches ? [v * 2, v * 2 + 1] : [v]).filter((i) => i < pages.length);
  const viewOf = (p) => (mq.matches ? Math.floor(p / 2) : p);

  let view = 0;
  let out = [];
  let settle = 0;
  /* The page the reader is actually looking at, held as an element rather than a
     number: a spread number means one thing two-up and another thing one-up, and
     by the time the width change arrives the helpers already read the new mode. */
  let anchor = pages[0];

  /* dir: 1 turns forward, -1 turns back, 0 swaps without a turn (first paint, a
     deep link, a language change, a resize). */
  function render(dir) {
    const shown = showOf(view).map((i) => pages[i]);
    const turning = !!dir && !reduced.matches;
    /* Everything that was on the table and is not part of the new pair has to
       leave — as an animated leaf when the reader turned a page, straight off when
       the book was only re-laid out. Taking it off the table by hand rather than
       on animationend matters: a visitor who asked for reduced motion fires no
       animation event, and a page left behind would sit over the new one forever. */
    const gone = [].slice.call(book.querySelectorAll(".lookbook__page.is-on"))
      .filter((p) => shown.indexOf(p) < 0);
    clearTimeout(settle);
    out.forEach((p) => p.classList.remove("is-leaving"));
    gone.forEach((p) => p.classList.remove("is-on"));
    if (turning) {
      book.dataset.turn = dir > 0 ? "fwd" : "back";
      gone.forEach((p) => p.classList.add("is-leaving"));
      out = gone;
    } else {
      book.removeAttribute("data-turn");
      out = [];
    }
    shown.forEach((p, i) => {
      p.dataset.pos = i ? "second" : "first";
      p.classList.add("is-on");
    });
    anchor = shown[0];
    /* A key that turned the page was pressed on a picture that is now off the table.
       Focus has to go somewhere in the book, or the keyboard reader loses the book
       altogether and the next arrow lands on the page behind it. */
    const held = document.activeElement;
    if (held && held !== document.body && book.contains(held)) {
      const host = held.closest ? held.closest(".lookbook__page") : null;
      if (host && gone.indexOf(host) > -1) {
        const onward = shown.map((pg) => pg.querySelector("a[href],button")).filter(Boolean)[0] || book;
        onward.focus();
      }
    }
    label.textContent = t(mq.matches ? "Spread" : "Page");
    num.textContent = (view + 1) + " / " + total();
    const name = shown[0].querySelector(".lookbook__name");
    /* The caption is read from the page itself, so it arrives in whatever language
       js/translate.js has already written into the document. */
    who.textContent = name ? "· " + name.textContent.trim() : "";
    prev.disabled = view === 0;
    next.disabled = view >= total() - 1;
    track.style.setProperty("--lb-p", ((view + 1) / total()).toFixed(4));
    if (out.length) settle = setTimeout(() => {
      out.forEach((p) => p.classList.remove("is-leaving"));
      out = [];
      book.removeAttribute("data-turn");
    }, 640);
  }

  function go(v, dir) {
    const n = Math.max(0, Math.min(total() - 1, v));
    if (n === view) { render(0); return; }
    /* Focus must not fall to the page body when the button that was just pressed
       turns out to be the one that reaches its end. */
    const lost = (document.activeElement === prev && n === 0) ||
                 (document.activeElement === next && n === total() - 1);
    view = n;
    render(dir);
    if (lost) (document.activeElement === prev ? next : prev).focus();
  }

  const step = (d) => go(view + d, d);
  const fwd = () => (rtl() ? -1 : 1);

  /* The arrows are the reader's, not the book's: "next" always means the next pages
     in the work's own order, written left to right or right to left. What mirrors in
     Arabic is the geometry — which half of the spread lifts, which way it swings —
     and that is the CSS's job. The keys and the drag do mirror, because they name a
     direction on the screen rather than a direction in the book. */
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));

  book.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); step(fwd()); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-fwd()); }
    else if (e.key === "Home") { e.preventDefault(); go(0, -1); }
    else if (e.key === "End") { e.preventDefault(); go(total() - 1, 1); }
  });

  /* A drag across the book, on the same terms as the customer rail: pointer capture
     only once the cursor has really moved, and a drag that ends on a picture must
     not open it. The pages shift a little under the hand while it is dragging, so
     the reader feels the leaf before it turns. */
  let down = false, x0 = 0, x1 = 0, moved = 0;
  book.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    down = true; moved = 0; x0 = x1 = e.clientX;
    book.classList.add("is-dragging");
  });
  book.addEventListener("pointermove", (e) => {
    if (!down) return;
    x1 = e.clientX;
    const dx = x1 - x0;
    if (Math.abs(dx) > 6 && !book.hasPointerCapture?.(e.pointerId)) {
      try { book.setPointerCapture(e.pointerId); } catch (err) { /* not capturable yet */ }
    }
    moved = Math.max(moved, Math.abs(dx));
    book.style.setProperty("--lb-drag", Math.max(-70, Math.min(70, dx * -0.22)) + "px");
  });
  const release = () => {
    if (!down) return;
    down = false;
    book.classList.remove("is-dragging");
    book.style.removeProperty("--lb-drag");
    const dx = x1 - x0;
    if (Math.abs(dx) > 40) step((dx < 0 ? 1 : -1) * fwd());
  };
  book.addEventListener("pointerup", release);
  book.addEventListener("pointercancel", release);
  book.addEventListener("pointerleave", release);

  book.addEventListener("click", (e) => {
    if (moved > 8) { e.preventDefault(); e.stopPropagation(); moved = 0; return; }
    const a = e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.charAt(0) !== "#") return;
    const el = document.getElementById(href.slice(1));
    if (!el) return;
    /* A contents line turns to its own page instead of jumping down the document. */
    const at = pages.indexOf(el);
    if (at > -1) { e.preventDefault(); go(viewOf(at), viewOf(at) >= view ? 1 : -1); return; }
    /* A picture opens the item it came from. Its card is the honest target of the
       link, so with scripting off this is a jump to the shelf below; with
       js/catalog.js present the click is handed to the card and the product panel
       takes it from there — same modal, same order buttons, nothing duplicated. */
    if (el.classList.contains("product-card")) { e.preventDefault(); el.click(); }
  });

  /* Widening the window does not move the reader: the page you were looking at
     stays the page you are looking at. */
  const onWidth = () => { go(viewOf(pages.indexOf(anchor)), 0); };
  if (mq.addEventListener) mq.addEventListener("change", onWidth); else mq.addListener(onWidth);
  window.addEventListener("orientationchange", () => setTimeout(onWidth, 140));

  document.addEventListener("i18n-applied", () => render(0));

  /* Deep links: a shared #page-9 opens the book to that spread rather than to the
     cover, which is what the flat no-script version already does. */
  let start = 0;
  try {
    const at = pages.indexOf(document.getElementById(decodeURIComponent(location.hash || "").slice(1)));
    if (at > -1) start = viewOf(at);
  } catch (err) { /* a hand-typed hash is nobody's fault but the visitor's */ }
  book.parentNode.classList.add("is-live");
  render(0);
  if (start) go(start, 0);
})();
