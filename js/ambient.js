/* Ambient hero layers: a linked-dot particle network, a background video, and
   the depth the video travels at as the page scrolls.
   The reference sites load tsParticles from a CDN and stream a hosted clip; a
   strict CSP with script-src 'self' and media-src 'self' allows neither, so both
   are drawn or served from this repo. Everything here is decorative: nothing is
   announced to a screen reader, the dots settle to a still frame for a visitor
   who asks the system to reduce motion, and a visitor who asks to save data
   never downloads the clip at all. */
(function () {
  var still = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)").matches : false;
  var saver = !!(navigator.connection && navigator.connection.saveData);
  var root = document.documentElement;

  function token(el, name, fallback) {
    var v = getComputedStyle(el).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  /* The palette lives in custom properties and flips with the theme, so the
     canvas reads the bare "r,g,b" triple and builds its own rgba() strings. */
  function mixer(el, name, fallback) {
    var rgb = token(el, name, fallback).replace(/\s+/g, "");
    return function (a) { return "rgba(" + rgb + "," + a + ")"; };
  }

  /* ---- linked dots ---- */
  [].slice.call(document.querySelectorAll("canvas[data-particles]")).forEach(function (cv) {
    var host = cv.parentNode;
    var ctx = cv.getContext("2d");
    if (!ctx || !host) return;

    var w = 0, h = 0, dpr = 1, pts = [], raf = 0, shown = true, dot, line;
    var LINK = 122;

    function resize() {
      var r = cv.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var want = Math.max(18, Math.min(64, Math.round(w * h / 24000)));
      while (pts.length < want) pts.push({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, r: 0 });
      if (pts.length > want) pts.length = want;
      pts.forEach(function (p) {
        if (!p.vx) {
          var a = Math.random() * Math.PI * 2, s = 0.14 + Math.random() * 0.2;
          p.vx = Math.cos(a) * s;
          p.vy = Math.sin(a) * s;
        }
        if (!p.r) p.r = 0.9 + Math.random() * 1.5;
      });

      dot = mixer(root, cv.dataset.pt ? "--" + cv.dataset.pt + "-rgb" : "--accent-rgb", "244,84,90");
      line = mixer(root, cv.dataset.ptLine ? "--" + cv.dataset.ptLine + "-rgb" : "--accent-2-rgb", "177,125,65");
    }

    function paint(static_only) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (var a = 0; a < pts.length; a++) {
        for (var b = a + 1; b < pts.length; b++) {
          var dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y;
          var d2 = dx * dx + dy * dy;
          if (d2 > LINK * LINK) continue;
          ctx.strokeStyle = line(((1 - Math.sqrt(d2) / LINK) * 0.34).toFixed(3));
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = dot(static_only ? "0.5" : "0.62");
      for (var n = 0; n < pts.length; n++) {
        ctx.beginPath();
        ctx.arc(pts[n].x, pts[n].y, pts[n].r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame() {
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
      }
      paint(false);
      raf = requestAnimationFrame(frame);
    }

    function play() {
      if (raf || still) return;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    // A settled frame either way, so the layer is never blank before the
    // observer or the tab's visibility has had a chance to report.
    paint(true);
    if (!still && !document.hidden) play();

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          shown = en.isIntersecting;
          if (shown && !document.hidden) play(); else stop();
        });
      }, { threshold: 0.02 }).observe(cv);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else if (shown) play();
    });

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { resize(); if (still) paint(true); }, 220);
    }, { passive: true });

    // The inks flip with the theme, so the canvas re-reads them from the root.
    if ("MutationObserver" in window) {
      new MutationObserver(function () {
        resize();
        if (still) paint(true);
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
  });

  /* ---- background video ---- */
  [].slice.call(document.querySelectorAll("video[data-bg]")).forEach(function (v) {
    var wrap = v.parentNode;
    if (still || saver || !v.dataset.src) return;

    function drop() {
      // A missing or unsupported clip must not leave a black slab in the hero.
      if (wrap) wrap.style.display = "none";
      v.removeAttribute("src");
      v.load();
    }
    v.addEventListener("error", drop);

    var loaded = false;
    function onScreen(inView) {
      if (!inView) { v.pause(); return; }
      if (!loaded) {
        loaded = true;
        v.src = v.dataset.src;
        v.load();
      }
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { onScreen(en.isIntersecting); });
      }, { threshold: 0.12 }).observe(v);
    } else {
      onScreen(true);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { v.pause(); return; }
      // Records are not delivered to a hidden tab, so a page opened in the
      // background can still have an unloaded clip when it comes forward.
      var r = v.getBoundingClientRect();
      if (loaded || (r.bottom > 0 && r.top < window.innerHeight)) onScreen(true);
    });
  });

  /* ---- hero depth ----
     The clip behind the headline travels at a fraction of the page, so the band
     reads as a window into a deeper space rather than a wallpaper. Only the
     picture moves and only by `translate`, which is not layout: the hero's own
     box never changes size or position, so nothing shifts under a reader. */
  [].slice.call(document.querySelectorAll(".hero__film")).forEach(function (film) {
    if (still) return;
    var hero = film.closest(".hero") || film.parentNode;
    if (!hero) return;
    var queued = false;

    function measure() {
      queued = false;
      var r = hero.getBoundingClientRect();
      var span = r.height + window.innerHeight;
      if (span < 1 || r.bottom < 0 || r.top > window.innerHeight) return;
      // -1 when the band has just entered at the bottom, +1 as it leaves the top.
      var p = (window.innerHeight - r.top) / span;
      var drift = (Math.max(0, Math.min(1, p)) - 0.5) * r.height * 0.07;
      film.style.setProperty("--film-shift", drift.toFixed(1) + "px");
    }

    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
  });
})();
