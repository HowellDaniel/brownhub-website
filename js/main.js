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

  const revealTargets = document.querySelectorAll(
    ".card, .feature, .step, .service-row, .split, .contact-form, .contact-info__card"
  );
  revealTargets.forEach((el) => el.classList.add("reveal"));

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealTargets.forEach((el) => revealObserver.observe(el));

  const form = document.getElementById("contact-form");
  if (form) {
    const status = document.getElementById("form-status");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let valid = true;
      form.querySelectorAll("[required]").forEach((field) => {
        const ok = field.value.trim() !== "" && field.checkValidity();
        field.classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });

      if (!valid) {
        status.textContent = "Please fill in all required fields correctly.";
        status.className = "form-status error";
        return;
      }

      status.textContent = "Thanks! Your message has been sent — we'll reply within one business day.";
      status.className = "form-status success";
      form.reset();
    });
  }
})();
