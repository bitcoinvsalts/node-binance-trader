import BigNumber from "bignumber.js"
import trader, {
    getOnSignalLogData,
    getTradeOpen,
    getTradeOpenFiltered,
    onBuySignal, onCloseTradedSignal, onSellSignal, onStopTradedSignal,
    onUserPayload,
    roundStep,
    tradingMetaData,
} from "./trader"
import {
    EntryType,
    PositionType,
    Signal,
    SignalJson,
    Strategy,
    StrategyJson,
    TradeOpen,
    TradingType,
} from "./types/bva"

beforeEach(() => {
    tradingMetaData.strategies = {}
    tradingMetaData.tradesOpen = []
})

afterEach(() => {
    jest.resetAllMocks()
})

describe("trader", () => {
    it ("acts on user payload", () => {
        const strategyJsonList: StrategyJson[] = [
            {
                buy_amount: 1,
                stop_loss: "1",
                stratid: "stratid1",
                take_profit: "2",
                trading: true,
                trading_type: "real",
            },
            {
                buy_amount: -1,
                stop_loss: "3",
                stratid: "stratid2",
                take_profit: "4",
                trading: false,
                trading_type: "virtual",
            },
        ]

        expect(tradingMetaData.strategies)
            .toEqual({})

        onUserPayload(strategyJsonList)

        const strategy1: Strategy = {
            tradeAmount: new BigNumber(1),
            stopLoss: 1,
            id: "stratid1",
            takeProfit: 2,
            isActive: true,
            tradingType: TradingType.real,
        }

        const strategy2: Strategy = {
            tradeAmount: new BigNumber(-1),
            stopLoss: 3,
            id: "stratid2",
            takeProfit: 4,
            isActive: false,
            tradingType: TradingType.virtual,
        }

        expect(tradingMetaData.strategies)
            .toEqual({ stratid1: strategy1, stratid2: strategy2 })
    })

    it ("acts on buy signal", async () => {
        const spy = jest.spyOn(trader, "trade").mockImplementation(() => Promise.resolve())
        const signalJsonNew: SignalJson = {
            new: true,
            nickname: "nickname",
            pair: "pair",
            price: "price",
            score: "score",
            stratid: "stratid",
            stratname: "stratname",
            userid: "userid",
        }
        const signalJsonOld: SignalJson = {
            ...signalJsonNew,
            new: false,
        }

        const signalNew: Signal = {
            entryType: EntryType.ENTER,
            nickname: "nickname",
            positionType: PositionType.LONG,
            price: "price",
            score: "score",
            strategyId: "stratid",
            strategyName: "stratname",
            symbol: "pair",
            userId: "userid",
        }
        const signalOld: Signal = {
            ...signalNew,
            entryType: EntryType.EXIT,
            positionType: PositionType.SHORT,
        }

        await onBuySignal(signalJsonNew)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(signalNew)

        spy.mockReset()

        await onBuySignal(signalJsonOld)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(signalOld)
    })

    it ("acts on sell signal", async () => {
        const spy = jest.spyOn(trader, "trade").mockImplementation(() => Promise.resolve())
        const signalJsonNew: SignalJson = {
            new: true,
            nickname: "nickname",
            pair: "pair",
            price: "price",
            score: "score",
            stratid: "stratid",
            stratname: "stratname",
            userid: "userid",
        }
        const signalJsonOld: SignalJson = {
            ...signalJsonNew,
            new: false,
        }

        const signalNew: Signal = {
            entryType: EntryType.ENTER,
            nickname: "nickname",
            positionType: PositionType.SHORT,
            price: "price",
            score: "score",
            strategyId: "stratid",
            strategyName: "stratname",
            symbol: "pair",
            userId: "userid",
        }
        const signalOld: Signal = {
            ...signalNew,
            entryType: EntryType.EXIT,
            positionType: PositionType.LONG,
        }

        await onSellSignal(signalJsonNew)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(signalNew)

        spy.mockReset()

        await onSellSignal(signalJsonOld)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(signalOld)
    })

    it ("acts on close traded signal", async () => {
        const spy = jest.spyOn(trader, "trade").mockImplementation(() => Promise.resolve())
        const signalJson: SignalJson = {
            new: false,
            nickname: "nickname",
            pair: "pair",
            price: "price",
            score: "score",
            stratid: "stratid",
            stratname: "stratname",
            userid: "userid",
        }

        const signal: Signal = {
            entryType: EntryType.EXIT,
            nickname: "nickname",
            positionType: undefined,
            price: "price",
            score: "score",
            strategyId: "stratid",
            strategyName: "stratname",
            symbol: "pair",
            userId: "userid",
        }

        await onCloseTradedSignal(signalJson)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(signal)
    })

    it ("acts on stop traded signal", async () => {
        const signalJson: SignalJson = {
            new: false,
            nickname: "nickname",
            pair: "pair",
            price: "price",
            score: "score",
            stratid: "stratid",
            stratname: "stratname",
            userid: "userid",
        }

        expect(onStopTradedSignal(signalJson)).toBe(false)

        const tradeOpen: TradeOpen = {
            id: "matches",
            isStopped: false,
            positionType: PositionType.LONG,
            priceBuy: new BigNumber(1),
            priceSell: new BigNumber(2),
            quantity: 10,
            strategyId: "stratid",
            strategyName: "stratname",
            symbol: "pair",
            timeBuy: 1,
            timeSell: 2,
            timeUpdated: 3,
        }

        tradingMetaData.tradesOpen = [tradeOpen]

        expect(tradingMetaData.tradesOpen[0].isStopped).toBe(false)
        expect(onStopTradedSignal(signalJson)).toBe(true)
        expect(tradingMetaData.tradesOpen[0].isStopped).toBe(true)
    })

    it ("gets on signal log data", () => {
        const signal: Signal = {
            entryType: EntryType.ENTER,
            nickname: "nickname",
            positionType: PositionType.LONG,
            price: "price",
            score: "score",
            strategyId: "strategyId",
            strategyName: "strategyName",
            symbol: "symbol",
            userId: "userId",
        }

        expect(getOnSignalLogData(signal))
            .toBe("for strategy strategyName (strategyId) and symbol symbol")
    })

    it("gets trade open (filtered)", () => {
        const strategyId = "strategyId"
        const strategyName = "strategyName"

        const signal: Signal = {
            entryType: EntryType.ENTER,
            nickname: "nickname",
            positionType: PositionType.LONG,
            price: "price",
            score: "score",
            strategyId,
            strategyName,
            symbol: "ETHBTC",
            userId: "userId",
        }
        const signalPositionTypeUnset: Signal = {
            ...signal,
            positionType: undefined,
        }

        const tradeOpenMatching: TradeOpen = {
            id: "matches",
            isStopped: false,
            positionType: PositionType.LONG,
            priceBuy: new BigNumber(1),
            priceSell: new BigNumber(2),
            quantity: 10,
            strategyId,
            strategyName,
            symbol: "ETHBTC",
            timeBuy: 1,
            timeSell: 2,
            timeUpdated: 3,
        }

        tradingMetaData.tradesOpen = [
            tradeOpenMatching,
            {
                ...tradeOpenMatching,
                id: "strategyIdWrong",
                strategyId: "wrong",
            },
            {
                ...tradeOpenMatching,
                id: "symbolWrong",
                symbol: "wrong",
            },
            {
                ...tradeOpenMatching,
                id: "positionTypeWrong",
                positionType: PositionType.SHORT,
            },
        ]

        expect(getTradeOpenFiltered(signal).length)
            .toEqual(1)
        expect(getTradeOpenFiltered(signalPositionTypeUnset).length)
            .toEqual(2)

        expect(getTradeOpen(signal))
            .toEqual(tradeOpenMatching)
        expect(getTradeOpen(signalPositionTypeUnset))
            .toEqual(undefined)
    })

    it("rounds step", () => expect(roundStep("10.987", "0.1"))
        .toEqual(10.9))
})
