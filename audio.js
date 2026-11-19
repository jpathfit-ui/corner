/* Corner: audio engine. Synthesized bell, clap and ticks, plus coach voice (recorded clips first, device voice as fallback). */
(function (root) {
  'use strict';
  var D = root.CornerData, C = root.CornerCoach;
  var A = { settings: { coachVol: 1, fxVol: 0.9, useClips: true, deviceVoices: { male: '', female: '' } } };
  var ctx = null, fx = null, coach = null, noiseBuf = null;
  var clipKeys = null;           // Set of "voice/style/slug" that exist, from audio/manifest.json
  var clipCache = {};
  var current = null;            // handle for whatever speech is playing now
  var token = 0;

  A.init = function () {
    if (ctx) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    fx = ctx.createGain();
    coach = ctx.createGain();
    fx.connect(ctx.destination);
    coach.connect(ctx.destination);
    A.applyVolumes();
    // One second of white noise, reused for claps.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };

  A.applyVolumes = function () {
    if (!ctx) return;
    fx.gain.value = A.settings.fxVol;
    coach.gain.value = A.settings.coachVol;
  };

  // Must run from a tap. Unlocks both WebAudio and speech on iPhone.
  A.unlock = function () {
    A.init();
    if (ctx && ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
    if (ctx) {
      var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); try { s.start(0); } catch (e) {}
    }
    if ('speechSynthesis' in root) {
      try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
    }
    A.loadManifest();
  };

  A.suspend = function () { if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) {} } };
  A.resume = function () { if (ctx && ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} } };

  var manifestP = null;
  // Called at app boot and again on unlock. Speech waits for it, so the first call of a workout can use a clip.
  A.loadManifest = function () {
    if (manifestP) return manifestP;
    clipKeys = new Set();
    try {
      manifestP = fetch('audio/manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (j && j.clips) j.clips.forEach(function (k) { clipKeys.add(k); });
      }).catch(function () {});
    } catch (e) { manifestP = Promise.resolve(); }
    return manifestP;
  };

  // Effects ----------------------------------------------------------------

  function bellStrike(t, vol) {
    var base = 690;
    var partials = [[1, 1], [2.01, 0.62], [2.76, 0.5], [4.07, 0.34], [5.43, 0.24], [6.9, 0.14]];
    partials.forEach(function (p, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = base * p[0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(p[1] * vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4 / (1 + i * 0.55));
      o.connect(g); g.connect(fx);
      o.start(t); o.stop(t + 2.6);
    });
    // Short metallic strike on top.
    var n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuf; nf.type = 'highpass'; nf.frequency.value = 3500;
    ng.gain.setValueAtTime(0.35 * vol, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(nf); nf.connect(ng); ng.connect(fx);
    n.start(t, Math.random() * 0.5); n.stop(t + 0.08);
  }

  A.bell = function (strikes) {
    if (!ctx) return;
    var t = ctx.currentTime + 0.02;
    for (var i = 0; i < (strikes || 1); i++) bellStrike(t + i * 0.34, 0.5);
  };

  function clapBurst(t, vol) {
    for (var k = 0; k < 3; k++) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1500 + k * 250; f.Q.value = 0.9;
      var st = t + k * 0.011;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(vol, st + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, st + (k === 2 ? 0.13 : 0.04));
      s.connect(f); f.connect(g); g.connect(fx);
      s.start(st, Math.random() * 0.6); s.stop(st + 0.16);
    }
  }

  // The ten second warning. Two sharp claps.
  A.clap = function () {
    if (!ctx) return;
    var t = ctx.currentTime + 0.01;
    clapBurst(t, 0.9);
    clapBurst(t + 0.17, 0.9);
  };

  function tickAt(t, freq, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(fx); o.start(t); o.stop(t + 0.11);
  }

  A.tick = function () { if (ctx) tickAt(ctx.currentTime + 0.01, 1250, 0.5); };
  A.tripleTick = function () {
    if (!ctx) return;
    var t = ctx.currentTime + 0.01;
    tickAt(t, 1400, 0.55); tickAt(t + 0.12, 1400, 0.55); tickAt(t + 0.24, 1700, 0.6);
  };

  // Voice ------------------------------------------------------------------

  A.stopSpeech = function () {
    token++;
    if (current) { var c = current; current = null; try { c.stop(); } catch (e) {} }
    if ('speechSynthesis' in root) { try { speechSynthesis.cancel(); } catch (e) {} }
  };

  A.hasClip = function (voiceId, style, text) {
    if (!A.settings.useClips || !clipKeys) return null;
    var s = D.slug(text);
    var order = [style, 'firm', 'calm', 'urgent'];
    for (var i = 0; i < order.length; i++) {
      var key = voiceId + '/' + order[i] + '/' + s;
      if (clipKeys.has(key)) return key;
    }
    return null;
  };

  function loadClip(key) {
    if (clipCache[key]) return clipCache[key];
    clipCache[key] = fetch('audio/' + key + '.mp3').then(function (r) {
      if (!r.ok) throw new Error('missing clip');
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); });
    });
    clipCache[key].catch(function () { delete clipCache[key]; });
    return clipCache[key];
  }

  A.prefetch = function (voiceId, style, text) {
    var key = A.hasClip(voiceId, style, text);
    if (key && ctx) loadClip(key).catch(function () {});
  };

  function playBuffer(buf, my) {
    return new Promise(function (resolve) {
      if (my !== token) return resolve();
      var s = ctx.createBufferSource();
      s.buffer = buf; s.connect(coach);
      var handle = { stop: function () { try { s.onended = null; s.stop(); } catch (e) {} resolve(); } };
      s.onended = function () { if (current === handle) current = null; resolve(); };
      current = handle;
      s.start();
    });
  }

  function deviceVoice(voice) {
    if (!('speechSynthesis' in root)) return null;
    var list = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    var chosen = A.settings.deviceVoices[voice.gender];
    if (chosen) {
      var f = list.filter(function (v) { return v.voiceURI === chosen; })[0];
      if (f) return f;
    }
    var male = /daniel|alex|fred|aaron|arthur|thomas|oliver|gordon|rishi|james|david|mark|george|ryan|guy|male/i;
    var female = /samantha|karen|moira|tessa|serena|allison|ava|susan|victoria|zira|hazel|catherine|fiona|kate|jenny|aria|female/i;
    var hint = voice.gender === 'male' ? male : female;
    return list.filter(function (v) { return hint.test(v.name); })[0] || list[0] || null;
  }

  A.deviceVoiceList = function () {
    if (!('speechSynthesis' in root)) return [];
    return speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
  };

  function ttsSpeak(text, o, my) {
    return new Promise(function (resolve) {
      if (!('speechSynthesis' in root) || my !== token) return resolve();
      var st = D.STYLES.filter(function (s) { return s.id === o.style; })[0] || D.STYLES[1];
      var inten = (o.intensity || 2) - 2;   // -1 measured, 0 driven, +1 fierce
      var u = new SpeechSynthesisUtterance(C.ttsText(text, o.style));
      u.rate = Math.max(0.6, Math.min(1.6, st.rate * o.voice.rate * (1 + inten * 0.06)));
      u.pitch = Math.max(0.1, Math.min(2, st.pitch * o.voice.pitch * (1 + inten * 0.04)));
      u.volume = Math.max(0.1, Math.min(1, A.settings.coachVol * st.vol * (1 + inten * 0.1)));
      var dv = deviceVoice(o.voice);
      if (dv) { u.voice = dv; u.lang = dv.lang; }
      var done = false, timer = null;
      function finish() {
        if (done) return; done = true; clearTimeout(timer);
        if (current === handle) current = null;
        resolve();
      }
      var handle = { stop: function () { done = true; clearTimeout(timer); try { speechSynthesis.cancel(); } catch (e) {} resolve(); } };
      u.onend = finish; u.onerror = finish;
      timer = setTimeout(finish, Math.max(2500, text.length * 110 + 1500)); // some iPhones never fire onend
      current = handle;
      try { speechSynthesis.speak(u); } catch (e) { finish(); }
    });
  }

  // Speak one line. Resolves when it has finished (or been cut off).
  A.speak = function (text, o) {
    A.stopSpeech();
    var my = token;
    return (manifestP || A.loadManifest()).then(function () {
      if (my !== token) return;
      var key = ctx ? A.hasClip(o.voice.id, o.style, text) : null;
      if (key) {
        return loadClip(key).then(function (buf) { return playBuffer(buf, my); }).catch(function () { return ttsSpeak(text, o, my); });
      }
      return ttsSpeak(text, o, my);
    });
  };

  root.CornerAudio = A;
})(typeof self !== 'undefined' ? self : this);
