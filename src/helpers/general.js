module.exports.logErr = function (req, message = '', data = {}) {
    let { query, body, url, params } = req;
    console.error({
        message,
        req: { query, body, url, params },
        data
    })
}