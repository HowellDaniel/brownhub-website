(function () {
  "use strict";

  var doc = document;
  var header = doc.querySelector(".site-header");
  var trigger = doc.getElementById("nav-search");
  if (!header || !trigger) return;

  function TR(s) { return (window.I18N && I18N.t) ? I18N.t(s) : s; }

  // Labels are the site's own English strings, so every one of them is already a
  // dictionary key and results localise for free. `k` is a private English alias
  // list that is never shown, only matched against.
  var INDEX = [
    { g: "Pages", t: "Home", h: "index.html", k: "start front page studio" },
    { g: "Pages", t: "Customer experience", h: "index.html#customer-experience", k: "experience rail drag carousel how it feels" },
    { g: "Pages", t: "Customer reviews", h: "index.html#reviews", k: "reviews testimonials clients say feedback stars rating" },
    { g: "Pages", t: "Services", h: "services.html", k: "what we do pricing packages" },
    { g: "Pages", t: "Catalog", h: "catalog.html", k: "shop items products prints" },
    { g: "Pages", t: "About", h: "about.html", k: "team story accra company" },
    { g: "Pages", t: "Contact", h: "contact.html", k: "email phone whatsapp quote enquiry" },
    { g: "Pages", t: "My requests", h: "", act: "acct", k: "login account sign in history orders" },

    { g: "Services", t: "Logo Design", h: "services.html#logo-brand", k: "logo mark symbol brand" },
    { g: "Services", t: "Brand Identity Design", h: "services.html#logo-brand", k: "brand identity corporate guideline colours" },
    { g: "Services", t: "Social Media Design", h: "services.html#social-ads", k: "social media post instagram content reel" },
    { g: "Services", t: "Marketing & Advertising Graphics", h: "services.html#social-ads", k: "marketing advertising campaign ad promo" },
    { g: "Services", t: "Flyer & Poster Design", h: "services.html#flyers-print", k: "flyer poster event programme" },
    { g: "Services", t: "Business Card Design", h: "services.html#flyers-print", k: "business card visiting card letterhead stationery" },
    { g: "Services", t: "Brochure & Company Profile Design", h: "services.html#brochures-books", k: "brochure company profile catalogue magazine" },
    { g: "Services", t: "Packaging Design", h: "services.html#packaging", k: "packaging label box sticker bottle food" },
    { g: "Services", t: "Custom Graphic Design", h: "services.html#custom", k: "custom anything illustration menu book cover" },
    { g: "Services", t: "Website or Software", h: "services.html#web-software", k: "website web software app system dashboard" },

    { g: "Catalog", t: "Pull Up Design, Backdrop and Printing", h: "catalog.html?q=Pull%20Up%20Design%2C%20Backdrop%20and%20Printing", k: "banner pull up stand backdrop event printing" },
    { g: "Catalog", t: "All Types of Frames", h: "catalog.html?q=All%20Types%20of%20Frames", k: "frame award plaque photo certificate glass" },
    { g: "Catalog", t: "Flyer", h: "catalog.html?q=Flyer", k: "flyer printing event wedding funeral church" },
    { g: "Catalog", t: "Sample of Printing", h: "catalog.html?q=Sample%20of%20Printing", k: "print sample business card letterhead receipt poster" },
    { g: "Catalog", t: "Funeral Banner", h: "catalog.html?q=Funeral%20Banner", k: "funeral banner memorial commemorative cloth" },
    { g: "Catalog", t: "Book Design (Inside and Cover)", h: "catalog.html?q=Book%20Design%20%28Inside%20and%20Cover%29", k: "book cover inside layout typesetting manuscript" },
    { g: "Catalog", t: "ABS Board", h: "catalog.html?q=ABS%20Board", k: "abs board foam signage portrait display" },

    { g: "Pages", t: "Privacy policy", h: "privacy.html", k: "privacy policy data legal cookies" }
  ];

  var CHIPS = ["Logo Design", "Brand Identity Design", "Flyer", "Packaging Design", "Business Card Design"];
  var GROUPS = ["Pages", "Services", "Catalog"];

  var wrap, panel, input, clearBtn, listEl, chipsEl, lastShown = [];
  var open = false, cursor = -1, seq = 0;

  function build() {
    wrap = doc.createElement("div");
    wrap.className = "search";
    wrap.id = "site-search";
    wrap.hidden = true;

    panel = doc.createElement("div");
    panel.className = "search__panel";
    panel.setAttribute("role", "search");
    wrap.appendChild(panel);

    var field = doc.createElement("div");
    field.className = "search__field";

    var glass = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    glass.setAttribute("class", "search__glass");
    glass.setAttribute("viewBox", "0 0 24 24");
    glass.setAttribute("width", "20");
    glass.setAttribute("height", "20");
    glass.setAttribute("fill", "none");
    glass.setAttribute("stroke", "currentColor");
    glass.setAttribute("stroke-width", "2");
    glass.setAttribute("stroke-linecap", "round");
    glass.setAttribute("aria-hidden", "true");
    var ring = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", "11"); ring.setAttribute("cy", "11"); ring.setAttribute("r", "7");
    var handle = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    handle.setAttribute("d", "M16.5 16.5 21 21");
    glass.appendChild(ring); glass.appendChild(handle);

    input = doc.createElement("input");
    input.id = "search-input";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", TR("Search services, catalog and pages"));
    input.setAttribute("placeholder", TR("Search services, catalog and pages"));
    input.setAttribute("aria-controls", "search-list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-activedescendant", "");

    clearBtn = doc.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "search__clear";
    clearBtn.setAttribute("aria-label", TR("Clear search"));
    clearBtn.hidden = true;
    clearBtn.textContent = "×";

    field.appendChild(glass); field.appendChild(input); field.appendChild(clearBtn);
    panel.appendChild(field);

    chipsEl = doc.createElement("div");
    chipsEl.className = "search__chips";
    chipsEl.setAttribute("role", "group");
    chipsEl.setAttribute("aria-label", TR("Popular searches"));
    CHIPS.forEach(function (c) {
      var b = doc.createElement("button");
      b.type = "button";
      b.className = "search__chip";
      b.textContent = TR(c);
      b.addEventListener("click", function () {
        input.value = c;
        input.focus();
        render();
      });
      chipsEl.appendChild(b);
    });
    panel.appendChild(chipsEl);

    listEl = doc.createElement("ul");
    listEl.className = "search__list";
    listEl.id = "search-list";
    listEl.setAttribute("role", "listbox");
    listEl.setAttribute("aria-label", TR("Search services, catalog and pages"));
    panel.appendChild(listEl);

    header.appendChild(wrap);
  }

  function norm(s) { return (s || "").toLowerCase().trim(); }

  function haystack(e) {
    return norm(e.t) + " " + norm(TR(e.t)) + " " + norm(e.k) + " " + norm(e.g) + " " + norm(TR(e.g));
  }

  function query(q) {
    var words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var out = [];
    for (var i = 0; i < INDEX.length; i++) {
      var e = INDEX[i], hay = haystack(e), all = true, any = false;
      for (var w = 0; w < words.length; w++) {
        var hit = hay.indexOf(words[w]) !== -1;
        if (!hit) all = false;
        if (hit) any = true;
      }
      if (all || (words.length > 1 && any)) out.push(e);
    }
    return out.slice(0, 14);
  }

  function option(e) {
    var li = doc.createElement("li");
    li.className = "search__item";
    li.id = "search-opt-" + (++seq);
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");

    var a = doc.createElement("a");
    a.className = "search__hit";
    a.href = e.h || "#";
    if (!e.h) a.setAttribute("role", "button");

    var t = doc.createElement("span");
    t.className = "search__hit-t";
    t.textContent = TR(e.t);

    var g = doc.createElement("span");
    g.className = "search__hit-g";
    g.textContent = TR(e.g);

    a.appendChild(t); a.appendChild(g);
    li.appendChild(a);

    li.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
    li.addEventListener("click", function (ev) {
      if (e.act === "acct") {
        ev.preventDefault();
        close();
        var acct = doc.getElementById("acct-open");
        if (acct) acct.click();
        else window.location.href = "contact.html";
      } else {
        close();
      }
    });
    return li;
  }

  function render() {
    var q = input.value;
    clearBtn.hidden = !norm(q);
    chipsEl.hidden = !!norm(q);
    listEl.textContent = "";
    lastShown = [];
    cursor = -1;
    input.setAttribute("aria-activedescendant", "");
    input.setAttribute("aria-expanded", "true");

    var hits = norm(q) ? query(q) : INDEX.slice(0, 6);
    if (!hits.length) {
      var none = doc.createElement("li");
      none.className = "search__none";
      none.textContent = TR("No matches. Try a shorter word.");
      listEl.appendChild(none);
      return;
    }

    GROUPS.forEach(function (g) {
      var inG = hits.filter(function (e) { return e.g === g; });
      if (!inG.length) return;
      var head = doc.createElement("li");
      head.className = "search__group";
      head.setAttribute("role", "presentation");
      head.textContent = TR(g);
      listEl.appendChild(head);
      inG.forEach(function (e) {
        var li = option(e);
        listEl.appendChild(li);
        lastShown.push(li);
      });
    });
  }

  function move(delta) {
    if (!lastShown.length) return;
    if (cursor > -1 && lastShown[cursor]) lastShown[cursor].setAttribute("aria-selected", "false");
    cursor = (cursor + delta + lastShown.length) % lastShown.length;
    var li = lastShown[cursor];
    li.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", li.id);
    if (li.scrollIntoView) li.scrollIntoView({ block: "nearest" });
  }

  function show() {
    open = true;
    wrap.hidden = false;
    doc.documentElement.classList.add("is-searching");
    // Force the starting style before the class lands; rAF would never fire in a
    // throttled background tab and the panel would stay transparent.
    void wrap.offsetWidth;
    wrap.classList.add("is-open");
    render();
    input.focus();
    doc.addEventListener("pointerdown", onPointer, true);
  }

  function close() {
    if (!open) return;
    open = false;
    wrap.classList.remove("is-open");
    doc.documentElement.classList.remove("is-searching");
    window.setTimeout(function () { if (!open) wrap.hidden = true; }, 180);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-activedescendant", "");
    trigger.setAttribute("aria-expanded", "false");
    doc.removeEventListener("pointerdown", onPointer, true);
  }

  function onPointer(e) {
    if (wrap.contains(e.target) || trigger.contains(e.target)) return;
    close();
  }

  function typing() {
    var a = doc.activeElement;
    return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
  }

  build();

  trigger.addEventListener("click", function () {
    if (open) close(); else { trigger.setAttribute("aria-expanded", "true"); show(); }
  });

  input.addEventListener("input", render);
  clearBtn.addEventListener("click", function () {
    input.value = "";
    input.focus();
    render();
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      var li = lastShown[cursor > -1 ? cursor : 0];
      if (li) li.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
      trigger.focus();
    }
  });

  doc.addEventListener("keydown", function (e) {
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (open) { close(); } else { trigger.setAttribute("aria-expanded", "true"); show(); }
      return;
    }
    if (e.key === "/" && !typing() && !open) {
      e.preventDefault();
      trigger.setAttribute("aria-expanded", "true");
      show();
      return;
    }
    if (e.key === "Escape" && open) close();
  });

  doc.addEventListener("i18n-applied", function () {
    if (!open) return;
    render();
  });
})();
