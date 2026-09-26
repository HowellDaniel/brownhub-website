(function () {
  "use strict";

  var doc = document;
  var src = doc.querySelector(".footer-social");
  if (!src || doc.querySelector(".social-rail")) return;

  var links = src.querySelectorAll("a");
  if (!links.length) return;

  function labelOf(a) {
    return a.getAttribute("aria-label") || a.getAttribute("title") || "";
  }

  var rail = doc.createElement("aside");
  rail.className = "social-rail";
  rail.setAttribute("aria-label", "Follow us on social media");

  for (var i = 0; i < links.length; i++) {
    var a = links[i];
    var svg = a.querySelector("svg");
    if (!svg) continue;
    var label = labelOf(a);

    var b = doc.createElement("a");
    b.className = "social-rail__btn";
    b.href = a.href;
    b.target = "_blank";
    b.rel = "noopener";
    if (label) {
      b.setAttribute("aria-label", label);
      b.setAttribute("title", label);
    }
    b.appendChild(svg.cloneNode(true));

    var tag = doc.createElement("span");
    tag.className = "social-rail__label";
    tag.setAttribute("aria-hidden", "true");
    tag.textContent = label;
    b.appendChild(tag);

    rail.appendChild(b);
  }

  if (!rail.children.length) return;
  doc.body.appendChild(rail);
})();
