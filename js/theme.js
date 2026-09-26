(() => {
  const KEY = "brownhub-theme";
  const root = document.documentElement;

  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    const btn = document.querySelector(".theme-toggle");
    if (btn) btn.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
    // Match the mobile browser chrome (address bar) to the page theme.
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", theme === "light" ? "#ffffff" : "#000d25");
  }

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  setTheme(saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.querySelector(".theme-toggle");
    if (btn) {
      btn.setAttribute("aria-label", root.getAttribute("data-theme") === "light" ? "Switch to dark mode" : "Switch to light mode");
      btn.addEventListener("click", () => {
        setTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
      });
    }
  });
})();
