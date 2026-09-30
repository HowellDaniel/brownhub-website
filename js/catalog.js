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
    "key-holders-2.jpg": 1,
    "key-holders.jpg": 1,
    "label-packaging.jpg": 1,
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
    "winners-chapel-flyer.jpg": 1
  };
  function stageSrc(path) {
    var base = path.split("/").pop();
    return HI[base] ? "images/catalog/hi/" + base : path;
  }

  var cards = [];
  document.querySelectorAll(".product-card").forEach(function (card) { cards.push(card); });

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
    if (img.getAttribute("data-fell")) return;
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
      var ok = !list.length || matches(card, list);
      card.hidden = !ok;
      if (ok) shown++;
    });
    if (filterClear) filterClear.hidden = !list.length;
    if (emptyEl) emptyEl.hidden = shown !== 0;
    if (remember !== false) {
      try {
        var u = new URL(location.href);
        if (list.length) u.searchParams.set("q", term.trim());
        else u.searchParams.delete("q");
        history.replaceState(history.state, "", u);
      } catch (e) {}
    }
  }

  if (filterForm && filterInput) {
    filterForm.addEventListener("submit", function (e) { e.preventDefault(); });
    filterInput.addEventListener("input", function () { applyFilter(filterInput.value); });
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
})();
