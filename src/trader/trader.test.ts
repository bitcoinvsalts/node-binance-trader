import BigNumber from "bignumber.js"
import stripAnsi from "strip-ansi"

import socket from "./socket"
import trader, {
    getOnSignalLogData,
    getTradeOpen,
    getTradeOpenFiltered,
    getTradingSequence,
    executeTradingTask,
    onBuySignal,
    onCloseTradedSignal,
    onSellSignal,
    onStopTradedSignal,
    onUserPayload,
    roundStep,
    trade,
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
import * as binance from "./apis/binance"
import { Market } from "ccxt"
import { getDefault, setDefault } from "./env"
import { TradingData, TradingSequence } from "./types/trader"
import { loggerOutput, resetLoggerOutput } from "../logger"

beforeAll(() => {
    const date = new Date(0)
    date.setTime(date.getTime() + date.getTimezoneOffset() * 60 * 1000)
    jest.useFakeTimers("modern")
    jest.setSystemTime(date)
})

afterAll(() => {
    jest.useRealTimers()
})

beforeEach(() => {
    tradingMetaData.strategies = {}
    tradingMetaData.tradesOpen = []
})

afterEach(() => {
    jest.resetAllMocks()
    resetLoggerOutput()
})

describe("trader", () => {
    it("acts on user payload", () => {
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

        expect(tradingMetaData.strategies).toEqual({})

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

        expect(tradingMetaData.strategies).toEqual({
            stratid1: strategy1,
            stratid2: strategy2,
        })
    })

    it("acts on buy signal", async () => {
        const spy = jest
            .spyOn(trader, "trade")
            .mockImplementation(() => Promise.resolve())
        const signalJsonNew: SignalJson = {
            new: true,
            nickname: "nickname",
            pair: "pair",
            price: "1",
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
            price: new BigNumber(1),
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

        spy.mockClear()

        await onBuySignal(signalJsonOld)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(signalOld)
    })

    it("acts on sell signal", async () => {
        const spy = jest
            .spyOn(trader, "trade")
            .mockImplementation(() => Promise.resolve())
        const signalJsonNew: SignalJson = {
            new: true,
            nickname: "nickname",
            pair: "pair",
            price: "1",
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
            price: new BigNumber(1),
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

        spy.mockClear()

        await onSellSignal(signalJsonOld)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(signalOld)
    })

    it("acts on close traded signal", async () => {
        const spy = jest
            .spyOn(trader, "trade")
            .mockImplementation(() => Promise.resolve())
        const signalJson: SignalJson = {
            new: false,
            nickname: "nickname",
            pair: "pair",
            price: "1",
            score: "score",
            stratid: "stratid",
            stratname: "stratname",
            userid: "userid",
        }

        const signal: Signal = {
            entryType: EntryType.EXIT,
            nickname: "nickname",
            positionType: undefined,
            price: new BigNumber(1),
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

    it("acts on stop traded signal", async () => {
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

    it("validates trading data", async () => {
        const signal: Signal = {
            entryType: EntryType.ENTER,
            nickname: "nickname",
            positionType: PositionType.LONG,
            price: new BigNumber(1),
            score: "score",
            strategyId: "strategyId",
            strategyName: "strategyName",
            symbol: "ETH/BTC",
            userId: "userId",
        }

        const strategy: Strategy = {
            tradeAmount: new BigNumber(1),
            stopLoss: 1,
            id: "strategyId",
            takeProfit: 2,
            isActive: false,
            tradingType: TradingType.real,
        }

        await trade(signal)
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toBe(
                    "Skipping signal as strategy strategyId \"strategyName\" isn't followed."
                )
            )

        tradingMetaData.strategies = { strategyId: strategy }

        await trade(signal)
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toBe(
                    "Skipping signal as strategy strategyId \"strategyName\" isn't active."
                )
            )

        tradingMetaData.strategies.strategyId.isActive = true

        const spy = jest
            .spyOn(binance, "fetchMarkets")
            .mockImplementation(() => Promise.resolve({}))

        await trade(signal)
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toBe(
                    "Skipping signal as there is no market data for symbol ETH/BTC."
                )
            )

        const market: Market = {
            limits: {
                amount: { min: 0.001, max: 100000 },
                price: { min: 0.000001, max: 100000 },
                cost: { min: 0.0001, max: 0 }, // "max" didn't come with this dataset originally and was added due to typescript constraints.
                // market: { min: 0, max: 1695.00721821 },
            },
            precision: { base: 8, quote: 8, amount: 3, price: 6 },
            tierBased: false,
            percentage: true,
            taker: 0.001,
            maker: 0.001,
            id: "ETHBTC",
            symbol: "ETH/BTC",
            base: "ETH",
            quote: "BTC",
            baseId: "ETH",
            quoteId: "BTC",
            info: {},
            type: "spot",
            spot: false,
            margin: false,
            future: false,
            active: false,
        }

        spy.mockImplementation(() =>
            Promise.resolve({
                "ETH/BTC": market,
            })
        )

        await trade(signal)
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toBe(
                    "Failed to trade as the market for symbol ETH/BTC is inactive."
                )
            )

        market.active = true

        await trade(signal)
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toBe(
                    "Failed to trade as neither margin trading nor spot trading is available for symbol ETH/BTC."
                )
            )

        signal.entryType = EntryType.ENTER
        signal.positionType = PositionType.LONG
        market.spot = false
        market.margin = true

        await trade(signal)
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toBe(
                    "Failed to trade as spot trading is unavailable for a long position on symbol ETH/BTC."
                )
            )

        signal.entryType = EntryType.ENTER
        signal.positionType = PositionType.SHORT
        market.spot = true
        market.margin = false

        setDefault({ ...getDefault, IS_TRADE_MARGIN_ENABLED: undefined })

        await trade(signal)
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toBe(
                    "Skipping signal as margin trading is disabled but required to exit a short position."
                )
            )

        setDefault({ ...getDefault, IS_TRADE_MARGIN_ENABLED: false })

        await trade(signal)
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toBe(
                    "Skipping signal as margin trading is disabled but required to exit a short position."
                )
            )

        setDefault({ ...getDefault, IS_TRADE_MARGIN_ENABLED: true })

        await trade(signal)
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toBe(
                    "Failed to trade as margin trading is unavailable for a short position on symbol ETH/BTC."
                )
            )
    })

    it("gets trading sequence", async () => {
        const signal: Signal = {
            entryType: EntryType.ENTER,
            nickname: "nickname",
            positionType: PositionType.LONG,
            price: new BigNumber(1),
            score: "score",
            strategyId: "stratid",
            strategyName: "stratname",
            symbol: "ETH/BTC",
            userId: "userId",
        }

        const strategy: Strategy = {
            tradeAmount: new BigNumber(1),
            stopLoss: 1,
            id: "stratid",
            takeProfit: 2,
            isActive: false,
            tradingType: TradingType.real,
        }

        const market: Market = {
            limits: {
                amount: { min: 0.001, max: 100000 },
                price: { min: 0.000001, max: 100000 },
                cost: { min: 0.0001, max: 0 }, // "max" didn't come with this dataset originally and was added due to typescript constraints.
                // market: { min: 0, max: 1695.00721821 },
            },
            precision: { base: 8, quote: 8, amount: 3, price: 6 },
            tierBased: false,
            percentage: true,
            taker: 0.001,
            maker: 0.001,
            id: "ETHBTC",
            symbol: "ETH/BTC",
            base: "ETH",
            quote: "BTC",
            baseId: "ETH",
            quoteId: "BTC",
            info: {},
            type: "spot",
            spot: false,
            margin: false,
            future: false,
            active: false,
        }

        signal.entryType = EntryType.ENTER
        signal.positionType = PositionType.LONG
        market.margin = true
        setDefault({ ...getDefault, IS_TRADE_MARGIN_ENABLED: false })

        await getTradingSequence({
            market,
            signal,
            strategy,
        })
            .then((value) =>
                expect(JSON.stringify(value)).toBe(
                    JSON.stringify({
                        after: undefined,
                        before: undefined,
                        mainAction: function order() {
                            return Promise.resolve()
                        },
                        quantity: 1,
                        socketChannel: "traded_buy_signal",
                    })
                )
            )
            .catch((reason) => fail(reason))

        signal.entryType = EntryType.ENTER
        signal.positionType = PositionType.LONG
        market.margin = true
        setDefault({ ...getDefault, IS_TRADE_MARGIN_ENABLED: true })

        await getTradingSequence({
            market,
            signal,
            strategy,
        })
            .then((value) =>
                expect(JSON.stringify(value)).toBe(
                    JSON.stringify({
                        after: undefined,
                        before: () => Promise.resolve(),
                        mainAction: function order() {
                            return Promise.resolve()
                        },
                        quantity: 1,
                        socketChannel: "traded_buy_signal",
                    })
                )
            )
            .catch((reason) => fail(reason))

        signal.entryType = EntryType.ENTER
        signal.positionType = PositionType.SHORT

        await getTradingSequence({
            market,
            signal,
            strategy,
        })
            .then((value) =>
                expect(JSON.stringify(value)).toBe(
                    JSON.stringify({
                        after: undefined,
                        before: () => Promise.resolve(),
                        mainAction: function order() {
                            return Promise.resolve()
                        },
                        quantity: 1,
                        socketChannel: "traded_sell_signal",
                    })
                )
            )
            .catch((reason) => fail(reason))

        signal.entryType = EntryType.EXIT
        signal.positionType = PositionType.LONG
        market.margin = true
        setDefault({ ...getDefault, IS_TRADE_MARGIN_ENABLED: true })

        await getTradingSequence({
            market,
            signal,
            strategy,
        })
            .then((value) => fail(value))
            .catch((reason) =>
                expect(reason).toEqual(
                    "Skipping signal as there was no associated open trade found."
                )
            )

        const tradeOpen: TradeOpen = {
            id: "matches",
            isStopped: false,
            positionType: PositionType.LONG,
            priceBuy: new BigNumber(1),
            priceSell: new BigNumber(2),
            quantity: 10,
            strategyId: "stratid",
            strategyName: "stratname",
            symbol: "ETH/BTC",
            timeBuy: 1,
            timeSell: 2,
            timeUpdated: 3,
        }

        tradingMetaData.tradesOpen = [
            tradeOpen,
            { ...tradeOpen, positionType: PositionType.SHORT },
        ]

        signal.entryType = EntryType.EXIT
        signal.positionType = PositionType.LONG
        market.margin = true
        setDefault({ ...getDefault, IS_TRADE_MARGIN_ENABLED: true })

        await getTradingSequence({
            market,
            signal,
            strategy,
        })
            .then((value) =>
                expect(JSON.stringify(value)).toBe(
                    JSON.stringify({
                        after: () => Promise.resolve(),
                        before: undefined,
                        mainAction: function order() {
                            return Promise.resolve()
                        },
                        quantity: 10,
                        socketChannel: "traded_sell_signal",
                    })
                )
            )
            .catch((reason) => fail(reason))

        signal.entryType = EntryType.EXIT
        signal.positionType = PositionType.LONG
        market.margin = false
        setDefault({ ...getDefault, IS_TRADE_MARGIN_ENABLED: true })

        await getTradingSequence({
            market,
            signal,
            strategy,
        })
            .then((value) =>
                expect(JSON.stringify(value)).toBe(
                    JSON.stringify({
                        after: undefined,
                        before: undefined,
                        mainAction: function order() {
                            return Promise.resolve()
                        },
                        quantity: 10,
                        socketChannel: "traded_sell_signal",
                    })
                )
            )
            .catch((reason) => fail(reason))

        signal.entryType = EntryType.EXIT
        signal.positionType = PositionType.SHORT

        await getTradingSequence({
            market,
            signal,
            strategy,
        })
            .then((value) =>
                expect(JSON.stringify(value)).toBe(
                    JSON.stringify({
                        after: () => Promise.resolve(),
                        before: undefined,
                        mainAction: function order() {
                            return Promise.resolve()
                        },
                        quantity: 10,
                        socketChannel: "traded_buy_signal",
                    })
                )
            )
            .catch((reason) => fail(reason))

        strategy.tradingType = TradingType.virtual

        await getTradingSequence({
            market,
            signal,
            strategy,
        })
            .then((value) =>
                expect(JSON.stringify(value)).toBe(
                    JSON.stringify({
                        after: () => Promise.resolve(),
                        before: () => Promise.resolve(),
                        mainAction: () => Promise.resolve(),
                        quantity: 10,
                        socketChannel: "traded_buy_signal",
                    })
                )
            )
            .catch((reason) => fail(reason))
    })

    it("executes a trading task", async () => {
        const market: Market = {
            limits: {
                amount: { min: 0.001, max: 100000 },
                price: { min: 0.000001, max: 100000 },
                cost: { min: 0.0001, max: 0 }, // "max" didn't come with this dataset originally and was added due to typescript constraints.
                // market: { min: 0, max: 1695.00721821 },
            },
            precision: { base: 8, quote: 8, amount: 3, price: 6 },
            tierBased: false,
            percentage: true,
            taker: 0.001,
            maker: 0.001,
            id: "ETHBTC",
            symbol: "ETH/BTC",
            base: "ETH",
            quote: "BTC",
            baseId: "ETH",
            quoteId: "BTC",
            info: {},
            type: "spot",
            spot: false,
            margin: false,
            future: false,
            active: false,
        }

        const signal: Signal = {
            entryType: EntryType.ENTER,
            nickname: "nickname",
            positionType: PositionType.LONG,
            price: new BigNumber(1),
            score: "score",
            strategyId: "strategyId",
            strategyName: "strategyName",
            symbol: "ETH/BTC",
            userId: "userId",
        }

        const strategy: Strategy = {
            tradeAmount: new BigNumber(1),
            stopLoss: 1,
            id: "strategyId",
            takeProfit: 2,
            isActive: false,
            tradingType: TradingType.real,
        }

        const tradingData: TradingData = {
            market,
            signal,
            strategy,
        }

        const jestFunctionBefore = jest.fn()
        const jestFunctionMainAction = jest.fn()
        const jestFunctionAfter = jest.fn()

        const tradingSequence: TradingSequence = {
            before: () =>
                new Promise((resolve) => {
                    jestFunctionBefore()
                    resolve(undefined)
                }),
            mainAction: () =>
                new Promise((resolve) => {
                    jestFunctionMainAction()
                    resolve(undefined)
                }),
            after: () =>
                new Promise((resolve) => {
                    jestFunctionAfter()
                    resolve(undefined)
                }),
            quantity: 3,
            socketChannel: "socketChannel",
        }

        const spy = jest.spyOn(socket, "emitSignalTraded").mockImplementation()

        await executeTradingTask(tradingData, tradingSequence)

        expect(stripAnsi(loggerOutput))
            .toBe(`1970-01-01 00:00:00 | info | Executing a real trade of 3 units of symbol ETH/BTC at price 1 (1 total).
1970-01-01 00:00:00 | info | Successfully executed the trading sequence's before step.
1970-01-01 00:00:00 | info | Successfully executed the trading sequence's main action step.
1970-01-01 00:00:00 | info | Successfully executed the trading sequence's after step.
`)
        expect(spy).toHaveBeenCalledWith("socketChannel", signal, strategy, 3)
        expect(jestFunctionBefore).toHaveBeenCalledTimes(1)
        expect(jestFunctionMainAction).toHaveBeenCalledTimes(1)
        expect(jestFunctionAfter).toHaveBeenCalledTimes(1)
        expect(tradingMetaData.tradesOpen).toEqual([
            {
                positionType: "LONG",
                quantity: 3,
                strategyId: "strategyId",
                strategyName: "strategyName",
                symbol: "ETH/BTC",
                timeUpdated: new Date().getTimezoneOffset() * 60 * 1000,
            },
        ])

        spy.mockClear()
        jestFunctionBefore.mockClear()
        jestFunctionMainAction.mockClear()
        jestFunctionAfter.mockClear()
        resetLoggerOutput()

        const tradingSequenceReject = {
            ...tradingSequence,
            before: () =>
                new Promise((_resolve, reject) => {
                    jestFunctionBefore()
                    reject(undefined)
                }),
            mainAction: () =>
                new Promise((_resolve, reject) => {
                    jestFunctionMainAction()
                    reject(undefined)
                }),
            after: () =>
                new Promise((_resolve, reject) => {
                    jestFunctionAfter()
                    reject(undefined)
                }),
        }

        await executeTradingTask(tradingData, tradingSequenceReject)

        expect(stripAnsi(loggerOutput))
            .toBe(`1970-01-01 00:00:00 | info | Executing a real trade of 3 units of symbol ETH/BTC at price 1 (1 total).
1970-01-01 00:00:00 | error | Failed to execute the trading sequence's before step: undefined
1970-01-01 00:00:00 | error | Failed to execute the trading sequence's main action step: undefined
1970-01-01 00:00:00 | error | Failed to execute the trading sequence's after step: undefined
`)
        expect(spy).toHaveBeenCalledTimes(0)
        expect(jestFunctionBefore).toHaveBeenCalledTimes(1)
        expect(jestFunctionMainAction).toHaveBeenCalledTimes(1)
        expect(jestFunctionAfter).toHaveBeenCalledTimes(1)

        const signalExit: Signal = {
            ...signal,
            entryType: EntryType.EXIT,
        }

        const tradingDataExit: TradingData = {
            ...tradingData,
            signal: signalExit,
        }

        spy.mockClear()
        jestFunctionBefore.mockClear()
        jestFunctionMainAction.mockClear()
        jestFunctionAfter.mockClear()
        resetLoggerOutput()

        const tradingSequenceNew = {
            ...tradingSequence,
            before: () =>
                new Promise((resolve) => {
                    jestFunctionBefore()
                    resolve(undefined)
                }),
            mainAction: () =>
                new Promise((resolve) => {
                    jestFunctionMainAction()
                    resolve(undefined)
                }),
            after: () =>
                new Promise((resolve) => {
                    jestFunctionAfter()
                    resolve(undefined)
                }),
        }
        expect(tradingMetaData.tradesOpen).toEqual([
            {
                positionType: "LONG",
                quantity: 3,
                strategyId: "strategyId",
                strategyName: "strategyName",
                symbol: "ETH/BTC",
                timeUpdated: new Date().getTimezoneOffset() * 60 * 1000,
            },
        ])

        await executeTradingTask(tradingDataExit, tradingSequenceNew)

        expect(stripAnsi(loggerOutput))
            .toBe(`1970-01-01 00:00:00 | info | Executing a real trade of 3 units of symbol ETH/BTC at price 1 (1 total).
1970-01-01 00:00:00 | info | Successfully executed the trading sequence's before step.
1970-01-01 00:00:00 | info | Successfully executed the trading sequence's main action step.
1970-01-01 00:00:00 | info | Successfully executed the trading sequence's after step.
`)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(jestFunctionBefore).toHaveBeenCalledTimes(1)
        expect(jestFunctionMainAction).toHaveBeenCalledTimes(1)
        expect(jestFunctionAfter).toHaveBeenCalledTimes(1)
        expect(tradingMetaData.tradesOpen).toEqual([])
    })

    it("gets on signal log data", () => {
        const signal: Signal = {
            entryType: EntryType.ENTER,
            nickname: "nickname",
            positionType: PositionType.LONG,
            price: new BigNumber(1),
            score: "score",
            strategyId: "strategyId",
            strategyName: "strategyName",
            symbol: "symbol",
            userId: "userId",
        }

        expect(getOnSignalLogData(signal)).toBe(
            "for strategy strategyId \"strategyName\" and symbol symbol"
        )
    })

    it("gets trade open (filtered)", () => {
        const strategyId = "strategyId"
        const strategyName = "strategyName"

        const signal: Signal = {
            entryType: EntryType.ENTER,
            nickname: "nickname",
            positionType: PositionType.LONG,
            price: new BigNumber(1),
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

        expect(getTradeOpenFiltered(signal).length).toEqual(1)
        expect(getTradeOpenFiltered(signalPositionTypeUnset).length).toEqual(2)

        expect(getTradeOpen(signal)).toEqual(tradeOpenMatching)
        expect(getTradeOpen(signalPositionTypeUnset)).toEqual(undefined)
    })

    it("rounds step", () => expect(roundStep("10.987", "0.1")).toEqual(10.9))
})
