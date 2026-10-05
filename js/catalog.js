(function () {
  var modal = document.getElementById("product-modal");
  if (!modal) return;

  var img = modal.querySelector(".modal__img");
  var nameEl = document.getElementById("product-modal-name");
  var catEl = document.getElementById("product-modal-cat");
  var descEl = document.getElementById("product-modal-desc");
  var chatBtn = document.getElementById("product-order-chat");
  var quoteBtn = document.getElementById("product-order-quote");
  var moreWrap = document.getElementById("product-modal-more");
  var moreTitle = document.getElementById("product-modal-more-title");
  var moreGrid = document.getElementById("product-modal-more-grid");
  var body = modal.querySelector(".modal__body");
  var current = "";
  var gal = document.getElementById("product-modal-gal");
  var prevBtn = document.getElementById("product-modal-prev");
  var nextBtn = document.getElementById("product-modal-next");
  var countEl = document.getElementById("product-modal-count");
  var thumbsWrap = document.getElementById("product-modal-thumbs");
  var photos = [];
  var shot = 0;

  /* Native-resolution frames (up to 1600px on the long side) pulled from the
     studio's own WhatsApp Business catalog. Only the modal stage uses them;
     card covers and the thumb strip keep the light 760px file. Regenerate this
     list from images/catalog/hi/ whenever more frames are harvested. */
  var HI = {
    "book-design-5.jpg": 1,
    "book-design-6.jpg": 1,
    "book-design-7.jpg": 1,
    "book-design-8.jpg": 1,
    "flyer-4.jpg": 1,
    "flyer-9.jpg": 1,
    "funeral-banner-2.jpg": 1,
    "funeral-banner-3.jpg": 1,
    "funeral-banner-4.jpg": 1,
    "funeral-banner-6.jpg": 1,
    "funeral-banner-7.jpg": 1,
    "funeral-banner-8.jpg": 1,
    "funeral-banner-9.jpg": 1,
    "gold-perspex-2.jpg": 1,
    "gold-perspex-3.jpg": 1,
    "gold-perspex-4.jpg": 1,
    "gold-perspex-5.jpg": 1,
    "gold-perspex-6.jpg": 1,
    "gold-perspex-7.jpg": 1,
    "gold-perspex.jpg": 1,
    "handkerchief-10.jpg": 1,
    "handkerchief-2.jpg": 1,
    "handkerchief-3.jpg": 1,
    "handkerchief-4.jpg": 1,
    "handkerchief-5.jpg": 1,
    "handkerchief-6.jpg": 1,
    "handkerchief-7.jpg": 1,
    "handkerchief-8.jpg": 1,
    "handkerchief-9.jpg": 1,
    "handkerchief.jpg": 1,
    "key-holders-2.jpg": 1,
    "key-holders.jpg": 1,
    "label-packaging.jpg": 1,
    "logo-design-mockup-2.jpg": 1,
    "logo-design-mockup-3.jpg": 1,
    "logo-design-mockup.jpg": 1,
    "more-winners-chapel-flyers-2.jpg": 1,
    "more-winners-chapel-flyers-3.jpg": 1,
    "more-winners-chapel-flyers-4.jpg": 1,
    "more-winners-chapel-flyers.jpg": 1,
    "notepad-design.jpg": 1,
    "other-flyers-2.jpg": 1,
    "printing-samples-16.jpg": 1,
    "printing-samples-17.jpg": 1,
    "printing-samples-9.jpg": 1,
    "pull-up-design-10.jpg": 1,
    "pull-up-design-11.jpg": 1,
    "pull-up-design-2.jpg": 1,
    "pull-up-design-3.jpg": 1,
    "pull-up-design-5.jpg": 1,
    "pull-up-design-6.jpg": 1,
    "pull-up-design-7.jpg": 1,
    "pull-up-design-8.jpg": 1,
    "pull-up-design-9.jpg": 1,
    "tshirts-caps-10.jpg": 1,
    "tshirts-caps-11.jpg": 1,
    "tshirts-caps-2.jpg": 1,
    "tshirts-caps-4.jpg": 1,
    "tshirts-caps-5.jpg": 1,
    "tshirts-caps-6.jpg": 1,
    "tshirts-caps-7.jpg": 1,
    "tshirts-caps-8.jpg": 1,
    "tshirts-caps-9.jpg": 1,
    "tshirts-caps.jpg": 1,
    "winners-chapel-flyer-10.jpg": 1,
    "winners-chapel-flyer-2.jpg": 1,
    "winners-chapel-flyer-3.jpg": 1,
    "winners-chapel-flyer-4.jpg": 1,
    "winners-chapel-flyer-5.jpg": 1,
    "winners-chapel-flyer-6.jpg": 1,
    "winners-chapel-flyer-7.jpg": 1,
    "winners-chapel-flyer-8.jpg": 1,
    "winners-chapel-flyer-9.jpg": 1,
    "winners-chapel-flyer.jpg": 1,
  };
  function stageSrc(path) {
    var base = path.split("/").pop();
    return HI[base] ? "images/catalog/hi/" + base : path;
  }

  // The home page carries a strip of catalog teasers that are plain links, so the
  // filter may only collect the real shelf — every catalog grid on the site is
  // #catalog-grid, and anything outside it stays exactly where it was put.
  var cards = [];
  (document.getElementById("catalog-grid") || document).querySelectorAll(".product-card")
    .forEach(function (card) { cards.push(card); });

  function byName(name) {
    for (var i = 0; i < cards.length; i++) if (cards[i].dataset.name === name) return cards[i];
    return null;
  }

  function peers(card) {
    var cat = card.dataset.cat;
    if (!cat) return [];
    return cards.filter(function (c) {
      return c !== card && c.dataset.cat === cat;
    });
  }

  function renderMore(card) {
    moreGrid.textContent = "";
    var list = peers(card);
    if (list.length) {
      moreTitle.textContent = "More in " + (card.dataset.catlabel || card.dataset.cat);
    } else {
      list = cards.filter(function (c) { return c !== card; });
      moreTitle.textContent = "More from the catalog";
    }
    if (!list.length) {
      moreWrap.hidden = true;
      return;
    }
    list.forEach(function (c) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "more-item";
      btn.setAttribute("aria-label", "View details: " + c.dataset.name);
      var thumb = document.createElement("img");
      thumb.src = c.dataset.img;
      thumb.alt = c.dataset.name;
      var name = document.createElement("span");
      name.textContent = c.dataset.name;
      btn.appendChild(thumb);
      btn.appendChild(name);
      btn.addEventListener("click", function () {
        open(c.dataset.name);
        if (body && body.scrollTop !== undefined) modal.querySelector(".modal__card").scrollTop = 0;
      });
      moreGrid.appendChild(btn);
    });
    moreWrap.hidden = false;
  }

  // WhatsApp only ever publishes one photo per product to the anonymous web, so any
  // further shots are listed on the card and the gallery collapses to one frame
  // when there is nothing else to show.
  function shotsOf(card) {
    var list = (card.dataset.imgs || "").split(",").map(function (s) {
      return s.trim();
    }).filter(Boolean);
    if (list.length) return list;
    return card.dataset.img ? [card.dataset.img] : [];
  }

  function showShot(i) {
    if (!photos.length) return;
    shot = (i + photos.length) % photos.length;
    unzoom();
    img.removeAttribute("data-fell");
    img.src = stageSrc(photos[shot]);
    countEl.textContent = (shot + 1) + " / " + photos.length;
    Array.prototype.forEach.call(thumbsWrap.children, function (thumb, n) {
      thumb.classList.toggle("is-active", n === shot);
      if (n === shot) thumb.setAttribute("aria-current", "true");
      else thumb.removeAttribute("aria-current");
    });
  }

  img.addEventListener("error", function () {
    // photos goes empty when another product's gallery has been built since the
    // frame that failed was chosen, and an undefined index would put the literal
    // string "undefined" into src and fire a second, pointless request.
    if (img.getAttribute("data-fell") || !photos.length) return;
    img.setAttribute("data-fell", "1");
    img.src = photos[shot];
  });

  function buildGallery(card) {
    photos = shotsOf(card);
    thumbsWrap.textContent = "";
    var multi = photos.length > 1;
    prevBtn.hidden = nextBtn.hidden = countEl.hidden = !multi;
    thumbsWrap.hidden = !multi;
    if (!multi) return;
    photos.forEach(function (src, i) {
      var thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "modal__gal-thumb";
      thumb.setAttribute("aria-label", card.dataset.name);
      var face = document.createElement("img");
      face.src = src;
      face.alt = "";
      // Eight frames per product would otherwise all download the moment the
      // modal opens; the strip is below the fold, so let the browser queue it.
      face.loading = "lazy";
      face.decoding = "async";
      thumb.appendChild(face);
      thumb.addEventListener("click", function () { showShot(i); });
      thumbsWrap.appendChild(thumb);
    });
  }

  function open(name) {
    var card = byName(name);
    if (!card) return;
    current = name;
    buildGallery(card);
    showShot(0);
    img.alt = name;
    nameEl.textContent = name;
    catEl.textContent = card.dataset.catlabel || "";
    descEl.textContent = card.dataset.desc;
    quoteBtn.href = "contact.html?item=" + encodeURIComponent(name);
    renderMore(card);
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    if (window.I18N && I18N.lang !== "en") I18N.translateNode(modal);
    chatBtn.focus();
  }

  function close() {
    unzoom();
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  cards.forEach(function (card) {
    card.addEventListener("click", function () { open(card.dataset.name); });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(card.dataset.name); }
    });
  });

  modal.querySelectorAll("[data-close-modal]").forEach(function (el) {
    el.addEventListener("click", close);
  });
  document.addEventListener("keydown", function (e) {
    if (!modal.classList.contains("open")) return;
    if (e.key === "Escape") { close(); return; }
    if (photos.length < 2) return;
    if (e.key === "ArrowRight") showShot(shot + 1);
    if (e.key === "ArrowLeft") showShot(shot - 1);
  });

  prevBtn.addEventListener("click", function () { showShot(shot - 1); });
  nextBtn.addEventListener("click", function () { showShot(shot + 1); });

  var swipeX = null;
  gal.addEventListener("touchstart", function (e) {
    // An enlarged picture pans under the finger instead; flipping the photo in the
    // middle of a pan would be the worst possible surprise.
    if (zoom.s > 1) { swipeX = null; return; }
    swipeX = e.touches.length === 1 ? e.touches[0].clientX : null;
  }, { passive: true });
  gal.addEventListener("touchend", function (e) {
    if (swipeX === null || photos.length < 2) { swipeX = null; return; }
    var dx = e.changedTouches[0].clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) < 45) return;
    showShot(dx < 0 ? shot + 1 : shot - 1);
  }, { passive: true });

  chatBtn.addEventListener("click", function () {
    var item = current;
    close();
    var toggle = document.getElementById("chatToggle");
    var panel = document.getElementById("chatPanel");
    if (!toggle || !panel) return;
    if (panel.hidden) toggle.click();
    setTimeout(function () {
      var tr = function (s) { return (window.I18N && I18N.t) ? I18N.t(s) : s; };
      var display = tr("I want to order:") + " " + tr(item);
      if (window.BROWNHUB_CHAT) {
        BROWNHUB_CHAT.send(display, "I want to order: " + item);
      } else {
        document.getElementById("chatInput").value = display;
        document.getElementById("chatForm").requestSubmit();
      }
    }, 350);
  });

  // The nav search deep-links here as catalog.html?q=term, so the grid filters
  // itself on load and the field mirrors whatever the URL says.
  var filterForm = document.getElementById("catalog-search");
  var filterInput = document.getElementById("catalog-filter-input");
  var filterClear = document.getElementById("catalog-filter-clear");
  var emptyEl = document.getElementById("catalog-empty");
  var catOn = "";

  function words(term) {
    return (term || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  }

  function matches(card, list) {
    // dataset holds the English source and textContent the rendered language, so
    // a visitor searching in either one hits the same card.
    var hay = (card.dataset.name + " " + (card.dataset.catlabel || "") + " " +
      (card.dataset.desc || "") + " " + card.textContent).toLowerCase();
    for (var i = 0; i < list.length; i++) if (hay.indexOf(list[i]) === -1) return false;
    return true;
  }

  function applyFilter(term, remember) {
    var list = words(term);
    var shown = 0;
    cards.forEach(function (card) {
      // A collection narrows by the card's own data-cat, never by its words: the
      // label is a dictionary key and may be rendered in any of forty languages,
      // while data-cat does not move.
      var ok = (!list.length || matches(card, list)) && (!catOn || card.dataset.cat === catOn);
      card.hidden = !ok;
      if (ok) shown++;
    });
    if (filterClear) filterClear.hidden = !list.length && !catOn;
    if (emptyEl) emptyEl.hidden = shown !== 0;
    if (remember !== false) {
      try {
        var u = new URL(location.href);
        if (list.length) u.searchParams.set("q", term.trim());
        else u.searchParams.delete("q");
        if (catOn) u.searchParams.set("cat", catOn);
        else u.searchParams.delete("cat");
        history.replaceState(history.state, "", u);
      } catch (e) {}
    }
  }

  if (filterForm && filterInput) {
    filterForm.addEventListener("submit", function (e) { e.preventDefault(); });
    filterInput.addEventListener("input", function () {
      // Typing outranks a collection: a visitor searching has already left the
      // shelf they came in through.
      if (catOn) { catOn = ""; armTile(""); }
      applyFilter(filterInput.value);
    });
    if (filterClear) {
      filterClear.addEventListener("click", function () {
        filterInput.value = "";
        filterInput.focus();
        applyFilter("");
      });
    }
    var seeded = new URLSearchParams(location.search).get("q");
    if (seeded) {
      filterInput.value = seeded;
      applyFilter(seeded, false);
    }
  }

  /* ---- collections ----
     Each tile narrows the grid to one family of work. The picture in a tile is a
     reserved slot for artwork, not a photograph of an item — the label is the
     only claim the tile makes, so the art can change without anything here
     having to be re-verified against a real order. */
  var tiles = [].slice.call(document.querySelectorAll(".collection[data-collection]"));

  function armTile(cat) {
    tiles.forEach(function (tile) {
      var on = tile.getAttribute("data-collection") === cat;
      tile.classList.toggle("is-on", on);
      tile.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  if (tiles.length) {
    tiles.forEach(function (tile) {
      tile.addEventListener("click", function () {
        var cat = tile.getAttribute("data-collection");
        catOn = catOn === cat ? "" : cat;
        armTile(catOn);
        applyFilter(filterInput ? filterInput.value : "");
        var shelf = document.getElementById("featured");
        if (catOn && shelf) {
          shelf.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "start"
          });
        }
      });
    });
    var seedCat = new URLSearchParams(location.search).get("cat");
    if (seedCat && tiles.some(function (tile) { return tile.getAttribute("data-collection") === seedCat; })) {
      catOn = seedCat;
      armTile(seedCat);
      applyFilter(filterInput ? filterInput.value : "", false);
    }
  }

  /* ---- a closer look ----
     The gallery already clips, so the picture itself is what scales inside it. A
     tap opens up on the point that was touched, a second tap lets go, the enlarged
     picture drags around, and two fingers scale it. Deliberately no control and no
     label: the cursor and the picture are the whole affordance, which also keeps
     this out of the dictionaries. */
  var ZOOM_IN = 2.5;
  var ZOOM_MAX = 4;
  var zoom = { s: 1, x: 0, y: 0 };
  var down = [];            // [pointerId, clientX, clientY] for the pointers held down
  var pinch = null;         // { d: distance the pinch started at, s: scale it started at }
  var press = null;         // the one-finger press being watched for a tap

  function pair() {
    return down.length >= 2 ? [down[0], down[1]] : null;
  }
  function spread(p) {
    return Math.sqrt(Math.pow(p[0][1] - p[1][1], 2) + Math.pow(p[0][2] - p[1][2], 2)) || 1;
  }
  function centre(p) {
    return { x: (p[0][1] + p[1][1]) / 2, y: (p[0][2] + p[1][2]) / 2 };
  }

  function paint() {
    var on = zoom.s > 1;
    gal.classList.toggle("is-zoom", on);
    img.style.transform = on
      ? "translate(" + zoom.x.toFixed(1) + "px," + zoom.y.toFixed(1) + "px) scale(" + zoom.s.toFixed(3) + ")"
      : "";
  }

  function keepInside() {
    var r = gal.getBoundingClientRect();
    var mx = (zoom.s - 1) * r.width / 2;
    var my = (zoom.s - 1) * r.height / 2;
    zoom.x = Math.min(mx, Math.max(-mx, zoom.x));
    zoom.y = Math.min(my, Math.max(-my, zoom.y));
  }

  // The picture scales about the middle of the frame, so a point is measured from
  // there and the offset solved so the picture under the finger stays under it.
  function scaleTo(next, cx, cy) {
    var r = gal.getBoundingClientRect();
    var px = cx - r.left - r.width / 2;
    var py = cy - r.top - r.height / 2;
    var want = Math.min(ZOOM_MAX, Math.max(1, next));
    var k = want / zoom.s;
    zoom.x = px - (px - zoom.x) * k;
    zoom.y = py - (py - zoom.y) * k;
    zoom.s = want;
    if (want === 1) { zoom.x = 0; zoom.y = 0; }
    keepInside();
    paint();
  }

  function unzoom() {
    zoom.s = 1;
    zoom.x = 0;
    zoom.y = 0;
    down = [];
    pinch = null;
    press = null;
    gal.classList.remove("is-drag");
    paint();
  }

  img.setAttribute("draggable", "false");

  gal.addEventListener("pointerdown", function (e) {
    if (e.target.closest(".modal__gal-nav")) return;
    down.push([e.pointerId, e.clientX, e.clientY]);
    if (down.length === 2) {
      var p = pair();
      pinch = { d: spread(p), s: zoom.s };
      press = null;
      gal.classList.add("is-drag");
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
    gal.classList.add("is-drag");
    // Only an enlarged picture is draggable, and only then does it hold the
    // pointer — otherwise a plain scroll of the card would be swallowed.
    if (zoom.s > 1) {
      gal.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });

  gal.addEventListener("pointermove", function (e) {
    var held = -1;
    for (var i = 0; i < down.length; i++) if (down[i][0] === e.pointerId) held = i;
    if (held < 0) return;
    down[held][1] = e.clientX;
    down[held][2] = e.clientY;
    var p = pair();
    if (pinch && p) {
      scaleTo(pinch.s * (spread(p) / pinch.d), centre(p).x, centre(p).y);
      return;
    }
    if (!press) return;
    // press keeps the last point, so the drag is measured here rather than from
    // movementX/Y, which WebKit does not supply for touch pointers.
    var dx = e.clientX - press.x;
    var dy = e.clientY - press.y;
    if (!press.moved && Math.abs(dx) + Math.abs(dy) < 9) return;
    press.moved = true;
    if (zoom.s > 1) {
      zoom.x += dx;
      zoom.y += dy;
      keepInside();
      paint();
    }
    press.x = e.clientX;
    press.y = e.clientY;
  });

  // A release anywhere ends the press, not just one inside the frame: a mouse
  // drag that runs off the picture would otherwise leave the grab cursor stuck
  // and a phantom pointer held down. A cancelled gesture is the browser taking
  // over to scroll, so it must never read as a tap.
  function release(e, tapped) {
    for (var i = 0; i < down.length; i++) {
      if (down[i][0] !== e.pointerId) continue;
      down.splice(i, 1);
      break;
    }
    if (down.length < 2) pinch = null;
    if (down.length) { press = null; return; }
    gal.classList.remove("is-drag");
    var wasTap = tapped !== false && press && !press.moved && Date.now() - press.t < 600;
    press = null;
    if (!wasTap) return;
    if (zoom.s > 1) unzoom();
    else scaleTo(ZOOM_IN, e.clientX, e.clientY);
  }
  window.addEventListener("pointerup", function (e) { release(e, true); });
  window.addEventListener("pointercancel", function (e) { release(e, false); });
})();
