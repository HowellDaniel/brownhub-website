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
    /* Only a canvas marked data-pt-react is stirred by the pointer; every other
       field on the site keeps the plain drift it has always had. */
    var react = cv.hasAttribute("data-pt-react");
    var REACH = +(cv.dataset.ptReach || 138);
    var lastX = -1e4, lastY = -1e4, bonds = 0, tick = 0;

    function resize() {
      var r = cv.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var want = Math.max(18, Math.min(react ? 96 : 64, Math.round(w * h / (react ? 15000 : 24000))));
      while (pts.length < want) pts.push({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, bx: 0, by: 0, r: 0 });
      if (pts.length > want) pts.length = want;
      pts.forEach(function (p) {
        if (!p.vx) {
          var a = Math.random() * Math.PI * 2, s = 0.14 + Math.random() * 0.2;
          p.vx = p.bx = Math.cos(a) * s;
          p.vy = p.by = Math.sin(a) * s;
        }
        if (!p.r) p.r = 0.9 + Math.random() * 1.5;
      });

      dot = mixer(root, cv.dataset.pt ? "--" + cv.dataset.pt + "-rgb" : "--accent-rgb", "244,84,90");
      line = mixer(root, cv.dataset.ptLine ? "--" + cv.dataset.ptLine + "-rgb" : "--accent-2-rgb", "177,125,65");
    }

    function paint(static_only, cx, cy) {
      var live = cx > -1e3;
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
      /* The cursor is not a dot among dots: it is a node every nearby particle
         reaches for, so the network reads as touched rather than merely drawn. */
      bonds = 0;
      if (live) {
        var reach = REACH * 1.25;
        ctx.lineWidth = 1.15;
        for (var n = 0; n < pts.length; n++) {
          var ox = pts[n].x - cx, oy = pts[n].y - cy;
          var od = Math.hypot(ox, oy);
          if (od > reach) continue;
          bonds++;
          ctx.strokeStyle = line(((1 - od / reach) * 0.5).toFixed(3));
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(pts[n].x, pts[n].y);
          ctx.stroke();
        }
        var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, REACH);
        halo.addColorStop(0, line("0.16"));
        halo.addColorStop(1, line("0"));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, REACH, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dot("0.9");
        ctx.beginPath();
        ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = dot(static_only ? "0.5" : "0.62");
      for (var m = 0; m < pts.length; m++) {
        ctx.beginPath();
        ctx.arc(pts[m].x, pts[m].y, pts[m].r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame() {
      var cx = -1e4, cy = -1e4;
      if (react) {
        /* One rect read per animated frame, at most — the canvas does not move
           while the page does, so the pointer has to be re-based each time. */
        var box = cv.getBoundingClientRect();
        cx = lastX - box.left;
        cy = lastY - box.top;
        if (cx < 0 || cy < 0 || cx > box.width || cy > box.height) { cx = cy = -1e4; }
      }
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (cx > -1e3) {
          var ox = p.x - cx, oy = p.y - cy;
          var d = Math.hypot(ox, oy);
          if (d < REACH && d > 0.01) {
            var f = (1 - d / REACH) * (1 - d / REACH) * 0.15;
            /* Push outward and slide along the tangent, so the dots flow around
               the hand instead of scattering flatly in front of it. */
            p.vx += (ox / d) * f - (oy / d) * f * 0.8;
            p.vy += (oy / d) * f + (ox / d) * f * 0.8;
          }
        }
        /* Whatever the pointer gave the field leaks back toward the particle's
           own drift speed, so the network settles rather than running forever. */
        p.vx += (p.bx - p.vx) * 0.016;
        p.vy += (p.by - p.vy) * 0.016;
        var sp = Math.hypot(p.vx, p.vy);
        if (sp > 1.5) { p.vx = p.vx / sp * 1.5; p.vy = p.vy / sp * 1.5; }
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
      }
      paint(false, cx, cy);
      if (react && ++tick % 20 === 0) {
        var out = document.getElementById(cv.dataset.ptCount || "");
        if (out) out.textContent = String(bonds);
      }
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

    if (react && !still) {
      /* Bound to the document, not the canvas: the field sits behind the copy
         and takes no pointer events of its own, and the loop is the one that
         decides whether the position landed inside it. */
      var track = function (e) { lastX = e.clientX; lastY = e.clientY; };
      document.addEventListener("pointermove", track, { passive: true });
      document.addEventListener("pointerdown", track, { passive: true });
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

  /* ---- hero pin ----
     The clip holds its place in the viewport while the band scrolls past it, so
     the picture reads as a window onto something that is not printed on the page.
     It is a screenful tall and anchored to the top of the stage, so translating
     it down by exactly how far the page has travelled under the band leaves it
     covering the whole visible window at every scroll position — the stage's own
     `overflow:hidden` trims what hangs below. `translate` is not layout: the
     hero's box never changes size or place, so nothing shifts under a reader.

     The property goes on the hero, not the clip, because the veil and the dots
     are its siblings and have to travel by the same amount: the thing that holds
     still is the finished picture, gradient and all. A custom property set on
     the clip would stop at its own box. */
  [].slice.call(document.querySelectorAll(".hero__film")).forEach(function (film) {
    if (still) return;
    var hero = film.closest(".hero") || film.parentNode;
    if (!hero) return;
    var queued = false;

    function measure() {
      queued = false;
      var r = hero.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      // While the band still shows its own top edge, the page carries the
      // picture; from the moment it passes under the viewport it stops.
      var y = Math.max(0, -r.top);
      hero.style.setProperty("--film-shift", y.toFixed(1) + "px");
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

  /* ---- pointer depth ----
     Layers marked [data-depth] travel with the cursor as well as with the page,
     so a hero reads as a stack of planes set at different distances rather than
     one flat picture. The pointer term is eased toward its target frame by frame
     — that lag is what makes the movement read as fluid rather than twitchy —
     and all three terms leave as custom properties, because js/scroll.js already
     writes --py on these same elements and the stylesheet has to compose the two
     rather than have one overwrite the other. A finger is ignored: it is already
     busy scrolling, and moving the planes under it would fight the page. Once
     every layer has settled the loop parks itself and waits to be woken. */
  (function () {
    var nodes = [].slice.call(document.querySelectorAll("[data-depth]"));
    if (!nodes.length || still) return;

    var groups = [];
    var layers = nodes.map(function (el) {
      var host = el.closest("[data-depth-host]") || el.closest(".hero") || el.parentElement;
      if (!host) return null;
      var g = null;
      for (var i = 0; i < groups.length; i++) if (groups[i].host === host) { g = groups[i]; break; }
      if (!g) { g = { host: host, layers: [] }; groups.push(g); }
      var L = { el: el, amp: parseFloat(el.dataset.depth) || 1, host: host, x: 0, y: 0, out: "" };
      g.layers.push(L);
      return L;
    }).filter(Boolean);
    if (!layers.length) return;

    var px = -1e4, py = -1e4, raf = 0, watching = true;

    function wake() { if (!raf && watching) raf = requestAnimationFrame(frame); }

    document.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      px = e.clientX; py = e.clientY;
      wake();
    }, { passive: true });
    addEventListener("scroll", wake, { passive: true });
    addEventListener("resize", wake, { passive: true });
    document.addEventListener("visibilitychange", function () {
      watching = !document.hidden;
      if (watching) wake();
    });

    function frame() {
      raf = 0;
      var moving = false;
      for (var g = 0; g < groups.length; g++) {
        var box = groups[g].host.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        var nx = 0, ny = 0;
        if (px >= box.left && px <= box.right && py >= box.top && py <= box.bottom) {
          nx = (px - box.left - box.width / 2) / (box.width / 2);
          ny = (py - box.top - box.height / 2) / (box.height / 2);
        }
        /* -0.5 as the host enters at the bottom of the screen, +0.5 as it leaves
           at the top, so the planes part around the middle of the pass. */
        var span = box.height + innerHeight;
        var prog = Math.max(0, Math.min(1, (innerHeight - box.top) / span)) - 0.5;
        for (var i = 0; i < groups[g].layers.length; i++) {
          var L = groups[g].layers[i];
          L.x += (nx - L.x) * 0.075;
          L.y += (ny - L.y) * 0.075;
          if (Math.abs(nx - L.x) > 0.002 || Math.abs(ny - L.y) > 0.002) moving = true;
          var mx = (L.x * L.amp * -26).toFixed(1) + "px";
          var my = (L.y * L.amp * -16).toFixed(1) + "px";
          var sy = (prog * L.amp * box.height * 0.12).toFixed(1) + "px";
          if (mx + my + sy === L.out) continue;
          L.out = mx + my + sy;
          L.el.style.setProperty("--mx", mx);
          L.el.style.setProperty("--my", my);
          L.el.style.setProperty("--sy", sy);
        }
      }
      if (moving) wake();
    }

    wake();
  })();
})();
