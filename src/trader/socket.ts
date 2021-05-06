import io from "socket.io-client"

import env from "./env"
import logger from "../logger"
import { onBuySignal, onCloseTradedSignal, onSellSignal, onStopTradedSignal, onUserPayload } from "./trader"
import { Signal, SignalJson, SignalTradedJson, Strategy, StrategyJson } from "./types/bva"

let socket: SocketIOClient.Socket

if (process.env.NODE_ENV !== "test") {
    socket = io("https://nbt-hub.herokuapp.com", {
        query: `v=${env.VERSION}&type=client&key=${env.BVA_API_KEY}`,
    })
}

export default function connect(): void {
    socket.on("connect", () => logger.info("Trader connected."))
    socket.on("disconnect", () => logger.info("Trader disconnected."))

    socket.on("error", (error: any) => logger.error(error))

    socket.on("message", (message: string) => {
        logger.info(`Received a message: "${message}"`)
    })

    socket.on("user_payload", async (strategies: StrategyJson[]) => {
        logger.debug(`Received user_payload: ${JSON.stringify(strategies)}`)
        onUserPayload(strategies)
    })

    socket.on("buy_signal", async (signalJson: SignalJson) => {
        logger.debug(`Received buy_signal: ${JSON.stringify(signalJson)}`)
        await onBuySignal(signalJson)
    })
    socket.on("sell_signal", async (signalJson: SignalJson) => {
        logger.debug(`Received sell_signal: ${JSON.stringify(signalJson)}`)
        await onSellSignal(signalJson)
    })

    socket.on("close_traded_signal", async (signalJson: SignalJson) => {
        logger.debug(`Received close_traded_signal: ${JSON.stringify(signalJson)}`)
        await onCloseTradedSignal(signalJson)
    })
    socket.on("stop_traded_signal", async (signalJson: SignalJson) => {
        logger.debug(`Received stop_traded_signal: ${JSON.stringify(signalJson)}`)
        onStopTradedSignal(signalJson)
    })
}

export function emitSignalTraded(channel: string, signal: Signal, strategy: Strategy, quantity: number): void {
    socket.emit(
        channel,
        getSignalTradedJson(signal, strategy, quantity)
    )
}

export function getSignalTradedJson(signal: Signal, strategy: Strategy, quantity: number): SignalTradedJson {
    return new SignalTradedJson({
        bvaApiKey: env.BVA_API_KEY,
        quantity: quantity.toString(),
        strategyId: signal.strategyId,
        strategyName: signal.strategyName,
        symbol: signal.symbol,
        tradingType: strategy.tradingType,
    })
}
