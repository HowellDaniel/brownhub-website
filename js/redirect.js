// A typed address often arrives without its .html, so recover it before the
// visitor sees an error at all. Only a single, plain path segment that names a
// page below qualifies — anything else stays on the 404 rather than being sent
// somewhere, which keeps this a recovery rule and not an open redirect.
(function () {
  var m = /^\/([A-Za-z][A-Za-z0-9_-]{0,31})\/?$/.exec(location.pathname);
  if (!m) return;
  var t = "/" + m[1] + ".html";
  var known = ["/", "/index.html", "/services.html", "/catalog.html",
    "/about.html", "/contact.html", "/privacy.html", "/legal.html", "/security.html"];
  var moved = ["/websites.html", "/engineering.html"];
  if (known.indexOf(t) !== -1) location.replace(t + location.search + location.hash);
  else if (moved.indexOf(t) !== -1) location.replace("/index.html" + location.search + location.hash);
})();
