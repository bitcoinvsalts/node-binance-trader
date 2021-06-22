import io from "socket.io-client"

import env from "./env"
import logger from "../logger"
import {
    onBuySignal,
    onCloseTradedSignal,
    onSellSignal,
    onStopTradedSignal,
    onUserPayload,
} from "./trader"
import {
    SignalJson,
    SignalTradedJson,
    StrategyJson,
    TradingType,
} from "./types/bva"
import BigNumber from "bignumber.js"

let socket: SocketIOClient.Socket

export function connect(): void {
    socket = io("https://nbt-hub.herokuapp.com", {
        query: `v=${env().VERSION}&type=client&key=${env().BVA_API_KEY}`,
    })

    socket.on("connect", () => logger.info("Trader connected."))
    socket.on("disconnect", () => logger.info("Trader disconnected."))

    socket.on("error", (error: any) =>
        logger.error(`Received error from socket: ${error}`)
    )

    socket.on("message", (message: string) => {
        logger.info(`Received a message: "${message}"`)
    })

    socket.on("user_payload", async (strategies: StrategyJson[]) => {
        logger.silly(`Received user_payload: ${JSON.stringify(strategies)}`)
        await onUserPayload(strategies).catch(() => {
            return
        })
    })

    socket.on("buy_signal", async (signalJson: SignalJson) => {
        logger.silly(`Received buy_signal: ${JSON.stringify(signalJson)}`)
        await onBuySignal(signalJson).catch(() => {
            return
        })
    })
    socket.on("sell_signal", async (signalJson: SignalJson) => {
        logger.silly(`Received sell_signal: ${JSON.stringify(signalJson)}`)
        await onSellSignal(signalJson).catch(() => {
            return
        })
    })

    socket.on("close_traded_signal", async (signalJson: SignalJson) => {
        logger.silly(`Received close_traded_signal: ${JSON.stringify(signalJson)}`)
        await onCloseTradedSignal(signalJson).catch(() => {
            return
        })
    })
    socket.on("stop_traded_signal", async (signalJson: SignalJson) => {
        logger.silly(`Received stop_traded_signal: ${JSON.stringify(signalJson)}`)
        await onStopTradedSignal(signalJson).catch(() => {
            return
        })
    })
}

export function emitSignalTraded(
    channel: string,
    symbol: string,
    strategyId: string,
    strategyName: string,
    quantity: BigNumber,
    tradingType: TradingType
): void {
    socket.emit(channel, getSignalTradedJson(symbol, strategyId, strategyName, quantity, tradingType))
}

export function getSignalTradedJson(
    symbol: string,
    strategyId: string,
    strategyName: string,
    quantity: BigNumber,
    tradingType: TradingType
): SignalTradedJson {
    return new SignalTradedJson({
        bvaApiKey: env().BVA_API_KEY,
        quantity: quantity.toString(),
        strategyId: strategyId,
        strategyName: strategyName,
        symbol: symbol,
        tradingType: tradingType,
    })
}

const exportFunctions = {
    connect,
    emitSignalTraded,
}

export default exportFunctions
