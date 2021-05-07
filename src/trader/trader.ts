// TODO: Add MinMax-Check for amount / quantity in trade functions.
// TODO: Fallback to spot trading, even if margin trading is allowed.

import { now } from "lodash"
import PQueue from "p-queue"

import logger from "../logger"
import {
    createMarketOrder,
    loadMarkets,
    marginBorrow,
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
import { TradingData, TradingMetaData, TradingSequence } from "./types/trader"

const logDefaultEntryType =
    "It shouldn't be possible to have an entry type apart from enter or exit."
const logDefaultPositionType =
    "It shouldn't be possible to have an position type apart from long or short."
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
    const strategyIds = strategies
        .map((strategy) => strategy.stratid)
        .join(", ")
    logger.info(
        `Received ${strategies.length} user strategies${
            strategyIds && ": " + strategyIds
        }.`
    )

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
        default:
            logger.error(logDefaultEntryType)
            break
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
        default:
            logger.error(logDefaultEntryType)
            break
    }

    await exportFunctions.trade(signal)
}

export async function onCloseTradedSignal(
    signalJson: SignalJson
): Promise<void> {
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

export async function checkTradingData(signal: Signal): Promise<TradingData> {
    const strategy = tradingMetaData.strategies[signal.strategyId]

    if (!strategy) {
        const logMessage = `Skipping signal as strategy ${signal.strategyName} isn't followed.`
        logger.info(logMessage)
        return Promise.reject(logMessage)
    }

    if (!strategy.isActive) {
        const logMessage = `Skipping signal as strategy ${signal.strategyName} isn't active.`
        logger.info(logMessage)
        return Promise.reject(logMessage)
    }

    const market = (await loadMarkets())[signal.symbol]

    if (!market) {
        const logMessage = `Skipping signal as there is no market data for symbol ${signal.symbol}.`
        logger.error(logMessage)
        return Promise.reject(logMessage)
    }

    if (!market.active) {
        const logMessage = `Failed to trade as the market for symbol ${market.symbol} is inactive.`
        logger.error(logMessage)
        return Promise.reject(logMessage)
    }

    if (!market.spot && !market.margin) {
        const logMessage = `Failed to trade as neither margin trading nor spot trading is available for symbol ${market.symbol}.`
        logger.error(logMessage)
        return Promise.reject(logMessage)
    }

    switch (signal.positionType) {
        case PositionType.LONG: {
            if (!market.spot) {
                const logMessage = `Failed to trade as spot trading is unavailable for a long position on symbol ${market.symbol}.`
                logger.error(logMessage)
                return Promise.reject(logMessage)
            }

            break
        }
        case PositionType.SHORT: {
            if (!env().IS_TRADE_MARGIN_ENABLED) {
                const logMessage =
                    "Skipping signal as margin trading is disabled but required to exit a short position."
                logger.warn(logMessage)
                return Promise.reject(logMessage)
            }

            if (!market.margin) {
                const logMessage = `Failed to trade as margin trading is unavailable for a short position on symbol ${market.symbol}.`
                logger.error(logMessage)
                return Promise.reject(logMessage)
            }

            break
        }
        default:
            logger.error(logDefaultPositionType)
            break
    }

    return Promise.resolve({
        market,
        signal,
        strategy,
    })
}

export function getTradingSequence(
    tradingData: TradingData
): Promise<TradingSequence> {
    const market = tradingData.market
    const signal = tradingData.signal
    const strategy = tradingData.strategy

    let tradingSequence: TradingSequence | undefined
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
                    const order = createMarketOrder(
                        signal.symbol,
                        "buy",
                        quantity,
                        undefined,
                        {
                            ...(env().IS_TRADE_MARGIN_ENABLED &&
                                market.margin && {
                                type: "margin",
                            }),
                        }
                    ).catch((reason) => logger.error(reason))

                    tradingSequence = {
                        before:
                            env().IS_TRADE_MARGIN_ENABLED && market.margin
                                ? marginBorrow(market.quote, quantity, now()).catch((reason) => logger.error(reason))
                                : undefined,
                        mainAction: order,
                        after: undefined,
                        quantity,
                    }
                    break
                }
                case PositionType.SHORT: {
                    // Enter short.
                    const order = createMarketOrder(
                        signal.symbol,
                        "sell",
                        quantity,
                        undefined,
                        {
                            type: "margin", // Short trades must be a margin trade unconditionally.
                        }
                    ).catch((reason) => logger.error(reason))

                    tradingSequence = {
                        before: marginBorrow(market.quote, quantity, now()).catch((reason) => logger.error(reason)),
                        mainAction: order,
                        after: undefined,
                        quantity,
                    }
                    break
                }
                // "undefined" should never occur and is thus handler by the default branch below.
                default: {
                    logger.error(logDefaultPositionType)
                    return Promise.reject(logDefaultPositionType)
                }
            }
            break
        }
        case EntryType.EXIT: {
            // TODO: Remember whether trades were entered using margin / borrowing.
            // First, get the open trade to exit.
            const tradeOpen = getTradeOpen(signal)

            if (!tradeOpen) {
                logger.error(logTradeOpenNone)
                return Promise.reject(logTradeOpenNone)
            }

            if (tradeOpen.isStopped) {
                const logMessage =
                    "Skipping signal as trading is stopped for this position."
                logger.warn(logMessage)
                return Promise.reject(logMessage)
            }

            quantity = tradeOpen.quantity

            switch (tradeOpen.positionType) {
                case PositionType.LONG: {
                    // Exit long.
                    const order = createMarketOrder(
                        signal.symbol,
                        "sell",
                        quantity,
                        undefined,
                        {
                            ...(env().IS_TRADE_MARGIN_ENABLED &&
                                market.margin && {
                                type: "margin",
                            }),
                        }
                    ).catch((reason) => logger.error(reason))

                    tradingSequence = {
                        before: undefined,
                        mainAction: order,
                        after:
                            env().IS_TRADE_MARGIN_ENABLED && market.margin
                                ? marginRepay(market.quote, quantity, now()).catch((reason) => logger.error(reason))
                                : undefined,
                        quantity,
                    }
                    break
                }
                case PositionType.SHORT: {
                    // Exit short.
                    const order = createMarketOrder(
                        signal.symbol,
                        "buy",
                        quantity,
                        undefined,
                        {
                            type: "margin", // Short trades must be a margin trade unconditionally.
                        }
                    ).catch((reason) => logger.error(reason))

                    tradingSequence = {
                        before: undefined,
                        mainAction: order,
                        after: marginRepay(market.quote, quantity, now()).catch((reason) => logger.error(reason)),
                        quantity,
                    }
                    break
                }
                // "undefined" should never occur and is thus handler by the default branch below.
                default: {
                    logger.error(logDefaultPositionType)
                    return Promise.reject(logDefaultPositionType)
                }
            }
            break
        }
        default:
            logger.error(logDefaultEntryType)
            break
    }

    // Shall not be moved before the previous switch
    // so that paper trading gives the most realistic experience.
    if (strategy.tradingType === TradingType.virtual) {
        tradingSequence = {
            before: Promise.resolve(),
            mainAction: Promise.resolve(),
            after: Promise.resolve(),
            quantity: 0,
        }
    }

    if (tradingSequence) {
        return Promise.resolve(tradingSequence)
    } else {
        return Promise.reject("It shouldn't be possible that no trading sequence could be found!")
    }
}

export function getTradingTask(
    tradingData: TradingData,
    tradingSequence: TradingSequence
): () => void {
    const signal = tradingData.signal
    const strategy = tradingData.strategy
    const quantity = tradingSequence.quantity

    return async () => {
        logger.info(
            `Executing a ${strategy.tradingType} trade ${quantity} units of symbol ${signal.symbol} (${strategy.tradeAmount} BTC) at price ${signal.price}.`
        )

        if (tradingSequence.before) {
            await tradingSequence.before
                .then(() => {
                    logger.error(
                        "Successfully executed the trading sequence's before step."
                    )
                })
                .catch((reason) => {
                    logger.error(
                        `Failed to execute the trading sequence's before step: ${reason}`
                    )
                    return
                })
        }

        await tradingSequence.mainAction
            .then(() => {
                logger.info(
                    "Successfully executed the trading sequence's main action step."
                )

                emitSignalTraded(
                    "traded_buy_signal",
                    signal,
                    strategy,
                    quantity
                )

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
                            (tradesOpenElement) =>
                                tradesOpenElement !== tradeOpen
                        )

                        break
                    }
                    default:
                        logger.error(logDefaultEntryType)
                        break
                }
            })
            .catch((reason) => {
                logger.error(
                    `Failed to execute the trading sequence's main action step: ${reason}`
                )
                return
            })

        if (tradingSequence.after) {
            await tradingSequence.after
                .then(() => {
                    logger.error(
                        "Successfully executed the trading sequence's after step."
                    )
                })
                .catch((reason) => {
                    logger.error(
                        `Failed to execute the trading sequence's after step: ${reason}`
                    )
                    return
                })
        }
    }
}

export async function trade(signal: Signal): Promise<void> {
    await notifyAll(getNotifierMessage(signal))

    const tradingData = await checkTradingData(signal)
    if (!tradingData) return

    const tradingSequence = await getTradingSequence(tradingData)
    if (!tradingSequence) return

    await queue.add(getTradingTask(tradingData, tradingSequence))
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
    run().then(() => undefined)
}

const exportFunctions = {
    trade,
}

export default exportFunctions
