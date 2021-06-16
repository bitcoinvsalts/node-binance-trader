import * as http from "http"
import express from "express"

import logger, { loggerOutput } from "../logger"
import env from "./env"
import { balanceHistory, resetVirtualBalances, setVirtualWalletFunds, tradingMetaData, transactions, virtualBalances} from "./trader"
import { Dictionary } from "ccxt"
import { BalanceHistory } from "./types/trader"
import BigNumber from "bignumber.js"

export default function startWebserver(): http.Server {
    const webserver = express()
    webserver.get("/", (req, res) =>
        res.send("Node Binance Trader is running.")
    )
    // Allow user to see open trades
    webserver.get("/trades", (req, res) => {
        if (Authenticate(req, res)) res.send(HTMLTableFormat(tradingMetaData.tradesOpen))
    })
    // Allow user to see configured strategies
    webserver.get("/strategies", (req, res) => {
        if (Authenticate(req, res)) res.send(HTMLTableFormat(Object.values(tradingMetaData.strategies)))
    })
    // Allow user to see, reset, and change virtual balances
    webserver.get("/virtual", (req, res) => {
        if (Authenticate(req, res)) {
            if (req.query.reset) {
                const value = new BigNumber(req.query.reset.toString())
                if (value.isGreaterThan(0)) {
                    setVirtualWalletFunds(value)
                } else if (req.query.reset.toString().toLowerCase() != "true") {
                    res.send("Invalid reset parameter.")
                    return
                }
                resetVirtualBalances()
                res.send("Virtual balances have been reset.")
            } else {
                res.send(HTMLFormat(virtualBalances))
            }
        } 
    })
    // Allow user to see log
    webserver.get("/log", (req, res) => {
        if (Authenticate(req, res)) res.send(HTMLFormat(loggerOutput.slice().reverse().join("\r\n")))
    })
    // Allow user to see recent transactions
    webserver.get("/trans", (req, res) => {
        if (Authenticate(req, res)) res.send(HTMLTableFormat(transactions.slice().reverse()))
    })
    // Allow user to see actual PnL and daily balances for the past year
    webserver.get("/pnl", (req, res) => {
        if (Authenticate(req, res)) {
            const pnl: Dictionary<Dictionary<{}>> = {}
            const now = new Date()
            for (let tradingType of Object.keys(balanceHistory)) {
                pnl[tradingType] = {}
                for (let coin of Object.keys(balanceHistory[tradingType])) {
                    pnl[tradingType][coin] = {
                        Today: PercentageChange(balanceHistory[tradingType][coin].filter(h => h.timestamp >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))),
                        SevenDays: PercentageChange(balanceHistory[tradingType][coin].filter(h => h.timestamp >= new Date(now.getFullYear(), now.getMonth(), now.getDate()-6))),
                        ThirtyDays: PercentageChange(balanceHistory[tradingType][coin].filter(h => h.timestamp >= new Date(now.getFullYear(), now.getMonth(), now.getDate()-29))),
                        OneEightyDays: PercentageChange(balanceHistory[tradingType][coin].filter(h => h.timestamp >= new Date(now.getFullYear(), now.getMonth(), now.getDate()-179))),
                        Total: PercentageChange(balanceHistory[tradingType][coin]),
                    }
                }
            }
            res.send(HTMLFormat({"Profit and Loss": pnl, "Balance History": balanceHistory}))
        }
    })
    return webserver.listen(env().TRADER_PORT, () =>
        logger.info(`Webserver started on port ${env().TRADER_PORT}.`)
    )
}

function Authenticate(req: any, res: any): boolean {
    if (env().WEB_PASSWORD) {
        if (Object.keys(req.query).includes(env().WEB_PASSWORD)) return true

        if (Object.values(req.query).includes(env().WEB_PASSWORD)) return true
        
        logger.error("Unauthorised access request on webserver: " + req.url)

        res.send("Unauthorised.")
        return false
    }

    return true
}

function HTMLFormat(data: any): string {
    return "<html><body><pre><code>" + (typeof data == "string" ? data : JSON.stringify(data, null, 4)) + "</code></pre></body></html>"
}

function HTMLTableFormat(data: any[]): string {
    let result = ""
    let cols: string[] = []
    for (let row of data) {
        // Add table headers before first row
        if (result == "") {
            cols = Object.keys(row) // Remember cols here as they can change if objects are created dynamically
            result = "<table border=1 cellspacing=0><tr>"
            for (let col of cols) {
                result += "<th>" + col + "</th>"
            }
            result += "</tr>"
        }

        result += "<tr>"
        for (let col of cols) {
            result += "<td"
            if (row[col] instanceof Date) {

                result += " title='" + row[col].getTime() + "'>"
                result += row[col].toLocaleString()
            } else {
                result += ">"
                if (row[col] != undefined) result += row[col]
            }
            result += "</td>"
        }
        result += "</tr>"
    }
    if (result != "") {
        result += "</table>"
    } else {
        result = "No data yet."
    }
    return HTMLFormat(result)
}

function PercentageChange(history: BalanceHistory[]): string {
    if (history.length) {
        const open = history[0].openBalance
        const close = history[history.length-1].closeBalance
        const time = Date.now() - history[0].timestamp.getTime()
        const value = close.minus(open)
        const percent = (!open.isZero()) ? value.dividedBy(open).multipliedBy(100).toFixed(2) : ""
        const apr = (!open.isZero() && time) ? value.dividedBy(open).dividedBy(time).multipliedBy(365 * 24 * 60 * 60 * 1000).multipliedBy(100).toFixed(2) : ""

        return `Value = ${value.toFixed()} | Total = ${percent}% | APR = ${apr}%`
    }
    return "No data."
}