import axios from "axios"
import MockAdapter from "axios-mock-adapter"

import { BvaCommand, TradeOpen } from "../types/bva"
import { getTradeOpenList } from "./bva"

describe("bva", () => {
    let mock: MockAdapter

    beforeAll(() => {
        mock = new MockAdapter(axios)
    })

    afterEach(() => {
        mock.reset()
    })

    it("gets trade open list", async () => {
        const bvaCommand: BvaCommand = {
            rowCount: 1,
            rows: [
                {
                    id: "126939",
                    stratid: "595",
                    stratname: "BVA_LONG_ONLY",
                    pair: "XRPBTC",
                    type: "LONG",
                    buy_time: "1619532046042",
                    sell_time: null,
                    updated_time: "1619532046042",
                    buy_price: "0.00002502",
                    sell_price: null,
                    qty: "800",
                    stopped: null,
                },
            ],
        }

        mock.onGet().replyOnce(200, bvaCommand)
        await expect(getTradeOpenList()).resolves.toEqual([
            new TradeOpen(bvaCommand.rows[0]),
        ])
    })

    it("fails to get trade open list", async () => {
        mock.onGet().replyOnce(400, "ERROR")
        await expect(getTradeOpenList()).rejects.toEqual(new Error("Request failed with status code 400"))
    })
})
