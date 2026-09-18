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
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          const duration = 1200;
          const start = performance.now();
          const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            el.textContent = Math.round(target * progress);
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
  });

  // Interactive background: a subtle pointer-responsive glow behind the page content.
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReducedMotion) {
    const background = document.createElement("div");
    background.className = "interactive-background";
    background.setAttribute("aria-hidden", "true");
    document.body.prepend(background);

    const style = document.createElement("style");
    style.textContent = `
      .interactive-background {
        position: fixed;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        overflow: hidden;
        background:
          radial-gradient(circle at var(--pointer-x, 50%) var(--pointer-y, 35%), rgba(224, 138, 60, .14), transparent 28rem),
          radial-gradient(circle at 85% 15%, rgba(73, 126, 181, .12), transparent 24rem);
        transition: background-position .35s ease;
      }
      .interactive-background::before,
      .interactive-background::after {
        content: "";
        position: absolute;
        width: 22rem;
        height: 22rem;
        border-radius: 50%;
        filter: blur(70px);
        opacity: .16;
        animation: brownhub-float 14s ease-in-out infinite alternate;
      }
      .interactive-background::before {
        left: 8%;
        top: 18%;
        background: #e08a3c;
      }
      .interactive-background::after {
        right: 8%;
        bottom: 12%;
        background: #477eb5;
        animation-delay: -6s;
      }
      @keyframes brownhub-float {
        from { transform: translate3d(-2rem, 1rem, 0) scale(.9); }
        to { transform: translate3d(2rem, -2rem, 0) scale(1.1); }
      }
      @media (max-width: 700px) {
        .interactive-background::before,
        .interactive-background::after { width: 14rem; height: 14rem; filter: blur(50px); }
      }
    `;
    document.head.appendChild(style);

    let frame;
    document.addEventListener("pointermove", (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = `${(event.clientX / window.innerWidth) * 100}%`;
        const y = `${(event.clientY / window.innerHeight) * 100}%`;
        background.style.setProperty("--pointer-x", x);
        background.style.setProperty("--pointer-y", y);
      });
    }, { passive: true });
  }
})();
