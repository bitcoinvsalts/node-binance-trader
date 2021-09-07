import BigNumber from "bignumber.js"
import env from "../env"
import { Dictionary, Market } from "ccxt"
import { PositionType, Signal, Strategy, TradeOpen, TradingType } from "./bva"

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
    SELL = "sell",
    BORROW = "borrow",
    REPAY = "repay"
}

// Source of trade actions
export enum SourceType {
    SIGNAL = "Trade Signal",
    MANUAL = "User Action",
    REBALANCE = "Auto Balancing"
}

export interface TradingData {
    market: Market
    signal: Signal
    strategy: Strategy
}

export interface TradingMetaData {
    strategies: Dictionary<Strategy>
    tradesOpen: TradeOpen[]
    tradesClosing: Set<TradeOpen>
    markets: Dictionary<Market>
    virtualBalances: Dictionary<Dictionary<BigNumber>>
    transactions: Transaction[],
    balanceHistory: Dictionary<Dictionary<BalanceHistory[]>>
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
    potential?: BigNumber // Potental funds after rebalancing
    trades: TradeOpen[] // List of associated open trades
    largestTrade?: TradeOpen // Largest open trade

    constructor(type: WalletType) {
        this.type = type
        this.free = new BigNumber(0)
        this.locked = new BigNumber(0)
        this.total = new BigNumber(0)
        this.trades = []
    }
}

// Transaction log entries
export class Transaction {
    timestamp: Date // Date and time of this transaction
    tradeId: string // ID of the trade
    strategyId: string // ID of the strategy that initiated the trade
    strategyName: string // Name of the strategy that initiated the trade
    tradingType: TradingType // REAL or VIRTUAL
    source: SourceType // SIGNAL, MANUAL, or REBALANCE
    positionType: PositionType // SHORT or LONG
    action: ActionType // BUY, SELL, BORROW, or REPAY
    wallet: WalletType // MARGIN or SPOT
    symbolAsset: string // Either the symbol pair for buy/sell (e.g. ETHBTC) or just the individual asset for borrow/repay (e.g. ETH)
    quantity: BigNumber // They quantity of this transaction
    price?: BigNumber // The price for this transaction (only for buy/sell)
    value?: BigNumber // Either the original cost when the trade was opened or the recalcuated value when closed (only for buy/sell)
    signalPrice?: BigNumber // The expected price if initiated by a signal (only for buy/sell)
    timeSinceSignal?: number // The total time in milliseconds from receiving the signal to executing on Binance
    profitLoss?: BigNumber // Calculated profit or loss of the quote coin on a closing trade
    estimatedFee?: BigNumber // Estimated value of the fee calculated in the quote coin

    constructor(timestamp: Date, tradeOpen: TradeOpen, source: SourceType, action: ActionType, symbolAsset: string, quantity: BigNumber, signal?: Signal) {
        this.timestamp = timestamp
        this.tradeId = tradeOpen.id
        this.strategyId = tradeOpen.strategyId
        this.strategyName = tradeOpen.strategyName
        this.tradingType = tradeOpen.tradingType!
        this.source = source
        this.positionType = tradeOpen.positionType
        this.action = action
        this.wallet = tradeOpen.wallet!
        this.symbolAsset = symbolAsset
        this.quantity = quantity
        if (action == ActionType.BUY) {
            this.price = tradeOpen.priceBuy
        } else if (action == ActionType.SELL) {
            this.price = tradeOpen.priceSell
        }
        if (this.price) {
            this.value = this.quantity.multipliedBy(this.price)
            this.estimatedFee = this.value.multipliedBy(env().TAKER_FEE_PERCENT / 100).negated()
        }
        if (signal) {
            this.signalPrice = signal.price
            this.timeSinceSignal = timestamp.getTime() - signal.timestamp.getTime()
        }
        if ((action == ActionType.BUY || action == ActionType.SELL) && tradeOpen.priceBuy && tradeOpen.priceSell) {
            // Regardless of whether this was SHORT or LONG, you should always buy low and sell high
            this.profitLoss = tradeOpen.quantity.multipliedBy(tradeOpen.priceSell).minus(tradeOpen.quantity.multipliedBy(tradeOpen.priceBuy))
        }
    }
}

// Used for tracking history over time to calculate Profit and Loss
export class BalanceHistory {
    date: Date // Date and time that this history slice started
    openBalance: BigNumber // Opening balance
    closeBalance: BigNumber // Last observed balance
    profitLoss: BigNumber // Difference between open and close balance
    estimatedFees: BigNumber // Total estimated fees
    minOpenTrades?: number // Lowest number of concurrent open trades
    maxOpenTrades?: number // Highest number of concurrent open trades
    totalOpenedTrades: number // Total number of trades opened
    totalClosedTrades: number // Total number of trades closed

    constructor(balance: BigNumber) {
        this.date = new Date()
        this.date.setHours(0,0,0,0) // Clear the time
        this.openBalance = balance
        this.closeBalance = balance
        this.profitLoss = new BigNumber(0)
        this.estimatedFees = new BigNumber(0)
        this.totalOpenedTrades = 0
        this.totalClosedTrades = 0
    }
}