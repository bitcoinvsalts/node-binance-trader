import * as http from "http"
import express from "express"

import logger, { loggerOutput } from "../logger"
import env from "./env"
import { closeTrade, deleteBalanceHistory, deleteTrade, resetVirtualBalances, setTradeStopped, setVirtualWalletFunds, tradingMetaData} from "./trader"
import { Dictionary } from "ccxt"
import { BalanceHistory } from "./types/trader"
import BigNumber from "bignumber.js"
import { loadRecords } from "./apis/postgres"
import { Pages, Percent, URLs } from "./types/http"

export default function startWebserver(): http.Server {
    const webserver = express()
    webserver.get("/", (req, res) =>
        res.send("Node Binance Trader is running.")
    )
    // Allow user to see open trades or delete a trade
    webserver.get("/trades", (req, res) => {
        if (Authenticate(req, res)) {
            if (req.query.stop) {
                const tradeId = req.query.stop.toString()
                const tradeName = setTradeStopped(tradeId, true)
                if (tradeName) {
                    res.send(`${tradeName} has been stopped.`)
                } else {
                    res.send(`No trade was found with the ID of '${tradeId}'.`)
                }
            } else if (req.query.start) {
                const tradeId = req.query.start.toString()
                const tradeName = setTradeStopped(tradeId, false)
                if (tradeName) {
                    res.send(`${tradeName} will continue to trade.`)
                } else {
                    res.send(`No trade was found with the ID of '${tradeId}'.`)
                }
            } else if (req.query.close) {
                const tradeId = req.query.close.toString()
                const tradeName = closeTrade(tradeId)
                if (tradeName) {
                    res.send(`A close request has been sent for ${tradeName}. Wait a few seconds before checking the logs.`)
                } else {
                    res.send(`No trade was found with the ID of '${tradeId}'.`)
                }
            } else if (req.query.delete) {
                const tradeId = req.query.delete.toString()
                const tradeName = deleteTrade(tradeId)
                if (tradeName) {
                    res.send(`${tradeName} has been deleted.`)
                } else {
                    res.send(`No trade was found with the ID of '${tradeId}'.`)
                }
            } else {
                res.send(HTMLTableFormat(Pages.TRADES, tradingMetaData.tradesOpen))
            }
        }
    })
    // Allow user to see configured strategies
    webserver.get("/strategies", (req, res) => {
        if (Authenticate(req, res)) res.send(HTMLTableFormat(Pages.STRATEGIES, Object.values(tradingMetaData.strategies)))
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
                res.send(HTMLFormat(Pages.VIRTUAL, tradingMetaData.virtualBalances))
            }
        } 
    })
    // Allow user to see in memory or database log
    webserver.get("/log", async (req, res) => {
        if (Authenticate(req, res)) {
            if (Object.keys(req.query).includes("db")) {
                let page = req.query.db ? Number.parseInt(req.query.db.toString()) : 1
                // Load the log from the database
                res.send(HTMLFormat(Pages.LOG_DB, (await loadRecords("log", page)).join("\r\n"), page+1))
            } else {
                // Use the memory log, exclude blank lines (i.e. the latest one)
                res.send(HTMLFormat(Pages.LOG_MEMORY, loggerOutput.filter(line => line).reverse().join("\r\n")))
            }
        }
    })
    // Allow user to see in memory or database transactions
    webserver.get("/trans", async (req, res) => {
        if (Authenticate(req, res)) {
            if (Object.keys(req.query).includes("db")) {
                let page = req.query.db ? Number.parseInt(req.query.db.toString()) : 1
                // Load the transactions from the database
                res.send(HTMLTableFormat(Pages.TRANS_DB, (await loadRecords("transaction", page)), page+1))
            } else {
                // Use the memory transactions
                res.send(HTMLTableFormat(Pages.TRANS_MEMORY, tradingMetaData.transactions.slice().reverse(), ))
            }
        }
    })
    // Allow user to see actual PnL and daily balances for the past year, or reset balances for a coin
    webserver.get("/pnl", (req, res) => {
        if (Authenticate(req, res)) {
            if (req.query.reset) {
                const asset = req.query.reset.toString().toUpperCase()
                const tradingTypes = deleteBalanceHistory(asset)
                if (tradingTypes.length) {
                    let result = ""
                    for (let tradingType of tradingTypes) {
                        result += `${asset} ${tradingType} balance history has been reset.<br>`
                    }
                    res.send(result)
                } else {
                    res.send(`No balance history found for ${asset}.`)
                }
            } else {
                const pnl: Dictionary<Dictionary<{}>> = {}
                const now = new Date()
                for (let tradingType of Object.keys(tradingMetaData.balanceHistory)) {
                    pnl[tradingType] = {}
                    for (let coin of Object.keys(tradingMetaData.balanceHistory[tradingType])) {
                        pnl[tradingType][coin] = [
                            PercentageChange("Today", tradingMetaData.balanceHistory[tradingType][coin].filter(h => h.date >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))),
                            PercentageChange("Seven Days", tradingMetaData.balanceHistory[tradingType][coin].filter(h => h.date >= new Date(now.getFullYear(), now.getMonth(), now.getDate()-6))),
                            PercentageChange("Thirty Days", tradingMetaData.balanceHistory[tradingType][coin].filter(h => h.date >= new Date(now.getFullYear(), now.getMonth(), now.getDate()-29))),
                            PercentageChange("180 Days", tradingMetaData.balanceHistory[tradingType][coin].filter(h => h.date >= new Date(now.getFullYear(), now.getMonth(), now.getDate()-179))),
                            PercentageChange("Total", tradingMetaData.balanceHistory[tradingType][coin]),
                        ]
                    }
                }
                res.send(HTMLTableFormat(Pages.PNL, {"Profit and Loss": pnl, "Balance History": tradingMetaData.balanceHistory}))
            }
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

function HTMLFormat(page: Pages, data: any, nextPage?: number): string {
    let html = `<html><head><title>NBT: ${page}</title></head><body>`

    // Menu
    html += `<p>`
    html += Object.values(Pages).map(name => {
        let link = ""
        if (page != name) link += `<a href="${URLs[name].replace("%d", "1")}${env().WEB_PASSWORD}">`
        link += name
        if (page != name) link += `</a>`
        return link
    }).join(" | ")
    html += `<br><font size=-2>${new Date().toLocaleString()}</font>`
    html += `</p>`

    // Content
    if (data) {
        html += `<pre><code>${typeof data == "string" ? data : JSON.stringify(data, null, 4)}</code></pre>`

        // Pagination
        if (nextPage) {
            html += `<a href="${URLs[page].replace("%d", nextPage.toString())}${env().WEB_PASSWORD}">Next Page...</a>`
        }
    } else {
        html += "No data yet."
    }
    
    return html + `</body></html>`
}

function HTMLTableFormat(page: Pages, data: any, nextPage?: number, breadcrumb?: string): string {
    let result = ""

    // Just in case
    if (!data) return result

    if (!Array.isArray(data)) {
        if (!breadcrumb) breadcrumb = ""
        for (let section of Object.keys(data)) {
            result += HTMLTableFormat(page, data[section], nextPage, breadcrumb + section + " : ")
        }
    } else {
        if (data.length) {
            const cols = new Set<string>()
            const valueSets: { [col: string] : Set<string> } = {}
            for (let row of data) {
                Object.keys(row).forEach(col => {
                    // Because objects may have been reloaded from the database via JSON, they lose their original properties
                    // So we need to check the entire dataset to make sure we have all possible columns
                    cols.add(col)

                    // We also want to keep the unique string values for colourising later
                    if (typeof(row[col]) == "string" && row[col]) {
                        if (!(col in valueSets)) valueSets[col] = new Set()
                        // Allow one extra so that we know it is over the limit
                        if (valueSets[col].size <= env().MAX_WEB_COLOURS) valueSets[col].add(row[col])
                    }
                })
            }

            const values: { [col: string] : string[] } = {}
            Object.keys(valueSets).forEach(col => {
                // Convert to sorted array if not over the maximum limit of values
                if (valueSets[col].size <= env().MAX_WEB_COLOURS) values[col] = [...valueSets[col]].sort()
            })

            // Add breadcrumb header
            if (breadcrumb) result += `<h2>${breadcrumb}</h2>`

            // Add table headers before first row
            result += "<table border=1 cellspacing=0><tr>"
            for (let col of cols) {
                result += "<th>" + col + "</th>"
            }
            result += "<th></th></tr>"

            // Add row data
            for (let row of data) {
                result += "<tr>"
                for (let col of cols) {
                    result += "<td"
                    if (row[col] instanceof Date) {
                        // Include raw time as the tooltip
                        result += " title='" + row[col].getTime() + "'>"
                        result += row[col].toLocaleString()
                    } else if (row[col] instanceof BigNumber) {
                        // Colour negative numbers as red
                        if (row[col].isLessThan(0)) result += " style='color: red;'"
                        result += ">"
                        if (row[col] != undefined) result += row[col].toFixed(env().MAX_WEB_PRECISION).replace(/\.?0+$/,"")
                    } else {
                        // Colour negative percentages as red
                        if (row[col] instanceof Percent && row[col].value.isLessThan(0)) result += " style='color: red;'"

                        // Colour true boolean values as blue
                        if (typeof(row[col]) == "boolean" && row[col]) result += " style='color: blue;'"

                        // Colour string as a gradient based on unique values (too many colours get meaningless)
                        if (typeof(row[col]) == "string" && row[col] && col in values) result += ` style='color: ${MakeColor(values[col].indexOf(row[col]), values[col].length)};'`

                        result += ">"
                        if (row[col] != undefined) result += row[col]
                    }
                    result += "</td>"
                }
                result += "<td>" + MakeCommands(page, row) + "</td>"
                result += "</tr>"
            }
            if (result != "") {
                result += "</table>"
            }
        }
    }
    if (!breadcrumb) {
        // This is top level, so wrap in HTML page
        return HTMLFormat(page, result, nextPage)
    } else {
        return result
    }
}

function PercentageChange(period: string, history: BalanceHistory[]): {} {
    if (history.length) {
        const open = history[0].openBalance
        const close = history[history.length-1].closeBalance
        const time = Date.now() - history[0].date.getTime()
        const fees = history.filter(h => h.estimatedFees).reduce((sum, current) => sum.plus(current.estimatedFees), new BigNumber(0))
        const value = close.minus(open).plus(fees) // TODO: don't subtract fees if BNB balance
        const percent = (!open.isZero()) ? new Percent(value.dividedBy(open).multipliedBy(100)) : ""
        const apr = (!open.isZero() && time) ? new Percent(value.dividedBy(open).dividedBy(time).multipliedBy(365 * 24 * 60 * 60 * 1000).multipliedBy(100)) : ""

        return {
            Period: period,
            Value: value,
            Total: percent,
            APR: apr,
        }
    }
    return {
        Period: period,
        Value: undefined,
        Total: undefined,
        APR: undefined,
    }
}

function MakeColor(n: number, total: number): string {
    if (total <= 1) return "black"

    // Offset to start with blue, darken a bit for readability
    return `hsl(${(225 + (n * (360 / total))) % 360}, 100%, 40%)`
}

function MakeCommands(page: Pages, record: any) : string {
    let commands = ""
    let root = URLs[page]
    if (env().WEB_PASSWORD) root += env().WEB_PASSWORD + "&"
    switch (page) {
        case (Pages.TRADES):
            if (!record.isStopped) {
                commands += MakeButton("Stop", `Are you sure you want to stop trade ${record.id}?`, `${root}stop=${record.id}`)
            } else {
                commands += MakeButton("Resume", `Are you sure you want to resume trade ${record.id}?`, `${root}start=${record.id}`)
            }
            commands += " "
            commands += MakeButton("Close", `Are you sure you want to close trade ${record.id}?`, `${root}close=${record.id}`)
            commands += " "
            commands += MakeButton("Delete", `Are you sure you want to delete trade ${record.id}?`, `${root}delete=${record.id}`)
            break
    }

    return commands
}

function MakeButton(name: string, question: string, action: string): string {
    let button = `<button onclick="(function(){`
    button += `if(confirm('${question}')) window.location.href='${action}'`
    button += `})();">${name}</button>`
    return button
}