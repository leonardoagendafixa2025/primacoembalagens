const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');

function walk(dir) {
  let res = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (['node_modules', '.git', '.gemini'].includes(f)) continue;
      const p = path.join(dir, f);
      const s = fs.statSync(p);
      if (s.isDirectory()) {
        res.push(...walk(p));
      } else {
        const lower = f.toLowerCase();
        if (
          lower.endsWith('.db') ||
          lower.endsWith('.sqlite') ||
          lower.endsWith('.sqlite3') ||
          lower.endsWith('.zip') ||
          lower.includes('picparam') ||
          lower.includes('packlib') ||
          lower.includes('catalog')
        ) {
          res.push({
            relative: path.relative(rootDir, p),
            name: f,
            size: s.size
          });
        }
      }
    }
  } catch (e) {}
  return res;
}

console.log(JSON.stringify(walk(rootDir), null, 2));
