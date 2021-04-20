const Binance = require("node-binance-api")
const env = require('../env')
const bnb_client = new Binance().options({
    APIKEY: env.BINANCE_API_KEY,
    APISECRET: env.BINANCE_API_SECRET,
})

module.exports = {
    bnb_client
}
