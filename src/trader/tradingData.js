const axios = require("axios")
const { bnb_client } = require("./binanceClient")
const env = require('../env');
const bva_key = env.BVA_API_KEY

const tradingData = {
    trading_pairs: {},
    open_trades: {},
    trading_types: {},
    trading_qty: {},
    buy_prices: {},
    sell_prices: {},
    user_payload: [],
    available_balances: [],
    minimums: {},
    margin_pairs: [],
}


async function UpdateOpenTrades() {
    return new Promise((resolve, reject) => {
        // Retrieve previous open trades //
        axios
            .get(
                "https://bitcoinvsaltcoins.com/api/useropentradedsignals?key=" +
                bva_key,
            )
            .then((response) => {
                response.data.rows.map((s) => {
                    tradingData.trading_pairs[s.pair + s.stratid] = true
                    tradingData.open_trades[s.pair + s.stratid] = !s.stopped
                    tradingData.trading_types[s.pair + s.stratid] = s.type
                    tradingData.trading_qty[s.pair + s.stratid] = s.qty
                    tradingData.buy_prices[s.pair + s.stratid] = new BigNumber(s.buy_price)
                    tradingData.sell_prices[s.pair + s.stratid] = new BigNumber(
                        s.sell_price,
                    )
                })
                console.log("Open Trades #:", _.values(tradingData.trading_pairs).length)
                console.log("Open Trades:", tradingData.trading_pairs)
                resolve(true)
            })
            .catch((e) => {
                console.log("ERROR UpdateOpenTrades", e.response.data)
                return reject(false)
            })
    })
}

async function updateExchangeInfo() {
    return new Promise((resolve, reject) => {
        bnb_client.exchangeInfo((error, data) => {
            if (error !== null) {
                console.log(error)
                return reject(error)
            }
            for (let obj of data.symbols) {
                let filters = { status: obj.status }
                for (let filter of obj.filters) {
                    if (filter.filterType == "MIN_NOTIONAL") {
                        filters.minNotional = filter.minNotional
                    } else if (filter.filterType == "PRICE_FILTER") {
                        filters.minPrice = filter.minPrice
                        filters.maxPrice = filter.maxPrice
                        filters.tickSize = filter.tickSize
                    } else if (filter.filterType == "LOT_SIZE") {
                        filters.stepSize = filter.stepSize
                        filters.minQty = filter.minQty
                        filters.maxQty = filter.maxQty
                    }
                }
                filters.orderTypes = obj.orderTypes
                filters.icebergAllowed = obj.icebergAllowed
                tradingData.minimums[obj.symbol] = filters
            }
            console.log(`Exchange minimums:`, Object.keys(tradingData.minimums))
            resolve(true)
        })
    })
}

//Get Binace Spot Balance
async function BalancesInfo() {
    return new Promise((resolve, reject) => {
        bnb_client.balance((error, balances) => {
            if (error) console.error(error)
            console.log("LOADING BINANCE SPOT BALANCE")
            for (let asset in balances) {
                if (balances[asset].available > 0.0) {
                    tradingData.available_balances.push({
                        asset: asset,
                        available: balances[asset].available,
                        onOrder: balances[asset].onOrder,
                    })
                }
            }
            console.log("DONE", tradingData.available_balances)
            resolve(true)
        })
    })
}

const clearSignalData = signal => {
    delete tradingData.trading_pairs[signal.pair + signal.stratid]
    delete tradingData.trading_types[signal.pair + signal.stratid]
    delete tradingData.sell_prices[signal.pair + signal.stratid]
    delete tradingData.buy_prices[signal.pair + signal.stratid]
    delete tradingData.trading_qty[signal.pair + signal.stratid]
    delete tradingData.open_trades[signal.pair + signal.stratid]
}

function addLongPosition(signal, qty) {
    tradingData.trading_pairs[signal.pair + signal.stratid] = true
    tradingData.trading_types[signal.pair + signal.stratid] = "LONG"
    tradingData.open_trades[signal.pair + signal.stratid] = true
    tradingData.trading_qty[signal.pair + signal.stratid] = Number(qty)
}

const UpdateMarginPairs = async () => new Promise((resolve, reject) => {
    axios
        .get(
            "https://www.binance.com/gateway-api/v1/friendly/margin/symbols",
        )
        .then((res) => {
            let list = res.data.data.map((obj) => obj.symbol)
            tradingData.margin_pairs = list.sort()
            console.log("Margin Pairs:", tradingData.margin_pairs)
            resolve(tradingData.margin_pairs)
        })
        .catch((e) => {
            console.log("ERROR UpdateMarginPairs", e.response.data)
            return reject(e.response.data)
        })
})

module.exports = {
    tradingData,
    updateExchangeInfo,
    clearSignalData,
    addLongPosition,
    UpdateMarginPairs,
    UpdateOpenTrades
}
