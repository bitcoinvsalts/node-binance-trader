import * as http from "http"
import express from "express"

import logger, { loggerOutput } from "../logger"
import env from "./env"
import { tradingMetaData, virtualBalances } from "./trader"

export default function startWebserver(): http.Server {
    const webserver = express()
    webserver.get("/", (req, res) =>
        res.send("Node Binance Trader is running.")
    )
    // Allow user to see open trades
    webserver.get("/trades", (req, res) =>
        res.send(HTMLFormat(tradingMetaData.tradesOpen))
    )
    // Allow user to see configured strategies
    webserver.get("/strategies", (req, res) =>
        res.send(HTMLFormat(tradingMetaData.strategies))
    )
    // Allow user to see virtual balances
    webserver.get("/virtual", (req, res) =>
        res.send(HTMLFormat(virtualBalances))
    )
    // Allow user to see log
    webserver.get("/log", (req, res) => 
        res.send(HTMLFormat(loggerOutput.slice().reverse().join("\r\n")))
    )
    return webserver.listen(env().TRADER_PORT, () =>
        logger.info(`Webserver started on port ${env().TRADER_PORT}.`)
    )
}

function HTMLFormat(data: any): string {
    return "<html><body><pre><code>" + (typeof data == "string" ? data : JSON.stringify(data, null, 4)) + "</code></pre></body></html>"
}