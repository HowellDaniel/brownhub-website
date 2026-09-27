(function () {
  "use strict";

  // ===== 1. Paystack ==========================================================
  // paystack.com -> Dashboard -> Settings -> API keys & webhooks -> Public Key.
  // Only the pk_... key belongs in this file. The sk_... secret can move money
  // and issue refunds, so it must never be pasted here or shipped in a page.
  var PK_KEY = "pk_live_b3a14638fa5e88c6988d25666ae9bc20864fc28f";
  // Paystack's hosted checkout frame, fetched on the first tap of a pay button so
  // a visitor who never buys never downloads a third-party script.
  var PK_SRC = "https://js.paystack.co/v1/inline.js";
  // Ways a buyer can pay in the popup. Ghana options are card, mobile_money and
  // bank_transfer; Paystack hides any channel the account has not switched on.
  var CHANNELS = ["card", "mobile_money", "bank_transfer"];
  // Anything that is not a public key is treated as no key. This is the guard that
  // keeps a pasted sk_... secret from being published to the whole internet, since
  // this file is served to every visitor.
  var PK_LIVE = /^pk_[a-z0-9_]+$/i.test(PK_KEY.trim()) ? PK_KEY.trim() : "";

  // ===== 2. What the studio sells, priced in Ghana cedis ======================
  // A price of 0 means "the studio has not set one yet": that card then asks for
  // a quote instead of taking money, so the site never advertises a figure that
  // nobody priced. Put a number in and the pay button appears on its own.
  // Placeholder figures the owner approved as payable on 2026-09-24; changing one
  // here changes what Paystack charges, so refund any order placed at the old rate.
  var PACKAGES = [
    { id: "logo", name: "Logo & Brand Identity", price: 1200 },
    { id: "social", name: "Social Media & Advertising", price: 450 },
    { id: "print", name: "Flyers, Posters & Print", price: 300 },
    { id: "packaging", name: "Packaging Design", price: 800 }
  ];

  // ===== 3. Sponsored slots ===================================================
  // Selling placement on this site to other businesses. Same pay button, and the
  // term shown under the price.
  var SLOTS = [
    { id: "catalog-top", name: "Top of the catalog", price: 250, term: "30 days" },
    { id: "catalog-mid", name: "Middle of the catalog", price: 150, term: "30 days" },
    { id: "home-banner", name: "Home page banner", price: 400, term: "30 days" }
  ];

  // ===== 4. Tools we recommend ================================================
  // Add an entry once that program has approved the site, with your own affiliate
  // id already inside the url. rel="sponsored nofollow" is set for you.
  var TOOLS = [];

  // ===== 5. Display ads =======================================================
  // The ca-pub-... number from the AdSense snippet. While this is empty no ad
  // script loads and no box appears, so an unapproved account cannot leave a
  // grey rectangle where the work should be.
  var ADSENSE = "";

  var WA = "https://wa.me/233502954541";
  var CURRENCY = "GHS";

  // ---------------------------------------------------------------------------

  var LOADED = null;
  var emailRow, noteEl;

  function txt(el, s) {
    el.textContent = "";
    el.appendChild(document.createTextNode(s));
    return el;
  }

  // For strings that go into a URL or an attribute rather than the page, where
  // the MutationObserver never reaches.
  function T(s) {
    return window.I18N && window.I18N.t ? window.I18N.t(s) : s;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) txt(n, text);
    return n;
  }

  function money(v) {
    // The locale's own currency name would print "GHS 1,200"; buyers here read
    // the symbol, so the number is grouped locally and the symbol is fixed.
    try {
      return "GH\u20B5" + new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 0, maximumFractionDigits: 2
      }).format(v);
    } catch (e) {
      return "GH\u20B5" + v;
    }
  }

  function emailOf() {
    var inp = emailRow ? emailRow.querySelector("input") : null;
    if (inp && inp.value.trim()) return inp.value.trim();
    var known = (window.BHAccounts && window.BHAccounts.email) ? (window.BHAccounts.email() || "") : "";
    // A signed-in client already proved this address, so show it rather than
    // asking them to type it again.
    if (inp && known) inp.value = known;
    return known;
  }

  // The note sits below the cards, so a message written while the visitor is
  // looking elsewhere still waits for them rather than interrupting.
  function say(msg, reference, item) {
    if (!noteEl) return;
    noteEl.textContent = "";
    if (!msg) { noteEl.hidden = true; return; }
    noteEl.hidden = false;
    noteEl.appendChild(txt(el("span", "pay-note__msg"), msg));
    // A value never goes inside a translatable sentence: the reference gets its
    // own line so the copy around it stays a dictionary key.
    if (reference) {
      noteEl.appendChild(el("span", "pay-ref-label", "Payment reference"));
      noteEl.appendChild(el("span", "pay-ref", reference));
    }
    if (reference && item) {
      var a = el("a", "btn btn--ghost btn--sm", "Send the reference to us on WhatsApp");
      a.href = WA + "?text=" + encodeURIComponent("I have paid for " + item.name + ". Reference: " + reference);
      a.target = "_blank";
      a.rel = "noopener";
      noteEl.appendChild(a);
    }
  }

  function ref(item) {
    return "BH-" + item.id + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function loadPk() {
    if (LOADED) return LOADED;
    LOADED = new Promise(function (resolve, reject) {
      if (window.PaystackPop) return resolve();
      var s = document.createElement("script");
      s.src = PK_SRC;
      s.async = true;
      s.onload = function () { window.PaystackPop ? resolve() : reject(new Error("no PaystackPop")); };
      s.onerror = function () { LOADED = null; s.remove(); reject(new Error("blocked")); };
      document.head.appendChild(s);
    });
    return LOADED;
  }

  // Unpriced cards, and any pay that cannot reach Paystack, end up here: the
  // contact form with the item already written into the message.
  function quote(item) {
    location.href = "contact.html?item=" + encodeURIComponent(item.name);
  }

  function record(item, reference) {
    if (!window.BHAccounts || !window.BHAccounts.record) return;
    window.BHAccounts.record({
      service: item.name,
      message: "Paid order: " + item.name + " | " + money(item.price) + " | reference " + reference
    });
  }

  function paid(item, res) {
    var reference = (res && res.reference) || "";
    record(item, reference);
    // The callback only means Paystack closed a session that ended in payment;
    // the money is confirmed in the dashboard, so nothing here claims more.
    say("We have your payment. We will confirm on WhatsApp and start the work.", reference, item);
  }

  function buy(item) {
    // Ask for an email only once there is actually a payment to make: the receipt
    // field stays hidden while nothing is priced, so checking it first would send
    // visitors to an input they cannot see.
    if (!PK_LIVE || !item.price) { quote(item); return; }
    var mail = emailOf();
    if (!mail || mail.indexOf("@") < 1) {
      say("Add your email first, so we can send the receipt.");
      if (emailRow) { emailRow.hidden = false; var inp = emailRow.querySelector("input"); if (inp) inp.focus(); }
      return;
    }
    say("");
    loadPk().then(function () {
      // setup() only builds the checkout frame in hiding; openIframe() is what the
      // buyer actually sees, so a missing call leaves the button doing nothing.
      window.PaystackPop.setup({
        key: PK_LIVE,
        channels: CHANNELS,
        email: mail,
        amount: Math.round(item.price * 100),
        currency: CURRENCY,
        ref: ref(item),
        metadata: { custom_fields: [{ display_name: "Item", variable_name: "bh_item", value: item.name }] },
        callback: function (res) { paid(item, res); },
        onClose: function () { say("Payment not completed. Try again, or send us the brief and we will quote it."); }
      }).openIframe();
    }).catch(function () { quote(item); });
  }

  // The order text is built before the dictionary has arrived, so each link is
  // refreshed when translate.js reports that a language has been applied.
  var waLinks = [];

  function orderHref(a, item) {
    a.href = WA + "?text=" + encodeURIComponent(T("I'd like to order:") + " " + T(item.name));
  }

  function card(item, priced) {
    var c = el("div", "card card--pay");
    c.appendChild(el("h3", null, item.name));
    if (item.term) c.appendChild(el("p", "pay-term", item.term));
    // An unpriced card says nothing about money: the button already asks for a
    // quote, and a repeated line would read like a missing price.
    if (priced) {
      c.appendChild(el("p", "pay-price")).appendChild(el("strong", null, money(item.price)));
      c.appendChild(el("p", "pay-methods", "Card, bank or mobile money"));
    }
    var actions = el("div", "pay-actions");
    var b = el("button", "btn " + (priced ? "btn--primary" : "btn--ghost"), priced ? "Pay now" : "Ask for a price");
    b.type = "button";
    b.addEventListener("click", function () { buy(item); });
    actions.appendChild(b);
    // WhatsApp is where this studio actually closes jobs, so the card offers it
    // whether or not a card terminal is wired up yet.
    var w = el("a", "btn btn--ghost btn--sm", "Order this on WhatsApp");
    w.target = "_blank";
    w.rel = "noopener";
    waLinks.push({ a: w, item: item });
    orderHref(w, item);
    actions.appendChild(w);
    c.appendChild(actions);
    return c;
  }

  function renderInto(host, items) {
    if (!host) return;
    host.textContent = "";
    items.forEach(function (i) { host.appendChild(card(i, i.price > 0 && !!PK_LIVE)); });
    if (emailRow && items.some(function (i) { return i.price > 0 && PK_LIVE; })) emailRow.hidden = false;
  }

  function mount(name) { return document.querySelector('[data-store="' + name + '"]'); }

  function renderTools() {
    var host = mount("tools");
    if (!host) return;
    if (!TOOLS.length) {
      var wrap = host.closest(".store-tools");
      if (wrap) wrap.hidden = true;
      return;
    }
    TOOLS.forEach(function (t) {
      var a = el("a", "tool", t.name);
      a.href = t.url;
      a.target = "_blank";
      a.rel = "sponsored nofollow noopener";
      if (t.why) a.appendChild(el("small", null, t.why));
      host.appendChild(a);
    });
  }

  // AdSense pays on impressions served from its own script, so there is nothing
  // to show until the account number exists.
  function renderAds() {
    var host = mount("ads");
    if (!host) return;
    if (!ADSENSE) { host.hidden = true; return; }
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.cssText = "display:block";
    ins.setAttribute("data-ad-client", ADSENSE);
    ins.setAttribute("data-ad-slot", "0");
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    host.appendChild(ins);
    var s = document.createElement("script");
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(ADSENSE);
    s.async = true;
    s.crossOrigin = "anonymous";
    host.appendChild(s);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* not approved yet */ }
  }

  function init() {
    emailRow = mount("email");
    noteEl = mount("note");
    // The card-details promise is only worth making when a key exists *and*
    // something carries a price; the line ships hidden so it never flashes on
    // ahead of this script.
    var payable = !!PK_LIVE && PACKAGES.concat(SLOTS).some(function (i) { return i.price > 0; });
    var secure = mount("secure");
    if (secure) secure.hidden = !payable;
    renderInto(mount("packages"), PACKAGES);
    renderInto(mount("slots"), SLOTS);
    renderTools();
    renderAds();
    if (window.BHAccounts && window.BHAccounts.email && emailRow) {
      var known = window.BHAccounts.email();
      var inp = emailRow.querySelector("input");
      if (known && inp && !inp.value) inp.value = known;
    }
    document.addEventListener("i18n-applied", function () {
      waLinks.forEach(function (l) { orderHref(l.a, l.item); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.BHStore = {
    packages: PACKAGES,
    slots: SLOTS,
    pay: buy,
    configured: function () { return !!PK_LIVE; },
    // The chat assistant quotes prices, and a second copy of the rate card would
    // drift from what the pay button charges, so it reads them from here.
    offers: function () {
      return PACKAGES.concat(SLOTS).filter(function (i) { return i.price > 0; });
    }
  };
})();
