import * as http from "http"
import express from "express"

import logger from "../logger"
import env from "./env"


export default function startWebserver(): http.Server {
    const webserver = express()
    webserver.get("/", (req, res) => res.send("Node Binance Trader is running."))
    return webserver.listen(env.TRADER_PORT, () => logger.info(`Webserver started on port ${env.TRADER_PORT}.`))
}
