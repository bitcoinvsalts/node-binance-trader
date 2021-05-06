import { EntryType, PositionType, Signal } from "../types/bva"
import { getNotifierMessage } from "./index"

describe("notifiers", () => {
    it("gets notifier message", async () => {
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

        const notifierMessage = getNotifierMessage(signal)
        expect(notifierMessage.content)
            .toEqual(`<b>0 symbol LONG trade.</b>
strategy: strategyName
price: price
score: score`
            )
        expect(notifierMessage.subject)
            .toEqual("0 symbol LONG trade.")
    })
})
