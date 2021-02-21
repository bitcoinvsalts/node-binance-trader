const _ = require("lodash")
const env = require("../env")
const TeleBot = require("telebot")

/**
 * @type {TeleBot}
 */
let telBot;

module.exports = function (trading_pairs) {
    if (!env.USE_TELEGRAM) return publicMethods;

    telBot = new TeleBot(env.TELEGRAM_API_KEY)

    // Get channel id.
    telBot.on("/info", async (msg) => {
        let response = "Open Trades: " + _.values(trading_pairs).length + "\n"
        // Uncomment to include channel id.
        // response += "Channel ID : "+msg.chat.id+"\n"
        return send(response)
    })


    telBot.on("start", () => {
        send("Trader Bot started!")
    })

    telBot.start()
    return publicMethods;
}

function createSignalMessage(base, signal) {
    let msg = base + " :: " + signal.stratname + ' ' + signal.pair + ' ' + signal.price + "\n"
    msg += (signal.score ? "score: " + signal.score : 'score: NA') + "\n"
    return msg
}

function send(message) {
    if (!env.USE_TELEGRAM || !telBot) return;

    return telBot.sendMessage(env.TELEGRAM_RECEIVER_ID, message, {
        parseMode: "html"
    })
}

function notifyBuyToCoverSignal(signal) {
    return send(createSignalMessage("<i>BUY_SIGNAL :: BUY TO COVER SHORT TRADE</i>", signal));
}
function notifyBuyToCoverTraded(signal) {
    return send(createSignalMessage("<b>>> SUCCESS! BUY_SIGNAL :: BUY TO COVER SHORT TRADE</b>", signal));
}
function notifyEnterLongSignal(signal) {
    return send(createSignalMessage("<i>BUY_SIGNAL :: ENTER LONG TRADE</i>", signal));
}
function notifyEnterLongTraded(signal) {
    return send(createSignalMessage("<b>>> SUCCESS! BUY_SIGNAL :: ENTER LONG TRADE</b>", signal));
}
function notifyEnterShortSignal(signal) {
    return send(createSignalMessage("<i>SELL_SIGNAL :: ENTER SHORT TRADE</i>", signal));
}
function notifyEnterShortTraded(signal) {
    return send(createSignalMessage("<b>>> SUCCESS! SELL_SIGNAL :: ENTER SHORT TRADE</b>", signal));
}
function notifyExitLongSignal(signal) {
    return send(createSignalMessage("<i>SELL_SIGNAL :: SELL TO EXIT LONG TRADE</i>", signal));
}
function notifyExitLongTraded(signal) {
    return send(createSignalMessage("<b>>> SUCCESS! SELL_SIGNAL :: SELL TO EXIT LONG TRADE</b>", signal));
}

const publicMethods = {
    notifyBuyToCoverSignal,
    notifyBuyToCoverTraded,
    notifyEnterLongSignal,
    notifyEnterLongTraded,
    notifyEnterShortSignal,
    notifyEnterShortTraded,
    notifyExitLongSignal,
    notifyExitLongTraded,
    send,
}
