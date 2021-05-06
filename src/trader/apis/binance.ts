import ccxt from "ccxt"

import env from "../env"
import logger from "../../logger"

const binanceClient = new ccxt.binance({
    apiKey: env.BINANCE_API_KEY,
    enableRateLimit: true,
    secret: env.BINANCE_SECRET_KEY,
})

export function getMarketsBva(markets: ccxt.Dictionary<ccxt.Market>): ccxt.Dictionary<ccxt.Market> {
    Object.keys(markets).forEach((key) => {
        const keyNew = markets[key].id
        markets[keyNew] = markets[key]
        delete markets[key]
    })
    return markets
}

export function loadMarkets(isReload?: boolean): Promise<ccxt.Dictionary<ccxt.Market>> {
    return new Promise((resolve, reject) => {
        binanceClient
            .loadMarkets(isReload)
            .then((markets) => {
                logger.info(`Loaded ${Object.keys(markets).length} markets.`)
                resolve(getMarketsBva(markets))
            })
            .catch((reason) => {
                logger.error(`Failed to get markets: ${reason}`)
                reject(reason)
            })
    })
}

export async function createMarketOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
    price?: number,
    params?: ccxt.Params
): Promise<ccxt.Order> {
    return binanceClient.createMarketOrder(symbol, side, amount, price, params)
}

export async function marginRepay(
    asset: string,
    amount: number,
    timestamp: number
): Promise<ccxt.Order> {
    return binanceClient.api.sapiPostMarginRepay({
        asset,
        isIsolated: false, // "false" for cross margin repay without specification of a symbol.
        amount,
        timestamp,
    })
}
