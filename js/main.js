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

    // Add structured project questions so visitors can provide more useful details.
    const messageField = contactForm.querySelector("#message")?.closest(".form-field");
    if (messageField && !contactForm.querySelector("#timeline")) {
      const projectQuestions = document.createElement("div");
      projectQuestions.className = "form-row";
      projectQuestions.innerHTML = `
        <div class="form-field">
          <label for="timeline">Preferred timeline</label>
          <select id="timeline" name="timeline">
            <option value="">Select a timeline…</option>
            <option>As soon as possible</option>
            <option>Within 1 month</option>
            <option>1–3 months</option>
            <option>3–6 months</option>
            <option>I'm flexible</option>
          </select>
        </div>
        <div class="form-field">
          <label for="budget">Estimated budget</label>
          <select id="budget" name="budget">
            <option value="">Select a budget range…</option>
            <option>Under $500</option>
            <option>$500–$2,000</option>
            <option>$2,000–$5,000</option>
            <option>$5,000–$10,000</option>
            <option>Over $10,000</option>
            <option>Not sure yet</option>
          </select>
        </div>`;
      messageField.before(projectQuestions);

      const message = contactForm.querySelector("#message");
      message.rows = 7;
      message.minLength = 20;
      message.placeholder = "Tell us about your goals, features, audience, timeline, budget, and any useful references…";
      message.setAttribute("aria-describedby", "message-help");

      const help = document.createElement("small");
      help.id = "message-help";
      help.className = "form-help";
      help.textContent = "The more details you provide, the better we can prepare for our response.";
      message.insertAdjacentElement("afterend", help);
    }
  }
})();
