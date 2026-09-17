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

  // Add the FAQ to the home page using accessible native disclosure panels.
  const homePage = document.querySelector(".hero");
  const cta = document.querySelector(".cta");
  if (homePage && cta && !document.getElementById("faq")) {
    const faq = document.createElement("section");
    faq.className = "section faq-section";
    faq.id = "faq";
    faq.setAttribute("aria-labelledby", "faq-title");
    faq.innerHTML = `
      <div class="container">
        <div class="section__head">
          <h2 id="faq-title">Frequently asked questions</h2>
          <p>Quick answers about working with BrownHub.</p>
        </div>
        <div class="faq-list">
          <details class="faq-item">
            <summary>What services does BrownHub offer?</summary>
            <p>We provide product engineering, website design and development, cloud and DevOps, AI and data solutions, UX and product design, and graphic design.</p>
          </details>
          <details class="faq-item">
            <summary>How does the project process work?</summary>
            <p>We begin with a consultation to understand your goals, then align on scope, timeline, and budget before moving through design, development, testing, and launch.</p>
          </details>
          <details class="faq-item">
            <summary>How long does a project take?</summary>
            <p>Timelines depend on the scope and complexity. After learning about your project, we will provide a realistic delivery plan and milestones.</p>
          </details>
          <details class="faq-item">
            <summary>How much does a project cost?</summary>
            <p>Every project is different. We create a tailored estimate based on your requirements, desired features, timeline, and level of support.</p>
          </details>
          <details class="faq-item">
            <summary>Can you improve an existing website?</summary>
            <p>Yes. We can refresh the design, improve performance and accessibility, add features, fix issues, or rebuild an existing website.</p>
          </details>
          <details class="faq-item">
            <summary>Do you provide support after launch?</summary>
            <p>Yes. We can provide ongoing maintenance, updates, monitoring, improvements, and technical support after your project goes live.</p>
          </details>
        </div>
      </div>`;
    cta.before(faq);

    const faqStyles = document.createElement("style");
    faqStyles.textContent = `
      .faq-list { max-width: 860px; margin: 0 auto; display: grid; gap: 1rem; }
      .faq-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
      .faq-item summary { cursor: pointer; list-style: none; padding: 1.25rem 1.5rem; color: var(--text); font-weight: 600; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .faq-item summary::-webkit-details-marker { display: none; }
      .faq-item summary::after { content: "+"; color: var(--accent); font-size: 1.5rem; font-weight: 400; line-height: 1; }
      .faq-item[open] summary::after { content: "−"; }
      .faq-item summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
      .faq-item p { margin: 0; padding: 0 1.5rem 1.25rem; color: var(--text-muted); line-height: 1.7; }
    `;
    document.head.appendChild(faqStyles);
  }
})();
