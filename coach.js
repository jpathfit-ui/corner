/* Corner: pure coaching logic (timeline, recovery placement, prompt picking, delivery style). No DOM. */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('./data.js') : root.CornerData);
  if (isNode) module.exports = api;
  else root.CornerCoach = api;
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
    'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function numberWord(n) {
    n = Math.max(0, Math.min(99, Math.floor(n)));
    if (n < 20) return ONES[n];
    var t = Math.floor(n / 10), o = n % 10;
    return TENS[t] + (o ? '-' + ONES[o] : '');
  }

  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function range(a, b) {
    var out = [];
    for (var i = a; i <= b; i++) out.push(i);
    return out;
  }

  // Which round numbers are recovery rounds (the boxer sets their own pace).
  function recoverySet(p, rng) {
    rng = rng || Math.random;
    var total = p.rounds;
    if (p.mode === 'free') return new Set(range(1, total));
    if (p.recoveryPlacement === 'custom') {
      return new Set((p.recoveryList || []).filter(function (r) { return r >= 1 && r <= total; }));
    }
    var elig = range(1, total);
    if (total >= 3) elig = elig.filter(function (r) { return r !== 1 && r !== total; });
    var c = Math.max(0, Math.min(p.recoveryCount || 0, elig.length));
    if (!c) return new Set();
    if (p.recoveryPlacement === 'random') return new Set(shuffle(elig, rng).slice(0, c));
    var out = new Set();
    for (var k = 0; k < c; k++) {
      var idx = Math.round(((k + 1) * (elig.length + 1)) / (c + 1)) - 1;
      idx = Math.max(0, Math.min(elig.length - 1, idx));
      out.add(elig[idx]);
    }
    return out;
  }

  function buildTimeline(p, rng) {
    var rec = recoverySet(p, rng);
    var segs = [];
    if (p.getReady > 0) segs.push({ type: 'ready', dur: p.getReady, n: 0 });
    for (var r = 1; r <= p.rounds; r++) {
      segs.push({ type: 'round', n: r, dur: p.roundSec, recovery: rec.has(r) });
      if (r < p.rounds && p.restSec > 0) segs.push({ type: 'rest', n: r, dur: p.restSec });
    }
    return { segs: segs, recovery: rec };
  }

  function totalSeconds(segs) {
    return segs.reduce(function (a, s) { return a + s.dur; }, 0);
  }

  function fillCall(template, n) {
    return String(template).replace(/\{n\}/g, numberWord(n));
  }

  function punchCount(text) {
    return String(text).split(',').length;
  }

  var GAP_BASE = 0.3; // extra seconds per punch so the boxer can finish throwing before the next call

  function chooseCategory(p, ctx, rng) {
    if (ctx.phase === 'rest') return 'restTalk';
    if (ctx.phase === 'recovery') return 'recoveryTalk';
    var mot = [0, 0.08, 0.16, 0.28][p.motivation] || 0;
    if (p.finalPush && ctx.remaining <= 30 && ctx.roundSec >= 60 && rng() < 0.55) return 'finalPush';
    if (rng() < mot) return 'motivation';
    var weights = [], sum = 0;
    D.CATEGORIES.forEach(function (c) {
      if (!c.pick) return;
      var w = (p.content && p.content[c.id]) || 0;
      if (w > 0) { weights.push([c.id, w]); sum += w; }
    });
    if (!sum) return 'combo';
    var x = rng() * sum;
    for (var i = 0; i < weights.length; i++) {
      x -= weights[i][1];
      if (x <= 0) return weights[i][0];
    }
    return weights[weights.length - 1][0];
  }

  function pickPrompt(prompts, p, ctx, rng) {
    rng = rng || Math.random;
    var rank = D.levelRank(p.level);
    var cat = chooseCategory(p, ctx, rng);
    var recent = ctx.recent || [];

    function usable(category, avoidRecent) {
      return prompts.filter(function (x) {
        if (x.category !== category || x.enabled === false) return false;
        if (D.levelRank(x.level) > rank) return false;
        // Real coaches repeat short cues, so only the last two are blocked for those.
        var window_ = (category === 'cue' || category === 'needle') ? recent.slice(-2) : recent;
        if (avoidRecent && window_.indexOf(x.id) !== -1) return false;
        if ((category === 'combo' || category === 'numbers') && p.comboLength && p.comboLength !== 'any') {
          var n = punchCount(x.text);
          if (p.comboLength === 'short' && n > 3) return false;
          if (p.comboLength === 'long' && n < 4) return false;
        }
        return true;
      });
    }

    var list = usable(cat, true);
    if (!list.length) list = usable(cat, false);
    if (!list.length && cat !== 'combo') { cat = 'combo'; list = usable(cat, true); if (!list.length) list = usable(cat, false); }
    if (!list.length) return null;

    var total = 0;
    var weighted = list.map(function (x) {
      var w = (x.level === p.level ? 3 : 1) * (x.freq || 3); // exact level favored, then per-prompt frequency
      total += w;
      return [x, w];
    });
    var r = rng() * total;
    for (var i = 0; i < weighted.length; i++) {
      r -= weighted[i][1];
      if (r <= 0) return { prompt: weighted[i][0], category: cat };
    }
    return { prompt: weighted[weighted.length - 1][0], category: cat };
  }

  var MILESTONES = [{ at: 'q1', p: 0.25 }, { at: 'half', p: 0.5 }, { at: 'q3', p: 0.75 }, { at: 'late', p: 0.9 }];

  // Milestone call for a point in the round. In the final round, dramatic "final" lines win when any exist.
  function pickMilestone(prompts, p, at, isFinal, recent, rng) {
    rng = rng || Math.random; recent = recent || [];
    var all = prompts.filter(function (x) { return x.category === 'milestone' && x.enabled !== false && x.at === at; });
    var list = isFinal ? all.filter(function (x) { return x.scope === 'final'; }) : [];
    if (!list.length) list = all.filter(function (x) { return x.scope !== 'final'; });
    var fresh = list.filter(function (x) { return recent.indexOf(x.id) === -1; });
    if (fresh.length) list = fresh;
    if (!list.length) return null;
    return list[Math.floor(rng() * list.length)];
  }

  // Delivery style for a given moment. progress is 0 to 1 through the round.
  function styleFor(p, category, progress, phase) {
    var order = ['calm', 'firm', 'urgent'];
    var s;
    if (phase === 'recovery' || phase === 'rest') return 'calm';
    if (p.style && p.style !== 'auto') {
      s = p.style;
      if (p.ramp && progress > 0.8 && s !== 'urgent') s = order[order.indexOf(s) + 1];
      return s;
    }
    if (category === 'finalPush') return 'urgent';
    if (category === 'motivation') return progress > 0.5 ? 'urgent' : 'firm';
    if (category === 'form') return progress < 0.5 ? 'calm' : 'firm';
    s = 'firm';
    if (p.ramp && progress > 0.8) s = 'urgent';
    return s;
  }

  // Punctuation nudges most device voices toward the intended delivery.
  function ttsText(text, style) {
    var t = String(text).trim().replace(/[.!?]+$/, '');
    if (style === 'urgent') return t.replace(/\.\s+/g, '! ') + '!';
    return t + '.';
  }

  function gapFor(p, seg, progress, remaining, lastPrompt, rng) {
    rng = rng || Math.random;
    var jitter = 0.85 + rng() * 0.3;
    if (seg.type === 'rest') return 16 * jitter;
    if (seg.recovery) return (22 + rng() * 8);
    var g = p.gap;
    if (p.ramp && progress > 0.8) g *= 0.8;
    if (lastPrompt && lastPrompt.category === 'cue') g *= 0.7;
    if (lastPrompt && (lastPrompt.category === 'combo' || lastPrompt.category === 'numbers')) {
      g += punchCount(lastPrompt.prompt.text) * GAP_BASE;
    }
    return g * jitter;
  }

  function roundCallText(seg, p, total, calls) {
    if (p.mode === 'free') return fillCall(calls.free, seg.n);
    if (seg.recovery) return calls.recovery;
    if (seg.n === 1) return calls.first;
    if (seg.n === total) return calls.last;
    return fillCall(calls.round, seg.n);
  }

  function describeRecovery(p) {
    if (p.mode === 'free') return 'Free Boxing';
    if (p.recoveryPlacement === 'custom') {
      var n = (p.recoveryList || []).length;
      return n ? n + (n === 1 ? ' Recovery Round' : ' Recovery Rounds') : 'No Recovery Rounds';
    }
    var c = p.recoveryCount || 0;
    return c ? c + (c === 1 ? ' Recovery Round' : ' Recovery Rounds') : 'No Recovery Rounds';
  }

  return {
    numberWord: numberWord, fmt: fmt, recoverySet: recoverySet, buildTimeline: buildTimeline, totalSeconds: totalSeconds,
    fillCall: fillCall, pickPrompt: pickPrompt, chooseCategory: chooseCategory, styleFor: styleFor, ttsText: ttsText, gapFor: gapFor,
    roundCallText: roundCallText, MILESTONES: MILESTONES, pickMilestone: pickMilestone, describeRecovery: describeRecovery, punchCount: punchCount
  };
});
