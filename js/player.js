/* BrownHub shared audio player.
   MediaRecorder clips ship without a duration header, so browsers report duration = Infinity
   and the native <audio controls> widget renders as a greyed, un-pressable bar on mobile
   (iOS never even loads the metadata without a gesture). Both recorders use this instead:
   a real Play/Pause button, preload=auto, and a forced duration read. */
(function () {
  "use strict";

  var players = [];
  var playing = null;

  function t(k) { return window.I18N && window.I18N.t ? window.I18N.t(k) : k; }

  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.round(s);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  var PLAY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>';
  var PAUSE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.4v14H7Zm6.6 0H17v14h-3.4Z"/></svg>';
  var FAIL = "Could not play the recording here. Use Download audio to listen to it.";

  function html(url) {
    return '<span class="bh-player">' +
      '<audio class="bh-player__el" src="' + url + '" preload="auto" playsinline></audio>' +
      '<button type="button" class="btn btn--primary voice-btn bh-player__btn" data-bh-play>' + PLAY_SVG +
      '<span class="bh-player__label">' + t("Play") + "</span></button>" +
      '<span class="bh-player__track" aria-hidden="true"><i></i></span>' +
      '<span class="bh-player__time">0:00 / 0:00</span></span>';
  }

  // Force the browser to compute the real duration of a headerless clip.
  function fixDuration(a, onReady) {
    if (a.duration === Infinity || isNaN(a.duration)) {
      var scrub = function () {
        a.removeEventListener("timeupdate", scrub);
        a.currentTime = 0;
        onReady();
      };
      a.addEventListener("timeupdate", scrub);
      try { a.currentTime = 1e101; } catch (e) { onReady(); }
    } else {
      onReady();
    }
  }

  function mount(root) {
    var el = root.querySelector(".bh-player");
    if (!el) return null;
    var a = el.querySelector(".bh-player__el");
    var btn = el.querySelector("[data-bh-play]");
    var fill = el.querySelector(".bh-player__track i");
    var time = el.querySelector(".bh-player__time");
    var total = 0;
    var p = { el: el, audio: a, btn: btn, time: time, playing: false };

    function paint() {
      var cur = a.currentTime || 0;
      var dur = isFinite(a.duration) && a.duration > 0 ? a.duration : total;
      if (dur > 0) {
        total = dur;
        time.textContent = fmt(cur) + " / " + fmt(dur);
        fill.style.transform = "scaleX(" + Math.min(1, cur / dur) + ")";
      } else {
        time.textContent = fmt(cur) + " / " + fmt(a.duration);
      }
    }
    function label() {
      btn.innerHTML = (p.playing ? PAUSE_SVG : PLAY_SVG) + '<span class="bh-player__label">' + t(p.playing ? "Pause" : "Play") + "</span>";
    }
    function fail() {
      el.classList.add("bh-player--blocked");
      time.textContent = t(FAIL);
    }

    a.addEventListener("loadedmetadata", function () { fixDuration(a, paint); paint(); });
    a.addEventListener("durationchange", function () { fixDuration(a, paint); });
    a.addEventListener("timeupdate", paint);
    a.addEventListener("seeked", paint);
    a.addEventListener("play", function () { p.playing = true; playing = p; label(); });
    a.addEventListener("pause", function () { p.playing = false; label(); });
    a.addEventListener("ended", function () {
      p.playing = false; playing = null; a.currentTime = 0;
      fill.style.transform = "scaleX(0)"; paint(); label();
    });
    // Ignore the transient abort from the duration probe; only report a clip that never loaded.
    a.addEventListener("error", function () { if (!a.readyState && !p.playing) fail(); });

    btn.addEventListener("click", function () {
      if (a.paused) {
        if (playing && playing !== p && playing.audio) { try { playing.audio.pause(); } catch (e) {} }
        var pr = a.play();
        if (pr && pr.catch) pr.catch(fail);
      } else {
        a.pause();
      }
    });

    players.push(p);
    p.refresh = function () { label(); paint(); };
    label();
    paint();
    return p;
  }

  // Drop players whose markup has been replaced, and re-translate the live ones.
  document.addEventListener("i18n-applied", function () {
    players = players.filter(function (p) { return p.el.isConnected; });
    players.forEach(function (p) { p.refresh(); });
  });

  window.BHPlayer = {
    html: html,
    mount: mount,
    // Call before discarding a bar so a clip never plays in the background.
    stop: function () {
      if (playing && playing.audio) { try { playing.audio.pause(); } catch (e) {} }
      playing = null;
    }
  };
})();
