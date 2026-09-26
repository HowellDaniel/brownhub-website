/*
  The nav bar in twilio.com's arrangement: a slim utility row above the main row,
  and a full-width mega panel that hangs under the Services item. The panel is
  built here rather than written into all seven pages, so there is one list of
  links to keep in step with the services page.
  Presentational only: with scripting off the nav is a plain link list.
*/
(function () {
  "use strict";

  var doc = document;
  var header = doc.querySelector(".site-header");
  var link = header && header.querySelector('.nav__menu a[href="services.html"]');
  if (!link) return;

  var P = {
    nib: '<path d="M15.6 3.4 20.6 8.4 9.4 19.6l-5.2.8.8-5.2 10.6-10.6Z"/><path d="M13.4 5.6 18.4 10.6"/>',
    phone: '<rect x="6.2" y="2.8" width="11.6" height="18.4" rx="2.4"/><path d="M10.4 18.4h3.2"/>',
    sheet: '<path d="M13.6 3.2H6.4v17.6h11.2V6.8l-4-3.6Z"/><path d="M13.4 3.4v3.6h4"/><path d="M9 12.4h6M9 15.8h6"/>',
    book: '<path d="M12 6.6C10.4 5.2 8 4.6 4.2 5v13.8c3.8-.4 6.2.2 7.8 1.6 1.6-1.4 4-2 7.8-1.6V5c-3.8-.4-6.2.2-7.8 1.6Z"/><path d="M12 6.6v13.8"/>',
    box: '<path d="M3.6 7.6 12 3.6l8.4 4v8.8L12 20.4l-8.4-4V7.6Z"/><path d="M3.6 7.6 12 11.6l8.4-4M12 11.6v8.8"/>',
    wand: '<path d="M4.4 19.6 15.2 8.8"/><path d="m18.2 3.4.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z"/><path d="M12.4 4.2 13 5.8l1.6.6-1.6.6-.6 1.6-.6-1.6L10.2 6.4l1.6-.6.6-1.6Z"/>',
    monitor: '<rect x="2.8" y="4.6" width="18.4" height="12" rx="2.2"/><path d="M8.6 8.4 6.8 10.6l1.8 2.2M15.4 8.4l1.8 2.2-1.8 2.2M12.8 8.8l-1.6 3.8"/><path d="M6.4 20.4h11.2"/>',
    banner: '<path d="M4.6 4.4h14.8v11.2H4.6z"/><path d="M9 19.6h6M12 15.6v4"/><path d="M8 9.2h8"/>',
    frame: '<rect x="4.4" y="4.4" width="15.2" height="15.2" rx="1.8"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    printer: '<path d="M7 8.6V3.8h10v4.8"/><path d="M4.6 8.6h14.8a2 2 0 0 1 2 2v5.2h-4.2v-2.4H6.8v2.4H2.6v-5.2a2 2 0 0 1 2-2Z"/><path d="M6.8 15.8h10.4v4.4H6.8z"/>',
    bag: '<path d="M5.2 8.2h13.6l1.2 12.4H4L5.2 8.2Z"/><path d="M9 8.2V6.4a3 3 0 0 1 6 0v1.8"/>'
  };

  function icon(k) {
    return '<span class="icon-tile icon-tile--sm"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (P[k] || P.nib) + "</svg></span>";
  }

  function row(r) {
    return '<li class="mega__row"><a href="' + r[2] + '">' + icon(r[3]) +
      '<span class="mega__body"><span class="mega__title">' + r[0] + "</span>" +
      '<span class="mega__desc">' + r[1] + "</span></span></a></li>";
  }

  var COLUMNS = [
    { h: "Design services", items: [
      ["Logo & Brand Identity", "Marks, wordmarks and the identity kit behind them.", "services.html#logo-brand", "nib"],
      ["Social Media & Advertising", "Posts, ads and campaign kits that hold the feed.", "services.html#social-ads", "phone"],
      ["Flyers, Posters & Print", "Flyers, posters, cards and everything you hand over.", "services.html#flyers-print", "sheet"],
      ["Brochures, Profiles & Books", "Company profiles, catalogues and book layouts.", "services.html#brochures-books", "book"]
    ]},
    { h: "More from the studio", items: [
      ["Packaging Design", "Labels, boxes and bottles built to shelf size.", "services.html#packaging", "box"],
      ["Custom Graphic Design", "Something unusual? We design that too.", "services.html#custom", "wand"],
      ["Websites & Software", "A hosted site or an app for the brand.", "services.html#web-software", "monitor"]
    ]},
    { h: "Popular in the catalog", items: [
      ["Banners & signage", "Pull-up stands, backdrops and ABS boards.", "catalog.html?q=Banners", "banner"],
      ["Frames & awards", "Plaques, certificates and framed photos.", "catalog.html?q=Frames", "frame"],
      ["Print & marketing", "Flyers, cards and printed marketing sets.", "catalog.html?q=Print", "printer"],
      ["Book design", "Covers and inside pages, set and printed.", "catalog.html?q=Book", "bag"]
    ]}
  ];

  doc.documentElement.classList.add("js-nav");

  var panel = doc.createElement("div");
  panel.className = "mega";
  panel.id = "mega-services";
  panel.setAttribute("aria-label", "Services menu");
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML =
    '<div class="mega__grid container">' +
      COLUMNS.map(function (c) {
        return '<section class="mega__col"><h2 class="mega__head">' + c.h + "</h2><ul>" +
          c.items.map(row).join("") + "</ul></section>";
      }).join("") +
      '<section class="mega__rail"><div class="mega__card">' +
        '<h2 class="mega__head">Start a project</h2>' +
        '<p>Tell us about your next project and get a free consultation within 24 hours.</p>' +
        '<a href="contact.html" class="btn btn--primary btn--sm">Start your project</a>' +
        '<a href="catalog.html" class="card__link">Order an item from the catalog</a>' +
      "</div></section>" +
    "</div>";
  header.appendChild(panel);

  var caret = doc.createElement("button");
  caret.type = "button";
  caret.className = "nav__caret";
  caret.setAttribute("aria-expanded", "false");
  caret.setAttribute("aria-controls", "mega-services");
  caret.setAttribute("aria-label", "Show services menu");
  caret.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>';
  link.parentNode.insertBefore(caret, link.nextSibling);
  link.parentNode.classList.add("nav__item--mega");

  var open = false, timer = null;
  function set(state) {
    if (state === open) return;
    open = state;
    header.classList.toggle("is-mega-open", state);
    caret.setAttribute("aria-expanded", state ? "true" : "false");
    panel.setAttribute("aria-hidden", state ? "false" : "true");
  }
  function later(state, ms) {
    clearTimeout(timer);
    timer = setTimeout(function () { set(state); }, ms);
  }

  caret.addEventListener("click", function (e) { e.preventDefault(); set(!open); });
  link.addEventListener("click", function () { set(false); });
  panel.addEventListener("mouseleave", function () { later(false, 260); });
  panel.addEventListener("mouseenter", function () { later(true, 0); });
  link.parentNode.addEventListener("mouseenter", function () {
    if (window.matchMedia("(min-width:901px) and (pointer:fine)").matches) later(true, 90);
  });
  link.parentNode.addEventListener("mouseleave", function () { later(false, 260); });

  doc.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !open) return;
    set(false);
    caret.focus();
  });
  doc.addEventListener("pointerdown", function (e) {
    if (open && !panel.contains(e.target) && !link.parentNode.contains(e.target)) set(false);
  });
  // The mobile drawer and the mega panel are two answers to the same question.
  var burger = doc.querySelector(".nav__toggle");
  if (burger) burger.addEventListener("click", function () { set(false); });
  window.addEventListener("resize", function () {
    if (!doc.querySelector(".site-header").matches(":hover")) set(false);
  });
})();
