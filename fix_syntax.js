const fs = require('fs');

const filePath = process.argv[2];
let content = fs.readFileSync(filePath, 'utf8');

// The file literally contains strings like \` and \${ because of over-escaping.
// We need to replace them with ` and ${ respectively.
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\${/g, '${');

fs.writeFileSync(filePath, content);
console.log('Fixed syntax errors in server.js');
