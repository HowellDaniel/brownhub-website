(() => {
  const shots = Array.prototype.slice.call(document.querySelectorAll(".shot"));
  if (!shots.length) return;

  const WA = "https://wa.me/233502954541";
  const ORDER_PREFIX = "I want to order:";

  const filter = document.querySelector(".filter");
  if (filter) {
    const buttons = Array.prototype.slice.call(filter.querySelectorAll(".filter__btn"));
    const show = (cat) => {
      for (const btn of buttons) {
        const on = btn.dataset.filter === cat;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      }
      for (const shot of shots) shot.hidden = cat !== "all" && shot.dataset.cat !== cat;
    };
    filter.addEventListener("click", (event) => {
      const btn = event.target.closest(".filter__btn");
      if (btn) show(btn.dataset.filter);
    });
  }

  const modal = document.getElementById("shot-modal");
  if (!modal) return;

  const img = document.getElementById("shot-modal-img");
  const nameEl = document.getElementById("shot-modal-name");
  const catEl = document.getElementById("shot-modal-cat");
  const descEl = document.getElementById("shot-modal-desc");
  const waBtn = document.getElementById("shot-modal-wa");
  const quoteBtn = document.getElementById("shot-modal-quote");
  const closeBtn = modal.querySelector(".modal__close");
  let opener = null;

  const isOpen = () => modal.classList.contains("open");

  function open(shot) {
    const name = shot.dataset.name || "";
    const desc = shot.dataset.desc || "";
    img.src = shot.querySelector("img").getAttribute("src");
    img.alt = desc;
    nameEl.textContent = name;
    catEl.textContent = shot.dataset.catlabel || "";
    descEl.textContent = desc;
    quoteBtn.href = "contact.html?item=" + encodeURIComponent(name);
    waBtn.href = WA + "?text=" + encodeURIComponent(ORDER_PREFIX + " " + name);
    opener = shot;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    if (window.I18N && I18N.lang !== "en") I18N.translateNode(modal);
    closeBtn.focus();
  }

  function close() {
    if (!isOpen()) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
    if (opener) {
      opener.focus();
      opener = null;
    }
  }

  for (const shot of shots) {
    shot.addEventListener("click", () => open(shot));
    shot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(shot);
      }
    });
  }

  modal.querySelectorAll("[data-close-shot]").forEach((el) => el.addEventListener("click", close));

  document.addEventListener("keydown", (event) => {
    if (!isOpen()) return;
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.prototype.slice.call(modal.querySelectorAll("a[href], button")).filter((el) => !el.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!modal.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
