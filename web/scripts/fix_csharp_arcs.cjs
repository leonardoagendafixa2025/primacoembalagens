const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../web/src/engine/csharpModelsData.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let fixedCount = 0;
const affectedModels = new Set();

for (const [id, m] of Object.entries(data)) {
  const arcs = m.geometry && m.geometry.arcs ? m.geometry.arcs : [];
  arcs.forEach((a, idx) => {
    if (a.r <= 0) return;
    let span = a.endAngle - a.startAngle;
    while (span < 0) span += 360;
    while (span > 360) span -= 360;
    
    // Check if it's a reflex arc > 180° that is NOT a full circle
    if (span > 180.1 && Math.abs(span - 360) > 0.1) {
      let invStart = a.endAngle >= 360 ? a.endAngle - 360 : a.endAngle;
      let invEnd = a.startAngle >= 360 ? a.startAngle - 360 : a.startAngle;
      if (invEnd < invStart) invEnd += 360;

      console.log(`[FIX] ${id} arc ${idx}: [${a.startAngle}° -> ${a.endAngle}°, span=${span.toFixed(1)}°] => [${Number(invStart.toFixed(3))}° -> ${Number(invEnd.toFixed(3))}°, span=${(invEnd - invStart).toFixed(1)}°]`);

      a.startAngle = Number(invStart.toFixed(3));
      a.endAngle = Number(invEnd.toFixed(3));
      fixedCount++;
      affectedModels.add(id);
    }
  });
}

console.log(`\nTotal fixed arcs: ${fixedCount} in ${affectedModels.size} models:`, Array.from(affectedModels));

// Save back formatted
fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Saved updated csharpModelsData.json successfully.');
