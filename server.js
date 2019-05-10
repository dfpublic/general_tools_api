let express = require('express');
let app = express();
let router = require('./src/router');
app.use(router);
app.listen(3333, () => {
    console.log('server started.');
})
console.log(__dirname);