/* Background music for the memorial page.
   It never starts by itself. It plays only when someone presses the button, and fades in softly.

   1. If a recording exists at audio/theme.mp3, that is played.
   2. Otherwise the page plays the hymn "It Is Well with My Soul" itself, from the notes in
      hymn-notes.js (melody by Philip P. Bliss, 1876; setting released as CC0). No recording is needed. */
(function () {
  var btn = document.getElementById('mu');
  if (!btn) return;

  var FILE = 'audio/theme.mp3';
  var BPM = 80;          // a calm hymn pace
  var LEVEL = 0.5;       // overall volume once faded in
  var fileMode = false;  // becomes true if audio/theme.mp3 exists
  var on = false;

  // file playback
  var audio = null;
  var fileTimer = null;

  // synthesized playback
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, bus = null, wave = null, pump = null, pauseTimer = null;
  var nextStart = 0, scheduledEnd = 0;

  btn.hidden = false;
  btn.title = 'It Is Well with My Soul';

  // Find out early whether a recording was added. The answer is ready before anyone presses the button,
  // so playback still starts straight from the press, which phones require.
  fetch(FILE, { method: 'HEAD' }).then(function (r) { fileMode = r.ok; }).catch(function () {});

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
    audio.play().then(function () { setState(true); fadeFile(LEVEL * 0.7, 1800); }).catch(function () {});
  }
  function pauseFile() {
    setState(false);
    fadeFile(0, 800, function () { audio.pause(); });
  }

  // ---------- the hymn, played by the page ----------
  function impulse() {
    var len = Math.floor(ctx.sampleRate * 2.6);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
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
    var room = ctx.createConvolver(); room.buffer = impulse();
    tone.connect(dry); tone.connect(room); room.connect(wet);
    dry.connect(master); wet.connect(master);
    master.connect(ctx.destination);
    // a soft, organ-like voice: a fundamental with a few gentle harmonics
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
    // when the hymn is nearly over, line up the next time through. Audio time stops while paused, so this stays in step.
    if (ctx && ctx.currentTime > scheduledEnd - 3) {
      nextStart = scheduledEnd + 2.5; // a quiet pause between verses
      scheduledEnd = schedule(nextStart);
    }
  }
  function playHymn() {
    if (!AC || !window.HYMN_NOTES) { return; }
    clearTimeout(pauseTimer);
    if (!ctx) {
      build();
      nextStart = ctx.currentTime + 0.3;
      scheduledEnd = schedule(nextStart);
      pump = setInterval(keepLooping, 1000);
    }
    var t = ctx.currentTime;
    var go = function () {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(LEVEL, ctx.currentTime + 2);
      setState(true);
    };
    var r = ctx.resume();
    if (r && r.then) { r.then(go); } else { go(); }
    return t;
  }
  function pauseHymn() {
    setState(false);
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 0.8);
    pauseTimer = setTimeout(function () { ctx.suspend(); }, 900);
  }

  btn.addEventListener('click', function () {
    if (fileMode) { if (on) pauseFile(); else playFile(); return; }
    if (on) pauseHymn(); else playHymn();
  });
})();
