const env = require("./../env")

module.exports = function (trading_pairs) {
  const notifiers = [];
  if (env.USE_TELEGRAM)
    notifiers.push(require('./telegram')(trading_pairs))
  if (env.USE_GMAIL)
    notifiers.push(require('./gmail')())

  const notifyAllFor = (method, arg) => notifiers.forEach(n => n[method] && n[method](arg));

  return {
    notifyBuyToCoverSignal: signal => notifyAllFor("notifyBuyToCoverSignal", signal),
    notifyBuyToCoverTraded: signal => notifyAllFor("notifyBuyToCoverTraded", signal),
    notifyEnterLongSignal: signal => notifyAllFor("notifyEnterLongSignal", signal),
    notifyEnterLongTraded: signal => notifyAllFor("notifyEnterLongTraded", signal),
    notifyEnterShortSignal: signal => notifyAllFor("notifyEnterShortSignal", signal),
    notifyEnterShortTraded: signal => notifyAllFor("notifyEnterShortTraded", signal),
    notifyExitLongSignal: signal => notifyAllFor("notifyExitLongSignal", signal),
    notifyExitLongTraded: signal => notifyAllFor("notifyExitLongTraded", signal),
    send: message => notifyAllFor("send", message),
  }
}