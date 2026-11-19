/* Scans audio/<voice>/<style>/<slug>.mp3 and writes audio/manifest.json so the app knows which clips exist.
   Run after adding clips:  node tools/build-manifest.js */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..', 'audio');
var clips = [];

function walk(dir, rel) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name), r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(p, r);
    else if (/\.mp3$/i.test(e.name) && rel.split('/').length === 2) clips.push(r.replace(/\.mp3$/i, ''));
  });
}
walk(root, '');
clips.sort();
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ clips: clips }, null, 1));
console.log('Clips listed:', clips.length);
