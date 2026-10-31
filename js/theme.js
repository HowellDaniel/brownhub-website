(() => {
  /* The service worker is what normally refuses to let this site be framed. But it
     can only rewrite headers once it is installed, and GitHub Pages answers with no
     security headers at all, so a visitor's very first load — and any load in a
     private window — arrives with nothing between an attacker's iframe and the
     sign-in panel or the contact form. This is that missing piece, and it is here
     rather than in its own file because this one already runs before the first
     frame is painted on every page. */
  if (self !== top) {
    // Ask to be let out first; a frame that is *allowed* to navigate its parent
    // gets the whole site instead of a hollow one.
    try { top.location.href = self.location.href; } catch (e) {}
    // A sandboxed parent ignores the navigation above without throwing, and by the
    // time this file has run the parser has opened <html> but painted nothing, so
    // the refused case never shows a flash of the real page.
    document.documentElement.style.display = "none";
  }

  const KEY = "brownhub-theme";
  const MODES = ["light", "dark", "system"];
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: light)");

  /* What is stored is a mode, not a colour: "system" leaves the decision with the
     device, and the page keeps following it while the OS theme changes. Nothing is
     written on a load, so a visitor who never opens the menu stays on System for
     good. A visit made before this menu existed holds the colour that visit ended
     on, which is still exactly what that person sees until they pick System. */
  function mode() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    return MODES.indexOf(saved) > -1 ? saved : "system";
  }

  let sync = null;

  function paint() {
    const m = mode();
    const theme = m === "system" ? (media.matches ? "light" : "dark") : m;
    root.setAttribute("data-theme-mode", m);
    root.setAttribute("data-theme", theme);
    // Match the mobile browser chrome (address bar) to the page theme.
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", theme === "light" ? "#fffbf7" : "#1b0b0c");
    if (sync) sync();
  }

  /* This file is loaded blocking in the head, so the first frame is already the
     right colour and nothing flashes. */
  paint();
  media.addEventListener("change", paint);

  document.addEventListener("DOMContentLoaded", () => {
    const host = document.getElementById("theme");
    if (!host) return;
    const btn = host.querySelector(".theme-toggle");
    const menu = host.querySelector(".theme-menu");
    const opts = Array.prototype.slice.call(host.querySelectorAll(".theme-menu__opt"));

    sync = () => {
      const m = root.getAttribute("data-theme-mode");
      opts.forEach((o) => {
        const on = o.getAttribute("data-mode") === m;
        o.classList.toggle("is-current", on);
        o.setAttribute("aria-current", on ? "true" : "false");
      });
    };

    function close() {
      host.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }

    btn.addEventListener("click", () => {
      const willOpen = !host.classList.contains("is-open");
      host.classList.toggle("is-open", willOpen);
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    opts.forEach((o) => o.addEventListener("click", () => {
      try { localStorage.setItem(KEY, o.getAttribute("data-mode")); } catch (e) {}
      paint();
      close();
      btn.focus();
    }));

    menu.addEventListener("keydown", (e) => {
      const at = opts.indexOf(document.activeElement);
      const step = (e.key === "ArrowDown" || e.key === "ArrowRight") ? 1
        : (e.key === "ArrowUp" || e.key === "ArrowLeft") ? -1 : 0;
      if (!step || at < 0) return;
      e.preventDefault();
      opts[(at + step + opts.length) % opts.length].focus();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    document.addEventListener("pointerdown", (e) => {
      if (host.classList.contains("is-open") && !host.contains(e.target)) close();
    });

    sync();
  });
})();
