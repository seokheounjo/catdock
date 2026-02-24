
const fs = require('fs');
const content = fs.readFileSync(0, 'utf8');
fs.writeFileSync('test-all-final.js', content);
console.log('Written', content.length, 'bytes');
