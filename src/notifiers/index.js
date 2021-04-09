const env = require("./../env")

module.exports = function (trading_pairs) {
    const notifiers = []

    if (env.USE_GMAIL) notifiers.push(require("./gmail")())
    if (env.USE_TELEGRAM) notifiers.push(require("./telegram")(trading_pairs))

    const notifyAllFor = (method, arg) =>
        notifiers.forEach((n) => n[method] && n[method](arg))

    return {
        notifyEnterLongSignal: (signal) =>
            notifyAllFor("notifyEnterLongSignal", signal),
        notifyEnterLongSignalTraded: (signal) =>
            notifyAllFor("notifyEnterLongSignalTraded", signal),
        notifyEnterShortSignal: (signal) =>
            notifyAllFor("notifyEnterShortSignal", signal),
        notifyEnterShortSignalTraded: (signal) =>
            notifyAllFor("notifyEnterShortSignalTraded", signal),
        notifyExitLongSignal: (signal) =>
            notifyAllFor("notifyExitLongSignal", signal),
        notifyExitLongSignalTraded: (signal) =>
            notifyAllFor("notifyExitLongSignalTraded", signal),
        notifyExitShortSignal: (signal) =>
            notifyAllFor("notifyExitShortSignal", signal),
        notifyExitShortSignalTraded: (signal) =>
            notifyAllFor("notifyExitShortSignalTraded", signal),
        send: (message) => notifyAllFor("send", message),
    }
}
