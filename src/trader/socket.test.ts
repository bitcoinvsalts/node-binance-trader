import BigNumber from "bignumber.js"

import {
    EntryType,
    PositionType,
    Signal,
    SignalTradedJson,
    Strategy,
    TradingType,
} from "./types/bva"
import { getSignalTradedJson } from "./socket"

describe("socket", () => {
    it("gets signal traded json", async () => {
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
        const strategy: Strategy = {
            id: "string",
            isActive: true,
            stopLoss: -10,
            takeProfit: 10,
            tradeAmount: new BigNumber(123),
            tradingType: TradingType.virtual,
        }
        const quantity = 25

        const signalTradedJson: SignalTradedJson = {
            key: "BVA_API_KEY",
            qty: "25",
            stratid: "strategyId",
            stratname: "strategyName",
            pair: "symbol",
            trading_type: TradingType.virtual,
        }

        expect(getSignalTradedJson(signal, strategy, quantity)).toEqual(
            signalTradedJson
        )
    })
})
