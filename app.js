/* Corner: app shell, screens and the workout runner. */
(function () {
  'use strict';
  var D = window.CornerData, C = window.CornerCoach, A = window.CornerAudio;

  var $ = function (s, el) { return (el || document).querySelector(s); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cap(s) { s = String(s).trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Dev only: ?speed=10 runs the clock faster for testing.
  var SCALE = parseFloat(new URLSearchParams(location.search).get('speed')) || 1;
  function now() { return performance.now() * SCALE; }

  // ---------- Storage ----------
  var LS = {
    get: function (k, def) { try { var v = localStorage.getItem('corner.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem('corner.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  var settings = Object.assign(D.defaultSettings(), LS.get('settings', {}));
  settings.calls = Object.assign({}, D.DEFAULT_CALLS, settings.calls || {});
  settings.deviceVoices = Object.assign({ male: '', female: '' }, settings.deviceVoices || {});
  var prompts = loadPrompts();
  var programs = LS.get('programs', null) || D.defaultPrograms();
  var history = LS.get('history', []);
  programs.forEach(function (p) {
    p.voice = String(p.voice || 'm1').charAt(0) === 'f' ? 'f1' : 'm1';
    p.content = p.content || {};
    if (p.content.cue === undefined) p.content.cue = 3;
    if (p.content.needle === undefined) p.content.needle = 1;
    if (p.milestones === undefined) p.milestones = true;
  });

  function loadPrompts() {
    var saved = LS.get('prompts', null), defs = D.defaultPrompts();
    if (!saved) return defs;
    var have = {};
    saved.forEach(function (p) { have[p.id] = true; });
    defs.forEach(function (d) { if (!have[d.id]) saved.push(d); });
    return saved;
  }
  function saveSettings() { LS.set('settings', settings); }
  function savePrompts() { LS.set('prompts', prompts); }
  function savePrograms() { LS.set('programs', programs); }
  function saveHistory() { LS.set('history', history.slice(0, 30)); }

  function findProgram(id) { return programs.filter(function (p) { return p.id === id; })[0]; }
  function currentProgram() { return findProgram(settings.selectedProgram) || programs[0]; }
  function voiceOf(id) { return D.VOICES.filter(function (v) { return v.id === id; })[0] || D.VOICES[0]; }
  function levelLabel(id) { return D.LEVELS.filter(function (l) { return l.id === id; })[0].label; }
  function catLabel(id) { return D.CATEGORIES.filter(function (c) { return c.id === id; })[0].label; }
  function progMeta(p) {
    var parts = [p.rounds + (p.rounds === 1 ? ' Round' : ' Rounds'), C.fmt(p.roundSec)];
    if (p.restSec) parts.push(C.fmt(p.restSec) + ' Rest');
    parts.push(C.describeRecovery(p));
    return parts.join(' · ');
  }

  function applyTheme() {
    var colors = { red: '#ff2b2b', silver: '#d7dadf', white: '#ffffff' };
    document.documentElement.style.setProperty('--timer', colors[settings.timerColor] || colors.red);
    document.body.classList.toggle('tsize-xl', settings.timerSize === 'xl');
    A.settings = settings;
    A.applyVolumes();
  }

  // ---------- Small UI helpers ----------
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  function openSheet(inner) {
    var r = $('#sheet-root');
    r.innerHTML = '<div class="sheet-back" data-act="sheet-bg"><div class="sheet" role="dialog">' + inner + '</div></div>';
    requestAnimationFrame(function () { if (r.firstChild) r.firstChild.classList.add('in'); });
  }
  function closeSheet() {
    var r = $('#sheet-root'), b = r.firstChild;
    if (!b) return;
    b.classList.remove('in');
    setTimeout(function () { if (r.firstChild === b) r.innerHTML = ''; }, 200);
  }
  var CS = { res: null };
  function confirmSheet(o) {
    return new Promise(function (res) {
      CS.res = res;
      openSheet('<h3>' + esc(o.title) + '</h3><p>' + esc(o.message) + '</p><div class="btnrow"><button class="btn ghost" data-act="cs-no">Cancel</button><button class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-act="cs-yes">' + esc(o.confirm || 'Confirm') + '</button></div>');
    });
  }
  function answerConfirm(v) {
    var r = CS.res; CS.res = null;
    closeSheet();
    if (r) r(v);
  }

  function seg(opts, cur, attrs) {
    return '<div class="seg">' + opts.map(function (o) {
      return '<button class="' + (String(o.v) === String(cur) ? 'on' : '') + '" ' + attrs + ' data-v="' + esc(o.v) + '">' + esc(o.l) + '</button>';
    }).join('') + '</div>';
  }
  function sw(on, attrs, label) {
    return '<button class="sw ' + (on ? 'on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(label || 'Toggle') + '" ' + attrs + '></button>';
  }

  // ---------- Views ----------
  var view = 'train';
  var PV = { cat: 'all', level: 'all', q: '' };

  function render() {
    var m = $('#main');
    if (view === 'train') m.innerHTML = trainHtml();
    else if (view === 'programs') m.innerHTML = programsHtml();
    else if (view === 'prompts') m.innerHTML = promptsHtml();
    else m.innerHTML = settingsHtml();
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.dataset.v === view); });
  }

  function trainHtml() {
    var p = currentProgram();
    var v = voiceOf(p.voice);
    var h = '<div class="card"><div class="meta" style="margin:0 0 4px;letter-spacing:.14em;text-transform:uppercase">Next Up</div>' +
      '<div class="title" style="font-size:22px">' + esc(p.name) + '</div>' +
      '<div class="meta">' + esc(progMeta(p)) + '</div>' +
      '<div class="meta">' + (p.mode === 'free' ? 'Free Boxing: bell and warnings only' : 'Coach: ' + esc(v.name) + ' · ' + esc(levelLabel(p.level))) + '</div>' +
      '<div class="stack" style="margin-top:14px"><button class="btn primary big" data-act="start">Start Workout</button>' +
      '<div class="btnrow" style="margin-top:10px"><button class="btn ghost slim" data-act="plan">Preview Plan</button><button class="btn ghost slim" data-act="testaudio">Test Audio</button></div></div></div>';
    h += '<h2 class="sec">Choose a Program</h2>';
    programs.forEach(function (x) {
      h += '<button class="card tap ' + (x.id === p.id ? 'sel' : '') + '" data-act="pick" data-id="' + esc(x.id) + '"><div class="title">' + esc(x.name) + '</div><div class="meta">' + esc(progMeta(x)) + '</div></button>';
    });
    h += '<h2 class="sec">Recent Workouts</h2>';
    if (!history.length) h += '<div class="card muted">No workouts yet. Pick a program and start your first round.</div>';
    history.slice(0, 5).forEach(function (x) {
      var d = new Date(x.ts);
      h += '<div class="card"><div class="title">' + esc(x.name) + '</div><div class="meta">' + esc(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + ' · ' + x.done + ' of ' + x.total + ' Rounds · ' + Math.max(1, Math.round(x.secs / 60)) + ' Minutes</div></div>';
    });
    return h;
  }

  function programsHtml() {
    var h = '<div class="stack"><button class="btn primary" data-act="newprog">New Program</button></div><h2 class="sec">Your Programs</h2>';
    programs.forEach(function (p) {
      h += '<div class="card"><div class="title">' + esc(p.name) + '</div><div class="meta">' + esc(progMeta(p)) + '</div>' +
        '<div class="meta">' + (p.mode === 'free' ? 'Free Boxing' : esc(levelLabel(p.level)) + ' · Voice: ' + esc(voiceOf(p.voice).name)) + '</div>' +
        '<div class="btnrow"><button class="btn ghost slim" data-act="editprog" data-id="' + esc(p.id) + '">Edit</button>' +
        '<button class="btn ghost slim" data-act="dupprog" data-id="' + esc(p.id) + '">Duplicate</button>' +
        '<button class="btn danger slim" data-act="delprog" data-id="' + esc(p.id) + '">Delete</button></div></div>';
    });
    return h;
  }

  function promptsHtml() {
    var q = PV.q.toLowerCase();
    var list = prompts.filter(function (x) {
      if (PV.cat !== 'all' && x.category !== PV.cat) return false;
      if (PV.level !== 'all' && x.level !== PV.level) return false;
      if (q && x.text.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var h = '<div class="stack"><button class="btn primary" data-act="newprompt">Add Prompt</button></div>';
    h += '<h2 class="sec">Filter</h2><input type="text" id="pq" placeholder="Search Prompts" value="' + esc(PV.q) + '" autocomplete="off" autocapitalize="off">';
    h += '<div class="chips" style="margin-top:10px"><button class="chip ' + (PV.cat === 'all' ? 'on' : '') + '" data-act="pcat" data-v="all">All</button>' +
      D.CATEGORIES.map(function (c) { return '<button class="chip ' + (PV.cat === c.id ? 'on' : '') + '" data-act="pcat" data-v="' + c.id + '">' + esc(c.label) + '</button>'; }).join('') + '</div>';
    h += '<div class="chips"><button class="chip ' + (PV.level === 'all' ? 'on' : '') + '" data-act="plevel" data-v="all">All Levels</button>' +
      D.LEVELS.map(function (l) { return '<button class="chip ' + (PV.level === l.id ? 'on' : '') + '" data-act="plevel" data-v="' + l.id + '">' + esc(l.label) + '</button>'; }).join('') + '</div>';
    h += '<h2 class="sec">' + list.length + (list.length === 1 ? ' Prompt' : ' Prompts') + '</h2>';
    if (!list.length) h += '<div class="card muted">Nothing matches. Try another filter or add your own prompt.</div>';
    list.forEach(function (x) {
      var edited = x.builtin && x.text !== originalText(x.id);
      h += '<div class="prow"><button class="main ' + (x.enabled === false ? 'off' : '') + '" data-act="pedit" data-id="' + esc(x.id) + '"><div class="t">' + esc(x.text) + '</div>' +
        '<div class="meta"><span class="badge">' + esc(catLabel(x.category)) + '</span><span class="badge">' + esc(levelLabel(x.level)) + '</span>' + badgeExtras(x) + (x.builtin ? (edited ? '<span class="badge red">Edited</span>' : '') : '<span class="badge red">Custom</span>') + '</div></button>' +
        '<div class="swwrap">' + sw(x.enabled !== false, 'data-act="ptoggle" data-id="' + esc(x.id) + '"', 'Use This Prompt') + '</div></div>';
    });
    return h;
  }

  function badgeExtras(x) {
    var out = '';
    if (x.category === 'milestone' && x.at) {
      var a = D.MILESTONE_AT.filter(function (m) { return m.v === x.at; })[0];
      out += '<span class="badge">' + esc(a ? a.l : x.at) + '</span>';
      if (x.scope === 'final') out += '<span class="badge red">Final Round</span>';
    }
    if ((x.freq || 3) !== 3) {
      var f = D.FREQS.filter(function (m) { return m.v === x.freq; })[0];
      if (f) out += '<span class="badge">' + esc(f.l) + '</span>';
    }
    return out;
  }

  var ORIG = null;
  function originalText(id) {
    if (!ORIG) { ORIG = {}; D.defaultPrompts().forEach(function (p) { ORIG[p.id] = p; }); }
    return ORIG[id] ? ORIG[id].text : null;
  }

  function settingsHtml() {
    var dv = A.deviceVoiceList();
    function vopt(sel) {
      return '<option value="">Automatic</option>' + dv.map(function (v) { return '<option value="' + esc(v.voiceURI) + '" ' + (sel === v.voiceURI ? 'selected' : '') + '>' + esc(v.name) + '</option>'; }).join('');
    }
    var wake = 'wakeLock' in navigator;
    var h = '<h2 class="sec" style="margin-top:4px">Sound</h2><div class="card">' +
      '<div class="row col"><div class="lab">Coach Volume</div><input type="range" min="0" max="1" step="0.05" value="' + settings.coachVol + '" data-bind="coachVol" aria-label="Coach Volume"></div>' +
      '<div class="row col"><div class="lab">Bell and Clap Volume</div><input type="range" min="0" max="1" step="0.05" value="' + settings.fxVol + '" data-bind="fxVol" aria-label="Bell and Clap Volume"></div>' +
      '<div class="row col"><div class="lab">Bell Strikes</div>' + seg([{ v: 1, l: 'One' }, { v: 2, l: 'Two' }, { v: 3, l: 'Three' }], settings.bellStrikes, 'data-act="sset" data-f="bellStrikes" data-t="n"') + '</div>' +
      '<div class="row"><div class="lab">Use Recorded Coach Clips<small>Falls back to the device voice when a clip is missing</small></div>' + sw(settings.useClips, 'data-act="stoggle" data-f="useClips"', 'Use Recorded Coach Clips') + '</div>' +
      '<div class="btnrow"><button class="btn ghost slim" data-act="testaudio">Test Audio</button></div></div>';

    h += '<h2 class="sec">Round Warnings</h2><div class="card">' +
      '<div class="row col"><div class="lab">Clap Warning<small>Two claps this many seconds before the round or rest ends</small></div>' + seg([{ v: 5, l: '5 Seconds' }, { v: 10, l: '10 Seconds' }, { v: 15, l: '15 Seconds' }, { v: 20, l: '20 Seconds' }], settings.warnSec, 'data-act="sset" data-f="warnSec" data-t="n"') + '</div>' +
      '<div class="row"><div class="lab">Five Second Cue<small>Three quick ticks at five seconds left</small></div>' + sw(settings.fiveCue, 'data-act="stoggle" data-f="fiveCue"', 'Five Second Cue') + '</div>' +
      '<div class="row"><div class="lab">Spoken Warning<small>Coach says the warning call along with the clap</small></div>' + sw(settings.spokenWarn, 'data-act="stoggle" data-f="spokenWarn"', 'Spoken Warning') + '</div>' +
      '<div class="row"><div class="lab">Thirty Second Call<small>Coach calls thirty seconds left in longer rounds</small></div>' + sw(settings.thirtyCall, 'data-act="stoggle" data-f="thirtyCall"', 'Thirty Second Call') + '</div></div>';

    h += '<h2 class="sec">Timer Display</h2><div class="card">' +
      '<div class="row col"><div class="lab">Timer Color</div>' + seg([{ v: 'red', l: 'Red' }, { v: 'silver', l: 'Silver' }, { v: 'white', l: 'White' }], settings.timerColor, 'data-act="sset" data-f="timerColor"') + '</div>' +
      '<div class="row col"><div class="lab">Timer Size</div>' + seg([{ v: 'large', l: 'Large' }, { v: 'xl', l: 'Extra Large' }], settings.timerSize, 'data-act="sset" data-f="timerSize"') + '</div>' +
      '<div class="row"><div class="lab">Keep Screen Awake<small>' + (wake ? 'Stops the screen from locking during a workout' : 'Not supported on this device. The screen may dim.') + '</small></div>' + sw(settings.keepAwake, 'data-act="stoggle" data-f="keepAwake"', 'Keep Screen Awake') + '</div></div>';

    h += '<h2 class="sec">Defaults</h2><div class="card"><div class="row col"><div class="lab">Level for New Programs</div>' +
      seg(D.LEVELS.map(function (l) { return { v: l.id, l: l.label }; }), settings.level, 'data-act="sset" data-f="level"') + '</div></div>';

    h += '<h2 class="sec">Device Voice Fallback</h2><div class="card"><div class="meta" style="margin:0 0 8px">Used when a recorded clip is not available for a phrase.</div>' +
      '<div class="field" style="margin-top:0"><label for="dvm">Male Coaches</label><select id="dvm" data-bind="dv-male">' + vopt(settings.deviceVoices.male) + '</select></div>' +
      '<div class="field"><label for="dvf">Female Coaches</label><select id="dvf" data-bind="dv-female">' + vopt(settings.deviceVoices.female) + '</select></div>' +
      '<div class="btnrow"><button class="btn ghost slim" data-act="hearvoices">Hear Voices</button></div></div>';

    h += '<h2 class="sec">Coach Phrases</h2><div class="card"><div class="meta" style="margin:0 0 6px">Fixed calls such as round starts. Use {n} where the round number belongs.</div>';
    D.CALL_LABELS.forEach(function (c) {
      h += '<div class="field"><label for="call-' + c[0] + '">' + esc(c[1]) + '</label><input type="text" id="call-' + c[0] + '" data-bind="call-' + c[0] + '" value="' + esc(settings.calls[c[0]]) + '" autocapitalize="sentences"></div>';
    });
    h += '<div class="btnrow"><button class="btn ghost slim" data-act="resetcalls">Reset Phrases</button></div></div>';

    h += '<h2 class="sec">Backup</h2><div class="card"><div class="meta" style="margin:0 0 8px">Everything is stored on this device. Copy a backup before clearing browser data.</div>' +
      '<div class="btnrow" style="margin-top:0"><button class="btn ghost slim" data-act="backup">Copy Backup</button><button class="btn ghost slim" data-act="restore">Restore Backup</button></div></div>';
    h += '<div class="stack" style="margin-top:14px"><button class="btn danger" data-act="resetall">Reset Everything</button></div>';
    return h;
  }

  // ---------- Program editor ----------
  var E = null; // { draft, isNew }
  var STEPS = {
    rounds: { min: 1, max: 30, step: 1 }, roundSec: { min: 30, max: 600, step: 15 }, restSec: { min: 0, max: 300, step: 15 },
    getReady: { min: 0, max: 60, step: 5 }, recoveryCount: { min: 0, max: 28, step: 1 }
  };

  function openEditor(id) {
    var existing = id ? findProgram(id) : null;
    E = { draft: existing ? clone(existing) : D.newProgram(settings.level), isNew: !existing };
    var s = $('#screen');
    s.classList.remove('hidden');
    renderEditor(0);
  }
  function closeScreen() { $('#screen').classList.add('hidden'); $('#screen').innerHTML = ''; E = null; }

  function stepRow(f, label, disp, hint) {
    return '<div class="row"><div class="lab">' + label + (hint ? '<small>' + hint + '</small>' : '') + '</div><div class="step">' +
      '<button data-act="step" data-f="' + f + '" data-d="-1" aria-label="Decrease ' + label + '">−</button><div class="val">' + disp + '</div>' +
      '<button data-act="step" data-f="' + f + '" data-d="1" aria-label="Increase ' + label + '">+</button></div></div>';
  }

  function renderEditor(scroll) {
    var d = E.draft, free = d.mode === 'free';
    var s = $('#screen');
    var h = '<div class="inner"><h2 class="page">' + (E.isNew ? 'New Program' : 'Edit Program') + '</h2>';

    h += '<h2 class="sec">Basics</h2><div class="card"><div class="field" style="margin-top:0"><label for="pname">Program Name</label><input type="text" id="pname" data-bind="name" value="' + esc(d.name) + '" autocapitalize="words"></div>' +
      '<div class="field"><label>Mode</label>' + seg([{ v: 'coached', l: 'Coached' }, { v: 'free', l: 'Free Boxing' }], d.mode, 'data-act="set" data-f="mode"') +
      '<div class="meta">' + (free ? 'Every round is yours. The bell, clap warnings and occasional light talk only.' : 'The coach calls combinations and can schedule recovery rounds.') + '</div></div></div>';

    h += '<h2 class="sec">Structure</h2><div class="card">' +
      (free ? '' : '<div class="row col"><div class="lab">Level</div>' + seg(D.LEVELS.map(function (l) { return { v: l.id, l: l.label }; }), d.level, 'data-act="set" data-f="level"') + '</div>') +
      stepRow('rounds', 'Rounds', d.rounds) + stepRow('roundSec', 'Round Length', C.fmt(d.roundSec)) +
      stepRow('restSec', 'Rest Length', d.restSec ? C.fmt(d.restSec) : 'None') + stepRow('getReady', 'Get Ready', d.getReady ? d.getReady + ' Sec' : 'None') + '</div>';

    if (!free) {
      h += '<h2 class="sec">Recovery Rounds</h2><div class="card"><div class="meta" style="margin:0 0 8px">The coach announces a recovery round out loud. You set your own pace: ease off to recover or push harder if you feel good.</div>' +
        '<div class="row col"><div class="lab">Placement</div>' + seg([{ v: 'even', l: 'Spread Evenly' }, { v: 'random', l: 'Random' }, { v: 'custom', l: 'Choose Rounds' }], d.recoveryPlacement, 'data-act="set" data-f="recoveryPlacement"') + '</div>';
      if (d.recoveryPlacement === 'custom') {
        h += '<div class="row col"><div class="lab">Tap the Rounds to Make Recovery</div><div class="rounds-grid">';
        for (var r = 1; r <= d.rounds; r++) h += '<button class="' + (d.recoveryList.indexOf(r) !== -1 ? 'on' : '') + '" data-act="recround" data-r="' + r + '" aria-label="Round ' + r + '">' + r + '</button>';
        h += '</div></div>';
      } else {
        h += stepRow('recoveryCount', 'Recovery Rounds', d.recoveryCount, d.recoveryPlacement === 'random' ? 'Chosen fresh each workout' : 'Never the first or last round');
      }
      h += '<div class="row"><div class="lab">Light Talk in Recovery<small>Occasional calm lines while you set your own pace</small></div>' + sw(d.recoveryTalk, 'data-act="toggle" data-f="recoveryTalk"', 'Light Talk in Recovery') + '</div></div>';

      h += '<h2 class="sec">Coach Voice</h2><div class="card">' + seg([{ v: 'm1', l: 'Male Coach' }, { v: 'f1', l: 'Female Coach' }], d.voice, 'data-act="set" data-f="voice"') +
        '<div class="meta">Uses the male or female voice you chose in Settings, under Device Voice Fallback.</div>' +
        '<div class="btnrow"><button class="btn ghost slim" data-act="sample">Hear Sample</button></div></div>';

      h += '<h2 class="sec">Delivery</h2><div class="card">' +
        '<div class="row col"><div class="lab">Coach Style<small>Auto builds from steady to urgent through each round</small></div>' + seg([{ v: 'auto', l: 'Auto' }, { v: 'calm', l: 'Calm' }, { v: 'firm', l: 'Firm' }, { v: 'urgent', l: 'Urgent' }], d.style, 'data-act="set" data-f="style"') + '</div>' +
        '<div class="row col"><div class="lab">Intensity<small>How much weight the coach puts behind each call</small></div>' + seg([{ v: 1, l: 'Measured' }, { v: 2, l: 'Driven' }, { v: 3, l: 'Fierce' }], d.intensity, 'data-act="set" data-f="intensity" data-t="n"') + '</div>' +
        '<div class="row col"><div class="lab">Callout Pace<small>Gap between calls</small></div>' + seg([{ v: 5, l: 'Relaxed' }, { v: 3, l: 'Steady' }, { v: 2, l: 'Quick' }, { v: 1.2, l: 'Rapid' }], d.gap, 'data-act="set" data-f="gap" data-t="n"') + '</div>' +
        '<div class="row col"><div class="lab">Motivation<small>How often the coach pushes you with encouragement</small></div>' + seg([{ v: 0, l: 'Off' }, { v: 1, l: 'Light' }, { v: 2, l: 'Regular' }, { v: 3, l: 'Heavy' }], d.motivation, 'data-act="set" data-f="motivation" data-t="n"') + '</div>' +
        '<div class="row"><div class="lab">Build Urgency<small>Faster and sharper in the last stretch of each round</small></div>' + sw(d.ramp, 'data-act="toggle" data-f="ramp"', 'Build Urgency') + '</div>' +
        '<div class="row"><div class="lab">Final Push<small>Extra push calls in the last thirty seconds</small></div>' + sw(d.finalPush, 'data-act="toggle" data-f="finalPush"', 'Final Push') + '</div>' +
        '<div class="row"><div class="lab">Milestone Calls<small>Calls at the start, a quarter, halfway, three quarters and ninety percent of each round</small></div>' + sw(d.milestones, 'data-act="toggle" data-f="milestones"', 'Milestone Calls') + '</div></div>';

      h += '<h2 class="sec">What the Coach Calls</h2><div class="card">' + D.CATEGORIES.filter(function (c) { return c.pick; }).map(function (c) {
        return '<div class="row col"><div class="lab">' + esc(c.label) + '</div>' + seg([{ v: 0, l: 'Off' }, { v: 1, l: 'Low' }, { v: 2, l: 'Medium' }, { v: 3, l: 'High' }], d.content[c.id], 'data-act="cw" data-c="' + c.id + '"') + '</div>';
      }).join('') + '<div class="row col"><div class="lab">Combination Length</div>' + seg([{ v: 'any', l: 'Any' }, { v: 'short', l: 'Short' }, { v: 'long', l: 'Long' }], d.comboLength, 'data-act="set" data-f="comboLength"') + '<div class="meta">Short is up to three punches. Long is four or more.</div></div></div>';
    }

    h += '<div class="stack" style="margin-top:16px"><button class="btn primary" data-act="saveprog">Save Program</button><button class="btn ghost" data-act="closescreen">Cancel</button></div></div>';
    s.innerHTML = h;
    s.scrollTop = scroll || 0;
  }

  function clampDraft() {
    var d = E.draft;
    d.recoveryList = d.recoveryList.filter(function (r) { return r <= d.rounds; });
    d.recoveryCount = Math.min(d.recoveryCount, Math.max(0, d.rounds - 2));
  }

  // ---------- Plan preview ----------
  function openPlan() {
    var p = currentProgram();
    var tl = C.buildTimeline(p);
    var total = C.totalSeconds(tl.segs);
    var h = '<div class="inner"><h2 class="page">' + esc(p.name) + '</h2><div class="meta">' + esc(progMeta(p)) + ' · About ' + Math.round(total / 60) + ' Minutes</div>';
    if (p.recoveryPlacement === 'random' && p.mode !== 'free') h += '<div class="meta">Recovery rounds are chosen at random when you start. This is one example.</div>';
    h += '<h2 class="sec">Round by Round</h2><div class="card">';
    tl.segs.forEach(function (sg) {
      var name, note = '';
      if (sg.type === 'ready') name = 'Get Ready';
      else if (sg.type === 'rest') name = 'Rest';
      else { name = 'Round ' + sg.n; note = p.mode === 'free' ? 'Free' : (sg.recovery ? 'Recovery, Your Pace' : 'Coached'); }
      h += '<div class="planrow"><div><div class="t">' + name + '</div>' + (note ? '<div class="meta" style="margin:0">' + note + '</div>' : '') + '</div><div class="t">' + C.fmt(sg.dur) + '</div></div>';
    });
    h += '</div><div class="stack"><button class="btn primary" data-act="closescreen">Done</button></div></div>';
    var s = $('#screen');
    s.classList.remove('hidden'); s.innerHTML = h; s.scrollTop = 0;
  }

  // ---------- Prompt sheet ----------
  var PS = null;
  function opts(list, cur) {
    return list.map(function (o) { return '<option value="' + esc(o.v) + '" ' + (String(o.v) === String(cur) ? 'selected' : '') + '>' + esc(o.l) + '</option>'; }).join('');
  }
  function openPromptSheet(id) {
    var ex = id ? prompts.filter(function (x) { return x.id === id; })[0] : null;
    PS = { id: id || null, isNew: !ex, builtin: !!(ex && ex.builtin), cat: ex ? ex.category : (PV.cat !== 'all' ? PV.cat : 'combo'), lvl: ex ? ex.level : settings.level };
    var edited = ex && ex.builtin && ex.text !== originalText(ex.id);
    var isMile = PS.cat === 'milestone';
    openSheet('<h3>' + (ex ? 'Edit Prompt' : 'Add Prompt') + '</h3>' +
      '<div class="field"><label for="pt-text">What the Coach Says</label><textarea id="pt-text" autocapitalize="sentences">' + esc(ex ? ex.text : '') + '</textarea></div>' +
      '<div class="field"><label for="pt-cat">Category</label><select id="pt-cat" data-bind="pt-cat">' + opts(D.CATEGORIES.map(function (c) { return { v: c.id, l: c.label }; }), PS.cat) + '</select></div>' +
      '<div class="field"><label for="pt-lvl">Level</label><select id="pt-lvl">' + opts(D.LEVELS.map(function (l) { return { v: l.id, l: l.label }; }), PS.lvl) + '</select></div>' +
      '<div class="field"><label for="pt-freq">How Often the Coach Says It</label><select id="pt-freq">' + opts(D.FREQS, ex ? (ex.freq || 3) : 3) + '</select></div>' +
      '<div id="pt-mile" ' + (isMile ? '' : 'class="hidden"') + '><div class="field"><label for="pt-at">When in the Round</label><select id="pt-at">' + opts(D.MILESTONE_AT, ex && ex.at ? ex.at : 'half') + '</select></div>' +
      '<div class="field"><label for="pt-scope">Which Rounds</label><select id="pt-scope">' + opts(D.MILESTONE_SCOPE, ex && ex.scope ? ex.scope : 'round') + '</select></div></div>' +
      '<div class="meta">Separate punches with commas. A recorded clip is used when one exists, otherwise the device voice reads it.</div>' +
      '<div class="btnrow"><button class="btn ghost" data-act="pt-hear">Hear It</button><button class="btn primary" data-act="pt-save">Save</button></div>' +
      '<div class="btnrow">' + (edited ? '<button class="btn ghost slim" data-act="pt-reset">Reset to Original</button>' : '') +
      (ex && !ex.builtin ? '<button class="btn danger slim" data-act="pt-del">Delete</button>' : '') + '<button class="btn ghost slim" data-act="sheet-close">Cancel</button></div>');
  }

  // ---------- Workout runner ----------
  var R = { active: false };

  function elapsed() { return (now() - R.segStart) / 1000; }
  function later(ms, fn) {
    var my = R.i, tok = R.token;
    setTimeout(function () { if (R.active && !R.paused && R.token === tok && R.i === my) fn(); }, ms);
  }
  function voice() { return voiceOf(R.prog.voice); }

  function say(text, o) {
    o = o || {};
    var id = ++R.speakId;
    R.speaking = true;
    if (o.show) showCall(o.show, o.style);
    return A.speak(text, { voice: voice(), style: o.style || 'firm', intensity: R.prog.intensity }).then(function () {
      if (R.speakId !== id || !R.active) return;
      R.speaking = false;
      if (o.onDone) o.onDone(); else R.nextCallAt = elapsed() + 1.5;
    });
  }

  function showCall(text, style) {
    var c = $('#wo-call');
    c.textContent = text;
    c.className = 'wo-call ' + (style || '');
  }

  function startWorkout() {
    var p = currentProgram();
    if (!p) return;
    A.settings = settings;
    A.unlock(); A.applyVolumes();
    var tl = C.buildTimeline(p);
    R = {
      active: true, paused: false, prog: p, segs: tl.segs, rec: tl.recovery, i: 0, segStart: now(), pauseAt: 0, lastRem: null, nextCallAt: 2,
      speaking: false, speakId: 0, recent: [], lastPrompt: null, mile: {}, roundsDone: 0, t0: now(), timer: null, lock: null, token: Date.now(), lastTime: ''
    };
    $('#wo').classList.remove('hidden');
    $('#wo-prog').textContent = p.name;
    var rounds = tl.segs.filter(function (s) { return s.type === 'round'; });
    $('#wo-dots').innerHTML = rounds.map(function (s) { return '<i class="' + (s.recovery ? 'rec' : '') + '" data-r="' + s.n + '"></i>'; }).join('');
    $('#wo-pause').textContent = 'Pause';
    requestWake();
    enterSeg(false);
    R.timer = setInterval(tick, 100);
    tick();
  }

  function requestWake() {
    if (!settings.keepAwake || !('wakeLock' in navigator)) { $('#wo-note').textContent = settings.keepAwake ? 'Screen may dim on this device' : ''; return; }
    navigator.wakeLock.request('screen').then(function (l) {
      R.lock = l; $('#wo-note').textContent = 'Screen stays on';
      l.addEventListener('release', function () { R.lock = null; });
    }).catch(function () { $('#wo-note').textContent = 'Screen may dim on this device'; });
  }
  function releaseWake() { try { if (R.lock) R.lock.release(); } catch (e) {} R.lock = null; }

  function enterSeg(late) {
    var seg = R.segs[R.i], calls = settings.calls, my = R.i;
    R.lastRem = null; R.nextCallAt = 2; R.mile = {};
    $('#wo-skip').hidden = seg.type !== 'rest';
    var wo = $('#wo');
    wo.classList.remove('warn', 'is-rest', 'is-ready', 'is-paused');
    wo.classList.add(seg.type === 'rest' ? 'is-rest' : seg.type === 'ready' ? 'is-ready' : 'is-work');
    var total = R.prog.rounds;
    var dots = document.querySelectorAll('#wo-dots i');
    Array.prototype.forEach.call(dots, function (d) {
      var n = +d.dataset.r;
      var curRound = seg.type === 'round' ? seg.n : (seg.type === 'rest' ? seg.n + 0.5 : 0);
      d.classList.toggle('done', n < curRound && !(seg.type === 'round' && n === seg.n));
      d.classList.toggle('cur', seg.type === 'round' && n === seg.n);
    });
    if (seg.type === 'ready') {
      $('#wo-round').textContent = 'Get Ready';
      $('#wo-phase').textContent = 'First Round Starts Soon';
      showCall('Hands Up', 'calm');
      say(calls.ready, { style: 'firm' });
    } else if (seg.type === 'round') {
      $('#wo-round').textContent = 'Round ' + seg.n + ' of ' + total;
      $('#wo-phase').textContent = R.prog.mode === 'free' ? 'Free Boxing' : (seg.recovery ? 'Recovery · Your Pace' : 'Work');
      showCall('', '');
      if (!late) A.bell(settings.bellStrikes);
      var txt = C.roundCallText(seg, R.prog, total, calls);
      var st = C.styleFor(R.prog, 'call', 0, seg.recovery ? 'recovery' : 'round');
      later(900, function () {
        say(txt, { style: st, show: txt, onDone: function () {
          if (R.i !== my) return;
          // Opening line in the first coached round, e.g. "All right, we're warming up."
          if (seg.n === 1 && !seg.recovery && R.prog.mode !== 'free' && R.prog.milestones) {
            var o = C.pickMilestone(prompts, R.prog, 'open', false, R.recent);
            if (o) {
              R.recent.push(o.id);
              say(o.text, { style: 'firm', show: o.text, onDone: function () { if (R.i === my) R.nextCallAt = elapsed() + 1.5; } });
              return;
            }
          }
          R.nextCallAt = elapsed() + (seg.recovery ? 12 : 1.4);
        } });
      });
    } else {
      var next = R.segs[R.i + 1];
      $('#wo-round').textContent = 'Rest';
      $('#wo-phase').textContent = 'Breathe';
      showCall('Next: Round ' + next.n + (next.recovery && R.prog.mode !== 'free' ? ' (Recovery)' : ''), 'calm');
      R.nextCallAt = 1.8;
    }
  }

  function onSecond(seg, remInt) {
    var s = settings;
    if (seg.type === 'ready') { if (remInt <= 3 && remInt >= 1) A.tick(); return; }
    if (remInt === s.warnSec && seg.dur > s.warnSec + 2) {
      A.clap();
      if (s.spokenWarn) say(s.calls.warn, { style: 'urgent' });
    }
    if (s.fiveCue && remInt === 5 && seg.dur > 8) A.tripleTick();
    if (seg.type === 'round' && remInt === 30 && s.thirtyCall && seg.dur >= 90 && !seg.recovery) {
      say(s.calls.thirty, { style: 'urgent', show: s.calls.thirty });
    }
    $('#wo').classList.toggle('warn', remInt <= s.warnSec && remInt > 0 && seg.dur > s.warnSec + 2);
  }

  function doCallout(seg, el, rem) {
    var my = R.i;
    var phase = seg.type === 'rest' ? 'rest' : (seg.recovery ? 'recovery' : 'round');
    if (phase === 'recovery' && !R.prog.recoveryTalk) { R.nextCallAt = Infinity; return; }
    var pick = C.pickPrompt(prompts, R.prog, { phase: phase, remaining: rem, roundSec: seg.dur, recent: R.recent });
    if (!pick) { R.nextCallAt = Infinity; return; }
    R.recent.push(pick.prompt.id);
    if (R.recent.length > 10) R.recent.shift();
    R.lastPrompt = pick;
    var style = C.styleFor(R.prog, pick.category, el / seg.dur, phase);
    A.prefetch(R.prog.voice, style, pick.prompt.text);
    say(pick.prompt.text, {
      style: style, show: pick.prompt.text,
      onDone: function () {
        if (R.i !== my) return;
        var e = elapsed();
        R.nextCallAt = e + C.gapFor(R.prog, seg, e / seg.dur, seg.dur - e, pick);
      }
    });
  }

  function playMilestone(seg, at, el) {
    var my = R.i;
    var m = C.pickMilestone(prompts, R.prog, at, seg.n === R.prog.rounds, R.recent);
    if (!m) return false;
    R.recent.push(m.id);
    if (R.recent.length > 10) R.recent.shift();
    var style = C.styleFor(R.prog, at === 'late' ? 'finalPush' : 'motivation', el / seg.dur, 'round');
    A.prefetch(R.prog.voice, style, m.text);
    say(m.text, { style: style, show: m.text, onDone: function () { if (R.i === my) R.nextCallAt = elapsed() + R.prog.gap * 1.2; } });
    return true;
  }

  function tick() {
    if (!R.active || R.paused) return;
    var seg = R.segs[R.i];
    var el = elapsed();
    if (el >= seg.dur) { advance(el - seg.dur > 2); return; }
    var rem = seg.dur - el, remInt = Math.ceil(rem);
    if (remInt !== R.lastRem) { R.lastRem = remInt; onSecond(seg, remInt); }
    var t = C.fmt(rem);
    if (t !== R.lastTime) { R.lastTime = t; $('#wo-time').textContent = t; }
    $('#wo-barfill').style.width = Math.min(100, (el / seg.dur) * 100) + '%';
    $('#wo-skip').hidden = seg.type !== 'rest';
    // Milestone calls: a quarter, halfway, three quarters and ninety percent through the round.
    var played = false;
    if (!R.speaking && seg.type === 'round' && !seg.recovery && R.prog.mode !== 'free' && R.prog.milestones && seg.dur >= 60) {
      var frac = el / seg.dur;
      C.MILESTONES.forEach(function (m) {
        if (played || R.mile[m.at] || frac < m.p) return;
        R.mile[m.at] = 1;
        if (rem > 5 && frac - m.p < 0.08) played = playMilestone(seg, m.at, el);
      });
    }
    var canCall = (seg.type === 'round' && rem > 3.2) || (seg.type === 'rest' && rem > 13);
    if (!played && canCall && !R.speaking && el >= R.nextCallAt) doCallout(seg, el, rem);
  }

  function advance(late) {
    var seg = R.segs[R.i];
    if (seg.type === 'round') {
      R.roundsDone++;
      if (!late && R.i === R.segs.length - 1) A.bell(Math.max(2, settings.bellStrikes));
      else if (!late) A.bell(settings.bellStrikes);
    }
    R.segStart += seg.dur * 1000;
    R.i++;
    if (R.i >= R.segs.length) { finishWorkout(true); return; }
    A.stopSpeech(); R.speaking = false;
    R.lastTime = '';
    enterSeg(late);
  }

  function skipRest() {
    var seg = R.segs[R.i];
    if (!R.active || seg.type !== 'rest') return;
    R.segStart = now() - seg.dur * 1000; // next tick advances
  }

  function endTimers() {
    clearInterval(R.timer); R.timer = null;
    A.stopSpeech(); releaseWake();
    R.active = false;
  }

  function saveWorkoutLog() {
    var secs = Math.round((now() - R.t0) / 1000);
    if (R.roundsDone < 1 && secs < 60) return;
    history.unshift({ ts: Date.now(), name: R.prog.name, done: R.roundsDone, total: R.prog.rounds, secs: secs });
    saveHistory();
  }

  function finishWorkout(complete) {
    var p = R.prog, rounds = R.roundsDone, secs = Math.round((now() - R.t0) / 1000);
    saveWorkoutLog();
    var last = R.prog;
    endTimers();
    $('#wo').classList.add('hidden');
    $('#wo').classList.remove('warn');
    if (complete) {
      A.speak(settings.calls.complete, { voice: voiceOf(last.voice), style: 'firm', intensity: last.intensity });
      openSheet('<h3>Workout Complete</h3><p>' + esc(p.name) + '</p><div class="statgrid"><div class="stat"><b>' + rounds + '</b><span>Rounds</span></div><div class="stat"><b>' + Math.max(1, Math.round(secs / 60)) + '</b><span>Minutes</span></div></div>' +
        '<div class="btnrow"><button class="btn primary" data-act="sheet-close">Done</button></div>');
    } else {
      toast('Workout Ended');
    }
    if (view === 'train') render();
  }

  function togglePause() {
    if (!R.active) return;
    var b = $('#wo-pause'), wo = $('#wo');
    if (!R.paused) {
      R.paused = true; R.pauseAt = now();
      A.stopSpeech(); R.speaking = false; A.suspend();
      b.textContent = 'Resume'; wo.classList.add('is-paused');
      $('#wo-phase').textContent = 'Paused';
    } else {
      R.segStart += now() - R.pauseAt;
      R.paused = false; A.resume();
      R.nextCallAt = elapsed() + 1.2;
      b.textContent = 'Pause'; wo.classList.remove('is-paused');
      var seg = R.segs[R.i];
      $('#wo-phase').textContent = seg.type === 'rest' ? 'Breathe' : seg.type === 'ready' ? 'First Round Starts Soon' : (R.prog.mode === 'free' ? 'Free Boxing' : (seg.recovery ? 'Recovery · Your Pace' : 'Work'));
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && R.active && !R.lock && !R.paused) requestWake();
  });

  // ---------- Audio test and samples ----------
  function testAudio() {
    A.settings = settings; A.unlock(); A.applyVolumes();
    var v = voiceOf(currentProgram().voice);
    A.bell(settings.bellStrikes);
    setTimeout(function () { A.clap(); }, 1500);
    setTimeout(function () { A.speak('Jab, cross, hook, cross', { voice: v, style: 'firm', intensity: 2 }); }, 2300);
  }

  function playSample(d) {
    A.settings = settings; A.unlock(); A.applyVolumes();
    var v = voiceOf(d.voice);
    // One combination early in a round, one push mid round, one final push.
    var steps = [['combo', 0.3], ['motivation', 0.65], ['finalPush', 0.92]];
    var lines = steps.map(function (s) {
      var list = prompts.filter(function (x) { return x.category === s[0] && x.enabled !== false && D.levelRank(x.level) <= D.levelRank(d.level); });
      var txt = list.length ? list[Math.floor(Math.random() * list.length)].text : 'Jab, cross, hook';
      return { text: txt, style: C.styleFor(d, s[0], s[1], 'round') };
    });
    (function run(i) {
      if (i >= lines.length) return;
      A.speak(lines[i].text, { voice: v, style: lines[i].style, intensity: d.intensity }).then(function () { setTimeout(function () { run(i + 1); }, 450); });
    })(0);
  }

  // ---------- Events ----------
  function backupData() { return JSON.stringify({ app: 'corner', v: 1, settings: settings, prompts: prompts, programs: programs, history: history }); }

  var H = {
    tab: function (el) { view = el.dataset.v; render(); window.scrollTo(0, 0); },
    start: function () { startWorkout(); },
    plan: function () { openPlan(); },
    testaudio: function () { testAudio(); },
    hearvoices: function () {
      A.settings = settings; A.unlock(); A.applyVolumes();
      var m = voiceOf('m1'), f = voiceOf('f1');
      toast('Playing Male, Then Female');
      A.speak('Male coach. Jab, cross, hook, cross.', { voice: m, style: 'firm', intensity: 2 }).then(function () {
        setTimeout(function () { A.speak('Female coach. Jab, cross, hook, cross.', { voice: f, style: 'firm', intensity: 2 }); }, 500);
      });
    },
    pick: function (el) { settings.selectedProgram = el.dataset.id; saveSettings(); render(); },
    newprog: function () { openEditor(null); },
    editprog: function (el) { openEditor(el.dataset.id); },
    dupprog: function (el) {
      var p = clone(findProgram(el.dataset.id)); p.id = D.newProgram().id; p.name = p.name + ' Copy';
      programs.push(p); savePrograms(); render(); toast('Program Duplicated');
    },
    delprog: function (el) {
      var p = findProgram(el.dataset.id);
      if (programs.length < 2) { toast('Keep at Least One Program'); return; }
      confirmSheet({ title: 'Delete Program', message: 'Delete ' + p.name + '? This cannot be undone.', confirm: 'Delete', danger: true }).then(function (ok) {
        if (!ok) return;
        programs = programs.filter(function (x) { return x.id !== p.id; });
        if (settings.selectedProgram === p.id) settings.selectedProgram = programs[0].id;
        savePrograms(); saveSettings(); render(); toast('Program Deleted');
      });
    },
    closescreen: function () { closeScreen(); },
    saveprog: function () {
      var d = E.draft;
      d.name = cap(d.name) || 'Untitled Program';
      if (d.recoveryPlacement === 'custom') d.recoveryList.sort(function (a, b) { return a - b; });
      var idx = -1;
      programs.forEach(function (p, i) { if (p.id === d.id) idx = i; });
      if (idx >= 0) programs[idx] = d; else programs.push(d);
      savePrograms();
      closeScreen(); render(); toast('Program Saved');
    },
    set: function (el) {
      var sc = $('#screen').scrollTop, v = el.dataset.v;
      E.draft[el.dataset.f] = el.dataset.t === 'n' ? parseFloat(v) : v;
      if (el.dataset.f === 'mode' && v === 'free') { E.draft.recoveryTalk = false; }
      renderEditor(sc);
    },
    toggle: function (el) { var sc = $('#screen').scrollTop; E.draft[el.dataset.f] = !E.draft[el.dataset.f]; renderEditor(sc); },
    step: function (el) {
      var sc = $('#screen').scrollTop, f = el.dataset.f, cfg = STEPS[f], d = E.draft;
      d[f] = Math.max(cfg.min, Math.min(cfg.max, d[f] + cfg.step * parseInt(el.dataset.d, 10)));
      clampDraft(); renderEditor(sc);
    },
    cw: function (el) { var sc = $('#screen').scrollTop; E.draft.content[el.dataset.c] = parseInt(el.dataset.v, 10); renderEditor(sc); },
    recround: function (el) {
      var sc = $('#screen').scrollTop, r = parseInt(el.dataset.r, 10), l = E.draft.recoveryList, i = l.indexOf(r);
      if (i === -1) l.push(r); else l.splice(i, 1);
      renderEditor(sc);
    },
    sample: function () { playSample(E.draft); },

    pcat: function (el) { PV.cat = el.dataset.v; render(); },
    plevel: function (el) { PV.level = el.dataset.v; render(); },
    newprompt: function () { openPromptSheet(null); },
    pedit: function (el) { openPromptSheet(el.dataset.id); },
    ptoggle: function (el) {
      var x = prompts.filter(function (p) { return p.id === el.dataset.id; })[0];
      x.enabled = x.enabled === false; savePrompts(); render();
    },
    'pt-save': function () {
      var text = cap($('#pt-text').value);
      if (!text) { toast('Enter What the Coach Says'); return; }
      var cat = $('#pt-cat').value, lvl = $('#pt-lvl').value, freq = parseInt($('#pt-freq').value, 10);
      var x;
      if (PS.isNew) {
        x = { id: 'custom-' + Date.now().toString(36), enabled: true, builtin: false };
        prompts.unshift(x);
      } else {
        x = prompts.filter(function (p) { return p.id === PS.id; })[0];
      }
      x.text = text; x.category = cat; x.level = lvl; x.freq = freq;
      if (cat === 'milestone') { x.at = $('#pt-at').value; x.scope = $('#pt-scope').value; } else { delete x.at; delete x.scope; }
      savePrompts(); closeSheet(); render(); toast('Prompt Saved');
    },
    'pt-hear': function () {
      var text = cap($('#pt-text').value);
      if (!text) return;
      A.settings = settings; A.unlock(); A.applyVolumes();
      A.speak(text, { voice: voiceOf(currentProgram().voice), style: 'firm', intensity: 2 });
    },
    'pt-reset': function () {
      var x = prompts.filter(function (p) { return p.id === PS.id; })[0];
      x.text = originalText(x.id); savePrompts(); closeSheet(); render(); toast('Prompt Reset');
    },
    'pt-del': function () {
      prompts = prompts.filter(function (p) { return p.id !== PS.id; }); savePrompts(); closeSheet(); render(); toast('Prompt Deleted');
    },
    'sheet-close': function () { closeSheet(); },
    'sheet-bg': function (el, e) { if (e.target === el) { if (CS.res) answerConfirm(false); else closeSheet(); } },
    'cs-yes': function () { answerConfirm(true); },
    'cs-no': function () { answerConfirm(false); },

    sset: function (el) {
      var v = el.dataset.v;
      settings[el.dataset.f] = el.dataset.t === 'n' ? parseFloat(v) : v;
      saveSettings(); applyTheme(); render();
    },
    stoggle: function (el) { settings[el.dataset.f] = !settings[el.dataset.f]; saveSettings(); applyTheme(); render(); },
    resetcalls: function () { settings.calls = clone(D.DEFAULT_CALLS); saveSettings(); render(); toast('Phrases Reset'); },
    backup: function () {
      var data = backupData();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(data).then(function () { toast('Backup Copied'); }, function () { toast('Could Not Copy'); });
      else toast('Could Not Copy');
    },
    restore: function () {
      openSheet('<h3>Restore Backup</h3><p>Paste a backup you copied earlier. This replaces everything on this device.</p><div class="field"><textarea id="rb" placeholder="Paste Backup Here"></textarea></div><div class="btnrow"><button class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn primary" data-act="restore-go">Restore</button></div>');
    },
    'restore-go': function () {
      try {
        var j = JSON.parse($('#rb').value);
        if (j.app !== 'corner' || !j.programs || !j.prompts) throw new Error('bad');
        settings = Object.assign(D.defaultSettings(), j.settings || {}); programs = j.programs; prompts = j.prompts; history = j.history || [];
        saveSettings(); savePrograms(); savePrompts(); saveHistory(); applyTheme(); closeSheet(); render(); toast('Backup Restored');
      } catch (e) { toast('That Is Not a Valid Backup'); }
    },
    resetall: function () {
      confirmSheet({ title: 'Reset Everything', message: 'This clears your programs, prompt edits, settings and history on this device.', confirm: 'Reset Everything', danger: true }).then(function (ok) {
        if (!ok) return;
        settings = D.defaultSettings(); prompts = D.defaultPrompts(); programs = D.defaultPrograms(); history = [];
        saveSettings(); savePrompts(); savePrograms(); saveHistory(); applyTheme(); render(); toast('Everything Reset');
      });
    },

    'wo-pause': function () { togglePause(); },
    'wo-skip': function () { skipRest(); },
    'wo-end': function () {
      confirmSheet({ title: 'End Workout', message: 'Stop now? Your finished rounds will be saved.', confirm: 'End Workout', danger: true }).then(function (ok) { if (ok && R.active) finishWorkout(false); });
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = H[el.dataset.act];
    if (fn) fn(el, e);
  });

  document.addEventListener('input', function (e) {
    var el = e.target, b = el.dataset && el.dataset.bind;
    if (el.id === 'pq') { PV.q = el.value; var pos = el.selectionStart; render(); var n = $('#pq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } return; }
    if (!b) return;
    if (b === 'name' && E) { E.draft.name = el.value; return; }
    if (b === 'coachVol' || b === 'fxVol') { settings[b] = parseFloat(el.value); A.applyVolumes(); saveSettings(); return; }
    if (b.indexOf('call-') === 0) { settings.calls[b.slice(5)] = el.value; saveSettings(); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target, b = el.dataset && el.dataset.bind;
    if (b === 'pt-cat') { var mb = $('#pt-mile'); if (mb) mb.classList.toggle('hidden', el.value !== 'milestone'); }
    if (b === 'dv-male') { settings.deviceVoices.male = el.value; saveSettings(); }
    if (b === 'dv-female') { settings.deviceVoices.female = el.value; saveSettings(); }
  });

  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = function () { if (view === 'settings') { var y = window.scrollY; render(); window.scrollTo(0, y); } };
  }

  // ---------- Boot ----------
  applyTheme();
  render();
  A.loadManifest();
  var launch = $('#launch');
  function endLaunch() { launch.classList.add('gone'); }
  launch.addEventListener('click', endLaunch);
  setTimeout(endLaunch, 1700);
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  window.__corner = { C: C, D: D, state: function () { return { settings: settings, programs: programs, prompts: prompts, R: R }; } };
})();
