// TODO: Add MinMax-Check for amount / quantity in trade functions.
// TODO: Fallback to spot trading, even if margin trading is allowed.

import { now } from "lodash"
import PQueue from "p-queue"

import logger from "../logger"
import {
    createMarketOrder,
    loadMarkets,
    marginRepay,
} from "./apis/binance"
import { getTradeOpenList } from "./apis/bva"
import env from "./env"
import startWebserver from "./http"
import initializeNotifiers, { getNotifierMessage, notifyAll } from "./notifiers"
import connectBvaClient, { emitSignalTraded } from "./socket"
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
import { TradingMetaData, TradingSequence } from "./types/trader"

const logTradeOpenNone =
    "Skipping signal as there was no associated open trade found."

export const tradingMetaData: TradingMetaData = {
    strategies: {},
    tradesOpen: [],
}

const queue = new PQueue({
    concurrency: 1,
    interval: 250,
})

export function onUserPayload(strategies: StrategyJson[]): void {
    const strategyIds = strategies.map((strategy) => strategy.stratid).join(", ")
    logger.info(`Received ${strategies.length} user strategies${strategyIds && ": " + strategyIds}.`)

    tradingMetaData.strategies = Object.assign(
        {},
        ...strategies.map((p) => {
            const strategy = new Strategy(p)
            return {
                [strategy.id]: strategy,
            }
        })
    )
}

export async function onBuySignal(signalJson: SignalJson): Promise<void> {
    const signal = new Signal(signalJson)

    switch (signal.entryType) {
        case EntryType.ENTER: {
            // Buy to enter signals a long trade.
            signal.positionType = PositionType.LONG
            logger.info(
                `Received an opening buy signal (enter long) ${getOnSignalLogData(
                    signal
                )}.`
            )
            break
        }
        case EntryType.EXIT: {
            // Buy to exit signals a short trade.
            signal.positionType = PositionType.SHORT
            logger.info(
                `Received a closing buy signal (exit short) ${getOnSignalLogData(
                    signal
                )}.`
            )
            break
        }
    }

    await exportFunctions.trade(signal)
}

export async function onSellSignal(signalJson: SignalJson): Promise<void> {
    const signal = new Signal(signalJson)

    switch (signal.entryType) {
        case EntryType.ENTER: {
            // Sell to enter signals a short trade.
            signal.positionType = PositionType.SHORT
            logger.info(
                `Received an opening sell signal (enter short) ${getOnSignalLogData(
                    signal
                )}.`
            )
            break
        }
        case EntryType.EXIT: {
            // Sell to enter signals a long trade.
            signal.positionType = PositionType.LONG
            logger.info(
                `Received a closing sell signal (exit long) ${getOnSignalLogData(
                    signal
                )}.`
            )
            break
        }
    }

    await exportFunctions.trade(signal)
}

export async function onCloseTradedSignal(signalJson: SignalJson): Promise<void> {
    const signal = new Signal(signalJson)
    await exportFunctions.trade(signal)
}

export function onStopTradedSignal(signalJson: SignalJson): boolean {
    const signal = new Signal(signalJson)

    logger.info(`Received an stop trade signal ${getOnSignalLogData(signal)}.`)

    const tradeOpen = getTradeOpen(signal)

    if (!tradeOpen) {
        logger.error(logTradeOpenNone)
        return false
    }

    tradeOpen.isStopped = true
    return true
}

export async function trade(signal: Signal): Promise<void> {
    await notifyAll(getNotifierMessage(signal))

    const strategy = tradingMetaData.strategies[signal.strategyId]

    if (!strategy) {
        logger.info(
            `Skipping signal as strategy ${signal.strategyName} isn't followed.`
        )
        return
    }

    if (!strategy.isActive) {
        logger.info(
            `Skipping signal as strategy ${signal.strategyName} isn't active.`
        )
        return
    }

    const market = (await loadMarkets())[signal.symbol]

    if (!market) {
        logger.error(
            `Skipping signal as there is no market data for symbol ${signal.symbol}.`
        )
        return
    }

    if (!market.active) {
        logger.error(
            `Failed to trade as the market for symbol ${market.symbol} is inactive.`
        )
        return
    }

    if (!market.spot && !market.margin) {
        logger.error(
            `Failed to trade as neither margin trading nor spot trading is available for symbol ${market.symbol}.`
        )
        return
    }

    switch (signal.positionType) {
        case PositionType.LONG: {
            if (!market.spot) {
                logger.error(
                    `Failed to trade as spot trading is unavailable for a long position on symbol ${market.symbol}.`
                )
                return
            }

            break
        }
        case PositionType.SHORT: {
            if (!env.IS_TRADE_MARGIN_ENABLED) {
                logger.warn(
                    "Skipping signal as margin trading is disabled but required to exit a short position."
                )
                return
            }

            if (!market.margin) {
                logger.error(
                    `Failed to trade as margin trading is unavailable for a short position on symbol ${market.symbol}.`
                )
                return
            }

            break
        }
    }

    const logPositionTypeInvalid = (entryTypeString: string) =>
        `It shouldn't be possible to read this log as ${entryTypeString} a trade should always come with a long or short indication.`
    let tradingSequence: TradingSequence
    let quantity: number

    switch (signal.entryType) {
        case EntryType.ENTER: {
            // First, get the quantity to enter with.
            quantity = Number(
                roundStep(
                    strategy.tradeAmount.dividedBy(signal.price).toString(),
                    market.limits.amount.min.toString()
                    // TODO: For Binance use the LOT_SIZE filter's stepSize property.
                    // It's currently simplified to minimum amount limit here.
                )
            )

            switch (signal.positionType) {
                // Enter long.
                case PositionType.LONG: {
                    tradingSequence = {
                        before: undefined, // TODO: Try borrowing here.
                        mainAction: createMarketOrder(
                            signal.symbol,
                            "buy",
                            quantity,
                            undefined,
                            {
                                ...(env.IS_TRADE_MARGIN_ENABLED &&
                                    market.margin && {
                                    type: "margin", // TODO: Decide margin usage CHECK!
                                }),
                            }
                        ),
                        after: undefined,
                    }
                    break
                }
                case PositionType.SHORT: {
                    // Enter short.
                    tradingSequence = {
                        before: undefined, // TODO: Borrow here.
                        mainAction: createMarketOrder(
                            signal.symbol,
                            "sell",
                            quantity,
                            undefined,
                            {
                                type: "margin", // Short trades must be a margin trade unconditionally.
                            }
                        ),
                        after: undefined,
                    }
                    break
                }
                // "undefined" should never occur and is thus handler by the default branch below.
                default: {
                    logger.error(logPositionTypeInvalid("entering"))
                    return
                }
            }
            break
        }
        case EntryType.EXIT: {
            // First, get the open trade to exit.
            const tradeOpen = getTradeOpen(signal)

            if (!tradeOpen) {
                logger.error(logTradeOpenNone)
                return
            }

            if (tradeOpen.isStopped) {
                logger.warn(
                    "Skipping signal as trading is stopped for this position."
                )
                return
            }

            quantity = tradeOpen.quantity

            switch (tradeOpen.positionType) {
                case PositionType.LONG: {
                    // Exit long.
                    tradingSequence = {
                        before: undefined,
                        mainAction: createMarketOrder(
                            signal.symbol,
                            "sell",
                            quantity,
                            undefined,
                            {
                                ...(env.IS_TRADE_MARGIN_ENABLED &&
                                    market.margin && {
                                    type: "margin", // TODO: Decide margin usage CHECK!
                                }),
                            }
                        ),
                        after: undefined, // TODO: Check repay.
                        // after: marginRepay(
                        //     market.quote,
                        //     quantity,
                        //     now()
                        // )
                    }
                    break
                }
                case PositionType.SHORT: {
                    // Exit short.
                    tradingSequence = {
                        before: undefined,
                        mainAction: createMarketOrder(
                            signal.symbol,
                            "buy",
                            quantity,
                            undefined,
                            {
                                type: "margin", // Short trades must be a margin trade unconditionally.
                            }
                        ),
                        after: marginRepay(
                            market.quote,
                            quantity,
                            now()
                        )
                    }
                    break
                }
                // "undefined" should never occur and is thus handler by the default branch below.
                default: {
                    logger.error(logPositionTypeInvalid("exiting"))
                    return
                }
            }
        }
    }

    await queue.add(async () => {
        if (strategy.tradingType === TradingType.virtual) {
            tradingSequence = {
                before: Promise.resolve(),
                mainAction: Promise.resolve(),
                after: Promise.resolve(),
            }
        }

        logger.info(`Executing a ${strategy.tradingType} trade ${quantity} units of symbol ${signal.symbol} (${strategy.tradeAmount} BTC) at price ${signal.price}.`)

        if (tradingSequence.before) {
            await tradingSequence.before
                .then(() => {
                    logger.error("Successfully executed the trading sequence's before step.")
                })
                .catch((reason) => {
                    logger.error(`Failed to execute the trading sequence's before step: ${reason}`)
                    return
                })
        }

        await tradingSequence.mainAction
            .then(() => {
                logger.info(
                    "Successfully executed the trading sequence's main action step."
                )

                emitSignalTraded("traded_buy_signal", signal, strategy, quantity)

                notifyAll(getNotifierMessage(signal, true))
                // TODO: Notify on failure.

                switch (signal.entryType) {
                    case EntryType.ENTER: {
                        tradingMetaData.tradesOpen.push({
                            // Remember the trade as opened.
                            positionType: PositionType.LONG,
                            quantity: quantity,
                            strategyId: signal.strategyId,
                            strategyName: signal.strategyName,
                            symbol: signal.symbol,
                            timeUpdated: now(),
                        })
                        break
                    }
                    case EntryType.EXIT: {
                        const tradeOpen = getTradeOpen(signal)

                        if (!tradeOpen) {
                            logger.error(logTradeOpenNone)
                            return
                        }

                        tradingMetaData.tradesOpen = tradingMetaData.tradesOpen.filter(
                            (tradesOpenElement) => tradesOpenElement !== tradeOpen
                        )

                        break
                    }
                    // TODO: Create default branch for all switch statements.
                }
            })
            .catch((reason) => {
                logger.error(`Failed to execute the trading sequence's main action step: ${reason}`)
                return
            })

        if (tradingSequence.after) {
            await tradingSequence.after
                .then(() => {
                    logger.error("Successfully executed the trading sequence's after step.")
                })
                .catch((reason) => {
                    logger.error(`Failed to execute the trading sequence's after step: ${reason}`)
                    return
                })
        }
    })
}

export function getOnSignalLogData(signal: Signal): string {
    return `for strategy ${signal.strategyName} (${signal.strategyId}) and symbol ${signal.symbol}`
}

export function getTradeOpen(signal: Signal): TradeOpen | undefined {
    const tradesOpenFiltered = getTradeOpenFiltered(signal)

    const logData = `in strategy ${signal.strategyId} for symbol ${signal.symbol}`

    if (tradesOpenFiltered.length > 1) {
        logger.warn(
            `There is more than one trade open ${logData}. Using the first found.`
        )
    } else if (tradesOpenFiltered.length === 0) {
        logger.warn(`No open trade found ${logData}.`)
    } else {
        logger.debug(`Exactly one open trade found ${logData}.`)
        return tradesOpenFiltered[0]
    }
}

export function getTradeOpenFiltered(signal: Signal): TradeOpen[] {
    return tradingMetaData.tradesOpen.filter(
        (tradeOpen) =>
            tradeOpen.strategyId === signal.strategyId &&
            tradeOpen.symbol === signal.symbol &&
            (signal.positionType
                ? tradeOpen.positionType === signal.positionType
                : true) // If the signal contains a position type, then the open trade must match that.
        // TODO: Check for same order size.
    )
}

// https://github.com/jaggedsoft/node-binance-api/blob/28e1162ccb62bc3fdfc311cdf8e8953c6e14f42c/node-binance-api.js#L2578
// https://github.com/jaggedsoft/node-binance-api/blob/28e1162ccb62bc3fdfc311cdf8e8953c6e14f42c/LICENSE
export function roundStep(qty: string, stepSize: string): number | string {
    // Integers do not require rounding
    if (Number.isInteger(qty)) return qty
    const qtyString = parseFloat(qty).toFixed(16)
    const desiredDecimals = Math.max(stepSize.indexOf("1") - 1, 0)
    const decimalIndex = qtyString.indexOf(".")
    return parseFloat(qtyString.slice(0, decimalIndex + desiredDecimals + 1))
}

async function run() {
    initializeNotifiers()

    tradingMetaData.tradesOpen = await getTradeOpenList()
    await loadMarkets(true)

    connectBvaClient()
    startWebserver()
}

if (process.env.NODE_ENV !== "test") {
    run()
        .then(() => undefined)
}

const exportFunctions = {
    trade
}

export default exportFunctions
