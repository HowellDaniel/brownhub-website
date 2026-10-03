/* websites.html and engineering.html were folded into the home page. The files
   stay on the server so every link already printed, bookmarked or indexed keeps
   working, but they have no content of their own: this hands the visitor to the
   band that replaced the page and takes the query and the anchor along, so
   websites.html#web-catalog still lands on the shelf and ?q=booking still
   filters it. location.replace keeps a page with nothing on it out of the back
   button. Inlined script is not an option — the document's own content policy
   only allows scripts served from this repo. */
(function () {
  var anchor = location.hash === "#software-catalog" ? "#web-catalog" : location.hash;
  location.replace("/index.html" + location.search + anchor);
})();
