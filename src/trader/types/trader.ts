import BigNumber from "bignumber.js"

import { Dictionary, Market } from "ccxt"
import { Signal, Strategy, TradeOpen } from "./bva"

// Represents the different wallet types in Binance
export enum WalletType {
    SPOT = "spot",
    MARGIN = "margin",
}

// Represents the different trading/auto balancing models
export enum LongFundsType {
    NONE = "",
    BORROW_MIN = "borrow min",
    BORROW_ALL = "borrow all",
    SELL_ALL = "sell all",
    SELL_LARGEST = "sell largest",
}

// Actions to execute trades
export enum ActionType {
    BUY = "buy",
    SELL = "sell"
}

export interface TradingData {
    market: Market
    signal: Signal
    strategy: Strategy
}

export interface TradingMetaData {
    strategies: Dictionary<Strategy>
    tradesOpen: TradeOpen[]
    markets: Dictionary<Market>
}

export interface TradingSequence {
    after?: () => Promise<unknown>
    before?: () => Promise<unknown>
    mainAction: () => Promise<unknown>
    socketChannel: string
}

// Data used to assist with rebalancing
export class WalletData {
    type: WalletType // MARGIN or SPOT
    free: BigNumber // Total funds available for trade
    locked: BigNumber // Total funds locked in open trades
    total: BigNumber // Free + Locked
    trades: number // Number of open trades
    largest?: TradeOpen // Largest open trade
    potential?: BigNumber // Potental funds after rebalancing

    constructor(type: WalletType) {
        this.type = type
        this.free = new BigNumber(0)
        this.locked = new BigNumber(0)
        this.total = new BigNumber(0)
        this.trades = 0
    }
}