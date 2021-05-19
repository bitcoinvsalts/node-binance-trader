import TeleBot from "telebot"

import env from "../env"
import { Notifier, NotifierMessage } from "../types/notifier"
import { getTradeOpenList } from "../apis/bva"

let telBot: TeleBot

export default function (): Notifier {
    telBot = new TeleBot(env().NOTIFIER_TELEGRAM_API_KEY)
    telBot.on("/info", async (msg) => {
        const tradeOpenList = await getTradeOpenList().catch((reason) => {
            return Promise.reject(reason)
        })
        return notify({
            content:
                `Open Trades: ${tradeOpenList.length} - ${tradeOpenList
                    .map((tradeOpen) => tradeOpen.symbol)
                    .join(", ")}\n` + `Channel ID: ${msg.chat.id}`,
        })
    })
    telBot.on("start", async () => {
        await notify({
            content: "Trader Bot started!",
        }).catch((reason) => {
            return Promise.reject(reason)
        })
    })
    telBot.start()

    return {
        notify,
    }
}

async function notify(notifierMessage: NotifierMessage): Promise<void> {
    if (!env().IS_NOTIFIER_TELEGRAM_ENABLED || !telBot) return

    return new Promise((resolve, reject) => {
        try {
            telBot.sendMessage(
                env().NOTIFIER_TELEGRAM_RECEIVER_ID,
                notifierMessage.contentHtml || notifierMessage.content,
                {
                    parseMode: "html",
                }
            )
            resolve()
        } catch (e) {
            reject(e)
        }
    })
}
