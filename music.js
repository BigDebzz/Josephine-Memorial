/* Background music for the memorial page.

   - It tries to start when the page opens. Browsers only allow sound after the visitor has touched the page,
     so if it is blocked, a short line asks them to tap anywhere, and it begins on their first tap.
   - It fades in softly. The button stops it at any time, and a stop is always complete: the sound engine is
     shut down, not just turned down.
   - It stops by itself when the visitor leaves the tab or closes the page, and it stays stopped until they
     press Play.
   - If someone pauses it, it stays paused for the rest of their visit.

   1. If a recording exists at audio/theme.mp3, that is played.
   2. Otherwise the page plays the hymn "It Is Well with My Soul" itself, from the notes in
      hymn-notes.js (melody by Philip P. Bliss, 1876; setting released as CC0). */
(function () {
  if (window.__memorialMusicStarted) return; // never run twice on one page
  window.__memorialMusicStarted = true;

  var btn = document.getElementById('mu');
  if (!btn) return;

  var FILE = 'audio/theme.mp3';
  var BPM = 80;          // a calm hymn pace
  var LEVEL = 0.4;       // overall volume once faded in (kept gentle)
  var KEY = 'memorial-music-off';
  var fileMode = false;  // true if audio/theme.mp3 exists
  var on = false;
  var waiting = false;   // waiting for the visitor's first tap
  var tried = false;     // the automatic start has been attempted
  var hint = null;

  var audio = null, fileTimer = null;

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, bus = null, wave = null, pump = null;
  var nextStart = 0, scheduledEnd = 0;

  btn.hidden = false;
  btn.title = 'It Is Well with My Soul';

  function remembered() { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function remember(v) { try { if (v) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  function setState(playing) {
    on = playing;
    btn.textContent = playing ? 'Pause music' : 'Play music';
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
  }

  // ---------- recording ----------
  function fadeFile(to, ms, done) {
    clearInterval(fileTimer);
    var from = audio.volume, steps = 20, i = 0;
    fileTimer = setInterval(function () {
      i += 1;
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) { clearInterval(fileTimer); if (done) done(); }
    }, ms / steps);
  }
  function playFile() {
    if (!audio) { audio = new Audio(FILE); audio.loop = true; audio.volume = 0; }
    return audio.play().then(function () { setState(true); fadeFile(LEVEL * 0.7, 1800); });
  }
  function stopFile(immediately) {
    setState(false);
    if (!audio) return;
    clearInterval(fileTimer);
    if (immediately) { audio.pause(); return; }
    fadeFile(0, 600, function () { audio.pause(); });
  }

  // ---------- the hymn, played by the page ----------
  function impulse(c) {
    var len = Math.floor(c.sampleRate * 2.6);
    var buf = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch += 1) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    return buf;
  }
  function build() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    var tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    var dry = ctx.createGain(); dry.gain.value = 0.8;
    var wet = ctx.createGain(); wet.gain.value = 0.38;
    var room = ctx.createConvolver(); room.buffer = impulse(ctx);
    tone.connect(dry); tone.connect(room); room.connect(wet);
    dry.connect(master); wet.connect(master);
    master.connect(ctx.destination);
    wave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.45, 0.22, 0.1, 0.05]));
    bus = tone;
  }
  function schedule(startAt) {
    var data = window.HYMN_NOTES;
    var spb = 60 / BPM, end = startAt;
    data.tracks.forEach(function (track) {
      var melody = track[0] === data.melody;
      track[1].forEach(function (n) {
        var s = startAt + n[0] * spb;
        var dur = Math.max(0.15, n[1] * spb * 0.97);
        var peak = (melody ? 0.12 : 0.08) * (0.55 + 0.45 * (n[3] / 127));
        var o = ctx.createOscillator();
        o.setPeriodicWave(wave);
        o.frequency.value = 440 * Math.pow(2, (n[2] - 69) / 12);
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(peak, s + 0.06);
        g.gain.setValueAtTime(peak, s + Math.max(0.08, dur - 0.2));
        g.gain.linearRampToValueAtTime(0, s + dur + 0.3);
        o.connect(g); g.connect(bus);
        o.start(s); o.stop(s + dur + 0.35);
        if (s + dur + 0.35 > end) end = s + dur + 0.35;
      });
    });
    return end;
  }
  function keepLooping() {
    // when the hymn is nearly over, line up the next time through
    if (ctx && ctx.currentTime > scheduledEnd - 3) {
      nextStart = scheduledEnd + 2.5; // a quiet pause between verses
      scheduledEnd = schedule(nextStart);
    }
  }
  function prepareHymn() {
    if (ctx) return;
    build();
    nextStart = ctx.currentTime + 0.3;
    scheduledEnd = schedule(nextStart);
    pump = setInterval(keepLooping, 1000);
  }
  function fadeInHymn() {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(LEVEL, ctx.currentTime + 3);
    setState(true);
  }
  // A full stop: forget the sound engine straight away, then close it. A fresh one is built on the next play.
  function stopHymn(immediately) {
    setState(false);
    clearInterval(pump);
    pump = null;
    var c = ctx, m = master;
    ctx = null; master = null; bus = null;
    if (!c) return;
    function shut() { try { c.close(); } catch (e) { /* already closed */ } }
    if (immediately) {
      try { m.gain.cancelScheduledValues(0); m.gain.value = 0; } catch (e) { /* ignore */ }
      shut();
      return;
    }
    try {
      var t = c.currentTime;
      m.gain.cancelScheduledValues(t);
      m.gain.setValueAtTime(m.gain.value, t);
      m.gain.linearRampToValueAtTime(0, t + 0.5);
    } catch (e) { /* ignore */ }
    setTimeout(shut, 600);
  }

  // ---------- starting and stopping ----------
  // Resolves once sound is really playing, and rejects if the browser blocked it.
  function start() {
    if (fileMode) return playFile();
    if (!AC || !window.HYMN_NOTES) return Promise.reject(new Error('no sound'));
    prepareHymn();
    var c = ctx;
    return new Promise(function (resolve, reject) {
      var finished = false;
      // A blocked browser often leaves resume() hanging rather than failing, so a short timer decides too.
      function finish() {
        if (finished) return;
        finished = true;
        if (ctx === c && c.state === 'running') { fadeInHymn(); resolve(); } else { reject(new Error('blocked')); }
      }
      Promise.resolve(c.resume()).then(finish, finish);
      setTimeout(finish, 700);
    });
  }
  function stop(immediately) {
    if (fileMode) stopFile(immediately); else stopHymn(immediately);
  }

  // ---------- the "tap anywhere" fallback ----------
  // Only events that browsers count as a real tap for sound. The "press down" event does not count on phones,
  // so it is deliberately not listed, and a listener is kept until the sound has really started.
  var EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];
  function showHint() {
    if (hint) return;
    hint = document.createElement('div');
    hint.textContent = 'Tap anywhere to begin the music';
    hint.setAttribute('role', 'status');
    hint.style.cssText = 'position:fixed;left:50%;bottom:4.2rem;transform:translateX(-50%);z-index:46;background:rgba(20,20,23,.9);'
      + 'color:#e2bd76;border:1px solid rgba(243,239,231,.12);padding:.6rem 1rem;font-size:.7rem;letter-spacing:.18em;'
      + 'text-transform:uppercase;border-radius:2px;transition:opacity .8s ease;white-space:nowrap;max-width:92vw;';
    document.body.appendChild(hint);
    setTimeout(function () { if (hint) hint.style.opacity = '0'; }, 7000);
  }
  function hideHint() {
    if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
    hint = null;
  }
  function stopWaiting() {
    waiting = false;
    EVENTS.forEach(function (n) { document.removeEventListener(n, onFirstTouch, true); });
    hideHint();
  }
  function onFirstTouch(e) {
    if (!waiting) return;
    if (btn.contains(e.target)) return; // the button handles its own press
    if (remembered() || document.hidden) { stopWaiting(); return; }
    // Keep listening until the sound has really started, so a touch that does not count is not wasted.
    start().then(function () { stopWaiting(); }, function () { /* blocked again: wait for the next tap */ });
  }
  function waitForFirstTouch() {
    if (waiting) return;
    waiting = true;
    showHint();
    EVENTS.forEach(function (n) { document.addEventListener(n, onFirstTouch, true); });
  }

  function tryAutoplay() {
    if (tried) return;
    tried = true;
    if (remembered()) return;
    start().catch(function () { waitForFirstTouch(); });
  }

  btn.addEventListener('click', function () {
    stopWaiting();
    if (on) {
      remember(true);
      stop(false);
    } else {
      remember(false);
      start().catch(function () {});
    }
  });

  // Leaving the tab, or closing the page, stops the music completely. It stays stopped until Play is pressed.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopWaiting();
      if (on) stop(true);
    }
  });
  window.addEventListener('pagehide', function () { if (on) stop(true); });

  // Find out whether a recording was added, then try to start (but never while the tab is in the background).
  fetch(FILE, { method: 'HEAD' })
    .then(function (r) { fileMode = r.ok; })
    .catch(function () { fileMode = false; })
    .then(function () {
      if (!document.hidden) { tryAutoplay(); return; }
      var once = function () {
        if (!document.hidden) { document.removeEventListener('visibilitychange', once); tryAutoplay(); }
      };
      document.addEventListener('visibilitychange', once);
    });
})();
