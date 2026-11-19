/* Lists every phrase the coach can say, so voice clips can be generated in one batch.
   Run:  node tools/list-phrases.js
   Writes tools/phrases.json and tools/phrases.csv. Each row is one clip per voice per delivery style. */
var fs = require('fs'), path = require('path');
var D = require('../data.js'), C = require('../coach.js');

var phrases = {};
function add(text, kind) {
  var slug = D.slug(text);
  if (!phrases[slug]) phrases[slug] = { slug: slug, text: text, kind: kind };
}

D.defaultPrompts().forEach(function (p) { add(p.text, p.category); });

// Fixed calls. Round numbers are expanded so every spoken round has a clip.
var calls = D.DEFAULT_CALLS;
['ready', 'first', 'last', 'recovery', 'thirty', 'warn', 'complete'].forEach(function (k) { add(calls[k], 'call'); });
for (var n = 1; n <= 30; n++) {
  add(C.fillCall(calls.round, n), 'call');
  add(C.fillCall(calls.free, n), 'call');
}

var list = Object.keys(phrases).map(function (k) { return phrases[k]; });
var styles = D.STYLES.map(function (s) { return s.id; });
var voices = D.VOICES.map(function (v) { return v.id; });

fs.writeFileSync(path.join(__dirname, 'phrases.json'), JSON.stringify({ voices: voices, styles: styles, phrases: list }, null, 2));
var csv = ['slug,text,kind'].concat(list.map(function (p) { return p.slug + ',"' + p.text.replace(/"/g, '""') + '",' + p.kind; }));
fs.writeFileSync(path.join(__dirname, 'phrases.csv'), csv.join('\n') + '\n');

console.log('Unique phrases:', list.length);
console.log('Delivery styles:', styles.join(', '));
console.log('Voices:', voices.join(', '));
console.log('Clips for one voice, all styles:', list.length * styles.length);
console.log('Clips for both coaches, all styles:', list.length * styles.length * voices.length);
console.log('Suggested start: one male and one female voice, firm style only =', list.length * 2, 'clips');
