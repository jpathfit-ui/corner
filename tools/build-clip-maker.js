/* Builds tools/clip-maker.html: one self-contained file you can open by double clicking.
   Run after changing data.js, coach.js, clipjobs.js or clip-maker.src.html:  node tools/build-clip-maker.js */
var fs = require('fs'), path = require('path');
var here = __dirname, root = path.join(here, '..');
var html = fs.readFileSync(path.join(here, 'clip-maker.src.html'), 'utf8');
function inline(src, file) {
  var tag = '<script src="' + src + '"></script>';
  if (html.indexOf(tag) === -1) throw new Error('Missing ' + tag);
  html = html.replace(tag, function () { return '<script>\n' + fs.readFileSync(file, 'utf8').replace(/<\/script>/g, '<\\/script>') + '\n</script>'; });
}
inline('../data.js', path.join(root, 'data.js'));
inline('../coach.js', path.join(root, 'coach.js'));
inline('clipjobs.js', path.join(here, 'clipjobs.js'));
fs.writeFileSync(path.join(here, 'clip-maker.html'), html);
console.log('Wrote tools/clip-maker.html (' + html.length + ' bytes)');
