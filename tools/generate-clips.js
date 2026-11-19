#!/usr/bin/env node
/* Generates coach voice clips with ElevenLabs, most important first, and stops before credits run out.
   Saves straight into audio/<voice>/<style>/<slug>.mp3 and keeps audio/manifest.json up to date.
   Safe to run again: clips that already exist are skipped, so it picks up where it stopped.

   Usage (Node 18 or newer):
     export ELEVENLABS_API_KEY=your_key_here
     node tools/generate-clips.js --voice-id VOICE_ID --folder m1
   Options:
     --folder m1|f1      male coach (m1) or female coach (f1). Default m1.
     --model NAME        default eleven_v3
     --stability 0|0.5|1 v3 setting: 0 Creative, 0.5 Natural, 1 Robust. Default 0.
     --reserve N         credits to leave untouched. Default 200.
     --available N       credits to assume if the account cannot report them. Default 10000.
     --limit N           make at most N clips this run (good for a first test with --limit 3).
     --no-tags           leave out delivery tags like [shouting] (for models older than v3).
     --dry-run           print the plan and spend nothing. */
var fs = require('fs'), path = require('path');
var J = require('./clipjobs.js');

function arg(name, def) { var i = process.argv.indexOf('--' + name); return i === -1 ? def : (process.argv[i + 1] && process.argv[i + 1].indexOf('--') !== 0 ? process.argv[i + 1] : true); }
var API = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';
var KEY = process.env.ELEVENLABS_API_KEY, VOICE = arg('voice-id'), FOLDER = arg('folder', 'm1');
var cfg = { model: arg('model', J.DEFAULTS.model), stability: parseFloat(arg('stability', 0)), speed: J.DEFAULTS.speed };
var RESERVE = parseInt(arg('reserve', J.DEFAULTS.reserve), 10), AVAIL = parseInt(arg('available', 10000), 10);
var LIMIT = parseInt(arg('limit', 0), 10), DRY = !!arg('dry-run', false), TAGS = !arg('no-tags', false);
var AUDIO = path.join(__dirname, '..', 'audio');

if (FOLDER !== 'm1' && FOLDER !== 'f1') { console.error('--folder must be m1 or f1'); process.exit(1); }
if (!DRY && (!KEY || !VOICE || VOICE === true)) { console.error('Set ELEVENLABS_API_KEY and pass --voice-id. Use --dry-run to see the plan without them.'); process.exit(1); }

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function fileFor(j) { return path.join(AUDIO, FOLDER, j.style, j.slug + '.mp3'); }

function writeManifest() {
  var clips = [];
  (function walk(dir, rel) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      var r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (/\.mp3$/i.test(e.name) && r.split('/').length === 3) clips.push(r.replace(/\.mp3$/i, ''));
    });
  })(AUDIO, '');
  clips.sort();
  fs.mkdirSync(AUDIO, { recursive: true });
  fs.writeFileSync(path.join(AUDIO, 'manifest.json'), JSON.stringify({ clips: clips }, null, 1));
  return clips.length;
}

async function credits() {
  try {
    var r = await fetch(API + '/v1/user/subscription', { headers: { 'xi-api-key': KEY } });
    if (!r.ok) return null;
    var j = await r.json();
    return { used: j.character_count, limit: j.character_limit, reset: j.next_character_count_reset_unix };
  } catch (e) { return null; }
}

var level = 0;
async function tts(job) {
  var url = API + '/v1/text-to-speech/' + encodeURIComponent(VOICE) + '?output_format=mp3_44100_128';
  for (var tries = 0; tries < 6; tries++) {
    var res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' }, body: JSON.stringify(J.requestBody(job, cfg, level)) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    var text = await res.text().catch(function () { return ''; });
    if (res.status === 401) throw Object.assign(new Error('The API key was rejected (401). ' + text.slice(0, 200)), { fatal: true });
    if (res.status === 429 || res.status >= 500) { console.log('Busy (' + res.status + '). Waiting 5 seconds.'); await sleep(5000); continue; }
    if ((res.status === 400 || res.status === 422) && level < 2 && /voice_settings|speed|stability|setting/i.test(text)) {
      level++; console.log('The model rejected a voice setting. Retrying ' + (level === 1 ? 'without speed' : 'with default voice settings') + '.'); continue;
    }
    throw Object.assign(new Error(res.status + ' ' + text.slice(0, 300)), { fatal: res.status === 402 || /quota|credit|limit|not available for free|paid/i.test(text) });
  }
  throw new Error('Gave up after repeated retries.');
}

(async function main() {
  var all = J.buildJobs({ tags: TAGS });
  var todo = all.filter(function (j) { return !fs.existsSync(fileFor(j)); });
  console.log(all.length + ' clips in the plan, ' + todo.length + ' still to make for ' + (FOLDER === 'm1' ? 'the male' : 'the female') + ' coach.');

  var info = DRY ? null : await credits();
  var remaining = info ? info.limit - info.used : AVAIL;
  console.log(info ? 'Credits: ' + info.used + ' used of ' + info.limit + ', ' + remaining + ' remaining.' : 'Could not read credits. Counting locally against ' + AVAIL + '.');

  if (DRY) {
    var cum = 0, last = 0;
    todo.forEach(function (j) { if (j.tier !== last) { last = j.tier; console.log('\nGroup ' + j.tier + ': ' + j.tierName); } cum += j.chars; });
    var byTier = {};
    todo.forEach(function (j) { byTier[j.tier] = (byTier[j.tier] || 0) + j.chars; });
    var run = 0;
    console.log('');
    Object.keys(byTier).forEach(function (t) { run += byTier[t]; console.log('Through group ' + t + ': about ' + run + ' credits'); });
    console.log('\nExample text sent for the first clips:');
    todo.slice(0, 5).forEach(function (j) { console.log('  ' + j.style + '/' + j.slug + '  ->  ' + j.say); });
    return;
  }

  var made = 0, spent = 0, reason = '';
  for (var i = 0; i < todo.length; i++) {
    var j = todo[i];
    if (LIMIT && made >= LIMIT) { reason = 'Reached --limit ' + LIMIT + '.'; break; }
    if (remaining - spent - j.chars < RESERVE) { reason = 'Stopped before running out of credits (' + (remaining - spent) + ' left, reserve ' + RESERVE + '). Next up was group ' + j.tier + ': ' + j.tierName + '.'; break; }
    try {
      var audio = await tts(j);
      fs.mkdirSync(path.dirname(fileFor(j)), { recursive: true });
      fs.writeFileSync(fileFor(j), audio);
      made++; spent += j.chars;
      console.log('Made ' + FOLDER + '/' + j.style + '/' + j.slug + '   ' + j.say);
      if (made % 10 === 0) { writeManifest(); var c = await credits(); if (c) { remaining = c.limit - c.used; spent = 0; } }
    } catch (e) {
      console.log('Error on "' + j.original + '": ' + e.message);
      if (e.fatal) { reason = 'Stopped: ' + e.message; break; }
    }
    await sleep(150);
  }
  var total = writeManifest();
  console.log('\n' + (reason || 'All clips in the plan are made.') + '\n' + made + ' clips made this run. The manifest lists ' + total + ' clips.');
  var after = await credits();
  if (after) console.log('Credits remaining: ' + (after.limit - after.used) + (after.reset ? ', resets ' + new Date(after.reset * 1000).toLocaleDateString() : ''));
})().catch(function (e) { console.error(e.message); process.exit(1); });
