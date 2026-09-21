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
})();
