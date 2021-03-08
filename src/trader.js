const express = require("express")
const io = require("socket.io-client")
const _ = require("lodash")
const colors = require("colors")
const BigNumber = require("bignumber.js")
const axios = require("axios")
const Binance = require("node-binance-api")
const env = require("./env")
const Task = require("./utils/task")
const TradeQueue = require("./trade-queue")

const bva_key = env.BVA_API_KEY
const tradeQueue = new TradeQueue()
const tradeShortEnabled = env.TRADE_SHORT_ENABLED
tradeQueue.startQueue()

//////////////////////////////////////////////////////////////////////////////////
//         VARIABLES TO KEEP TRACK OF BOT POSITIONS AND ACTIVITY
//////////////////////////////////////////////////////////////////////////////////

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

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

const app = express()
app.get("/", (req, res) => res.send(""))
app.listen(env.TRADER_PORT, () => console.log("NBT auto trader running.".grey))

const notifier = require('./notifiers')(tradingData.trading_pairs)

//////////////////////////////////////////////////////////////////////////////////

const bnb_client = new Binance().options({
    APIKEY: env.BINANCE_API_KEY,
    APISECRET: env.BINANCE_SECRET_KEY,
})

//////////////////////////////////////////////////////////////////////////////////

const nbt_vers = env.VERSION
const socket = io("https://nbt-hub.herokuapp.com", {
    query: "v=" + nbt_vers + "&type=client&key=" + bva_key,
})

socket.on("connect", () => {
    console.log("Auto Trader connected.".grey)
})

socket.on("disconnect", () => {
    console.log("Auto Trader disconnected.".grey)
})

socket.on("message", (message) => {
    console.log(colors.magenta("NBT Message: " + message))
})

socket.on("buy_signal", async (signal) => {
    const tresult = _.findIndex(
        tradingData.user_payload,
        (o) => o.stratid == signal.stratid
    )
    if (tresult > -1) {
        if (!tradingData.trading_pairs[signal.pair + signal.stratid] && signal.new) {
            console.log(
                colors.grey(
                    "BUY_SIGNAL :: ENTER LONG TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            //notify
            notifier.notifyEnterLongSignal(signal)

            console.log(
                signal.pair,
                " ===> BUY",
                signal.price,
                Number(tradingData.user_payload[tresult].buy_amount)
            )

            const alt = signal.pair.replace("BTC", "")
            if (tradingData.minimums[alt + "BTC"] && tradingData.minimums[alt + "BTC"].minQty) {
                const buy_amount = new BigNumber(
                    tradingData.user_payload[tresult].buy_amount
                )
                const btc_qty = buy_amount.dividedBy(signal.price)
                const qty = bnb_client.roundStep(
                    btc_qty,
                    tradingData.minimums[alt + "BTC"].stepSize
                )
                console.log("Market Buy ==> " + qty + " - " + alt + "BTC")
                ////
                const traded_buy_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: tradingData.user_payload[tresult].trading_type,
                    pair: signal.pair,
                    qty: qty,
                }
                ////
                if (tradingData.user_payload[tresult].trading_type === "real") {
                    if (tradingData.margin_pairs.includes(alt + "BTC")) {
                        const job = async () => {
                            return new Promise((resolve, reject) => {
                                bnb_client.mgMarketBuy(
                                    alt + "BTC",
                                    Number(qty),
                                    (error, response) => {
                                        if (error) {
                                            console.log("ERROR 3355333", error.body)
                                            reject(error)
                                            return
                                        }

                                        //////
                                        tradingData.trading_pairs[signal.pair + signal.stratid] = true
                                        tradingData.trading_types[signal.pair + signal.stratid] = "LONG"
                                        tradingData.open_trades[signal.pair + signal.stratid] = true
                                        tradingData.trading_qty[signal.pair + signal.stratid] = Number(qty)
                                        //////

                                        console.log("SUCCESS 222444222")
                                        socket.emit(
                                            "traded_buy_signal",
                                            traded_buy_signal
                                        )
                                        notifier.notifyEnterLongTraded(signal)
                                        resolve(true)
                                    }
                                )
                            })
                        }

                        const task = new Task(job)
                        tradeQueue.addToQueue(task)
                    } else {
                        const job = async () => {
                            return new Promise((resolve, reject) => {
                                bnb_client.marketBuy(
                                    alt + "BTC",
                                    Number(qty),
                                    (error, response) => {
                                        if (error) {
                                            console.log(
                                                "ERROR 7991117 marketBuy",
                                                alt + "BTC",
                                                Number(qty),
                                                error.body
                                            )
                                            reject(error)
                                            return
                                        }

                                        //////
                                        tradingData.trading_pairs[signal.pair + signal.stratid] = true
                                        tradingData.trading_types[signal.pair + signal.stratid] = "LONG"
                                        tradingData.open_trades[signal.pair + signal.stratid] = true
                                        tradingData.trading_qty[signal.pair + signal.stratid] = Number(qty)
                                        //////

                                        console.log(
                                            "SUCESS 99111 marketBuy",
                                            alt + "BTC",
                                            Number(qty)
                                        )
                                        socket.emit(
                                            "traded_buy_signal",
                                            traded_buy_signal
                                        )
                                        notifier.notifyEnterLongTraded(signal)
                                        resolve(true)
                                    }
                                )
                            })
                        }

                        const task = new Task(job)
                        tradeQueue.addToQueue(task)
                    }
                } else {
                    // VIRTUAL TRADE

                    //////
                    tradingData.trading_pairs[signal.pair + signal.stratid] = true
                    tradingData.trading_types[signal.pair + signal.stratid] = "LONG"
                    tradingData.open_trades[signal.pair + signal.stratid] = true
                    tradingData.trading_qty[signal.pair + signal.stratid] = Number(qty)
                    //////

                    socket.emit("traded_buy_signal", traded_buy_signal)
                    notifier.notifyEnterLongTraded(signal)
                }
            } else {
                console.log("PAIR UNKNOWN", alt)
            }
            //////
        } else if (
            tradeShortEnabled &&
            tradingData.trading_types[signal.pair + signal.stratid] === "SHORT" &&
            tradingData.trading_qty[signal.pair + signal.stratid] &&
            !signal.new &&
            tradingData.open_trades[signal.pair + signal.stratid]
        ) {
            console.log(
                colors.grey(
                    "BUY_SIGNAL :: BUY TO COVER SHORT TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            //notify
            notifier.notifyBuyToCoverSignal(signal)
            //////
            console.log(
                signal.pair,
                " ---> BUY",
                Number(tradingData.trading_qty[signal.pair + signal.stratid])
            )

            const alt = signal.pair.replace("BTC", "")
            if (tradingData.minimums[alt + "BTC"].minQty) {
                const qty = Number(
                    tradingData.trading_qty[signal.pair + signal.stratid]
                )
                console.log(
                    "QTY ====mgMarketBuy===> " + qty + " - " + alt + "BTC"
                )
                /////
                const traded_buy_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: tradingData.user_payload[tresult].trading_type,
                    pair: signal.pair,
                    qty: qty,
                }
                /////
                if (tradingData.user_payload[tresult].trading_type === "real") {
                    const job = async () => {
                        return new Promise((resolve, reject) => {
                            bnb_client.mgMarketBuy(
                                alt + "BTC",
                                Number(qty),
                                (error, response) => {
                                    if (error) {
                                        console.log(
                                            "ERROR 6 ",
                                            alt,
                                            Number(qty),
                                            error.body
                                        )

                                        reject(error)
                                        return
                                    }

                                    //////
                                    delete tradingData.trading_pairs[signal.pair + signal.stratid]
                                    delete tradingData.trading_types[signal.pair + signal.stratid]
                                    delete tradingData.buy_prices[signal.pair + signal.stratid]
                                    delete tradingData.sell_prices[signal.pair + signal.stratid]
                                    delete tradingData.trading_qty[signal.pair + signal.stratid]
                                    delete tradingData.open_trades[signal.pair + signal.stratid]
                                    //////

                                    socket.emit(
                                        "traded_buy_signal",
                                        traded_buy_signal
                                    )
                                    notifier.notifyBuyToCoverTraded(signal)

                                    console.log("---+-- mgRepay ---+--")
                                    bnb_client.mgRepay(
                                        alt,
                                        Number(qty),
                                        (error, response) => {
                                            if (error) {
                                                console.log(
                                                    "ERROR 244343333",
                                                    alt,
                                                    Number(qty),
                                                    error.body
                                                )

                                                reject(error)
                                                return
                                            }
                                            console.log("SUCCESS 333342111")

                                            resolve(true)
                                        }
                                    )
                                }
                            )
                        })
                    }

                    const task = new Task(job)
                    tradeQueue.addToQueue(task)
                } else {
                    // VIRTUAL TRADE

                    //////
                    delete tradingData.trading_pairs[signal.pair + signal.stratid]
                    delete tradingData.trading_types[signal.pair + signal.stratid]
                    delete tradingData.buy_prices[signal.pair + signal.stratid]
                    delete tradingData.sell_prices[signal.pair + signal.stratid]
                    delete tradingData.trading_qty[signal.pair + signal.stratid]
                    delete tradingData.open_trades[signal.pair + signal.stratid]
                    //////

                    socket.emit("traded_buy_signal", traded_buy_signal)
                    notifier.notifyBuyToCoverTraded(signal)
                }
            } else {
                console.log("PAIR UNKNOWN", alt)
            }
        } else {
            console.log(
                "BUY AGAIN",
                JSON.stringify(signal),
                tradingData.trading_types[signal.pair + signal.stratid]
            )
        }
    }
})

socket.on("sell_signal", async (signal) => {
    const tresult = _.findIndex(tradingData.user_payload, (o) => {
        return o.stratid == signal.stratid
    })
    if (tresult > -1) {
        if (tradeShortEnabled && !tradingData.trading_pairs[signal.pair + signal.stratid] && signal.new) {
            console.log(
                colors.grey(
                    "SELL_SIGNAL :: ENTER SHORT TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            //notify
            notifier.notifyEnterShortSignal(signal)

            console.log(
                signal.pair,
                " ===> SELL",
                signal.price,
                Number(tradingData.user_payload[tresult].buy_amount)
            )

            console.log("const alt = signal.pair.replace('BTC', '')")
            const alt = signal.pair.replace("BTC", "")
            if (tradingData.minimums[alt + "BTC"] && tradingData.minimums[alt + "BTC"].minQty) {
                const buy_amount = new BigNumber(
                    tradingData.user_payload[tresult].buy_amount
                )
                const btc_qty = buy_amount.dividedBy(signal.price)
                const qty = bnb_client.roundStep(
                    btc_qty,
                    tradingData.minimums[alt + "BTC"].stepSize
                )
                console.log(
                    "QTY ===mgBorrow===> " + qty + " - " + alt + "BTC"
                )
                const traded_sell_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: tradingData.user_payload[tresult].trading_type,
                    pair: signal.pair,
                    qty: qty,
                }

                if (tradingData.user_payload[tresult].trading_type === "real") {
                    const job = async () => {
                        return new Promise((resolve, reject) => {
                            bnb_client.mgBorrow(
                                alt,
                                Number(qty),
                                (error, response) => {
                                    if (error) {
                                        console.log(
                                            "ERROR 55555555555",
                                            alt,
                                            Number(qty),
                                            JSON.stringify(error)
                                        )
                                        reject(error)
                                        return
                                    }

                                    console.log(
                                        "SUCESS 444444444 mgMarketSell 44444444"
                                    )
                                    bnb_client.mgMarketSell(
                                        alt + "BTC",
                                        Number(qty),
                                        (error, response) => {
                                            if (error) {
                                                console.log(
                                                    "ERROR 333333333",
                                                    JSON.stringify(error)
                                                )

                                                reject(error)
                                                return
                                            }

                                            //////
                                            tradingData.trading_pairs[signal.pair + signal.stratid] = true
                                            tradingData.trading_types[signal.pair + signal.stratid] = "SHORT"
                                            tradingData.open_trades[signal.pair + signal.stratid] = true
                                            tradingData.trading_qty[signal.pair + signal.stratid] = Number(qty)
                                            //////

                                            console.log("SUCCESS 22222222")
                                            socket.emit(
                                                "traded_sell_signal",
                                                traded_sell_signal
                                            )
                                            notifier.notifyEnterShortTraded(signal)

                                            resolve(true)
                                        }
                                    )
                                }
                            )
                        })
                    }

                    const task = new Task(job)
                    tradeQueue.addToQueue(task)
                } else {
                    // VIRTUAL TRADE

                    //////
                    tradingData.trading_pairs[signal.pair + signal.stratid] = true
                    tradingData.trading_types[signal.pair + signal.stratid] = "SHORT"
                    tradingData.open_trades[signal.pair + signal.stratid] = true
                    tradingData.trading_qty[signal.pair + signal.stratid] = Number(qty)
                    //////

                    socket.emit("traded_sell_signal", traded_sell_signal)
                    notifier.notifyEnterShortTraded(signal)
                }
            } else {
                console.log("PAIR UNKNOWN", alt)
            }

            //////
        } else if (
            tradingData.trading_types[signal.pair + signal.stratid] === "LONG" &&
            tradingData.trading_qty[signal.pair + signal.stratid] &&
            !signal.new &&
            tradingData.open_trades[signal.pair + signal.stratid]
        ) {
            console.log(
                colors.grey(
                    "SELL_SIGNAL :: SELL TO EXIT LONG TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            //notify
            notifier.notifyExitLongSignal(signal)
            //////
            console.log(
                signal.pair,
                " ---> SELL",
                Number(tradingData.trading_qty[signal.pair + signal.stratid])
            )

            const alt = signal.pair.replace("BTC", "")
            if (tradingData.minimums[alt + "BTC"] && tradingData.minimums[alt + "BTC"].minQty) {
                const qty = tradingData.trading_qty[signal.pair + signal.stratid]
                ///
                const traded_sell_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: tradingData.user_payload[tresult].trading_type,
                    pair: signal.pair,
                    qty: qty,
                }
                ///
                if (tradingData.user_payload[tresult].trading_type === "real") {
                    if (tradingData.margin_pairs.includes(alt + "BTC")) {
                        console.log(
                            "QTY =======mgMarketSell======> " +
                            qty +
                            " - " +
                            alt +
                            "BTC"
                        )
                        const job = async () => {
                            return new Promise((resolve, reject) => {
                                bnb_client.mgMarketSell(
                                    alt + "BTC",
                                    Number(qty),
                                    (error, response) => {
                                        if (error) {
                                            console.log(
                                                "ERROR 722211117",
                                                alt,
                                                Number(qty),
                                                JSON.stringify(error)
                                            )

                                            reject(error)
                                            return
                                        }

                                        //////
                                        delete tradingData.trading_pairs[signal.pair + signal.stratid]
                                        delete tradingData.trading_types[signal.pair + signal.stratid]
                                        delete tradingData.sell_prices[signal.pair + signal.stratid]
                                        delete tradingData.buy_prices[signal.pair + signal.stratid]
                                        delete tradingData.trading_qty[signal.pair + signal.stratid]
                                        delete tradingData.open_trades[signal.pair + signal.stratid]
                                        //////

                                        console.log(
                                            "SUCESS 71111111",
                                            alt,
                                            Number(qty)
                                        )
                                        socket.emit(
                                            "traded_sell_signal",
                                            traded_sell_signal
                                        )
                                        notifier.notifyExitLongTraded(signal)

                                        resolve(true)
                                    }
                                )
                            })
                        }

                        const task = new Task(job)
                        tradeQueue.addToQueue(task)
                    } else {
                        console.log(
                            "QTY =======marketSell======> " +
                            qty +
                            " - " +
                            alt +
                            "BTC"
                        )
                        const job = async () => {
                            return new Promise((resolve, reject) => {
                                bnb_client.marketSell(
                                    alt + "BTC",
                                    Number(qty),
                                    (error, response) => {
                                        if (error) {
                                            console.log(
                                                "ERROR 7213331117 marketSell",
                                                alt + "BTC",
                                                Number(qty),
                                                JSON.stringify(error)
                                            )

                                            reject(error)
                                            return
                                        }

                                        //////
                                        delete tradingData.trading_pairs[signal.pair + signal.stratid]
                                        delete tradingData.trading_types[signal.pair + signal.stratid]
                                        delete tradingData.sell_prices[signal.pair + signal.stratid]
                                        delete tradingData.buy_prices[signal.pair + signal.stratid]
                                        delete tradingData.trading_qty[signal.pair + signal.stratid]
                                        delete tradingData.open_trades[signal.pair + signal.stratid]
                                        //////

                                        console.log(
                                            "SUCESS 711000111 marketSell",
                                            alt + "BTC",
                                            Number(qty)
                                        )
                                        socket.emit(
                                            "traded_sell_signal",
                                            traded_sell_signal
                                        )
                                        notifier.notifyExitLongTraded(signal)

                                        resolve(true)
                                    }
                                )
                            })
                        }

                        const task = new Task(job)
                        tradeQueue.addToQueue(task)
                    }
                } else {
                    // VIRTUAL TRADE

                    //////
                    delete tradingData.trading_pairs[signal.pair + signal.stratid]
                    delete tradingData.trading_types[signal.pair + signal.stratid]
                    delete tradingData.sell_prices[signal.pair + signal.stratid]
                    delete tradingData.buy_prices[signal.pair + signal.stratid]
                    delete tradingData.trading_qty[signal.pair + signal.stratid]
                    delete tradingData.open_trades[signal.pair + signal.stratid]
                    //////

                    socket.emit("traded_sell_signal", traded_sell_signal)
                    notifier.notifyExitLongTraded(signal)
                }
                ///
            } else {
                console.log("PAIR UNKNOWN", alt)
            }
        } else {
            console.log(
                "SELL AGAIN",
                signal.stratname,
                signal.pair,
                !signal.new,
                tradingData.open_trades[signal.pair + signal.stratid],
                tradingData.trading_types[signal.pair + signal.stratid]
            )
        }
    }
})

socket.on("close_traded_signal", async (signal) => {
    console.log(
        colors.grey(
            "NBT HUB =====> close_traded_signal",
            signal.stratid,
            signal.pair,
            signal.trading_type
        )
    )
    const tresult = _.findIndex(tradingData.user_payload, (o) => {
        return o.stratid == signal.stratid
    })
    if (tresult > -1) {
        if (tradingData.trading_types[signal.pair + signal.stratid] === "LONG") {
            console.log(
                colors.grey(
                    "CLOSE_SIGNAL :: SELL TO EXIT LONG TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            const traded_sell_signal = {
                key: bva_key,
                stratname: signal.stratname,
                stratid: signal.stratid,
                trading_type: tradingData.user_payload[tresult].trading_type,
                pair: signal.pair,
                qty: signal.qty,
            }
            //////
            if (tradingData.user_payload[tresult].trading_type === "real") {
                console.log(signal.pair, " ===---==> SELL ", signal.qty)

                const alt = signal.pair.replace("BTC", "")
                if (tradingData.minimums[alt + "BTC"] && tradingData.minimums[alt + "BTC"].minQty) {
                    const qty = signal.qty
                    ///
                    if (tradingData.margin_pairs.includes(alt + "BTC")) {
                        console.log(
                            "CLOSE =========mgMarketSell=========> " +
                            qty +
                            " - " +
                            alt +
                            "BTC"
                        )
                        const job = async () => {
                            return new Promise((resolve, reject) => {
                                bnb_client.mgMarketSell(
                                    alt + "BTC",
                                    Number(qty),
                                    (error, response) => {
                                        if (error) {
                                            console.log(
                                                "ERORR 4547777745",
                                                alt,
                                                Number(qty),
                                                JSON.stringify(error)
                                            )

                                            reject(error)
                                            return
                                        }

                                        //////
                                        delete tradingData.trading_pairs[signal.pair + signal.stratid]
                                        delete tradingData.trading_types[signal.pair + signal.stratid]
                                        delete tradingData.sell_prices[signal.pair + signal.stratid]
                                        delete tradingData.buy_prices[signal.pair + signal.stratid]
                                        delete tradingData.trading_qty[signal.pair + signal.stratid]
                                        delete tradingData.open_trades[signal.pair + signal.stratid]
                                        //////

                                        console.log("SUCESS44444", alt, Number(qty))
                                        socket.emit(
                                            "traded_sell_signal",
                                            traded_sell_signal
                                        )

                                        resolve(true)
                                    }
                                )
                            })
                        }

                        const task = new Task(job)
                        tradeQueue.addToQueue(task)
                    } else {
                        console.log(
                            "CLOSE =========marketSell=========> " +
                            qty +
                            " - " +
                            alt +
                            "BTC"
                        )
                        const job = async () => {
                            return new Promise((resolve, reject) => {
                                bnb_client.marketSell(
                                    alt + "BTC",
                                    Number(qty),
                                    (error, response) => {
                                        if (error) {
                                            console.log(
                                                "ERROR 72317 marketSell",
                                                alt,
                                                Number(qty),
                                                JSON.stringify(error)
                                            )

                                            reject(error)
                                            return
                                        }

                                        //////
                                        delete tradingData.trading_pairs[signal.pair + signal.stratid]
                                        delete tradingData.trading_types[signal.pair + signal.stratid]
                                        delete tradingData.sell_prices[signal.pair + signal.stratid]
                                        delete tradingData.buy_prices[signal.pair + signal.stratid]
                                        delete tradingData.trading_qty[signal.pair + signal.stratid]
                                        delete tradingData.open_trades[signal.pair + signal.stratid]
                                        //////

                                        console.log(
                                            "SUCESS 716611 marketSell",
                                            alt,
                                            Number(qty)
                                        )
                                        socket.emit(
                                            "traded_sell_signal",
                                            traded_sell_signal
                                        )

                                        resolve(true)
                                    }
                                )
                            })
                        }

                        const task = new Task(job)
                        tradeQueue.addToQueue(task)
                    }
                    ///
                } else {
                    console.log("PAIR UNKNOWN", alt)
                }

            } else {
                // VIRTUAL TRADE

                //////
                delete tradingData.trading_pairs[signal.pair + signal.stratid]
                delete tradingData.trading_types[signal.pair + signal.stratid]
                delete tradingData.sell_prices[signal.pair + signal.stratid]
                delete tradingData.buy_prices[signal.pair + signal.stratid]
                delete tradingData.trading_qty[signal.pair + signal.stratid]
                delete tradingData.open_trades[signal.pair + signal.stratid]
                //////

                socket.emit("traded_sell_signal", traded_sell_signal)
            }
        } else if (tradingData.trading_types[signal.pair + signal.stratid] === "SHORT") {
            console.log(
                colors.grey(
                    "CLOSE_SIGNAL :: BUY TO COVER SHORT TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            //////
            const traded_buy_signal = {
                key: bva_key,
                stratname: signal.stratname,
                stratid: signal.stratid,
                trading_type: tradingData.user_payload[tresult].trading_type,
                pair: signal.pair,
                qty: signal.qty,
            }
            //////
            if (tradingData.user_payload[tresult].trading_type === "real") {
                console.log(signal.pair, " ---==---> BUY ", signal.qty)

                const alt = signal.pair.replace("BTC", "")
                if (tradingData.minimums[alt + "BTC"] && tradingData.minimums[alt + "BTC"].minQty) {
                    const qty = tradingData.trading_qty[signal.pair + signal.stratid]
                    console.log("QTY ==> " + qty + " - " + alt + "BTC")
                    const job = async () => {
                        return new Promise((resolve, reject) => {
                            bnb_client.mgMarketBuy(
                                alt + "BTC",
                                Number(qty),
                                (error, response) => {
                                    if (error) {
                                        console.log(
                                            "ERROR 2 ",
                                            alt,
                                            Number(
                                                tradingData.user_payload[tresult].buy_amount
                                                ),
                                            error.body
                                        )

                                        reject(error)
                                        return
                                    }

                                    //////
                                    delete tradingData.trading_pairs[signal.pair + signal.stratid]
                                    delete tradingData.trading_types[signal.pair + signal.stratid]
                                    delete tradingData.sell_prices[signal.pair + signal.stratid]
                                    delete tradingData.buy_prices[signal.pair + signal.stratid]
                                    delete tradingData.trading_qty[signal.pair + signal.stratid]
                                    delete tradingData.open_trades[signal.pair + signal.stratid]
                                    //////

                                    socket.emit(
                                        "traded_buy_signal",
                                        traded_buy_signal
                                        )

                                    console.log("----- mgRepay -----")
                                    bnb_client.mgRepay(
                                        alt,
                                        Number(qty),
                                        (error, response) => {
                                            if (error) {
                                                console.log(
                                                    "ERROR 99999999999",
                                                    alt,
                                                    Number(qty),
                                                    error.body
                                                )

                                                reject(error)
                                                return
                                            }
                                            console.log("SUCCESS 888888888888")

                                            resolve(true)
                                        }
                                    )
                                }
                            )
                        })
                    }

                    const task = new Task(job)
                    tradeQueue.addToQueue(task)
                } else {
                    console.log("PAIR UNKNOWN", alt)
                }
            } else {
                // VIRTUAL TRADE

                //////
                delete tradingData.trading_pairs[signal.pair + signal.stratid]
                delete tradingData.trading_types[signal.pair + signal.stratid]
                delete tradingData.sell_prices[signal.pair + signal.stratid]
                delete tradingData.buy_prices[signal.pair + signal.stratid]
                delete tradingData.trading_qty[signal.pair + signal.stratid]
                delete tradingData.open_trades[signal.pair + signal.stratid]
                //////

                socket.emit("traded_buy_signal", traded_buy_signal)
            }
        }
    }
})

socket.on("stop_traded_signal", async (signal) => {
    console.log(
        colors.grey(
            "NBT HUB =====> stop_traded_signal",
            signal.stratid,
            signal.pair,
            signal.trading_type
        )
    )
    const tresult = _.findIndex(tradingData.user_payload, (o) => {
        return o.stratid == signal.stratid
    })
    if (tresult > -1) {
        if (tradingData.open_trades[signal.pair + signal.stratid]) {
            delete tradingData.open_trades[signal.pair + signal.stratid]
        }
    }
})

socket.on("user_payload", async (data) => {
    console.log(
        colors.grey("NBT HUB => user strategies + trading setup updated")
    )
    tradingData.user_payload = data
})

//////////////////////////////////////////////////////////////////////////////////

async function ExchangeInfo() {
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

async function UpdateOpenTrades() {
    return new Promise((resolve, reject) => {
        // Retrieve previous open trades //
        axios
            .get(
                "https://bitcoinvsaltcoins.com/api/useropentradedsignals?key=" +
                bva_key
            )
            .then((response) => {
                response.data.rows.map((s) => {
                    tradingData.trading_pairs[s.pair + s.stratid] = true
                    tradingData.open_trades[s.pair + s.stratid] = !s.stopped
                    tradingData.trading_types[s.pair + s.stratid] = s.type
                    tradingData.trading_qty[s.pair + s.stratid] = s.qty
                    tradingData.buy_prices[s.pair + s.stratid] = new BigNumber(s.buy_price)
                    tradingData.sell_prices[s.pair + s.stratid] = new BigNumber(
                        s.sell_price
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

async function UpdateMarginPairs() {
    return new Promise((resolve, reject) => {
        axios
            .get(
                "https://www.binance.com/gateway-api/v1/friendly/margin/symbols"
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
}

async function run() {
    await UpdateMarginPairs()
    await ExchangeInfo()
    await UpdateOpenTrades()
    //await BalancesInfo()
}

run()
