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

  // Use FormSubmit to deliver contact-form submissions to the site owner.
  // The first submission requires one-time email activation from FormSubmit.
  const contactForm = document.getElementById("contact-form");
  if (contactForm) {
    contactForm.action = "https://formsubmit.co/howelldaniel533@gmail.com";
    contactForm.method = "POST";
    contactForm.noValidate = false;

    const hiddenFields = {
      _subject: "New BrownHub website enquiry",
      _captcha: "false",
      _template: "table"
    };

    Object.entries(hiddenFields).forEach(([name, value]) => {
      if (contactForm.querySelector(`[name="${name}"]`)) return;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      contactForm.appendChild(input);
    });
  }
})();
