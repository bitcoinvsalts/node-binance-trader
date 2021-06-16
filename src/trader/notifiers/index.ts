import { basename } from "path/posix"
import { EntryType, PositionType, Signal, TradeOpen } from "../types/bva"
import { MessageType, Notifier, NotifierMessage } from "../types/notifier"
import { SourceType } from "../types/trader"
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
    messageType: MessageType,
    signal?: Signal,
    tradeOpen?: TradeOpen,
    reason?: string
): NotifierMessage {
    const type = tradeOpen ? "trade" : signal ? "signal" : "Notification"
    const action = signal
        ? `${signal.entryType as EntryType} ${signal.symbol} ${signal.positionType} ${type}.`
        : tradeOpen
        ? `${tradeOpen.symbol} ${tradeOpen.positionType} ${type}.`
        : type

    const base = `${messageType} ${action}`.trim()
    const colour = messageType == MessageType.SUCCESS ? "#008000" : "#ff0000"
    const baseHtml = messageType == MessageType.INFO 
        ? `<b>${action}</b>`
        : `<font color=${colour}><b>${messageType}</b></font> ${action}`
    
    const content: string[] = [""]

    if (signal) {
        content.push("strategy: " + signal.strategyName)
        content.push("price: " + signal.price)
        content.push("score: ") + signal.score === "NA" ? "N/A" : signal.score
    } else if (tradeOpen) {
        content.push("strategy: " + tradeOpen.strategyName)
        content.push("price: " + tradeOpen.priceSell) // This should only happen when we are re-balancing a LONG trade, so buy and sell price will be the same anyway
    }

    if (tradeOpen) {
        content.push("quantity: " + tradeOpen.quantity)
        content.push("wallet: " + tradeOpen.wallet)
        content.push("type: " + tradeOpen.tradingType)
    }

    if (reason) {
        content.push("")
        content.push(reason)
    }

    return {
        subject: base,
        content: base + content.join("\n"),
        contentHtml: baseHtml + content.join("<br/>"),
    }
}
