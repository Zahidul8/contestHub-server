const fs = require('fs');
const key = fs.readFileSync('./contesthub-project-666ef-firebase-adminsdk-key.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)