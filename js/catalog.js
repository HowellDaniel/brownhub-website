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

  function open(name) {
    var card = byName(name);
    if (!card) return;
    current = name;
    img.src = card.dataset.img;
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
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

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
