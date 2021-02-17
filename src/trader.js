const express = require("express")
const io = require("socket.io-client")
const moment = require("moment")
const _ = require("lodash")
const colors = require("colors")
const BigNumber = require("bignumber.js")
const axios = require("axios")
const Binance = require("node-binance-api")
const nodemailer = require("nodemailer")
const env = require("./env")

const bva_key = env.BVA_API_KEY
const send_email = false // USE SEND MAIL ---- true = YES; false = NO
const gmail_address = env.GMAIL_ADDRESS
const gmail_app_password = env.GMAIL_APP_PASSWORD
const gmailEmail = encodeURIComponent(gmail_address)
const gmailPassword = encodeURIComponent(gmail_app_password)
const mailTransport = nodemailer.createTransport(
    `smtps://${gmailEmail}:${gmailPassword}@smtp.gmail.com`
)

//////////////////////////////////////////////////////////////////////////////////
//         VARIABLES TO KEEP TRACK OF BOT POSITIONS AND ACTIVITY
//////////////////////////////////////////////////////////////////////////////////

let trading_pairs = {}
let open_trades = {}
let trading_types = {}
let trading_qty = {}
let buy_prices = {}
let sell_prices = {}
let user_payload = []
let available_balances = []

let minimums = {}

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

const app = express()
app.get("/", (req, res) => res.send(""))
app.listen(env.TRADER_PORT, () => console.log("NBT auto trader running.".grey))

const notifier = require('./notifiers')(trading_pairs);

//////////////////////////////////////////////////////////////////////////////////

const margin_pairs = [
    "ADABTC",
    "ATOMBTC",
    "BATBTC",
    "BCHBTC",
    "BNBBTC",
    "DASHBTC",
    "EOSBTC",
    "ETCBTC",
    "ETHBTC",
    "IOSTBTC",
    "IOTABTC",
    "LINKBTC",
    "LTCBTC",
    "MATICBTC",
    "NEOBTC",
    "ONTBTC",
    "QTUMBTC",
    "RVNBTC",
    "TRXBTC",
    "VETBTC",
    "XLMBTC",
    "XMRBTC",
    "XRPBTC",
    "XTZBTC",
    "ZECBTC",
]

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
        user_payload,
        (o) => o.stratid == signal.stratid
    )
    if (tresult > -1) {
        if (!trading_pairs[signal.pair + signal.stratid] && signal.new) {
            console.log(
                colors.grey(
                    "BUY_SIGNAL :: ENTER LONG TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            // SEND TRADE EMAIL
            if (send_email) {
                const mailOptions = {
                    from: '"🐬  BVA " <no-reply@gmail.com>',
                    to: gmail_address,
                    subject:
                        "BUY_SIGNAL :: ENTER LONG TRADE :: " +
                        signal.stratname +
                        " " +
                        signal.pair +
                        " " +
                        signal.price,
                    text:
                        (signal.score
                            ? "score: " + signal.score
                            : "score: NA") + "\n",
                }
                mailTransport
                    .sendMail(mailOptions)
                    .then(() => {})
                    .catch((error) => {
                        console.error(
                            "There was an error while sending the email ... trying again..."
                        )
                        setTimeout(() => {
                            mailTransport
                                .sendMail(mailOptions)
                                .then(() => {})
                                .catch((error) => {
                                    console.error(
                                        "There was an error while sending the email: stop trying"
                                    )
                                })
                        }, 2000)
                    })
            }
            //notify
            notifier.notifyEnterLongSignal(signal)

            //////
            trading_pairs[signal.pair + signal.stratid] = true
            trading_types[signal.pair + signal.stratid] = "LONG"
            open_trades[signal.pair + signal.stratid] = true
            //////
            console.log(
                signal.pair,
                " ===> BUY",
                signal.price,
                Number(user_payload[tresult].buy_amount)
            )
            if (signal.pair == "BTCUSDT") {
                trading_qty[signal.pair + signal.stratid] = Number(
                    user_payload[tresult].buy_amount
                )
                ////
                const traded_buy_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: user_payload[tresult].trading_type,
                    pair: signal.pair,
                    qty: Number(user_payload[tresult].buy_amount),
                }
                ////
                if (user_payload[tresult].trading_type === "real") {
                    bnb_client.mgMarketBuy(
                        "BTCUSDT",
                        Number(user_payload[tresult].buy_amount),
                        (error, response) => {
                            if (error) {
                                console.log(
                                    "ERROR 3 BTCUSDT ",
                                    Number(user_payload[tresult].buy_amount),
                                    error.body
                                )
                                return
                            }

                            console.log(" mgMarketBuy BTCUSDT SUCESS 3")
                            socket.emit("traded_buy_signal", traded_buy_signal)
                            notifier.notifyEnterLongTraded(signal);
                        }
                    )
                } else {
                    // VIRTUAL TRADE
                    socket.emit("traded_buy_signal", traded_buy_signal)
                    notifier.notifyEnterLongTraded(signal);
                }
            } else {
                const alt = signal.pair.replace("BTC", "")
                if (minimums[alt + "BTC"] && minimums[alt + "BTC"].minQty) {
                    const buy_amount = new BigNumber(
                        user_payload[tresult].buy_amount
                    )
                    const btc_qty = buy_amount.dividedBy(signal.price)
                    const qty = bnb_client.roundStep(
                        btc_qty,
                        minimums[alt + "BTC"].stepSize
                    )
                    console.log("Market Buy ==> " + qty + " - " + alt + "BTC")
                    trading_qty[signal.pair + signal.stratid] = Number(qty)
                    ////
                    const traded_buy_signal = {
                        key: bva_key,
                        stratname: signal.stratname,
                        stratid: signal.stratid,
                        trading_type: user_payload[tresult].trading_type,
                        pair: signal.pair,
                        qty: qty,
                    }
                    ////
                    if (user_payload[tresult].trading_type === "real") {
                        if (margin_pairs.includes(alt + "BTC")) {
                            bnb_client.mgMarketBuy(
                                alt + "BTC",
                                Number(qty),
                                (error, response) => {
                                    if (error) {
                                        console.log("ERROR 3355333", error.body)
                                        return
                                    }

                                    console.log("SUCCESS 222444222")
                                    socket.emit(
                                        "traded_buy_signal",
                                        traded_buy_signal
                                    )
                                    notifier.notifyEnterLongTraded(signal);
                                }
                            )
                        } else {
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
                                        return
                                    }

                                    console.log(
                                        "SUCESS 99111 marketBuy",
                                        alt + "BTC",
                                        Number(qty)
                                    )
                                    socket.emit(
                                        "traded_buy_signal",
                                        traded_buy_signal
                                    )
                                    notifier.notifyEnterLongTraded(signal);
                                }
                            )
                        }
                    } else {
                        // VIRTUAL TRADE
                        socket.emit("traded_buy_signal", traded_buy_signal)
                        notifier.notifyEnterLongTraded(signal);
                    }
                } else {
                    console.log("PAIR UNKNOWN", alt)
                }
            }
            //////
        } else if (
            trading_types[signal.pair + signal.stratid] === "SHORT" &&
            trading_qty[signal.pair + signal.stratid] &&
            !signal.new &&
            open_trades[signal.pair + signal.stratid]
        ) {
            console.log(
                colors.grey(
                    "BUY_SIGNAL :: BUY TO COVER SHORT TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            // SEND TRADE EMAIL
            if (send_email) {
                const mailOptions = {
                    from: '"🐬  BVA " <no-reply@gmail.com>',
                    to: gmail_address,
                    subject:
                        "BUY_SIGNAL :: BUY TO COVER SHORT TRADE :: " +
                        signal.stratname +
                        " " +
                        signal.pair +
                        " " +
                        signal.price,
                    text:
                        (signal.score
                            ? "score: " + signal.score
                            : "score: NA") + "\n",
                }
                mailTransport
                    .sendMail(mailOptions)
                    .then(() => {})
                    .catch((error) => {
                        console.error(
                            "There was an error while sending the email ... trying again..."
                        )
                        setTimeout(() => {
                            mailTransport
                                .sendMail(mailOptions)
                                .then(() => {})
                                .catch((error) => {
                                    console.error(
                                        "There was an error while sending the email: stop trying"
                                    )
                                })
                        }, 2000)
                    })
            }
            //notify
            notifier.notifyBuyToCoverSignal(signal)
            //////
            console.log(
                signal.pair,
                " ---> BUY",
                Number(trading_qty[signal.pair + signal.stratid])
            )
            if (signal.pair == "BTCUSDT") {
                /////
                const traded_buy_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: user_payload[tresult].trading_type,
                    pair: signal.pair,
                    qty: Number(trading_qty[signal.pair + signal.stratid]),
                }
                /////
                if (user_payload[tresult].trading_type === "real") {
                    const qty = Number(
                        trading_qty[signal.pair + signal.stratid]
                    )
                    bnb_client.mgMarketBuy(
                        "BTCUSDT",
                        qty,
                        (error, response) => {
                            if (error) {
                                console.log("ERROR 5 BTCUST ", qty, error.body)
                                return
                            }

                            socket.emit("traded_buy_signal", traded_buy_signal)
                            notifier.notifyBuyToCoverTraded(signal);

                            console.log("----- mgRepay BTC 5 -----")
                            bnb_client.mgRepay(
                                "BTC",
                                qty,
                                (error, response) => {
                                    if (error) {
                                        console.log(
                                            "ERROR BTC 999",
                                            qty,
                                            error.body
                                        )
                                        return
                                    }
                                    console.log("SUCCESS BTC 888")
                                }
                            )
                        }
                    )
                } else {
                    // VIRTUAL TRADE
                    socket.emit("traded_buy_signal", traded_buy_signal)
                    notifier.notifyBuyToCoverTraded(signal);
                }
            } else {
                const alt = signal.pair.replace("BTC", "")
                if (minimums[alt + "BTC"].minQty) {
                    const qty = Number(
                        trading_qty[signal.pair + signal.stratid]
                    )
                    console.log(
                        "QTY ====mgMarketBuy===> " + qty + " - " + alt + "BTC"
                    )
                    /////
                    const traded_buy_signal = {
                        key: bva_key,
                        stratname: signal.stratname,
                        stratid: signal.stratid,
                        trading_type: user_payload[tresult].trading_type,
                        pair: signal.pair,
                        qty: qty,
                    }
                    /////
                    if (user_payload[tresult].trading_type === "real") {
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
                                    return
                                }
                                socket.emit(
                                    "traded_buy_signal",
                                    traded_buy_signal
                                )
                                notifier.notifyBuyToCoverTraded(signal);

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
                                            return
                                        }
                                        console.log("SUCCESS 333342111")
                                    }
                                )
                            }
                        )
                    } else {
                        // VIRTUAL TRADE
                        socket.emit("traded_buy_signal", traded_buy_signal)
                        notifier.notifyBuyToCoverTraded(signal);
                    }
                } else {
                    console.log("PAIR UNKNOWN", alt)
                }
            }
            //////
            delete trading_pairs[signal.pair + signal.stratid]
            delete trading_types[signal.pair + signal.stratid]
            delete buy_prices[signal.pair + signal.stratid]
            delete sell_prices[signal.pair + signal.stratid]
            delete trading_qty[signal.pair + signal.stratid]
            delete open_trades[signal.pair + signal.stratid]
            //////
        } else {
            console.log(
                "BUY AGAIN",
                JSON.stringify(signal),
                trading_types[signal.pair + signal.stratid]
            )
        }
    }
})

socket.on("sell_signal", async (signal) => {
    const tresult = _.findIndex(user_payload, (o) => {
        return o.stratid == signal.stratid
    })
    if (tresult > -1) {
        if (!trading_pairs[signal.pair + signal.stratid] && signal.new) {
            console.log(
                colors.grey(
                    "SELL_SIGNAL :: ENTER SHORT TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            // SEND TRADE EMAIL
            if (send_email) {
                const mailOptions = {
                    from: '"🐬  BVA " <no-reply@gmail.com>',
                    to: gmail_address,
                    subject:
                        "SELL_SIGNAL :: ENTER SHORT TRADE :: " +
                        signal.stratname +
                        " " +
                        signal.pair +
                        " " +
                        signal.price,
                    text:
                        (signal.score
                            ? "score: " + signal.score
                            : "score: NA") + "\n",
                }
                mailTransport
                    .sendMail(mailOptions)
                    .then(() => {})
                    .catch((error) => {
                        console.error(
                            "There was an error while sending the email ... trying again..."
                        )
                        setTimeout(() => {
                            mailTransport
                                .sendMail(mailOptions)
                                .then(() => {})
                                .catch((error) => {
                                    console.error(
                                        "There was an error while sending the email: stop trying"
                                    )
                                })
                        }, 2000)
                    })
            }
            //notify
            notifier.notifyEnterShortSignal(signal)
            //////
            trading_pairs[signal.pair + signal.stratid] = true
            trading_types[signal.pair + signal.stratid] = "SHORT"
            open_trades[signal.pair + signal.stratid] = true
            //////
            console.log(
                signal.pair,
                " ===> SELL",
                signal.price,
                Number(user_payload[tresult].buy_amount)
            )
            if (signal.pair == "BTCUSDT") {
                trading_qty[signal.pair + signal.stratid] = Number(
                    user_payload[tresult].buy_amount
                )
                const traded_sell_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: user_payload[tresult].trading_type,
                    pair: signal.pair,
                    qty: Number(user_payload[tresult].buy_amount),
                }

                if (user_payload[tresult].trading_type === "real") {
                    bnb_client.mgBorrow(
                        "BTC",
                        Number(user_payload[tresult].buy_amount),
                        (error, response) => {
                            if (error) {
                                console.log(
                                    "ERROR BTC 55",
                                    Number(user_payload[tresult].buy_amount),
                                    error.body
                                )
                                return
                            }
                            console.log("SUCESS BTC 4 mgMarketSell 444")
                            bnb_client.mgMarketSell(
                                "BTCUSDT",
                                Number(user_payload[tresult].buy_amount),
                                (error, response) => {
                                    if (error) {
                                        console.log(
                                            "ERROR BTC 33333",
                                            error.body
                                        )
                                        return
                                    }
                                    console.log(
                                        "mgMarketSell BTCUSDT SUCCESS 2222"
                                    )
                                    socket.emit(
                                        "traded_sell_signal",
                                        traded_sell_signal
                                    )
                                    notifier.notifyEnterShortTraded(signal);
                                }
                            )
                        }
                    )
                } else {
                    // VIRTUAL TRADE
                    socket.emit("traded_sell_signal", traded_sell_signal)
                    notifier.notifyEnterShortTraded(signal);
                }
            } else {
                console.log("const alt = signal.pair.replace('BTC', '')")
                const alt = signal.pair.replace("BTC", "")
                if (minimums[alt + "BTC"] && minimums[alt + "BTC"].minQty) {
                    const buy_amount = new BigNumber(
                        user_payload[tresult].buy_amount
                    )
                    const btc_qty = buy_amount.dividedBy(signal.price)
                    const qty = bnb_client.roundStep(
                        btc_qty,
                        minimums[alt + "BTC"].stepSize
                    )
                    trading_qty[signal.pair + signal.stratid] = Number(qty)
                    console.log(
                        "QTY ===mgBorrow===> " + qty + " - " + alt + "BTC"
                    )
                    const traded_sell_signal = {
                        key: bva_key,
                        stratname: signal.stratname,
                        stratid: signal.stratid,
                        trading_type: user_payload[tresult].trading_type,
                        pair: signal.pair,
                        qty: qty,
                    }

                    if (user_payload[tresult].trading_type === "real") {
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
                                            return
                                        }
                                        console.log("SUCCESS 22222222")
                                        socket.emit(
                                            "traded_sell_signal",
                                            traded_sell_signal
                                        )
                                        notifier.notifyEnterShortTraded(signal);
                                    }
                                )
                            }
                        )
                    } else {
                        // VIRTUAL TRADE
                        socket.emit("traded_sell_signal", traded_sell_signal)
                        notifier.notifyEnterShortTraded(signal);
                    }
                } else {
                    console.log("PAIR UNKNOWN", alt)
                }
            }
            //////
        } else if (
            trading_types[signal.pair + signal.stratid] === "LONG" &&
            trading_qty[signal.pair + signal.stratid] &&
            !signal.new &&
            open_trades[signal.pair + signal.stratid]
        ) {
            console.log(
                colors.grey(
                    "SELL_SIGNAL :: SELL TO EXIT LONG TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            // SEND TRADE EMAIL
            if (send_email) {
                const mailOptions = {
                    from: '"🐬  BVA " <no-reply@gmail.com>',
                    to: gmail_address,
                    subject:
                        "SELL_SIGNAL :: SELL TO EXIT LONG TRADE :: " +
                        signal.stratname +
                        " " +
                        signal.pair +
                        " " +
                        signal.price,
                    text:
                        (signal.score
                            ? "score: " + signal.score
                            : "score: NA") + "\n",
                }
                mailTransport
                    .sendMail(mailOptions)
                    .then(() => {})
                    .catch((error) => {
                        console.error(
                            "There was an error while sending the email ... trying again..."
                        )
                        setTimeout(() => {
                            mailTransport
                                .sendMail(mailOptions)
                                .then(() => {})
                                .catch((error) => {
                                    console.error(
                                        "There was an error while sending the email: stop trying"
                                    )
                                })
                        }, 2000)
                    })
            }
            //notify
            notifier.notifyExitLongSignal(signal)
            //////
            console.log(
                signal.pair,
                " ---> SELL",
                Number(trading_qty[signal.pair + signal.stratid])
            )
            if (signal.pair == "BTCUSDT") {
                const traded_sell_signal = {
                    key: bva_key,
                    stratname: signal.stratname,
                    stratid: signal.stratid,
                    trading_type: user_payload[tresult].trading_type,
                    pair: signal.pair,
                    qty: Number(trading_qty[signal.pair + signal.stratid]),
                }

                if (user_payload[tresult].trading_type === "real") {
                    bnb_client.mgMarketSell(
                        "BTCUSDT",
                        Number(trading_qty[signal.pair + signal.stratid]),
                        (error, response) => {
                            if (error) {
                                console.log(
                                    "ERROR 7220017 BTCUSDT",
                                    Number(
                                        trading_qty[
                                            signal.pair + signal.stratid
                                        ]
                                    ),
                                    JSON.stringify(error)
                                )
                                return
                            }
                            socket.emit(
                                "traded_sell_signal",
                                traded_sell_signal
                            )
                            notifier.notifyExitLongTraded(signal)
                        }
                    )
                } else {
                    // VIRTUAL TRADE
                    socket.emit("traded_sell_signal", traded_sell_signal)
                    notifier.notifyExitLongTraded(signal)

                }
            } else {
                const alt = signal.pair.replace("BTC", "")
                if (minimums[alt + "BTC"] && minimums[alt + "BTC"].minQty) {
                    const qty = trading_qty[signal.pair + signal.stratid]
                    ///
                    const traded_sell_signal = {
                        key: bva_key,
                        stratname: signal.stratname,
                        stratid: signal.stratid,
                        trading_type: user_payload[tresult].trading_type,
                        pair: signal.pair,
                        qty: qty,
                    }
                    ///
                    if (user_payload[tresult].trading_type === "real") {
                        if (margin_pairs.includes(alt + "BTC")) {
                            console.log(
                                "QTY =======mgMarketSell======> " +
                                    qty +
                                    " - " +
                                    alt +
                                    "BTC"
                            )
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
                                        return
                                    }
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
                                }
                            )
                        } else {
                            console.log(
                                "QTY =======marketSell======> " +
                                    qty +
                                    " - " +
                                    alt +
                                    "BTC"
                            )
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
                                        return
                                    }
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
                                }
                            )
                        }
                    } else {
                        // VIRTUAL TRADE
                        socket.emit("traded_sell_signal", traded_sell_signal)
                        notifier.notifyExitLongTraded(signal)
                    }
                    ///
                } else {
                    console.log("PAIR UNKNOWN", alt)
                }
            }
            //////
            delete trading_pairs[signal.pair + signal.stratid]
            delete trading_types[signal.pair + signal.stratid]
            delete sell_prices[signal.pair + signal.stratid]
            delete buy_prices[signal.pair + signal.stratid]
            delete trading_qty[signal.pair + signal.stratid]
            delete open_trades[signal.pair + signal.stratid]
            //////
        } else {
            console.log(
                "SELL AGAIN",
                signal.stratname,
                signal.pair,
                !signal.new,
                open_trades[signal.pair + signal.stratid],
                trading_types[signal.pair + signal.stratid]
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
    const tresult = _.findIndex(user_payload, (o) => {
        return o.stratid == signal.stratid
    })
    if (tresult > -1) {
        if (trading_types[signal.pair + signal.stratid] === "LONG") {
            console.log(
                colors.grey(
                    "BUY_SIGNAL :: SELL TO EXIT LONG TRADE ::",
                    signal.stratname,
                    signal.stratid,
                    signal.pair
                )
            )
            const traded_sell_signal = {
                key: bva_key,
                stratname: signal.stratname,
                stratid: signal.stratid,
                trading_type: user_payload[tresult].trading_type,
                pair: signal.pair,
                qty: signal.qty,
            }
            //////
            if (user_payload[tresult].trading_type === "real") {
                console.log(signal.pair, " ===---==> SELL ", signal.qty)
                if (signal.pair == "BTCUSDT") {
                    bnb_client.mgMarketSell(
                        "BTCUSDT",
                        Number(signal.qty),
                        (error, response) => {
                            if (error) {
                                console.log(
                                    "ERROR 1212 BTCUSDT",
                                    Number(signal.qty),
                                    JSON.stringify(error)
                                )
                                return
                            }
                            socket.emit(
                                "traded_sell_signal",
                                traded_sell_signal
                            )
                        }
                    )
                } else {
                    const alt = signal.pair.replace("BTC", "")
                    if (minimums[alt + "BTC"] && minimums[alt + "BTC"].minQty) {
                        const qty = signal.qty
                        ///
                        if (margin_pairs.includes(alt + "BTC")) {
                            console.log(
                                "CLOSE =========mgMarketSell=========> " +
                                    qty +
                                    " - " +
                                    alt +
                                    "BTC"
                            )
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
                                        return
                                    }
                                    console.log("SUCESS44444", alt, Number(qty))
                                    socket.emit(
                                        "traded_sell_signal",
                                        traded_sell_signal
                                    )
                                }
                            )
                        } else {
                            console.log(
                                "CLOSE =========marketSell=========> " +
                                    qty +
                                    " - " +
                                    alt +
                                    "BTC"
                            )
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
                                        return
                                    }
                                    console.log(
                                        "SUCESS 716611 marketSell",
                                        alt,
                                        Number(qty)
                                    )
                                    socket.emit(
                                        "traded_sell_signal",
                                        traded_sell_signal
                                    )
                                }
                            )
                        }
                        ///
                    } else {
                        console.log("PAIR UNKNOWN", alt)
                    }
                }
            } else {
                // VIRTUAL TRADE
                socket.emit("traded_sell_signal", traded_sell_signal)
            }
            //////
            delete trading_pairs[signal.pair + signal.stratid]
            delete trading_types[signal.pair + signal.stratid]
            delete sell_prices[signal.pair + signal.stratid]
            delete trading_qty[signal.pair + signal.stratid]
            delete open_trades[signal.pair + signal.stratid]
            //////
        } else if (trading_types[signal.pair + signal.stratid] === "SHORT") {
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
                trading_type: user_payload[tresult].trading_type,
                pair: signal.pair,
                qty: signal.qty,
            }
            //////
            if (user_payload[tresult].trading_type === "real") {
                console.log(signal.pair, " ---==---> BUY ", signal.qty)
                if (signal.pair == "BTCUSDT") {
                    bnb_client.mgMarketBuy(
                        "BTCUSDT",
                        signal.qty,
                        (error, response) => {
                            if (error) {
                                console.log(
                                    "ERROR 990099 BTCUSDT",
                                    Number(signal.qty),
                                    error.body
                                )
                                return
                            }
                            socket.emit("traded_buy_signal", traded_buy_signal)

                            console.log("----- mgRepay BTC -----")
                            bnb_client.mgRepay(
                                "BTC",
                                Number(signal.qty),
                                (error, response) => {
                                    if (error) {
                                        console.log(
                                            "ERROR BTC 9",
                                            Number(signal.qty),
                                            error.body
                                        )
                                        return
                                    }
                                    console.log("SUCCESS BTC 8")
                                }
                            )
                        }
                    )
                } else {
                    const alt = signal.pair.replace("BTC", "")
                    if (minimums[alt + "BTC"] && minimums[alt + "BTC"].minQty) {
                        const qty = trading_qty[signal.pair + signal.stratid]
                        console.log("QTY ==> " + qty + " - " + alt + "BTC")
                        bnb_client.mgMarketBuy(
                            alt + "BTC",
                            Number(qty),
                            (error, response) => {
                                if (error) {
                                    console.log(
                                        "ERROR 2 ",
                                        alt,
                                        Number(
                                            user_payload[tresult].buy_amount
                                        ),
                                        error.body
                                    )
                                    return
                                }
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
                                            return
                                        }
                                        console.log("SUCCESS 888888888888")
                                    }
                                )
                            }
                        )
                    } else {
                        console.log("PAIR UNKNOWN", alt)
                    }
                }
            } else {
                // VIRTUAL TRADE
                socket.emit("traded_buy_signal", traded_buy_signal)
            }
            //////
            delete trading_pairs[signal.pair + signal.stratid]
            delete trading_types[signal.pair + signal.stratid]
            delete buy_prices[signal.pair + signal.stratid]
            delete trading_qty[signal.pair + signal.stratid]
            delete open_trades[signal.pair + signal.stratid]
            //////
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
    const tresult = _.findIndex(user_payload, (o) => {
        return o.stratid == signal.stratid
    })
    if (tresult > -1) {
        if (open_trades[signal.pair + signal.stratid]) {
            delete open_trades[signal.pair + signal.stratid]
        }
    }
})

socket.on("user_payload", async (data) => {
    console.log(
        colors.grey("NBT HUB => user strategies + trading setup updated")
    )
    user_payload = data
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
                minimums[obj.symbol] = filters
            }
            console.log(`Exchange Minimums:`, Object.keys(minimums))
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
                    available_balances.push({
                        asset: asset,
                        available: balances[asset].available,
                        onOrder: balances[asset].onOrder,
                    })
                }
            }
            console.log("DONE", available_balances)
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
                    trading_pairs[s.pair + s.stratid] = true
                    open_trades[s.pair + s.stratid] = !s.stopped
                    trading_types[s.pair + s.stratid] = s.type
                    trading_qty[s.pair + s.stratid] = s.qty
                    buy_prices[s.pair + s.stratid] = new BigNumber(s.buy_price)
                    sell_prices[s.pair + s.stratid] = new BigNumber(
                        s.sell_price
                    )
                })
                console.log("Open Trades #:", _.values(trading_pairs).length)
                console.log("Open Trades:", trading_pairs)
                resolve(true)
            })
            .catch((e) => {
                console.log("ERROR UpdateOpenTrades", e.response.data)
                return reject(false)
            })
    })
}

async function run() {
    await ExchangeInfo()
    await UpdateOpenTrades()
    //await BalancesInfo()
}

run()
