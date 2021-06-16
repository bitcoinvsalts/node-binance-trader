import BigNumber from "bignumber.js"
import { WalletType } from "./trader"

/////

export enum EntryType {
    ENTER = "ENTER", // New/open signal from the NBT Hub
    EXIT = "EXIT", // Stop signal from the NBT Hub
}

export enum PositionType {
    LONG = "LONG", // Buy first then sell
    SHORT = "SHORT", // Borrow to sell first then buy to repay
}

export enum TradingType {
    real = "real", // Execute trades on Binance
    virtual = "virtual", // Simulate trades in memory
}

/////

export class Strategy {
    id: string
    isActive: boolean
    stopLoss: number
    takeProfit: number
    tradeAmount: BigNumber
    tradingType: TradingType

    isStopped: boolean
    lossTradeRun: number

    constructor(bvaStrategyJson: StrategyJson) {
        this.id = bvaStrategyJson.stratid
        this.isActive = bvaStrategyJson.trading
        this.stopLoss = parseFloat(bvaStrategyJson.stop_loss)
        this.takeProfit = parseFloat(bvaStrategyJson.take_profit)
        this.tradeAmount = new BigNumber(bvaStrategyJson.buy_amount)
        this.tradingType =
            TradingType[
                bvaStrategyJson.trading_type as keyof typeof TradingType
            ]

        this.isStopped = false // Default doesn't come from the NBT Hub, will be stopped if it hits the loss limit
        this.lossTradeRun = 0 // Used to check for loss limit
    }
}

// Example:
// [
//     {
//       buy_amount: '0.002',
//       stop_loss: '0',
//       stratid: '466',
//       take_profit: '0'
//       trading_type: 'virtual',
//       trading: true,
//     }
// ]

export interface StrategyJson {
    buy_amount: number
    stop_loss: string
    stratid: string
    take_profit: string
    trading: boolean
    trading_type: string
}

/////

export interface TradeOpenJson {
    buy_price: string
    buy_time: string
    id: string
    pair: string
    qty: string
    sell_price: string | null
    sell_time: string | null
    stopped: boolean | null
    stratid: string
    stratname: string
    type: string
    updated_time: string
}

export class TradeOpen {
    id: string
    isStopped: boolean
    positionType: PositionType
    tradingType?: TradingType // Comes from the strategy
    priceBuy?: BigNumber
    priceSell?: BigNumber
    quantity: BigNumber
    cost?: BigNumber // Comes from the strategy or is calculated
    borrow?: BigNumber // This doesn't come from the NBT Hub, needs to be derived from trader logic
    wallet?: WalletType // This doesn't come from the NBT Hub, needs to be derived from trader logic
    strategyId: string
    strategyName: string
    symbol: string
    timeBuy?: Date
    timeSell?: Date
    timeUpdated: Date
    executed: boolean

    constructor(tradeOpenJson: TradeOpenJson) {
        this.id = tradeOpenJson.id
        this.isStopped = tradeOpenJson.stopped != null && tradeOpenJson.stopped
        this.positionType = tradeOpenJson.type as PositionType
        this.priceBuy = tradeOpenJson.buy_price
            ? new BigNumber(tradeOpenJson.buy_price)
            : undefined
        this.priceSell = tradeOpenJson.sell_price
            ? new BigNumber(tradeOpenJson.sell_price)
            : undefined
        this.quantity = new BigNumber(tradeOpenJson.qty)
        this.strategyId = tradeOpenJson.stratid
        this.strategyName = tradeOpenJson.stratname
        this.symbol = tradeOpenJson.pair
        this.timeBuy = tradeOpenJson.buy_time
            ? new Date(Number(tradeOpenJson.buy_time))
            : undefined
        this.timeSell = tradeOpenJson.sell_time
            ? new Date(Number(tradeOpenJson.sell_time))
            : undefined
        this.timeUpdated = new Date(Number(tradeOpenJson.updated_time))
        this.executed = true
    }
}

/////

export interface BvaCommand {
    rowCount: number
    rows: TradeOpenJson[]
}

/////

export class Signal {
    entryType: EntryType
    nickname: string
    positionType?: PositionType
    price?: BigNumber
    score: string
    strategyId: string
    strategyName: string
    symbol: string
    userId: string

    constructor(
        signalJson: SignalJson,
        positionType?: PositionType // Currently a hack as BVA's signals contain this information only implicitly through the differentiation between buy and sell signals.
    ) {
        this.entryType = signalJson.new ? EntryType.ENTER : EntryType.EXIT
        this.nickname = signalJson.nickname
        this.positionType = positionType // Will typically be null initially, then set once the signal is decoded
        this.price = signalJson.price ? new BigNumber(signalJson.price) : signalJson.close_price ? new BigNumber(signalJson.close_price) : undefined
        this.score = signalJson.score
        this.strategyId = signalJson.stratid
        this.strategyName = signalJson.stratname
        this.symbol = signalJson.pair
        this.userId = signalJson.userid
    }
}

// {
//     userid: "1472",
//     nickname: "dsyntech",
//     stratid: "681",
//     stratname: "DS STRATEGY USDT",
//     pair: "GXSUSDT",
//     price: "0.92450000",
//     new: false,
//     score: "NA",
// }

export interface SignalJson {
    new: boolean
    nickname: string
    pair: string
    price: string
    close_price: string // Used instead of 'price' in a close_traded_signal
    score: string // A stringified number or "NA".
    stratid: string
    stratname: string
    userid: string
}

/////

export interface SignalTraded {
    bvaApiKey: string
    quantity: string
    strategyId: string
    strategyName: string
    symbol: string
    tradingType: TradingType
}

export class SignalTradedJson {
    key: string
    pair: string
    qty: string
    stratid: string
    stratname: string
    trading_type: TradingType

    constructor(signalTraded: SignalTraded) {
        this.key = signalTraded.bvaApiKey
        this.pair = signalTraded.symbol
        this.qty = signalTraded.quantity
        this.stratid = signalTraded.strategyId
        this.stratname = signalTraded.strategyName
        this.trading_type = signalTraded.tradingType
    }
}
