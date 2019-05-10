let express = require('express');
let cors = require('cors');
let bodyParser = require('body-parser');
let module_router = require('./api/modules');
let router = express.Router();
router.use(cors());
router.use(bodyParser.urlencoded({ 'extended': true }));
router.use(bodyParser.json());
router.use('/modules', module_router);
router.get('/', (req, res) => {
    res.end('tools api')
})
module.exports = router;
