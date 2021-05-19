import { EntryType, PositionType, Signal } from "../types/bva"
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

export function getNotifierMessage(
    signal: Signal,
    isSuccessful?: boolean
): NotifierMessage {
    const successString = "SUCCESS!"
    const action = `${signal.entryType as EntryType} ${signal.symbol} ${
        signal.positionType as PositionType
    } trade.`
    const base = isSuccessful ? `${successString} ${action}` : `${action}`
    const baseHtml = isSuccessful
        ? `<b>${successString}</b> ${action}`
        : `<b>${action}</b>`
    const content =
        "\n" +
        "strategy: " +
        signal.strategyName +
        "\n" +
        "price: " +
        signal.price +
        "\n" +
        "score: " +
        (signal.score === "NA" ? "N/A" : signal.score)

    return {
        subject: base,
        content: base + content,
        contentHtml: baseHtml + content.replace(/\n/g, "<br/>"),
    }
}
