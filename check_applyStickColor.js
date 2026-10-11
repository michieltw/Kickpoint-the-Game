const fs = require('fs');
const mainJs = fs.readFileSync('js/main.js', 'utf8');
const lines = mainJs.split('\n');
lines.forEach((line, i) => {
    if (line.includes('applyStickColor')) {
        console.log(`${i+1}: ${line}`);
    }
});
