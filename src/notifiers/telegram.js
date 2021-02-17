const TeleBot = require("telebot")
const _ = require("lodash")
const env = require("../env")

/**
 * @type {TeleBot}
 */
let telBot;

module.exports = function (trading_pairs) {
    if (!env.USE_TELEGRAM) return publicMethods;

    telBot = new TeleBot(env.TELEGRAM_API_KEY)

    // GET CHANEL ID
    telBot.on("/info", async (msg) => {
        let response = "Open Trades: " + _.values(trading_pairs).length + "\n"
        // response += "Chanel ID : "+msg.chat.id+"\n"  //IF UNCOMENT SHOW CHANEL ID
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
        parseMode: "markdown"
    })
}

function notifyExitLongSignal(signal) {
    return send(createSignalMessage("SELL_SIGNAL :: SELL TO EXIT LONG TRADE", signal));
}
function notifyExitLongTraded(signal) {
    return send(createSignalMessage("**>> SUCCESS! SELL_SIGNAL :: SELL TO EXIT LONG TRADE**", signal));
}
function notifyEnterLongSignal(signal) {
    return send(createSignalMessage("**BUY_SIGNAL :: ENTER LONG TRADE", signal));
}
function notifyEnterLongTraded(signal) {
    return send(createSignalMessage("**>> SUCCESS! BUY_SIGNAL :: ENTER LONG TRADE**", signal));
}
function notifyBuyToCoverSignal(signal) {
    return send(createSignalMessage("**BUY_SIGNAL :: BUY TO COVER SHORT TRADE", signal));
}
function notifyBuyToCoverTraded(signal) {
    return send(createSignalMessage("**>> SUCCESS! BUY_SIGNAL :: BUY TO COVER SHORT TRADE**", signal));
}
function notifyEnterShortSignal(signal) {
    return send(createSignalMessage("**SELL_SIGNAL :: ENTER SHORT TRADE", signal));
}
function notifyEnterShortTraded(signal) {
    return send(createSignalMessage("**>> SUCCESS! SELL_SIGNAL :: ENTER SHORT TRADE**", signal));
}

const publicMethods = {
    send,
    notifyExitLongSignal,
    notifyExitLongTraded,
    notifyEnterLongSignal,
    notifyEnterLongTraded,
    notifyBuyToCoverSignal,
    notifyBuyToCoverTraded,
    notifyEnterShortSignal,
    notifyEnterShortTraded,
}
