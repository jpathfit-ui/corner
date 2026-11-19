/* Corner: data model, default prompt library, programs, voices and settings. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CornerData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LEVELS = [
    { id: 'novice', label: 'Novice', rank: 1 },
    { id: 'intermediate', label: 'Intermediate', rank: 2 },
    { id: 'advanced', label: 'Advanced', rank: 3 }
  ];

  // pick:true categories can be weighted inside a program. The rest are used automatically by the coach.
  var CATEGORIES = [
    { id: 'combo', label: 'Combinations', pick: true },
    { id: 'numbers', label: 'Number Combinations', pick: true },
    { id: 'defense', label: 'Defense', pick: true },
    { id: 'footwork', label: 'Footwork', pick: true },
    { id: 'form', label: 'Form Tips', pick: true },
    { id: 'cue', label: 'Short Cues', pick: true },
    { id: 'needle', label: 'Needling', pick: true },
    { id: 'milestone', label: 'Milestones', pick: false },
    { id: 'motivation', label: 'Motivation', pick: false },
    { id: 'finalPush', label: 'Final Push', pick: false },
    { id: 'recoveryTalk', label: 'Recovery Talk', pick: false },
    { id: 'restTalk', label: 'Rest Talk', pick: false }
  ];

  // Two coaches. Each uses the device voice picked for its gender in Settings, or recorded clips in audio/m1 and audio/f1.
  var VOICES = [
    { id: 'm1', gender: 'male', name: 'Male Coach', pitch: 1, rate: 1 },
    { id: 'f1', gender: 'female', name: 'Female Coach', pitch: 1, rate: 1 }
  ];

  // Device voice fallback parameters. Recorded clips replace these when they exist.
  var STYLES = [
    { id: 'calm', label: 'Calm', rate: 0.92, pitch: 0.92, vol: 0.85 },
    { id: 'firm', label: 'Firm', rate: 1.0, pitch: 0.97, vol: 1.0 },
    { id: 'urgent', label: 'Urgent', rate: 1.17, pitch: 1.06, vol: 1.0 }
  ];

  function slug(text) {
    return String(text).toLowerCase().replace(/\{n\}/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
  }

  function levelRank(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i].rank;
    return 2;
  }

  var RAW = {
    combo: {
      novice: ['Jab, cross', 'Jab, jab, cross', 'Jab, cross, hook', 'Cross, hook', 'Double jab, cross', 'Jab to the body, jab to the head', 'Jab, cross, step back'],
      intermediate: [
        'Jab, cross, hook, cross', 'Jab, jab, cross, hook', 'Jab, cross, uppercut, hook', 'Jab, cross, body hook, head hook',
        'Double jab, cross, hook', 'Jab, body jab, cross, hook', 'Jab, cross, hook, uppercut', 'Cross, hook, cross', 'Hook, cross, hook',
        'Jab, uppercut, cross', 'Jab, cross, slip, cross', 'Jab, cross, roll, hook', 'Jab, cross, hook, step out', 'Jab, hook, cross',
        'Body jab, cross, hook to the body', 'Cross, hook, uppercut, cross', 'Jab, cross, pivot, hook', 'Jab, jab, cross, roll, cross',
        'Jab to the body, jab to the head, cross, hook'
      ],
      advanced: [
        'Jab, cross, hook, cross, hook', 'Jab, jab, cross, slip, cross, hook', 'Jab, cross, roll, cross, hook, cross', 'Jab, feint, cross, hook',
        'Jab, cross, body hook, head hook, cross', 'Slip, slip, cross, hook, cross', 'Jab, pull, cross, hook, roll', 'Cross, hook, step off, jab, cross',
        'Jab, cross, uppercut, hook, cross, roll', 'Double jab, cross, hook, cross, slip', 'Jab, cross, hook, cross, uppercut, hook', 'Feint jab, cross, hook, cross'
      ]
    },
    numbers: {
      novice: ['One, two', 'One, one, two', 'One, two, three'],
      intermediate: ['One, two, three, two', 'One, two, five, two', 'One, one, two, three', 'Two, three, two', 'Three, two, three', 'One, two, slip, two, three'],
      advanced: ['One, two, three, two, three', 'One, one, two, five, two', 'Two, three, two, one, two', 'One, two, three, six, three, two', 'One, two, slip, two, three, two']
    },
    defense: {
      novice: ['Slip left', 'Slip right', 'Parry and jab', 'Hands up, block'],
      intermediate: ['Slip, slip, cross', 'Roll under the hook', 'Parry, cross', 'Duck and hook', 'Pull back, jab, cross', 'Block, slip, counter',
        'Slip right, cross, hook', 'Slip left, hook, cross', 'Shell up, then fire back', 'Roll left, roll right, cross'],
      advanced: ['Slip, roll, cross, hook', 'Pull, counter cross, hook', 'Double slip, hook, cross', 'Roll under, uppercut, cross']
    },
    footwork: {
      novice: ['Move your feet', 'Circle left', 'Circle right', 'Stay light on your toes'],
      intermediate: ['Step in, step out', 'Pivot out', 'Cut off the ring', 'Angle off to the left', 'Angle off to the right', 'Jab and move', 'Reset your stance'],
      advanced: ['Step off the line, counter', 'Pivot, jab, cross, pivot', 'Switch the angle, then fire']
    },
    form: {
      novice: ['Hands up', 'Chin down', 'Keep your elbows in', 'Breathe out on every punch', 'Stay relaxed'],
      intermediate: ['Turn the hip on the cross', 'Snap the jab back to your chin', 'Do not drop the hand after the jab', 'Sit down on your punches',
        'Pivot the back foot on the cross', 'Rotate the shoulder on the hook', 'Eyes up, stay loose'],
      advanced: ['Keep the combination tight. No wasted motion.', 'Reset your balance after every combo', 'Throw with intent, not just volume']
    },
    cue: {
      novice: [
        { t: 'Hands up', f: 12 }, { t: 'Chin down', f: 12 }, { t: 'Move your feet', f: 6 }, { t: 'Watch the footwork', f: 6 },
        { t: 'Move your head', f: 6 }, { t: 'Harder', f: 6 }, { t: 'Faster', f: 6 }, { t: "Let's go", f: 6 }, { t: 'Breathe', f: 6 },
        { t: 'Watch the shoulder', f: 3 }, { t: 'Stay loose', f: 3 }, { t: 'Elbows in', f: 3 }, { t: 'Reset your stance', f: 3 },
        { t: 'Work the body', f: 3 }, { t: 'Snap it back', f: 3 }, { t: 'Sharper', f: 3 }, { t: 'Keep it tight', f: 3 },
        { t: 'Do not drop that right hand', f: 3 }, { t: 'Soft knees', f: 3 }, { t: 'Step back out', f: 1 }
      ]
    },
    needle: {
      novice: [
        { t: 'Do not get sloppy', f: 3 }, { t: 'You are looking tired', f: 3 }, { t: 'Do not tell me you are tired', f: 3 },
        { t: 'Hands are dropping', f: 3 }, { t: 'Do not quit on me now', f: 3 }, { t: 'That was sloppy. Tighten it up.', f: 1 },
        { t: 'Come on, show me something', f: 1 }, { t: 'Is that all you have got?', f: 1 }
      ]
    },
    milestone: {
      novice: [
        { t: "All right, we're warming up. Let's get into it.", at: 'open' },
        { t: 'Nice and easy to start. Find your rhythm.', at: 'open' },
        { t: "Let's go. Loosen up and stay light.", at: 'open' },
        { t: 'Quarter of the way. Keep working.', at: 'q1' },
        { t: 'Good start. Keep it going.', at: 'q1' },
        { t: "All right, we're working our way in.", at: 'q1' },
        { t: 'Halfway. What have you got left?', at: 'half' },
        { t: "Halfway there. Show me what you've got.", at: 'half' },
        { t: "Half done. Keep going, don't stop now.", at: 'half' },
        { t: 'Three quarters of the way. Stay strong.', at: 'q3' },
        { t: 'Strong finish coming. Stay with it.', at: 'q3' },
        { t: 'Almost there. Do not let up.', at: 'q3' },
        { t: 'Ninety percent. This is where it counts.', at: 'late' },
        { t: 'Ten percent left. Make it count.', at: 'late' },
        { t: "Strong finish. You're almost there.", at: 'late' },
        { t: 'Halfway through the last round. Keep digging.', at: 'half', scope: 'final' },
        { t: 'Three quarters through the last round. Leave it all in here.', at: 'q3', scope: 'final' },
        { t: 'This is what makes champions. Make it or break it.', at: 'late', scope: 'final' },
        { t: 'Last stretch. This is what makes champions.', at: 'late', scope: 'final' },
        { t: 'Make it or break it. Finish strong.', at: 'late', scope: 'final' }
      ]
    },
    motivation: {
      novice: ['Keep it going', 'Stay sharp', 'Let us go, let us work', 'Find your rhythm', 'Do not ease up', 'You are doing great. Keep pushing.',
        'Bring the intensity', 'Work, work, work', 'Stay focused', 'Punch with intent', 'Make every shot count', 'Dig in',
        'This is where it counts', 'Good work. Stay on it.', 'Push through it. You are stronger than you think.', 'Sharper. Faster. Stay tight.']
    },
    finalPush: {
      novice: ['Empty the tank', 'Finish strong', 'Leave nothing behind', 'Push, push, push', 'Everything you have got, right now',
        'This is the round that counts. Dig deep.', 'Go, go, go. Do not stop.', 'Last push. Make it count.', 'Hands fast. No rest.', 'Fire it all out']
    },
    recoveryTalk: {
      novice: ['Stay loose. Stay moving.', 'Breathe. Keep your hands up.', 'Your pace. Your rhythm.', 'Pick it up if you feel good', 'Shake out the shoulders',
        'Slow and smooth', 'Light shots. Good form.', 'Keep moving your feet', 'Easy does it. Stay active.']
    },
    restTalk: {
      novice: ['Good round. Breathe.', 'Slow, deep breaths', 'Take a drink', 'Shake it out', 'Hands down. Relax your shoulders.',
        'Next round, we pick it up', 'Nice work. Recover.', 'Stay on your feet. Walk it off.']
    }
  };

  function defaultPrompts() {
    var out = [];
    Object.keys(RAW).forEach(function (cat) {
      Object.keys(RAW[cat]).forEach(function (lvl) {
        RAW[cat][lvl].forEach(function (item) {
          var o = typeof item === 'string' ? { t: item } : item;
          var p = { id: cat + '-' + slug(o.t), category: cat, level: lvl, text: o.t, freq: o.f || 3, enabled: true, builtin: true };
          if (o.at) { p.at = o.at; p.scope = o.scope || 'round'; }
          out.push(p);
        });
      });
    });
    return out;
  }

  var FREQS = [{ v: 1, l: 'Rarely' }, { v: 3, l: 'Sometimes' }, { v: 6, l: 'Often' }, { v: 12, l: 'Constantly' }];
  var MILESTONE_AT = [{ v: 'open', l: 'Start of Workout' }, { v: 'q1', l: 'Quarter Way' }, { v: 'half', l: 'Halfway' }, { v: 'q3', l: 'Three Quarters' }, { v: 'late', l: 'Ninety Percent' }];
  var MILESTONE_SCOPE = [{ v: 'round', l: 'Every Round' }, { v: 'final', l: 'Final Round Only' }];

  var DEFAULT_CALLS = {
    ready: 'Get ready',
    first: 'Round one. Let us get to work.',
    round: 'Round {n}',
    last: 'Final round. Give me everything.',
    recovery: 'Recovery round. Your pace.',
    free: 'Free boxing. Round {n}. Your pace.',
    thirty: 'Thirty seconds left. Finish strong.',
    warn: 'Ten seconds',
    complete: 'Workout complete. Great work.'
  };

  var CALL_LABELS = [
    ['ready', 'Get Ready'],
    ['first', 'First Round'],
    ['round', 'Round Start (use {n} for the number)'],
    ['last', 'Final Round'],
    ['recovery', 'Recovery Round'],
    ['free', 'Free Boxing Round (use {n} for the number)'],
    ['thirty', 'Thirty Seconds Left'],
    ['warn', 'Warning Call'],
    ['complete', 'Workout Complete']
  ];

  function defaultSettings() {
    return {
      selectedProgram: 'prog-classic',
      level: 'intermediate',
      coachVol: 1,
      fxVol: 0.9,
      useClips: true,
      warnSec: 10,
      fiveCue: false,
      spokenWarn: false,
      thirtyCall: true,
      bellStrikes: 1,
      keepAwake: true,
      timerColor: 'red',
      timerSize: 'large',
      deviceVoices: { male: '', female: '' },
      calls: JSON.parse(JSON.stringify(DEFAULT_CALLS))
    };
  }

  function newProgram(level) {
    return {
      id: 'prog-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
      name: 'New Program',
      mode: 'coached',
      level: level || 'intermediate',
      rounds: 6,
      roundSec: 180,
      restSec: 60,
      getReady: 10,
      recoveryCount: 1,
      recoveryPlacement: 'even',
      recoveryList: [],
      voice: 'm1',
      style: 'auto',
      intensity: 2,
      ramp: true,
      gap: 3,
      motivation: 2,
      finalPush: true,
      recoveryTalk: true,
      content: { combo: 3, cue: 3, numbers: 1, defense: 1, footwork: 1, form: 1, needle: 1 },
      comboLength: 'any',
      milestones: true
    };
  }

  function prog(id, over) {
    var p = newProgram('intermediate');
    p.id = id;
    Object.keys(over).forEach(function (k) {
      if (k === 'content') p.content = Object.assign(p.content, over.content);
      else p[k] = over[k];
    });
    return p;
  }

  function defaultPrograms() {
    return [
      prog('prog-classic', { name: 'Intermediate Classic', rounds: 6, roundSec: 180, restSec: 60, recoveryCount: 1, voice: 'm1' }),
      prog('prog-grind', { name: 'Eight Round Grind', rounds: 8, roundSec: 180, restSec: 60, recoveryCount: 2, voice: 'm1', motivation: 3, gap: 3 }),
      prog('prog-power', { name: 'Power and Speed', rounds: 10, roundSec: 120, restSec: 30, recoveryCount: 2, voice: 'f1', style: 'urgent', intensity: 3, gap: 2, motivation: 2, content: { needle: 2 } }),
      prog('prog-defense', { name: 'Defense and Counters', rounds: 5, roundSec: 180, restSec: 60, recoveryCount: 1, voice: 'f1', gap: 4, content: { combo: 2, cue: 2, numbers: 0, defense: 3, footwork: 2, form: 1, needle: 1 } }),
      prog('prog-tech', { name: 'Technique Rounds', level: 'novice', rounds: 4, roundSec: 180, restSec: 60, recoveryCount: 1, voice: 'f1', style: 'calm', intensity: 1, gap: 5, motivation: 1, content: { combo: 3, cue: 2, numbers: 1, defense: 1, footwork: 2, form: 3, needle: 0 } }),
      prog('prog-free', { name: 'Free Boxing', mode: 'free', rounds: 5, roundSec: 180, restSec: 60, voice: 'm1', recoveryTalk: false })
    ];
  }

  return {
    LEVELS: LEVELS, CATEGORIES: CATEGORIES, VOICES: VOICES, STYLES: STYLES, DEFAULT_CALLS: DEFAULT_CALLS, CALL_LABELS: CALL_LABELS,
    slug: slug, levelRank: levelRank, defaultPrompts: defaultPrompts, defaultSettings: defaultSettings,
    defaultPrograms: defaultPrograms, newProgram: newProgram, RAW: RAW, FREQS: FREQS, MILESTONE_AT: MILESTONE_AT, MILESTONE_SCOPE: MILESTONE_SCOPE
  };
});
