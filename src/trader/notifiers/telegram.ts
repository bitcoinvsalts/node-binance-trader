import TeleBot from "telebot"

import env from "../env"
import { Notifier, NotifierMessage } from "../types/notifier"
import { getTradeOpenList } from "../apis/bva"
import logger from "../../logger"

let telBot: TeleBot

export default function (): Notifier {
    telBot = new TeleBot(env().NOTIFIER_TELEGRAM_API_KEY)
    telBot.on("/info", async (msg) => {
        const tradeOpenList = await getTradeOpenList().catch((reason) => {
            logger.error(reason)
            return Promise.reject(reason)
        })
        return notify({
            content:
                `Open Trades: ${tradeOpenList.length} - ${tradeOpenList
                    .map((tradeOpen) => tradeOpen.symbol)
                    .join(", ")}\n` + `Channel Chat ID: ${msg.chat.id}`,
        }, msg.from.id)
    })
    telBot.on("start", async () => {
        await notify({
            content: "Trader Bot started!",
        }).catch((reason) => {
            logger.error(reason)
            return Promise.reject(reason)
        })
    })
    telBot.start()

    return {
        notify,
    }
}

async function notify(notifierMessage: NotifierMessage, fromId?: string): Promise<void> {
    if (!env().IS_NOTIFIER_TELEGRAM_ENABLED || !telBot) return

    return telBot.sendMessage(
        fromId || env().NOTIFIER_TELEGRAM_RECEIVER_ID,
        notifierMessage.content,
        /*{
            parseMode: "html",
        }*/
    )
}
