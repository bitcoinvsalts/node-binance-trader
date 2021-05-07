import { Signal } from "../types/bva"
import { Notifier, NotifierMessage } from "../types/notifier"
import env from "./../env"
import gmail from "./gmail"
import telegram from "./telegram"

const notifiers: Notifier[] = []

export default function initializeNotifiers(): Notifier {
    if (env().IS_NOTIFIER_GMAIL_ENABLED) notifiers.push(gmail())
    if (env().IS_NOTIFIER_TELEGRAM_ENABLED) notifiers.push(telegram())

    return {
        notify: notifyAll,
    }
}

export function notifyAll(notifierMessage: NotifierMessage): Promise<void> {
    return new Promise((resolve) => {
        Promise.all(
            notifiers.map((notifier) => notifier.notify(notifierMessage))
        ).then(() => resolve())
    })
}

export function getNotifierMessage(signal: Signal, isSuccessful?: boolean): NotifierMessage {
    const successString = "SUCCESS!"
    const action = `${signal.entryType} ${signal.symbol} ${signal.positionType} trade.`
    const base = isSuccessful ? `${successString} ${action}` : `${action}`
    const baseHtml = isSuccessful
        ? `<b>${successString}</b> ${action}`
        : `<b>${action}</b>`

    return {
        subject: base,
        content:
            baseHtml +
            "\n" +
            "strategy: " +
            signal.strategyName +
            "\n" +
            "price: " +
            signal.price +
            "\n" +
            "score: " +
            (signal.score === "NA" ? "N/A" : signal.score),
    }
}
