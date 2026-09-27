/* BrownHub voice converter.
   MediaRecorder gives us webm/opus on Android and desktop Chrome, and that clip
   is what the studio receives by email and through the WhatsApp share sheet.
   Neither plays it: mail clients on Windows refuse webm audio, and WhatsApp
   hands it over as an unopenable document. So every recording is normalised to a
   container its recipients can actually play before it leaves the browser. */
(function () {
  "use strict";

  /* Telephone bandwidth, mono. A minute of speech costs about 1.9 MB this way,
     which stays inside what a form relay and a phone share both tolerate; the
     original 48 kHz stereo would be six times the size for no added clarity. */
  var RATE = 16000;
  /* Uncompressed audio grows: 32 KB a second here, so a five-minute note is
     about ten megabytes. Past that the relay is more likely to refuse the
     message than a long voicemail is to be worth sending, so the original clip
     is kept instead of the better container. */
  var MAX_SECONDS = 5 * 60;
  var MAX_BYTES = 10 * 1024 * 1024;

  // Containers that already play everywhere are passed through untouched.
  function passthrough(type) {
    var t = String(type || "").toLowerCase();
    if (t.indexOf("mp4") > -1 || t.indexOf("aac") > -1) return "m4a";
    if (t.indexOf("mpeg") > -1 || t.indexOf("mp3") > -1) return "mp3";
    if (t.indexOf("wave") > -1) return "wav";
    return "";
  }

  function pcm16(samples, rate) {
    var n = samples.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var v = new DataView(buf);
    function tag(off, s) { for (var i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
    tag(0, "RIFF");
    v.setUint32(4, 36 + n * 2, true);
    tag(8, "WAVE");
    tag(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);          // PCM, not a compressed float
    v.setUint16(22, 1, true);          // mono
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    tag(36, "data");
    v.setUint32(40, n * 2, true);
    for (var o = 44, i = 0; i < n; i++, o += 2) {
      var x = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  /* One channel at 16 kHz: the OfflineAudioContext mixes the decoded source down
     and resamples it as it renders, so no manual interpolation is needed. */
  function render(decoded, seconds) {
    var OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OC) return Promise.reject(new Error("offline audio unsupported"));
    var oc = new OC(1, Math.max(1, Math.ceil(Math.min(seconds, MAX_SECONDS) * RATE)), RATE);
    var src = oc.createBufferSource();
    src.buffer = decoded;
    src.connect(oc.destination);
    src.start(0);
    return oc.startRendering();
  }

  function decode(buffer) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.reject(new Error("web audio unsupported"));
    var ctx = new AC();
    return ctx.decodeAudioData(buffer.slice(0)).then(function (d) {
      ctx.close();
      return d;
    }, function (e) {
      try { ctx.close(); } catch (x) {}
      throw e;
    });
  }

  // Never rejects: an undecodable clip is returned exactly as recorded rather
  // than lost. Missing audio would be worse to the studio than bad audio.
  function playable(blob) {
    var type = (blob && blob.type) || "";
    var keep = passthrough(type);
    if (keep) return Promise.resolve({ blob: blob, ext: keep, mime: type, converted: false });
    var seconds = 0;
    return Promise.resolve()
      .then(function () { return blob.arrayBuffer(); })
      .then(function (buf) { return decode(buf); })
      .then(function (decoded) {
        seconds = decoded.duration;
        return render(decoded, seconds);
      })
      .then(function (rendered) {
        var out = pcm16(rendered.getChannelData(0), rendered.sampleRate);
        if (!out || !out.size || out.size > MAX_BYTES) throw new Error("wav too large");
        return { blob: out, ext: "wav", mime: "audio/wav", converted: true, seconds: Math.round(seconds) };
      })
      .catch(function () { return { blob: blob, ext: "webm", mime: type || "audio/webm", converted: false }; });
  }

  window.BHWVoice = { playable: playable };
})();
