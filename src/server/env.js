// read .env file into proces.env
require("dotenv").config()

const envalid = require("envalid")
var packageJson = require("../../package.json")

module.exports = envalid.cleanEnv(process.env, {
    BACKTEST_TEST_PAIR: envalid.str({ default: "BTCUSDT" }),
    BVA_API_KEY: envalid.str(),
    CONNECT_SERVER_TO_BVA: envalid.bool({ default: true }),
    DATABASE_CONNECT_VIA_SSL: envalid.bool({ default: false }),
    DATABASE_INSERT_PAIR_HISTORY: envalid.bool({ default: true }),
    DATABASE_URL: envalid.str({
        default:
            "DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres",
    }),
    SERVER_PORT: envalid.port({
        default: 4000,
        desc: "The port to start the server on",
    }),
    STRATEGY_TIMEFRAME: envalid.str({ default: "15m" }),
    VERSION: envalid.str({ default: packageJson.version }),
})
