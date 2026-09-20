(function () {
  var modal = document.getElementById("product-modal");
  if (!modal) return;

  var img = modal.querySelector(".modal__img");
  var nameEl = document.getElementById("product-modal-name");
  var descEl = document.getElementById("product-modal-desc");
  var chatBtn = document.getElementById("product-order-chat");
  var quoteBtn = document.getElementById("product-order-quote");
  var current = "";

  function open(card) {
    current = card.dataset.name;
    img.src = card.dataset.img;
    img.alt = current;
    nameEl.textContent = current;
    descEl.textContent = card.dataset.desc;
    quoteBtn.href = "contact.html?item=" + encodeURIComponent(current);
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    if (window.I18N && I18N.lang !== "en") I18N.translateNode(modal);
    chatBtn.focus();
  }

  function close() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  document.querySelectorAll(".product-card").forEach(function (card) {
    card.addEventListener("click", function () { open(card); });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(card); }
    });
  });

  modal.querySelectorAll("[data-close-modal]").forEach(function (el) {
    el.addEventListener("click", close);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  chatBtn.addEventListener("click", function () {
    var item = current;
    close();
    var toggle = document.getElementById("chatToggle");
    var panel = document.getElementById("chatPanel");
    if (!toggle || !panel) return;
    if (panel.hidden) toggle.click();
    setTimeout(function () {
      var input = document.getElementById("chatInput");
      var form = document.getElementById("chatForm");
      input.value = "I want to order: " + item;
      form.requestSubmit();
    }, 350);
  });
})();
