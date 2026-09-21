(function () {
  const toggle = document.querySelector(".nav__toggle");
  const menu = document.getElementById("nav-menu");

  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    menu.addEventListener("click", (e) => {
      if (e.target.matches(".nav__link")) {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now) => {
          const progress = Math.min((now - start) / 1200, 1);
          el.textContent = Math.round(target * progress);
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    observer.observe(el);
  });

  // Add the brand explicitly in the navigation so it remains visible even if
  // the image has transparent space or the stylesheet has logo constraints.
  document.querySelectorAll(".site-header .nav__logo").forEach((brand) => {
    if (brand.querySelector(".brand-name")) return;
    const name = document.createElement("span");
    name.className = "brand-name";
    name.textContent = "BrownHub Studio";
    name.setAttribute("aria-hidden", "true");
    brand.appendChild(name);
  });

  const contactForm = document.getElementById("contact-form");
  if (contactForm) {
    contactForm.autocomplete = "on";
    const fields = { name: "name", email: "email", company: "organization", message: "off" };
    Object.entries(fields).forEach(([id, value]) => {
      const field = contactForm.querySelector(`#${id}`);
      if (field) field.autocomplete = value;
    });
    const item = new URLSearchParams(location.search).get("item");
    if (item) {
      const message = document.getElementById("message");
      const service = document.getElementById("service");
      let auto = null;
      const tr = (s) => (window.I18N && I18N.t ? I18N.t(s) : s);
      const setPrefill = () => {
        if (message && (auto === null || message.value === auto)) {
          auto = tr("I'd like to order:") + " " + tr(item);
          message.value = auto;
        }
        if (service) service.value = "Graphic Designing";
      };
      setPrefill();
      document.addEventListener("i18n-applied", setPrefill);
    }
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReducedMotion) {
    const background = document.createElement("div");
    background.className = "interactive-background";
    background.setAttribute("aria-hidden", "true");
    document.body.prepend(background);

    const style = document.createElement("style");
    style.textContent = `
      .interactive-background { position:fixed; inset:0; z-index:-1; pointer-events:none; overflow:hidden; background:radial-gradient(circle at var(--pointer-x,50%) var(--pointer-y,35%),rgba(224,138,60,.14),transparent 28rem),radial-gradient(circle at 85% 15%,rgba(73,126,181,.12),transparent 24rem); }
      .interactive-background::before,.interactive-background::after { content:""; position:absolute; width:22rem; height:22rem; border-radius:50%; filter:blur(70px); opacity:.16; animation:brownhub-float 14s ease-in-out infinite alternate; }
      .interactive-background::before { left:8%; top:18%; background:#e08a3c; }
      .interactive-background::after { right:8%; bottom:12%; background:#477eb5; animation-delay:-6s; }
      @keyframes brownhub-float { from { transform:translate3d(-2rem,1rem,0) scale(.9); } to { transform:translate3d(2rem,-2rem,0) scale(1.1); } }
      .hero__card { will-change:transform; }
      .hero__card--1 { animation:hero-card-float-one 5s ease-in-out infinite; }
      .hero__card--2 { animation:hero-card-float-two 6s ease-in-out -1.5s infinite; }
      .hero__card--3 { animation:hero-card-float-three 5.5s ease-in-out -3s infinite; }
      @keyframes hero-card-float-one { 0% { transform:translate3d(-18px,10px,0) rotate(-6deg); } 25% { transform:translate3d(20px,-8px,0) rotate(2deg); } 50% { transform:translate3d(12px,-24px,0) rotate(4deg); } 75% { transform:translate3d(-16px,-14px,0) rotate(-2deg); } 100% { transform:translate3d(-18px,10px,0) rotate(-6deg); } }
      @keyframes hero-card-float-two { 0% { transform:translate3d(26px,-16px,0) rotate(5deg); } 33% { transform:translate3d(-10px,-28px,0) rotate(-2deg); } 66% { transform:translate3d(10px,6px,0) rotate(3deg); } 100% { transform:translate3d(26px,-16px,0) rotate(5deg); } }
      @keyframes hero-card-float-three { 0% { transform:translate3d(-16px,-10px,0) rotate(-3deg); } 25% { transform:translate3d(18px,-18px,0) rotate(4deg); } 50% { transform:translate3d(28px,8px,0) rotate(0deg); } 75% { transform:translate3d(-8px,10px,0) rotate(-5deg); } 100% { transform:translate3d(-16px,-10px,0) rotate(-3deg); } }
      @media (max-width:700px) { .interactive-background::before,.interactive-background::after { width:14rem; height:14rem; filter:blur(50px); } }
    `;
    document.head.appendChild(style);

    let frame;
    document.addEventListener("pointermove", (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        background.style.setProperty("--pointer-x", `${event.clientX / window.innerWidth * 100}%`);
        background.style.setProperty("--pointer-y", `${event.clientY / window.innerHeight * 100}%`);
      });
    }, { passive: true });
  }
})();
