import axios from "axios"

import env from "../env"
import logger from "../../logger"
import { BvaCommand, TradeOpen } from "../types/bva"

export async function getTradeOpenList(): Promise<TradeOpen[]> {
    return new Promise((resolve, reject) => {
        axios
            .get(
                `https://bitcoinvsaltcoins.com/api/useropentradedsignals?key=${
                    env().BVA_API_KEY
                }`
            )
            .then((response) => {
                const bvaCommand: BvaCommand = response.data
                const tradeOpens = bvaCommand.rows.map(
                    (tradeOpenJson) => new TradeOpen(tradeOpenJson)
                )

                const tradeOpenSymbols = tradeOpens
                    .map((tradeOpen) => tradeOpen.symbol)
                    .join(", ")
                logger.info(
                    `Fetched ${tradeOpens.length} open trades${
                        tradeOpenSymbols && ": " + tradeOpenSymbols
                    }.`
                )

                resolve(tradeOpens)
            })
            .catch((reason) => {
                logger.error(`Failed to get open trades: ${reason}`)
                reject(reason)
            })
    })
}
