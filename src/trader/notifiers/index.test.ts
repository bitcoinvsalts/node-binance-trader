import BigNumber from "bignumber.js"
import { EntryType, PositionType, Signal } from "../types/bva"
import { getNotifierMessage } from "./index"

describe("notifiers", () => {
    it("gets notifier message", async () => {
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

        const notifierMessage = getNotifierMessage(signal)
        expect(notifierMessage)
            .toEqual({
                subject: "0 symbol LONG trade.",
                content: `0 symbol LONG trade.
strategy: strategyName
price: 1
score: score`,
                contentHtml: "<b>0 symbol LONG trade.</b><br/>strategy: strategyName<br/>price: 1<br/>score: score",
            })
    })
})
