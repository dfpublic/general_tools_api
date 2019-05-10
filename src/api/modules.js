let express = require('express');
let router = express.Router();
let {logErr} = require('../helpers/general');
router.get('/', (req, res) => {
    let { query } = req;
    console.log({ query });
    res.end('/modules');
});

router.get('/test/:module', (req, res) => {
    let { query, body, url, params } = req;
    console.log({ query, body, url, params });
    res.end('');
})
router.post('/process/:mod', async (req, res) => {
    try {
        let { body, params } = req;
        let { mod } = params || { mod: '' };
        let data = body.data || {};
        if (!mod) {
            logErr(req, `missing param: 'mod'`);
            throw new Error('missing param')
        }
        if (!data) {
            logErr(req, `missing body content: 'data'`);
            throw new Error('missing param')
        }
        let transform = require(`../modules/${mod}/generator.js`);
        let new_data = await transform(data);
        res.end(JSON.stringify({
            new_data
        }));
    }
    catch (err) {
        console.log(err);
        res.end(JSON.stringify({
            errors: ['Server Error: ' + err.message]
        }));
    }
});
module.exports = router;