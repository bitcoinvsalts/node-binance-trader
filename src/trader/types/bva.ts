import BigNumber from "bignumber.js"

/////

export enum EntryType {
    ENTER,
    EXIT,
}

export enum PositionType {
    LONG = "LONG",
    SHORT = "SHORT",
}

export enum TradingType {
    real = "real",
    virtual = "virtual",
}

/////

export class Strategy {
    id: string
    isActive: boolean
    stopLoss: number
    takeProfit: number
    tradeAmount: BigNumber
    tradingType: TradingType

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
    id?: string
    isStopped?: boolean
    positionType: PositionType
    priceBuy?: BigNumber
    priceSell?: BigNumber
    quantity: number
    strategyId: string
    strategyName: string
    symbol: string
    timeBuy?: number
    timeSell?: number
    timeUpdated: number

    constructor(tradeOpenJson: TradeOpenJson) {
        this.positionType = tradeOpenJson.type as PositionType
        this.priceBuy = new BigNumber(tradeOpenJson.buy_price)
        this.priceSell = tradeOpenJson.sell_price
            ? new BigNumber(tradeOpenJson.sell_price)
            : undefined
        this.quantity = Number(tradeOpenJson.qty)
        this.strategyId = tradeOpenJson.stratid
        this.strategyName = tradeOpenJson.stratname
        this.symbol = tradeOpenJson.pair
        this.timeBuy = Number(tradeOpenJson.buy_time)
        this.timeSell = Number(tradeOpenJson.sell_time)
        this.timeUpdated = Number(tradeOpenJson.updated_time)
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
    price: BigNumber
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
        this.positionType = positionType
        this.price = new BigNumber(signalJson.price)
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
