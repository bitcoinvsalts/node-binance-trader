const envalid = require('envalid')
var pjson = require('./package.json');

module.exports = envalid.cleanEnv(process.env, {
    HOST: envalid.host({ default: 'localhost' }),
    PORT: envalid.port({ default: 4000, desc: 'The port to start the server on' }),
    VERSION: envalid.str({ default: pjson.version }),
    DATABASE_URL: envalid.str(),
    BVA_API_KEY: envalid.str(),
    TELEGRAM_TOKEN: envalid.str(),
    TELEGRAM_CHAT_ID: envalid.num()
})