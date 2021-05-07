import { Market } from "ccxt"
import { Signal, Strategy, TradeOpen } from "./bva"

export interface TradingData {
    market: Market
    signal: Signal
    strategy: Strategy
}

// export interface TradingDataEnter extends TradingData {
//     quantity: number
// }

// export interface TradingDataExit extends TradingData {
//     tradeOpen: TradeOpen
// }

export interface TradingMetaData {
    strategies: Record<string, Strategy>
    tradesOpen: TradeOpen[]
}

export interface TradingSequence {
    after?: Promise<unknown>
    before?: Promise<unknown>
    mainAction: Promise<unknown>
    quantity: number
}
