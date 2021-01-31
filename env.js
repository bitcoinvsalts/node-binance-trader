// read .env file into proces.env
require('dotenv').config()

const envalid = require('envalid')
var pjson = require('./package.json');

module.exports = envalid.cleanEnv(process.env, {
    BACKTEST_TEST_PAIR: envalid.str({default: 'BTCUSDT'}),
    BINANCE_API_KEY: envalid.str(),
    BINANCE_SECRET_KEY: envalid.str(),
    BVA_API_KEY: envalid.str(),
    CONNECT_SERVER_TO_BVA: envalid.bool({ default: true }),
    DATABASE_CONNECT_VIA_SSL: envalid.bool({ default: false }),
    DATABASE_INSERT_PAIR_HISTORY:  envalid.bool({ default: true}),
    DATABASE_URL: envalid.str({default: 'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres'}),
    HOST: envalid.host({ default: 'localhost' }),
    SERVER_PORT: envalid.port({ default: 4000, desc: 'The port to start the server on' }),
    TRADER_PORT: envalid.port({ default: 8003, desc: 'The port to trader webserver runs' }),
    STRATEGY_TIMEFRAME: envalid.str({default:'15m'}),
    VERSION: envalid.str({ default: pjson.version }),
})
