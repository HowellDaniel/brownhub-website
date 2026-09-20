(() => {
  const toggle = document.getElementById("chatToggle");
  const panel = document.getElementById("chatPanel");
  const closeBtn = document.getElementById("chatClose");
  const messages = document.getElementById("chatMessages");
  const chips = document.getElementById("chatChips");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  if (!toggle || !panel || !messages) return;

  const WA = "https://wa.me/233502954541";
  const WA_CATALOG = "https://wa.me/c/233502954541";

  function T(s) {
    return (window.I18N && window.I18N.t) ? window.I18N.t(s) : s;
  }

  const questionIntents = [
    {
      keys: ["human", "agent", "real person", "talk to someone", "speak to someone", "call you", "phone", "email", "whatsapp", "contact"],
      html: `You can reach the team directly: call or WhatsApp <a href="tel:+233593872873">+233 593 872 873</a>, email <a href="mailto:howelldaniel533@gmail.com">howelldaniel533@gmail.com</a>, or chat on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a>. The <a href="contact.html">contact form</a> works too.`
    },
    {
      keys: ["where", "address", "location", "office", "visit", "find you", "based"],
      html: `We're in Accra, Ghana — work address: ChrisPrintgh, Accra New Town, Greater Accra. Both locations with maps are on the <a href="contact.html">contact page</a>.`
    },
    {
      keys: ["hours", "open", "closed", "available", "weekend"],
      html: `We're open Mon–Fri, 9am–6pm GMT. Messages sent outside those hours (here or on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a>) get answered the next working day.`
    },
    {
      keys: ["how long", "turnaround", "deadline", "delivery", "deliver", "when will", "rush", "urgent"],
      html: `Typical turnaround: flyers &amp; banners 1–3 days, logos &amp; branding about a week, websites 1–3 weeks depending on page count. Rush job? Ask on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> and we'll confirm what's possible.`
    },
    {
      keys: ["order", "buy", "purchase", "book", "place an order"],
      html: `Ordering is simple: 1) open the item in our <a href="catalog.html">catalog</a>, 2) press “Order now via chat” or “Request a quote”, 3) send your sizes, quantity and deadline. We confirm the price and start right away.`
    },
    {
      keys: ["price", "cost", "quote", "how much", "charge", "fee", "budget"],
      html: `Prices depend on scope — pages, sizes, materials and deadline. Send the details on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> or by email and you'll get a quick quote; design jobs are usually quoted the same day.`
    }
  ];

  const topicIntents = [
    {
      keys: ["thank", "thanks", "appreciate"],
      html: "Anytime! Anything else I can help with — websites, design work, ordering or prices?"
    },
    {
      keys: ["catalog", "catalogue", "product", "item", "print", "printing", "flyer", "banner", "pull up", "pull-up", "frame", "abs board", "book design", "funeral"],
      html: `Browse every print &amp; design piece in our <a href="catalog.html">website catalog</a> — tap any item to see details and order right here. The catalog is also on <a href="${WA_CATALOG}" target="_blank" rel="noopener">WhatsApp</a>.`
    },
    {
      keys: ["graphic", "design", "logo", "brand", "branding", "poster", "card", "artwork"],
      html: `Our graphic design studio handles logos &amp; branding, flyers, banners, pull-up stands, frames, book covers and print-ready artwork. See samples in the <a href="catalog.html">catalog</a> and the full list on the <a href="services.html">services page</a>.`
    },
    {
      keys: ["website", "web site", "site", "web", "landing", "portfolio", "ecommerce", "e-commerce", "responsive", "domain", "hosting", "page"],
      html: `We build responsive business websites, landing pages, portfolios and web apps — fast, mobile-first and easy to maintain. Details on the <a href="services.html">services page</a>; tell me your idea here or on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> for a quote.`
    },
    {
      keys: ["help", "what can you do", "assist", "options"],
      html: "I give quick answers on our website development and graphic design work: services, catalog items, prices, turnaround, ordering and how to reach the team. Try a button below."
    },
    {
      keys: ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"],
      html: "Hello! Great to see you. Ask me anything about our website development or graphic design work — or tap a button below to get started."
    }
  ];

  const fallback = `I didn't quite catch that. I'm best at quick answers on <strong>website projects</strong> and <strong>graphic design work</strong> — services, catalog items, prices, turnaround, ordering. Or reach a human on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a>.`;

  const greeting = `Hi, I'm the BrownHub robotic assistant. I give quick replies on anything about our <strong>website development</strong> and <strong>graphic design</strong> work. What can I help with?`;

  const defaultChips = ["Website services", "Graphic design", "Catalog items", "Get a quote", "Talk to a human"];

  function bestOf(list, t) {
    let best = null, bestScore = 0;
    for (const intent of list) {
      const score = intent.keys.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0);
      if (score > bestScore) { best = intent; bestScore = score; }
    }
    return best;
  }

  function answer(text) {
    const t = text.toLowerCase();
    const hit = bestOf(questionIntents, t) || bestOf(topicIntents, t);
    return hit ? hit.html : fallback;
  }

  function scrollDown() { messages.scrollTop = messages.scrollHeight; }

  function addMsg(html, who) {
    const el = document.createElement("div");
    el.className = `chat-msg chat-msg--${who}`;
    if (who === "user") el.textContent = html;
    else el.innerHTML = T(html);
    messages.appendChild(el);
    scrollDown();
    return el;
  }

  function typingBubble() {
    const el = document.createElement("div");
    el.className = "chat-msg chat-msg--bot chat-msg--typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    messages.appendChild(el);
    scrollDown();
    return el;
  }

  function renderChips(list) {
    chips.innerHTML = "";
    for (const label of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = T(label);
      b.addEventListener("click", () => send(label));
      chips.appendChild(b);
    }
  }

  function send(text) {
    const clean = text.trim();
    if (!clean) return;
    addMsg(clean, "user");
    renderChips([]);
    const bubble = typingBubble();
    setTimeout(() => {
      bubble.remove();
      addMsg(answer(clean), "bot");
      renderChips(defaultChips);
      input.focus();
    }, 550 + Math.random() * 450);
  }

  let greeted = false;
  function openChat() {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    if (!greeted) {
      greeted = true;
      const bubble = typingBubble();
      setTimeout(() => {
        bubble.remove();
        addMsg(greeting, "bot");
        renderChips(defaultChips);
      }, 600);
    }
    input.focus();
  }

  function closeChat() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }

  toggle.addEventListener("click", () => (panel.hidden ? openChat() : closeChat()));
  closeBtn.addEventListener("click", closeChat);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closeChat();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
    input.value = "";
  });
})();
