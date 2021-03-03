// read .env file into proces.env
require("dotenv").config()

const envalid = require("envalid")
var pjson = require("../package.json")

module.exports = envalid.cleanEnv(process.env, {
    BACKTEST_TEST_PAIR: envalid.str({ default: "BTCUSDT" }),
    BINANCE_API_KEY: envalid.str(),
    BINANCE_SECRET_KEY: envalid.str(),
    BVA_API_KEY: envalid.str(),
    CONNECT_SERVER_TO_BVA: envalid.bool({ default: true }),
    DATABASE_CONNECT_VIA_SSL: envalid.bool({ default: false }),
    DATABASE_INSERT_PAIR_HISTORY: envalid.bool({ default: true }),
    DATABASE_URL: envalid.str({
        default:
            "DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres",
    }),
    GMAIL_ADDRESS: envalid.str({ default: "" }),
    GMAIL_APP_PASSWORD: envalid.str({ default: "" }),
    HOST: envalid.host({ default: "localhost" }),
    SERVER_PORT: envalid.port({
        default: 4000,
        desc: "The port to start the server on",
    }),
    STRATEGY_TIMEFRAME: envalid.str({ default: "15m" }),
    TELEGRAM_API_KEY: envalid.str({ default: "" }),
    TELEGRAM_RECEIVER_ID: envalid.str({ default: "" }),
    TRADE_SHORT_ENABLED: envalid.bool({ default: true }),
    TRADER_PORT: envalid.port({
        default: 8003,
        desc: "The port to trader webserver runs",
    }),
    USE_GMAIL: envalid.bool({ default: false }),
    USE_TELEGRAM: envalid.bool({ default: false }),
    VERSION: envalid.str({ default: pjson.version }),
})
