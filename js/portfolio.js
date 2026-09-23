(() => {
  const filter = document.querySelector(".filter");
  const shots = Array.prototype.slice.call(document.querySelectorAll(".shot"));
  if (!filter || !shots.length) return;
  const buttons = Array.prototype.slice.call(filter.querySelectorAll(".filter__btn"));

  function show(cat) {
    for (const btn of buttons) {
      const on = btn.dataset.filter === cat;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    for (const shot of shots) shot.hidden = cat !== "all" && shot.dataset.cat !== cat;
  }

  filter.addEventListener("click", (event) => {
    const btn = event.target.closest(".filter__btn");
    if (btn) show(btn.dataset.filter);
  });
})();
