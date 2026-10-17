/* websites.html was folded into the engineering page. The file stays on the
   server so every link already printed, bookmarked or indexed keeps working,
   but it has no content of its own: this hands the visitor to the band that
   replaced the page and takes the query and the anchor along, so
   websites.html#software-catalog still lands on the shelf and ?q=booking still
   filters it. location.replace keeps a page with nothing on it out of the back
   button. Inlined script is not an option — the document's own content policy
   only allows scripts served from this repo. */
(function () {
  var anchor = location.hash === "#software-catalog" ? "#web-catalog" : location.hash;
  location.replace("/engineering.html" + location.search + anchor);
})();
