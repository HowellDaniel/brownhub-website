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
  // Ways a buyer can pay in the popup. Ghana rails are card and mobile_money;
  // apple_pay only appears for a visitor on an Apple device once Paystack has
  // verified this domain — the checkout also hides any channel the account has not
  // switched on, so listing one costs nothing. bank_transfer is deliberately NOT
  // listed: the tab would print the one-time account Paystack's partner bank mints
  // for that transaction, and the owner has decided a buyer who wants to bank with
  // this studio should be given his account and nothing else. The dashboard's own
  // Bank Transfer toggle stays on; a checkout that does not name the channel simply
  // never shows it. The studio's account reaches buyers through the panel below.
  var CHANNELS = ["card", "mobile_money", "apple_pay"];
  // The studio's transfer account is not written into this file: it is held in
  // Supabase's secret store and returned to supabase/functions/bank-details, which
  // answers only this site's Origin and only with no-store. So the number is never
  // served, cached, indexed or committed as page content — a buyer who asks for it
  // still gets to read it, which is the whole point of the panel.
  var BANK_EP = "https://rmvyrfqyxgupwuzxadyx.supabase.co/functions/v1/bank-details";
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
  // What a buyer actually receives is rendered by renderFeatured() below from
  // data/featured.json — a slot with no entry there shows nothing at all, so the
  // band never appears as a hole and nothing is invented about a business that has
  // not paid. Fill the JSON in when an order lands: name, blurb, url, an optional
  // image inside this site (the page's own content policy only allows images from
  // here), and the day the placement ends.
  // One price for every place, on the owner's word: GH₵300 for a month in any of
  // the three. The tag is the short position name the buyer types
  // into the bank's narration field, so a transfer that arrives with no message is
  // still recognisable as the top of the catalog rather than the home banner.
  var SLOTS = [
    { id: "catalog-top", name: "Top of the catalog", price: 300, term: "30 days", tag: "TOP" },
    { id: "catalog-mid", name: "Middle of the catalog", price: 300, term: "30 days", tag: "MID" },
    { id: "home-banner", name: "Home page banner", price: 300, term: "30 days", tag: "HOME" }
  ];
  var FEATURED_EP = "data/featured.json";

  // ===== 4. Tools we recommend ================================================
  // Add an entry once that program has approved the site, with your own affiliate
  // id already inside the url. rel="sponsored nofollow" is set for you.
  var TOOLS = [];

  // ===== 5. Display ads =======================================================
  // The ca-pub-... number from the AdSense snippet. While this is empty no ad
  // script loads and no box appears, so an unapproved account cannot leave a
  // grey rectangle where the work should be.
  //
  // Pasting a key here is NOT the whole job, and this is the line that says so:
  // every page's own content policy reads script-src 'self' https://js.paystack.co,
  // so Google's ad script would be refused and the slot would stay invisible with
  // no error in the page. When a key goes in, the same commit has to widen the
  // policy in all nine documents and in sw.js:
  //   script-src   + https://pagead2.googlesyndication.com https://adservice.google.com
  //   frame-src    + https://googleads.g.doubleclick.net https://adsense.google.com
  //   img-src      + https://*.doubleclick.net https://pagead2.googlesyndication.com
  //   connect-src  + https://*.google-analytics.com https://pagead2.googlesyndication.com
  //   style-src    + 'unsafe-inline' for the ad frames only if Google asks
  // Until then this file loads nothing third-party here, and the visitor's choice
  // in the cookie centre is what decides even after it: see renderAds().
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

  function copyText(s) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).catch(function () {});
      return;
    }
    var t = document.createElement("textarea");
    t.value = s;
    t.setAttribute("readonly", "");
    t.style.cssText = "position:fixed;top:-10rem;opacity:0";
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch (e) { /* nothing else to try */ }
    t.remove();
  }

  // Held in a variable and nowhere else: not localStorage, not sessionStorage, so
  // the account leaves the tab when the tab closes.
  var bankData = null;

  function bankDetails() {
    if (bankData) return Promise.resolve(bankData);
    return fetch(BANK_EP, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("off")); })
      .then(function (d) {
        if (!d || !d.bank || !d.name || !d.number) return Promise.reject(new Error("empty"));
        bankData = { bank: String(d.bank), name: String(d.name), number: String(d.number) };
        return bankData;
      });
  }

  var openXfer = null;

  function onXferKey(e) {
    if (e.key === "Escape") closeXfer();
  }

  function closeXfer() {
    if (!openXfer) return;
    var node = openXfer;
    openXfer = null;
    document.removeEventListener("keydown", onXferKey);
    node.remove();
  }

  function stepText(s) {
    var li = el("li", "pay-xfer__step");
    li.appendChild(el("span", "pay-xfer__say", s));
    return li;
  }

  // A label and a value that must not be translated: the dictionary rewrites the
  // text nodes it recognises and leaves an unknown account number exactly alone,
  // which is the safe direction for a string that sends money.
  function dataRow(label, value, copyable) {
    var row = el("div", "pay-xfer__row");
    row.appendChild(el("span", "pay-xfer__k", label));
    row.appendChild(el("span", "pay-xfer__v", value));
    if (copyable) {
      var b = el("button", "pay-xfer__copy", "Copy");
      b.type = "button";
      b.addEventListener("click", function () {
        copyText(value);
        txt(b, "Copied");
        setTimeout(function () { txt(b, "Copy"); }, 2600);
      });
      row.appendChild(b);
    }
    return row;
  }

  function openTransfer(item) {
    closeXfer();
    // A code the buyer types into the bank's narration field, so a transfer that
    // arrives without a message can still be matched to the order it belongs to.
    // A slot's code also carries its position, because three different places now
    // cost the same figure and the amount alone cannot say which one was bought.
    var tag = item.tag ? "-" + item.tag : "";
    var code = "BH" + tag + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    var wrap = el("div", "pay-xfer");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", T("Transfer to our own bank account"));
    var back = el("div", "pay-xfer__backdrop");
    back.addEventListener("click", closeXfer);
    wrap.appendChild(back);

    var box = el("div", "pay-xfer__box");
    var close = el("button", "pay-xfer__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", T("Close"));
    close.addEventListener("click", closeXfer);
    box.appendChild(close);

    var head = el("div", "pay-xfer__head");
    head.appendChild(el("p", "pay-xfer__title", "Transfer to our own bank account"));
    var lead = el("p", "pay-xfer__item");
    lead.appendChild(el("span", null, item.name));
    lead.appendChild(el("strong", null, money(item.price)));
    head.appendChild(lead);
    box.appendChild(head);

    // The five rows are on screen before the account arrives, so the panel opens at
    // roughly its final height and never rebuilds itself under the buyer's thumb.
    var rows = el("div", "pay-xfer__rows");
    var wait = 5;
    while (wait--) rows.appendChild(el("div", "pay-xfer__row pay-xfer__row--wait"));
    box.appendChild(rows);
    var steps = el("ol", "pay-xfer__steps");
    box.appendChild(steps);
    var foot = el("p", "pay-xfer__load", "Loading the account details…");
    box.appendChild(foot);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    openXfer = wrap;
    document.addEventListener("keydown", onXferKey);
    close.focus();

    function wire() {
      foot.className = "pay-xfer__note";
      txt(foot, "Send the exact amount, and put the reference in the message field, so we can match it to your order.");
      var acts = el("div", "pay-xfer__acts");
      var w = el("a", "btn btn--primary btn--sm", "Tell us on WhatsApp once you have sent it.");
      w.target = "_blank";
      w.rel = "noopener";
      function hrefFor() {
        w.href = WA + "?text=" + encodeURIComponent(
          T("I have sent a bank transfer.") + ": " + T(item.name) + " " + money(item.price) +
          " " + T("Reference") + " " + code
        );
      }
      hrefFor();
      waLinks.push({ a: w, item: item, extra: hrefFor });
      acts.appendChild(w);
      var alt = el("button", "btn btn--ghost btn--sm", "Pay by card or mobile money");
      alt.type = "button";
      alt.addEventListener("click", function () { closeXfer(); buy(item); });
      acts.appendChild(alt);
      box.appendChild(acts);
    }

    bankDetails().then(function (d) {
      rows.textContent = "";
      rows.appendChild(dataRow("Bank", d.bank, false));
      rows.appendChild(dataRow("Account number", d.number, true));
      rows.appendChild(dataRow("Account name", d.name, true));
      rows.appendChild(dataRow("Amount", money(item.price), true));
      rows.appendChild(dataRow("Reference", code, true));
      steps.appendChild(stepText("Open your bank app or internet banking."));
      steps.appendChild(stepText("Choose Instant pay or GIP if your bank offers it."));
      wire();
    }).catch(function () {
      rows.remove();
      steps.remove();
      foot.className = "pay-xfer__note pay-xfer__note--bad";
      txt(foot, "We could not load our account details just now. Message us and we will send them across.");
      var acts = el("div", "pay-xfer__acts");
      var w = el("a", "btn btn--ghost btn--sm", "Order this on WhatsApp");
      w.target = "_blank";
      w.rel = "noopener";
      w.href = WA + "?text=" + encodeURIComponent(T("I'd like to order:") + " " + T(item.name));
      acts.appendChild(w);
      box.appendChild(acts);
    });
  }

  function card(item, priced) {
    var c = el("div", "card card--pay");
    c.appendChild(el("h3", null, item.name));
    if (item.term) c.appendChild(el("p", "pay-term", item.term));
    // An unpriced card says nothing about money: the button already asks for a
    // quote, and a repeated line would read like a missing price.
    if (priced) {
      c.appendChild(el("p", "pay-price")).appendChild(el("strong", null, money(item.price)));
      c.appendChild(el("p", "pay-methods", "Card, mobile money or Apple Pay — or transfer to our account"));
    }
    var actions = el("div", "pay-actions");
    // On a priced card the heaviest action is the one that pays the studio directly.
    // Paystack's popup is the secondary choice and does exactly what it always did —
    // card, mobile money, Apple Pay, and its own single-use transfer number — but a
    // buyer who wants to bank with us rather than with a processor should not have to
    // find that route in the second row.
    if (priced) {
      var x = el("button", "btn btn--primary pay-xfer-open", "Transfer to our account");
      x.type = "button";
      x.addEventListener("click", function () { openTransfer(item); });
      actions.appendChild(x);
    }
    var b = el("button", "btn " + (priced ? "btn--ghost btn--sm" : "btn--ghost"), priced ? "Pay now" : "Ask for a price");
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
  // to show until the account number exists — and nothing may load until the
  // visitor has said yes to it in the cookie centre. Google asks for the same
  // thing the site already promises, so this is a consent gate, not a style
  // choice: no ad request for anyone who has not decided, and a second chance
  // when the decision arrives during the visit (the bhconsent event below).
  var adsFired = false;

  function renderAds() {
    var host = mount("ads");
    if (!host) return;
    var c = typeof window.bhConsent === "function" ? window.bhConsent() : {};
    if (!ADSENSE || !c.decided || !c.advertising || adsFired) { host.hidden = true; return; }
    adsFired = true;
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
    // If the page's own content policy is still refusing the ad host — which it
    // will until the directives named above are widened — the frame simply does
    // not appear. Hiding the mount is the honest answer; an empty box is not.
    s.onerror = function () { host.hidden = true; };
    host.appendChild(s);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* not approved yet */ }
  }

  // The paid placements, once someone has bought one. An empty or malformed file
  // renders nothing: this never fills a slot with an invented business.
  function renderFeatured() {
    var hosts = document.querySelectorAll("[data-featured]");
    if (!hosts.length) return;
    // no-cache, and the service worker answers /data from the network first, so the
    // owner editing this file by hand is the whole publishing step.
    fetch(FEATURED_EP, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        Array.prototype.forEach.call(hosts, function (host) {
          var key = host.getAttribute("data-featured");
          var list = Array.isArray(data[key]) ? data[key] : [];
          var today = new Date().toISOString().slice(0, 10);
          var live = list.filter(function (f) {
            return f && typeof f.name === "string" && f.name.trim() &&
              typeof f.url === "string" && /^https?:\/\//i.test(f.url.trim()) &&
              (!f.until || String(f.until).slice(0, 10) >= today);
          }).slice(0, 2);
          if (!live.length) return;
          host.hidden = false;
          host.textContent = "";
          live.forEach(function (f) { host.appendChild(featuredCard(f)); });
        });
      })
      .catch(function () { /* no placement is worse than a broken one, so say nothing */ });
  }

  function featuredCard(f) {
    var box = el("div", "featured__card");
    box.appendChild(el("span", "featured__tag", "Sponsored"));
    if (typeof f.image === "string" && /^images\/[\w.-]+$/.test(f.image.trim())) {
      var pic = el("div", "featured__pic");
      var img = document.createElement("img");
      img.src = f.image.trim();
      img.alt = String(f.name).slice(0, 120);
      img.width = 108; img.height = 108; img.loading = "lazy"; img.decoding = "async";
      pic.appendChild(img);
      box.appendChild(pic);
    }
    var body = el("div", "featured__body");
    var name = el("h3", "featured__name");
    var a = el("a", null, String(f.name).slice(0, 120));
    a.href = String(f.url).trim();
    a.target = "_blank";
    // A buyer paid for the position, not for this site's endorsement, and search
    // engines ask for exactly this attribute on a paid link.
    a.rel = "sponsored nofollow noopener";
    name.appendChild(a);
    body.appendChild(name);
    if (f.blurb) body.appendChild(el("p", "featured__blurb", String(f.blurb).slice(0, 240)));
    box.appendChild(body);
    return box;
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
    renderFeatured();
    renderAds();
    if (window.BHAccounts && window.BHAccounts.email && emailRow) {
      var known = window.BHAccounts.email();
      var inp = emailRow.querySelector("input");
      if (known && inp && !inp.value) inp.value = known;
    }
    document.addEventListener("i18n-applied", function () {
      waLinks.forEach(function (l) { if (l.extra) l.extra(); else orderHref(l.a, l.item); });
    });
    // Consent can arrive after this file has run: the notice is answered by a click,
    // and an ad is worth requesting once it has been allowed.
    document.addEventListener("bhconsent", renderAds);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.BHStore = {
    packages: PACKAGES,
    channels: function () { return CHANNELS.slice(); },
    slots: SLOTS,
    pay: buy,
    transfer: openTransfer,
    configured: function () { return !!PK_LIVE; },
    // The chat assistant quotes prices, and a second copy of the rate card would
    // drift from what the pay button charges, so it reads them from here.
    offers: function () {
      return PACKAGES.concat(SLOTS).filter(function (i) { return i.price > 0; });
    }
  };
})();
