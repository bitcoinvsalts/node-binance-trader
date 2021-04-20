const TradeQueue = require("../trade-queue")
const tradeQueue = new TradeQueue()
const env = require("../env")
const BigNumber = require("bignumber.js")
const colors = require("colors")
const _ = require("lodash")
const Task = require("../utils/task")
const { UpdateOpenTrades } = require("./tradingData")
const { UpdateMarginPairs } = require("./tradingData")
const { bnb_client } = require("./binanceClient")
const { tradingData,clearSignalData,addLongPosition,updateExchangeInfo } = require("./tradingData")
const bva_key = env.BVA_API_KEY
const notifier = require("../notifiers")(tradingData.trading_pairs)

const tradeShortEnabled = env.TRADE_SHORT_ENABLED

const queueRealTradeJob = (alt, qty, signal, traded_buy_signal) => {
    const job = async () => {
        return new Promise((resolve, reject) => {
            bnb_client.mgMarketBuy(alt + "BTC", Number(qty),
                (error, response) => {
                    if (error) {
                        console.log(
                            "ERROR 6 ",
                            alt,
                            Number(qty),
                            error.body,
                        )

                        reject(error)
                        return
                    }

                    clearSignalData(signal)
                    socket.emit(
                        "traded_buy_signal",
                        traded_buy_signal,
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
                                    error.body,
                                )

                                reject(error)
                                return
                            }
                            console.log("SUCCESS 333342111")

                            resolve(true)
                        },
                    )
                },
            )
        })
    }

    const task = new Task(job)
    tradeQueue.addToQueue(task)
}

async function init() {
    tradeQueue.startQueue()
    await UpdateMarginPairs()
    await updateExchangeInfo()
    await UpdateOpenTrades()
    //await BalancesInfo()
}

const onUserPayload = async (data) => {
    console.log(
        colors.grey("NBT HUB => user strategies + trading setup updated"),
    )
    tradingData.user_payload = data
}

const onRealTrade = (alt, qty, signal, traded_buy_signal) => {
    let isMarginTrade = tradingData.margin_pairs.includes(alt + "BTC")
    if (isMarginTrade) {
        const task = new Task(() => new Promise((resolve, reject) => {
            bnb_client.mgMarketBuy(
                alt + "BTC",
                Number(qty),
                (error, response) => {
                    if (error) {
                        console.log("ERROR 3355333", error.body)
                        reject(error)
                        return
                    }

                    addLongPosition(signal, qty)
                    console.log("SUCCESS 222444222")
                    socket.emit(
                        "traded_buy_signal",
                        traded_buy_signal,
                    )
                    notifier.notifyEnterLongTraded(signal)
                    resolve(true)
                },
            )
        }))
        tradeQueue.addToQueue(task)
    } else {
        const task = new Task(() => new Promise((resolve, reject) => {
            bnb_client.marketBuy(
                alt + "BTC",
                Number(qty),
                (error, response) => {
                    if (error) {
                        console.log(
                            "ERROR 7991117 marketBuy",
                            alt + "BTC",
                            Number(qty),
                            error.body,
                        )
                        reject(error)
                        return
                    }
                    addLongPosition(signal, qty)
                    console.log(
                        "SUCESS 99111 marketBuy",
                        alt + "BTC",
                        Number(qty),
                    )
                    socket.emit(
                        "traded_buy_signal",
                        traded_buy_signal,
                    )
                    notifier.notifyEnterLongTraded(signal)
                    resolve(true)
                },
            )
        }))
        tradeQueue.addToQueue(task)
    }
}

const onVirtualTrade = (signal, qty, traded_buy_signal) => {
    addLongPosition(signal, qty)
    socket.emit("traded_buy_signal", traded_buy_signal)
    notifier.notifyEnterLongTraded(signal)
}

const onBuySignal = async (signal) => {
    const tresult = _.findIndex(
        tradingData.user_payload,
        (o) => o.stratid == signal.stratid,
    )
    const isNewSignal = !tradingData.trading_pairs[signal.pair + signal.stratid] && signal.new
    if (tresult > -1) {
        let userPayload = tradingData.user_payload[tresult]
        let isRealTradingOn = userPayload.trading_type === "real"
        if (isNewSignal) {
            console.log(
                colors.grey(
                    "BUY_SIGNAL :: ENTER LONG TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair,
                ),
            )
            //notify
            notifier.notifyEnterLongSignal(signal)

            console.log(
                signal.pair,
                " ===> BUY",
                signal.price,
                Number(userPayload.buy_amount),
            )

            const alt = signal.pair.replace("BTC", "")
            if (tradingData.minimums[alt + "BTC"] && tradingData.minimums[alt + "BTC"].minQty) {
                const buy_amount = new BigNumber(
                    userPayload.buy_amount,
                )
                const btc_qty = buy_amount.dividedBy(signal.price)
                const qty = bnb_client.roundStep(
                    btc_qty,
                    tradingData.minimums[alt + "BTC"].stepSize,
                )
                console.log("Market Buy ==> " + qty + " - " + alt + "BTC")
                ////
                const traded_buy_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: userPayload.trading_type,
                    pair: signal.pair,
                    qty: qty,
                }
                ////
                if (isRealTradingOn) {
                    onRealTrade(alt, qty, signal, traded_buy_signal)
                } else {
                    // VIRTUAL TRADE
                    onVirtualTrade(signal, qty, traded_buy_signal)
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
                    signal.pair,
                ),
            )
            //notify
            notifier.notifyBuyToCoverSignal(signal)
            //////
            console.log(
                signal.pair,
                " ---> BUY",
                Number(tradingData.trading_qty[signal.pair + signal.stratid]),
            )

            const alt = signal.pair.replace("BTC", "")
            if (tradingData.minimums[alt + "BTC"].minQty) {
                const qty = Number(
                    tradingData.trading_qty[signal.pair + signal.stratid],
                )
                console.log(
                    "QTY ====mgMarketBuy===> " + qty + " - " + alt + "BTC",
                )
                /////
                const traded_buy_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: userPayload.trading_type,
                    pair: signal.pair,
                    qty: qty,
                }
                /////
                if (isRealTradingOn) {
                    queueRealTradeJob(alt, qty, signal, traded_buy_signal)
                } else {
                    // VIRTUAL TRADE

                    //////
                    clearSignalData(signal)
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
                tradingData.trading_types[signal.pair + signal.stratid],
            )
        }
    }
}
const onSellSignal = async (signal) => {
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
                    signal.pair,
                ),
            )
            //notify
            notifier.notifyEnterShortSignal(signal)

            console.log(
                signal.pair,
                " ===> SELL",
                signal.price,
                Number(tradingData.user_payload[tresult].buy_amount),
            )

            console.log("const alt = signal.pair.replace('BTC', '')")
            const alt = signal.pair.replace("BTC", "")
            if (tradingData.minimums[alt + "BTC"] && tradingData.minimums[alt + "BTC"].minQty) {
                const buy_amount = new BigNumber(
                    tradingData.user_payload[tresult].buy_amount,
                )
                const btc_qty = buy_amount.dividedBy(signal.price)
                const qty = bnb_client.roundStep(
                    btc_qty,
                    tradingData.minimums[alt + "BTC"].stepSize,
                )
                console.log(
                    "QTY ===mgBorrow===> " + qty + " - " + alt + "BTC",
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
                                            JSON.stringify(error),
                                        )
                                        reject(error)
                                        return
                                    }

                                    console.log(
                                        "SUCESS 444444444 mgMarketSell 44444444",
                                    )
                                    bnb_client.mgMarketSell(
                                        alt + "BTC",
                                        Number(qty),
                                        (error, response) => {
                                            if (error) {
                                                console.log(
                                                    "ERROR 333333333",
                                                    JSON.stringify(error),
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
                                                traded_sell_signal,
                                            )
                                            notifier.notifyEnterShortTraded(signal)

                                            resolve(true)
                                        },
                                    )
                                },
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
                    signal.pair,
                ),
            )
            //notify
            notifier.notifyExitLongSignal(signal)
            //////
            console.log(
                signal.pair,
                " ---> SELL",
                Number(tradingData.trading_qty[signal.pair + signal.stratid]),
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
                            "BTC",
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
                                                JSON.stringify(error),
                                            )

                                            reject(error)
                                            return
                                        }

                                        clearSignalData(signal)
                                        console.log(
                                            "SUCESS 71111111",
                                            alt,
                                            Number(qty),
                                        )
                                        socket.emit(
                                            "traded_sell_signal",
                                            traded_sell_signal,
                                        )
                                        notifier.notifyExitLongTraded(signal)

                                        resolve(true)
                                    },
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
                            "BTC",
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
                                                JSON.stringify(error),
                                            )

                                            reject(error)
                                            return
                                        }

                                        clearSignalData(signal)
                                        console.log(
                                            "SUCESS 711000111 marketSell",
                                            alt + "BTC",
                                            Number(qty),
                                        )
                                        socket.emit(
                                            "traded_sell_signal",
                                            traded_sell_signal,
                                        )
                                        notifier.notifyExitLongTraded(signal)

                                        resolve(true)
                                    },
                                )
                            })
                        }

                        const task = new Task(job)
                        tradeQueue.addToQueue(task)
                    }
                } else {
                    // VIRTUAL TRADE
                    clearSignalData(signal)
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
                tradingData.trading_types[signal.pair + signal.stratid],
            )
        }
    }
}
const onStopTradedSignal = async (signal) => {
    console.log(
        colors.grey(
            "NBT HUB =====> stop_traded_signal",
            signal.stratid,
            signal.pair,
            signal.trading_type,
        ),
    )
    const signalIndex = _.findIndex(tradingData.user_payload, (o) => {
        return o.stratid == signal.stratid
    })
    const foundIndex = signalIndex > -1
    if (foundIndex) {
        if (tradingData.open_trades[signal.pair + signal.stratid]) {
            delete tradingData.open_trades[signal.pair + signal.stratid]
        }
    }
}
const onCloseTradedSignal = async (signal) => {
    console.log(
        colors.grey(
            "NBT HUB =====> close_traded_signal",
            signal.stratid,
            signal.pair,
            signal.trading_type,
        ),
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
                    signal.pair,
                ),
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
                            "BTC",
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
                                                JSON.stringify(error),
                                            )

                                            reject(error)
                                            return
                                        }

                                        clearSignalData(signal)
                                        console.log("SUCESS44444", alt, Number(qty))
                                        socket.emit(
                                            "traded_sell_signal",
                                            traded_sell_signal,
                                        )

                                        resolve(true)
                                    },
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
                            "BTC",
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
                                                JSON.stringify(error),
                                            )

                                            reject(error)
                                            return
                                        }

                                        clearSignalData(signal)
                                        console.log(
                                            "SUCESS 716611 marketSell",
                                            alt,
                                            Number(qty),
                                        )
                                        socket.emit(
                                            "traded_sell_signal",
                                            traded_sell_signal,
                                        )

                                        resolve(true)
                                    },
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
                clearSignalData(signal)
                socket.emit("traded_sell_signal", traded_sell_signal)
            }
        } else if (tradingData.trading_types[signal.pair + signal.stratid] === "SHORT") {
            console.log(
                colors.grey(
                    "CLOSE_SIGNAL :: BUY TO COVER SHORT TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair,
                ),
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
                                                tradingData.user_payload[tresult].buy_amount,
                                            ),
                                            error.body,
                                        )

                                        reject(error)
                                        return
                                    }

                                    clearSignalData(signal)
                                    socket.emit(
                                        "traded_buy_signal",
                                        traded_buy_signal,
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
                                                    error.body,
                                                )

                                                reject(error)
                                                return
                                            }
                                            console.log("SUCCESS 888888888888")

                                            resolve(true)
                                        },
                                    )
                                },
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
                clearSignalData(signal)
                socket.emit("traded_buy_signal", traded_buy_signal)
            }
        }
    }
}

module.exports = { init, onUserPayload, onBuySignal, onSellSignal, onStopTradedSignal, onCloseTradedSignal }

