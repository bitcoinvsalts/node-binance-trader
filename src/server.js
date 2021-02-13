const express = require("express")
const io_client = require("socket.io-client")
const path = require("path")
const binance = require("binance-api-node").default
const moment = require("moment")
const BigNumber = require("bignumber.js")
const _ = require("lodash")
const tulind = require("tulind")
const axios = require("axios")
const { Client } = require("pg")
const env = require("./env")

const PORT = env.SERVER_PORT
const INDEX = path.join(__dirname, "index.html")

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
//         PLEASE EDIT THE FOLLOWING VARIABLES JUST BELOW
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

const insert_into_db = env.DATABASE_INSERT_PAIR_HISTORY
const pg_connectionString = env.DATABASE_URL
const pg_connectionSSL = env.DATABASE_CONNECT_VIA_SSL

// to monitor your strategy you can send your buy and sell signals to http://bitcoinvsaltcoins.com
const send_signal_to_bva = env.CONNECT_SERVER_TO_BVA
const bva_key = env.BVA_API_KEY

const wait_time = 800
const timeframe = env.STRATEGY_TIMEFRAME

const nbt_vers = env.VERSION

const pairs = ["BTCUSDT"] //, 'ETHBTC', 'XRPBTC', 'XRPETH']

const stratname = "DEMO STRATS"

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

console.log("insert_into_db: ", insert_into_db)
console.log("send_signal_to_bva: ", send_signal_to_bva)

/////////////////////

let pairData = {}
let openSignals = {}

const nbt_prefix = "nbt_"
const interv_time = 10000

/////////////////////////////////////////////////////////////////////////////////

let socket_client = {}
if (send_signal_to_bva) {
    console.log("Connection to NBT HUB...")
    // retrieve previous open signals from HUB
    axios
        .get("https://bitcoinvsaltcoins.com/api/useropensignals?key=" + bva_key)
        .then((response) => {
            response.data.rows.map((s) => {
                openSignals[s.pair + s.stratname.replace(/\s+/g, "")] = {
                    buy_price: BigNumber(s.buy_price),
                    sell_price: BigNumber(s.sell_price),
                    stop_profit: Number(s.stop_profit),
                    stop_loss: Number(s.stop_loss),
                    type: s.type,
                }
            })
            console.log("Open Trades:", _.values(openSignals).length)
            console.log(_.keys(openSignals))
        })
        .catch((e) => {
            console.log("ERROR 8665")
            console.log(e.response.data)
        })
    // create a socket client connection to send your signals to NBT Hub (http://bitcoinvsaltcoins.com)
    socket_client = io_client("https://nbt-hub.herokuapp.com", {
        query: "v=" + nbt_vers + "&type=server&key=" + bva_key,
    })
}

//////////////////////////////////////////////////////////////////////////////////

let pg_client
if (insert_into_db && pg_connectionString) {
    console.log("Connecting to the Postgresql db...")
    pg_client = new Client({
        ssl: pg_connectionSSL,
        connectionString: pg_connectionString,
    })
    pg_client.connect()
}

//////////////////////////////////////////////////////////////////////////////////

const server = express()
    .use((req, res) => res.sendFile(INDEX))
    .listen(PORT, () => console.log(`NBT server running on port ${PORT}`))

//////////////////////////////////////////////////////////////////////////////////

const binance_client = binance()

//////////////////////////////////////////////////////////////////////////////////

async function run() {
    console.log(" ")
    console.log("Total pairs: " + pairs.length)
    console.log(" ")
    console.log(JSON.stringify(pairs))
    console.log(" ")
    await sleep(wait_time)
    await trackData()
}

//////////////////////////////////////////////////////////////////////////////////

async function trackData() {
    console.log("----")
    for (var i = 0, len = pairs.length; i < len; i++) {
        console.log("--> " + pairs[i])
        if (insert_into_db) await createPgPairTable(pairs[i])
        await trackPairData(pairs[i])
        await sleep(wait_time) //let's be safe with the api biance calls
    }
    console.log("----")
}

function addCandle(pair, candle) {
    pairData[pair].candle_opens.push(Number(candle.open))
    pairData[pair].candle_closes.push(Number(candle.close))
    pairData[pair].candle_lows.push(Number(candle.low))
    pairData[pair].candle_highs.push(Number(candle.high))
    pairData[pair].candle_volumes.push(Number(candle.volume))
}

function updateLastCandle(pair, candle) {
    let index = pairData[pair].candle_opens.length - 1
    pairData[pair].candle_opens[index] = Number(candle.open)
    pairData[pair].candle_closes[index] = Number(candle.close)
    pairData[pair].candle_lows[index] = Number(candle.low)
    pairData[pair].candle_highs[index] = Number(candle.high)
    pairData[pair].candle_volumes[index] = Number(candle.volume)
}

function initPairData(pair) {
    pairData[pair] = {}

    // price info
    pairData[pair].price = BigNumber(0)
    pairData[pair].prev_price = BigNumber(0)

    // depth data
    pairData[pair].sum_bids = BigNumber(0)
    pairData[pair].sum_asks = BigNumber(0)
    pairData[pair].first_bid_qty = BigNumber(0)
    pairData[pair].first_ask_qty = BigNumber(0)
    pairData[pair].first_bid_price = BigNumber(0)
    pairData[pair].first_ask_price = BigNumber(0)

    pairData[pair].volumes = []
    pairData[pair].makers = []
    pairData[pair].trades = []

    // candle data
    pairData[pair].candle_opens = []
    pairData[pair].candle_closes = []
    pairData[pair].candle_highs = []
    pairData[pair].candle_lows = []
    pairData[pair].candle_volumes = []
    pairData[pair].interv_vols_sum = []

    // indicator data
    pairData[pair].srsi = null
}

async function trackPairData(pair) {
    initPairData(pair)

    // get start candles
    const candles = await binance_client.candles({
        symbol: pair,
        interval: timeframe,
    })
    for (var i = 0, len = candles.length; i < len; i++) {
        addCandle(pair, candles[i])
    }
    await sleep(wait_time)
    // setup candle websocket
    const candlesWs = binance_client.ws.candles(
        pair,
        timeframe,
        async (candle) => {
            updateLastCandle(pair, candle)
            if (candle.isFinal) {
                addCandle(pair, candle)
            }

            try {
                await tulind.indicators.stochrsi
                    .indicator([pairData[pair].candle_closes], [100])
                    .then((results) => {
                        pairData[pair].srsi = BigNumber(
                            results[0][results[0].length - 1] * 100
                        )
                    })
            } catch (e) {
                console.log(pair, "SRSI ERROR!!!")
                pairData[pair].srsi = null
            }
        }
    )

    await sleep(wait_time)

    // setup depth websocket
    const depthWs = binance_client.ws.partialDepth(
        { symbol: pair, level: 10 },
        (depth) => {
            pairData[pair].sum_bids = _.sumBy(depth.bids, (o) => {
                return Number(o.quantity)
            })
            pairData[pair].sum_asks = _.sumBy(depth.asks, (o) => {
                return Number(o.quantity)
            })

            pairData[pair].first_bid_qty = BigNumber(depth.bids[0].quantity)
            pairData[pair].first_ask_qty = BigNumber(depth.asks[0].quantity)
            pairData[pair].first_bid_price = BigNumber(depth.bids[0].price)
            pairData[pair].first_ask_price = BigNumber(depth.asks[0].price)
        }
    )

    await sleep(wait_time)

    // setup trade  (1 per second)
    const tradesWs = binance_client.ws.trades([pair], (trade) => {
        pairData[pair].price = BigNumber(trade.price)
        pairData[pair].volumes.unshift({
            timestamp: Date.now(),
            volume: parseFloat(trade.quantity),
        })
        pairData[pair].makers.unshift({
            timestamp: Date.now(),
            maker: trade.maker,
        })
    })

    // loop to create signals (& save values to db)
    setInterval(async () => {
        let depth_report = ""

        const last_sum_bids_bn = BigNumber(pairData[pair].sum_bids)
        const last_sum_asks_bn = BigNumber(pairData[pair].sum_asks)

        if (last_sum_bids_bn.isLessThan(last_sum_asks_bn)) {
            depth_report =
                "-" +
                last_sum_asks_bn
                    .dividedBy(last_sum_bids_bn)
                    .decimalPlaces(2)
                    .toString()
        } else {
            depth_report =
                "+" +
                last_sum_bids_bn
                    .dividedBy(last_sum_asks_bn)
                    .decimalPlaces(2)
                    .toString()
        }

        // calculate some extra values which depend on others
        pairData[pair].interv_vols_sum.push(
            Number(_.sumBy(pairData[pair].volumes, "volume"))
        )
        pairData[pair].trades.push(pairData[pair].volumes.length)

        const makers_count = BigNumber(
            _.filter(pairData[pair].makers, (o) => {
                if (o.maker) return o
            }).length
        )
        const makers_total = BigNumber(pairData[pair].makers.length)
        const maker_ratio =
            makers_count > 0
                ? makers_count.dividedBy(makers_total).times(100)
                : BigNumber(0)

        // if data ready
        if (
            pairData[pair].price.isGreaterThan(0) &&
            pairData[pair].candle_closes.length &&
            last_sum_bids_bn.isGreaterThan(0) &&
            last_sum_asks_bn.isGreaterThan(0) &&
            pairData[pair].interv_vols_sum.length &&
            pairData[pair].first_bid_price > 0 &&
            pairData[pair].first_ask_price > 0
        ) {
            const price_open = Number(
                pairData[pair].candle_opens[
                    pairData[pair].candle_opens.length - 1
                ]
            )
            const price_high = Number(
                pairData[pair].candle_highs[
                    pairData[pair].candle_highs.length - 1
                ]
            )
            const price_low = Number(
                pairData[pair].candle_lows[
                    pairData[pair].candle_lows.length - 1
                ]
            )
            const price_last = Number(
                pairData[pair].candle_closes[
                    pairData[pair].candle_closes.length - 1
                ]
            )

            const first_ask_price = pairData[pair].first_ask_price
            const first_bid_price = pairData[pair].first_bid_price

            // DATABASE INSERT
            if (insert_into_db) {
                const insert_values = [
                    Date.now(),
                    moment(Date.now()).format(),
                    Number(pairData[pair].price.toString()),
                    price_open,
                    price_high,
                    price_low,
                    price_last,
                    pairData[pair].interv_vols_sum[
                        pairData[pair].interv_vols_sum.length - 1
                    ],
                    pairData[pair].trades[pairData[pair].trades.length - 1],
                    Number(maker_ratio.decimalPlaces(2).toString()),
                    Number(depth_report),
                    Number(last_sum_bids_bn),
                    Number(last_sum_asks_bn),
                    Number(pairData[pair].first_bid_price),
                    Number(pairData[pair].first_ask_price),
                    Number(pairData[pair].first_bid_qty),
                    Number(pairData[pair].first_ask_qty),
                    pairData[pair].srsi === null
                        ? null
                        : Number(
                              pairData[pair].srsi.decimalPlaces(2).toString()
                          ),
                ]
                const insert_query =
                    "INSERT INTO " +
                    nbt_prefix +
                    pair +
                    "(eventtime, datetime, price, candle_open, candle_high, candle_low, candle_close, sum_interv_vols, trades, makers_count, depth_report, sum_bids, sum_asks, first_bid_price, first_ask_price, first_bid_qty, first_ask_qty, srsi)" +
                    " VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING * "
                pg_client
                    .query(insert_query, insert_values)
                    .then((res) => {})
                    .catch((e) => {
                        console.log(e)
                    })
            }

            const signal_key = stratname.replace(/\s+/g, "")

            //////// SIGNAL CONDITION ///////
            let signalCheck = await checkSignal(pair)

            if (signalCheck && !openSignals[pair + signal_key]) {
                const signal = {
                    key: bva_key,
                    stratname: stratname,
                    pair: pair,
                    stop_loss: signalCheck.stopLoss,
                    stop_profit: signalCheck.takeProfit,
                }

                // store signal
                const openSignal = {
                    type: signalCheck.isBuy ? "LONG" : "SHORT",
                    stop_loss: signal.stop_loss,
                    stop_profit: signal.stop_profit,
                }

                if (openSignal.type === "LONG") {
                    signal.buy_price = Number(first_ask_price)
                    openSignal.buy_price = Number(first_ask_price)
                } else {
                    signal.sell_price = Number(first_bid_price)
                    openSignal.sell_price = Number(first_bid_price)
                }

                console.log("OPEN", openSignal.type, signal)

                if (send_signal_to_bva) {
                    socket_client.emit(
                        openSignal.type === "LONG"
                            ? "buy_signal"
                            : "sell_signal",
                        signal
                    )
                }

                // store open signal
                openSignals[pair + signal_key] = openSignal
            } else if (openSignals[pair + signal_key]) {
                // check if needs to be closed
                const openSignal = openSignals[pair + signal_key]

                const pnl =
                    openSignal.type === "LONG"
                        ? first_bid_price
                              .minus(openSignal.buy_price)
                              .times(100)
                              .dividedBy(openSignal.buy_price)
                        : BigNumber(openSignal.sell_price)
                              .minus(first_ask_price)
                              .times(100)
                              .dividedBy(openSignal.sell_price)

                if (
                    pnl.isLessThan(openSignals[pair + signal_key].stop_loss) ||
                    pnl.isGreaterThan(
                        openSignals[pair + signal_key].stop_profit
                    )
                ) {
                    const signal = {
                        key: bva_key,
                        stratname: stratname,
                        pair: pair,
                    }

                    if (openSignal.type === "LONG") {
                        signal.sell_price = Number(first_bid_price)
                    } else {
                        signal.buy_price = Number(first_ask_price)
                    }

                    console.log("CLOSE", openSignal.type, signal)

                    if (send_signal_to_bva) {
                        socket_client.emit(
                            openSignal.type === "LONG"
                                ? "sell_signal"
                                : "buy_signal",
                            signal
                        )
                    }

                    // remove open signal
                    delete openSignals[pair + signal_key]
                }
            }

            pairData[pair].prev_price = price_last
        }

        // clean up arrays...
        pairData[pair].makers = _.filter(pairData[pair].makers, (v) => {
            return v.timestamp >= Date.now() - interv_time
        })
        pairData[pair].volumes = _.filter(pairData[pair].volumes, (v) => {
            return v.timestamp >= Date.now() - interv_time
        })
        pairData[pair].candle_opens = pairData[pair].candle_opens.slice(
            pairData[pair].candle_opens.length - 10000,
            10000
        )
        pairData[pair].candle_closes = pairData[pair].candle_closes.slice(
            pairData[pair].candle_closes.length - 10000,
            10000
        )
        pairData[pair].candle_highs = pairData[pair].candle_highs.slice(
            pairData[pair].candle_highs.length - 10000,
            10000
        )
        pairData[pair].candle_lows = pairData[pair].candle_lows.slice(
            pairData[pair].candle_lows.length - 10000,
            10000
        )
        pairData[pair].candle_volumes = pairData[pair].candle_volumes.slice(
            pairData[pair].candle_volumes.length - 10000,
            10000
        )
        pairData[pair].interv_vols_sum = pairData[pair].interv_vols_sum.slice(
            pairData[pair].interv_vols_sum.length - 10000,
            10000
        )
        pairData[pair].trades = pairData[pair].trades.slice(
            pairData[pair].trades.length - 10000,
            10000
        )
    }, 1000)
}

/////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////// SIGNAL DECLARATION - START /////////////////////////////////
//////////////////////////////// THIS IS WHERE YOU CODE YOUR STRATEGY ///////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////
async function checkSignal(pair) {
    try {
        let rsi = await tulind.indicators.stochrsi.indicator(
            [pairData[pair].candle_closes],
            [14]
        )
        let rsiLatest = rsi[0][rsi[0].length - 1]

        let macd = await tulind.indicators.macd.indicator(
            [pairData[pair].candle_closes],
            [12, 26, 9]
        )

        let macdOldest = macd[2][macd[2].length - 3]
        let macdOlder = macd[2][macd[2].length - 2]
        let macdNewest = macd[2][macd[2].length - 1]

        if (
            macdNewest >= 0 &&
            macdOlder < 0 &&
            macdOldest < 0 &&
            rsiLatest < 0.3
        ) {
            return { isBuy: true, takeProfit: 1, stopLoss: -1 }
        }
        if (
            macdNewest < 0 &&
            macdOlder >= 0 &&
            macdOldest >= 0 &&
            rsiLatest > 0.7
        ) {
            return { isBuy: false, takeProfit: 1, stopLoss: -1 }
        }
    } catch (e) {
        console.log(e)
    }
    return null
}
///////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////// SIGNAL DECLARATION - END /////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

async function createPgPairTable(pair) {
    return pg_client
        .query(
            "CREATE TABLE " +
                nbt_prefix +
                pair +
                "(id bigserial primary key, eventtime bigint NOT NULL, datetime varchar(200), price decimal, candle_open decimal, candle_high decimal, candle_low decimal, candle_close decimal, sum_interv_vols decimal, trades integer, makers_count real, depth_report decimal, sum_bids real, sum_asks real, first_bid_price decimal, first_ask_price decimal, first_bid_qty decimal, first_ask_qty decimal, srsi real)"
        )
        .then((res) => {
            console.log("TABLE " + nbt_prefix + pair + " CREATION SUCCESS")
        })
        .catch((e) => {
            //console.log(e)
        })
}

sleep = (x) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(true)
        }, x)
    })
}

run()
