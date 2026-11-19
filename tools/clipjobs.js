/* Corner clip jobs: which clips to generate, in what order, and how each phrase is styled for ElevenLabs.
   Shared by tools/generate-clips.js (Node) and the browser Clip Maker.

   Styling rules (edit here to change how every clip is delivered):
   - Combinations (combo, numbers, defense, footwork) are split per punch: "Jab! Cross! Hook!"
   - firm: confident, no tag. Needling lines get [annoyed].
   - urgent: [shouting] plus exclamation marks, with the last word in capitals for emphasis.
   - calm: [calm, steady voice] with plain sentences.
   Tags only work on Eleven v3 and later models. Turn tags off for older models. */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('../data.js') : root.CornerData, isNode ? require('../coach.js') : root.CornerCoach);
  if (isNode) module.exports = api; else root.CornerClipJobs = api;
})(typeof self !== 'undefined' ? self : this, function (D, C) {
  'use strict';

  var COMBO_LIKE = { combo: 1, numbers: 1, defense: 1, footwork: 1 };
  var BANG_FIRM = { cue: 1, motivation: 1, finalPush: 1, call: 1 };

  function cap(s) { s = s.trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function stripEnd(s) { return s.trim().replace(/[.!?]+$/, ''); }
  function sentences(t) { return (t.match(/[^.!?]+[.!?]*/g) || [t]).map(function (x) { return x.trim(); }).filter(Boolean); }
  function parts(t) { return t.split(',').map(function (x) { return cap(x); }).filter(Boolean); }

  function emphasizeLast(list) {
    var last = list.length - 1;
    return list.map(function (s, i) {
      s = stripEnd(s);
      if (i === last) { var w = s.split(' '); w[w.length - 1] = w[w.length - 1].toUpperCase(); s = w.join(' '); }
      return s + '!';
    }).join(' ');
  }

  // The exact text sent to ElevenLabs for a phrase in a given style.
  function say(item, style, useTags) {
    var t = item.text, cat = item.category, body, tag = '';
    var combo = COMBO_LIKE[cat] && t.indexOf(',') !== -1;
    if (style === 'urgent') {
      body = combo ? parts(t).join('! ') + '!' : emphasizeLast(sentences(t));
      tag = cat === 'needle' ? '[annoyed] [shouting] ' : '[shouting] ';
    } else if (style === 'calm') {
      body = combo ? parts(t).join('. ') + '.' : sentences(t).map(function (s) { return stripEnd(s) + '.'; }).join(' ');
      tag = '[calm, steady voice] ';
    } else {
      if (combo) body = parts(t).join('! ') + '!';
      else if (BANG_FIRM[cat]) body = sentences(t).map(function (s) { return stripEnd(s) + '!'; }).join(' ');
      else body = sentences(t).map(function (s) { return stripEnd(s) + '.'; }).join(' ');
      tag = cat === 'needle' ? '[annoyed] ' : '';
    }
    return (useTags === false ? '' : tag) + body;
  }

  // Fixed coach calls (round numbers etc.), expanded so every spoken call has a clip.
  function callItems() {
    var c = D.DEFAULT_CALLS, items = [];
    function add(text, style, kind) { items.push({ text: text, category: 'call', kind: kind, only: style }); }
    add(c.ready, 'firm', 'ready'); add(c.first, 'firm', 'first'); add(c.last, 'firm', 'last'); add(c.complete, 'firm', 'complete');
    add(c.thirty, 'urgent', 'thirty'); add(c.warn, 'urgent', 'warn'); add(c.recovery, 'calm', 'recovery');
    for (var n = 2; n <= 12; n++) add(C.fillCall(c.round, n), 'firm', 'round');
    for (var m = 1; m <= 12; m++) add(C.fillCall(c.free, m), 'calm', 'free');
    return items;
  }

  // Most useful first, so a free plan covers the clips played most often.
  var TIERS = [
    { name: 'Firm: short cues, milestones and round calls', style: 'firm', cats: ['cue', 'milestone'], calls: ['ready', 'first', 'round', 'last', 'complete'] },
    { name: 'Firm: combinations and number combinations', style: 'firm', cats: ['combo', 'numbers'] },
    { name: 'Urgent: short cues, milestones, final push and warnings', style: 'urgent', cats: ['cue', 'milestone', 'finalPush'], calls: ['thirty', 'warn'], skip: function (it) { return it.category === 'milestone' && (it.at === 'open' || it.at === 'q1'); } },
    { name: 'Calm: recovery and rest lines', style: 'calm', cats: ['recoveryTalk', 'restTalk'], calls: ['recovery', 'free'] },
    { name: 'Firm: everything else', style: 'firm', cats: ['defense', 'footwork', 'form', 'motivation', 'needle', 'finalPush'] },
    { name: 'Urgent: combinations, defense and push lines', style: 'urgent', cats: ['combo', 'numbers', 'defense', 'footwork', 'motivation', 'needle'] },
    { name: 'Calm: form tips', style: 'calm', cats: ['form'] }
  ];

  function buildJobs(opts) {
    opts = opts || {};
    var tags = opts.tags !== false;
    var items = D.defaultPrompts().concat(callItems());
    var seen = {}, jobs = [];
    TIERS.forEach(function (tier, ti) {
      items.forEach(function (it) {
        var ok = it.category === 'call' ? (tier.calls || []).indexOf(it.kind) !== -1 && it.only === tier.style : tier.cats.indexOf(it.category) !== -1;
        if (!ok || (tier.skip && tier.skip(it))) return;
        var slug = D.slug(it.text), key = '{v}/' + tier.style + '/' + slug;
        if (seen[key]) return;
        seen[key] = 1;
        var text = say(it, tier.style, tags);
        jobs.push({ tier: ti + 1, tierName: tier.name, style: tier.style, slug: slug, original: it.text, category: it.category, say: text, chars: text.length });
      });
    });
    return jobs;
  }

  var DEFAULTS = { model: 'eleven_v3', stability: 0, speed: { calm: 1.0, firm: 1.1, urgent: 1.2 }, tags: true, reserve: 200 };

  // Request body for one clip. Level 0 sends speed, 1 drops speed, 2 sends no voice settings.
  function requestBody(job, cfg, level) {
    var b = { text: job.say, model_id: cfg.model };
    if (level < 2) {
      b.voice_settings = { stability: cfg.stability };
      if (level < 1 && cfg.speed && cfg.speed[job.style]) b.voice_settings.speed = cfg.speed[job.style];
    }
    return b;
  }

  return { buildJobs: buildJobs, say: say, TIERS: TIERS, DEFAULTS: DEFAULTS, requestBody: requestBody };
});
