/* One bottom ask at a time.
   Four scripts fix something to the bottom edge of the same screen: the cookie notice,
   the install pill (or an update card standing in its place), the quote card, and the
   assistant's teaser. Each had its own politeness — the quote card waits for consent, the
   teaser waits for the welcome card — and none could see the others, so on a first visit
   to a phone all four arrived and took 623px of an 844px screen. This hands out the right
   to stand there: the first ask claims the edge, the rest queue, and when the edge is
   given back the queued ask with the lowest rank number takes it.
   Deliberately free of the DOM: whoever builds the queue supplies `standing`, so a claim
   held by a notice that left the screen without releasing it can always be swept away. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BHAskQueue = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /* Consent first: everything else on this list asks the visitor for something, and a
     notice that has not been answered is the one thing that must not be buried. */
  const RANKS = { consent: 5, build: 10, install: 20, quote: 30, teaser: 40 };

  function make(ranks, standing) {
    let owner = null;
    const waiting = [];

    function hand() {
      if (!waiting.length) return;
      waiting.sort((a, b) => ranks[a.key] - ranks[b.key]);
      const next = waiting.shift();
      owner = next.key;
      next.fn();
    }

    return {
      /* Grants the edge now and returns true, or queues the ask and returns false. An ask
         that already owns the edge is never raised a second time. */
      request: function (key, fn) {
        if (typeof ranks[key] !== "number") return false;
        if (owner === key) return true;
        if (owner !== null) { waiting.push({ key: key, fn: fn }); return false; }
        owner = key;
        fn();
        return true;
      },
      /* Gives the edge back. A key that is not the owner may still be waiting, and taking
         it out of the queue is how an ask that no longer wants to appear cancels itself. */
      release: function (key) {
        for (let i = waiting.length; i--;) if (waiting[i].key === key) waiting.splice(i, 1);
        if (owner !== key) return false;
        owner = null;
        hand();
        return true;
      },
      owner: function () { return owner; },
      /* The safety net for a notice removed without a release: whoever measures the bottom
         edge can ask this, and a claim whose ask is no longer on screen is freed. */
      sweep: function () {
        if (owner !== null && !standing(owner)) { owner = null; hand(); }
      }
    };
  }

  return { make: make, RANKS: RANKS };
});
