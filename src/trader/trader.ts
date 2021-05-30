// TODO: Add MinMax-Check for amount / quantity in trade functions.
// TODO: Fallback to spot trading, even if margin trading is allowed.

import BigNumber from "bignumber.js"
import { Balances, Dictionary, Market } from "ccxt"
import PQueue from "p-queue"

import logger from "../logger"
import {
    createMarketOrder,
    fetchBalance,
    getMarginLoans,
    loadMarkets,
    marginBorrow,
    marginRepay,
} from "./apis/binance"
import { getTradeOpenList } from "./apis/bva"
import env from "./env"
import startWebserver from "./http"
import initializeNotifiers, { getNotifierMessage, notifyAll } from "./notifiers"
import socket from "./socket"
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
import { WalletType, TradingData, TradingMetaData, TradingSequence, LongFundsType, WalletData, ActionType } from "./types/trader"

// Standard error messages
const logDefaultEntryType =
    "It shouldn't be possible to have an entry type apart from enter or exit."
const logDefaultPositionType =
    "It shouldn't be possible to have an position type apart from long or short."
const logTradeOpenNone =
    "Skipping signal as there was no associated open trade found."

// Holds the information about the current strategies and open trades
export const tradingMetaData: TradingMetaData = {
    strategies: {}, // This comes from the payload data that is sent from BVA hub, it is a dictionary of type Strategy (see bva.ts) indexed by the strategy ID
    tradesOpen: [], // This is an array of type TradeOpen (see bva.ts) containing all the open trades
    markets: {} // This is a dictionary of the different trading symbols and limits that are supported on the Binance exchange
}

// Initialise the virtual wallets and attempt to keep track of the balance for simulations
const virtualBalances: Dictionary<Dictionary<BigNumber>> = {}

// Configuration for the asynchronous queue that executes the trades on Binance
const queue = new PQueue({
    concurrency: 1,
    interval: 250,
})

// Receives the information on selected strategies from the BVA hub
export async function onUserPayload(strategies: StrategyJson[]) {
    // Convert list of strategy IDs into a comma delimited string for logging
    const strategyIds = strategies
        .map((strategy) => strategy.stratid)
        .join(", ")
    logger.info(
        `Received ${strategies.length} user strategies${
            strategyIds && ": " + strategyIds
        }.`
    )

    // Log if any are not yet configured
    const invalid = strategies.filter(s => new Strategy(s).tradingType == undefined || s.buy_amount <= 0)
    if (invalid.length) {
        logger.warn(`${invalid.length} strategies have not yet been configured, so will be ignored: ${invalid.map(s => s.stratid).join(", ")}.`)
    }
    
    // Processes the JSON data into the strategies dictionary (ignoring invalid strategies)
    const newStrategies: Record<string, Strategy> = Object.assign(
        {},
        ...strategies.filter(s => !invalid.includes(s)).map((s) => {
            const strategy = new Strategy(s)
            return {
                [strategy.id]: strategy,
            }
        })
    )

    // If there were no strategies previously then this is probably the first time we've got them
    // Technically you may have had no strategies configured before, but they you should have no trades either
    if (Object.keys(tradingMetaData.strategies).length == 0) {
        tradingMetaData.tradesOpen = await getTradeOpenList().catch((reason) => {
            // This will prevent the strategies from being saved too, so this will prevent the trader from functioning until the problem is resolved
            logger.debug("onUserPayload->getTradeOpenList: " + reason)
            logger.error("Trader is not operational, please restart.")
            return Promise.reject(reason)
        })        
    } else {
        await checkStrategyChanges(newStrategies).catch((reason) => {
            logger.debug("onUserPayload->checkStrategyChanges: " + reason)
            logger.error("Trader is not operational, please restart.")
            return Promise.reject(reason)
        })  
    }

    // Everything is good to go, so update to the new strategies
    tradingMetaData.strategies = newStrategies
}

// Retrieves the open trade list from the BVA hub then tries to match them to existing balances and loans in Binance.
export async function loadPreviousOpenTrades(strategies: Dictionary<Strategy>): Promise<TradeOpen[]> {
    // Retrieve the existing open trades from the BVA hub
    let prevTrades = await getTradeOpenList().catch((reason) => {
        logger.debug("loadPreviousOpenTrades->getTradeOpenList: " + reason)
        return Promise.reject(reason)
    })

    // Check that all the previous open trades match to current strategies
    const badTrades = prevTrades.filter(trade => !(trade.strategyId in strategies))
    if (badTrades.length) {
        // There is no way to know if they were previously real or virtual
        const logMessage = `${badTrades.length} previous open trades are no longer associated with any strategies, so will be discarded. If you want to close them, you will need to re-add the strategy in BVA and restart the trader.`
        logger.error(logMessage)
    }

    // Make sure trades are valid, then we don't have to check later
    for (let trade of prevTrades) {
        // There is no way to know how the trade was previously opened, so have to assume it is still the same as the current strategy
        trade.tradingType = strategies[trade.strategyId].tradingType

        if (trade.isStopped) {
            logger.warn(`${trade.strategyId} ${trade.symbol} ${trade.positionType} trade was stopped, it will be discarded.`)
            badTrades.push(trade)
        } else {
            switch (trade.positionType) {
                case PositionType.SHORT:
                    if (!trade.priceSell) {
                        // Hopefully this won't happen
                        logger.error(`${trade.strategyId} ${trade.symbol} ${trade.positionType} trade is missing a sell price, it will be discarded.`)
                        badTrades.push(trade)
                    }
                    break
                case PositionType.LONG:
                    if (!trade.priceBuy) {
                        // Hopefully this won't happen
                        logger.error(`${trade.strategyId} ${trade.symbol} ${trade.positionType} trade is missing a buy price, it will be discarded.`)
                        badTrades.push(trade)
                    }
                    break
            }
        }
    }

    // Remove bad trades so that they don't get considered for balance allocation
    // TODO: Notify of discarded trades
    prevTrades = prevTrades.filter(trade => !badTrades.includes(trade))

    const realTrades = prevTrades.filter(trade => trade.tradingType == TradingType.real)
    const virtualTrades = prevTrades.filter(trade => trade.tradingType == TradingType.virtual)

    // Can only match real trades to balances
    if (realTrades.length) {
        // BVA hub is not aware of the funding and balancing models, so we need to try to match these trades to Binance balances to estimate the original quantities and costs
        // Start by loading the current balances for each wallet
        const balances: Dictionary<Balances> = {}
        for (let wallet of Object.values(WalletType)) {
            balances[wallet] = await fetchBalance(wallet).catch((reason) => {
                logger.error("Trader is not operational, please restart.")
                return Promise.reject(reason)
            })
        }
        
        // Get current loans so we can match SHORT trades or borrowed LONG trades
        const marginLoans = getMarginLoans(balances[WalletType.MARGIN])

        // Potentially there can be multiple trades for the same coins from different strategies, so need to work out what the maximum allocation is
        const longTrades: Dictionary<number> = {}
        const borrowed: Dictionary<BigNumber> = {}
        // Can only match balances for real trades
        for (let trade of realTrades) {
            const market = tradingMetaData.markets[trade.symbol]
            switch (trade.positionType) {
                case PositionType.LONG:
                    if (!longTrades[market.base]) longTrades[market.base] = 0
                    longTrades[market.base]++
                    break
                case PositionType.SHORT:
                    if (!borrowed[market.base]) borrowed[market.base] = new BigNumber(0)
                    borrowed[market.base] = borrowed[market.base].plus(trade.quantity)
            }
        }

        // First lets start with SHORT trades, because the loans are less obscured
        // It may be possible for both a SHORT trade and a LONG trade to borrow the same asset, this is too hard to determine, so the SHORT trade will get the full loan instead
        for (let trade of realTrades.filter(t => t.positionType == PositionType.SHORT)) {
            const market = tradingMetaData.markets[trade.symbol]

            // All SHORT trades are from margin
            trade.wallet = WalletType.MARGIN

            // Estimate the proportion of the borrowed funds that belong to this trade
            // Technically rounding it to a legal quantity could use up more than was borrowed if there were multiple uneven trades, may need something fancier
            trade.quantity = getLegalQty(trade.quantity.dividedBy(borrowed[market.base]).multipliedBy(marginLoans[market.base].borrowed), market, trade.priceSell!)
            trade.cost = trade.quantity.multipliedBy(trade.priceSell!)
            trade.borrow = trade.quantity

            // Now we need to take these funds away from the balances, because they can't be used for LONG trades
            // For example if you had a SHORT trade on ETHBTC and a LONG trade on BTCUSD, these would share the same balance
            balances[trade.wallet][market.quote].free -= trade.cost.toNumber()

            if (balances[trade.wallet][market.quote].free < 0) {
                logger.warn(`Insufficient funds in ${market.quote} ${trade.wallet} wallet, you might not be able to repay the short trade.`)
                balances[trade.wallet][market.quote].free = 0
            }
        }

        // We needed to know the total borrowed amount to proportion the SHORT trades, but now we can clean them up
        for (let trade of realTrades.filter(t => t.positionType == PositionType.SHORT)) {
            const market = tradingMetaData.markets[trade.symbol]

            marginLoans[market.base].borrowed -= trade.borrow!.toNumber()
            // Check if we will pay back too much
            if (marginLoans[market.base].borrowed < 0) {
                // Take off the difference
                trade.borrow = trade.borrow!.plus(marginLoans[market.base].borrowed)
                logger.warn(`Loaned amount for ${market.base} doesn't match open short trades (possibly due to rounding), reducing the repayment amount for this trade.`)
            }
        }

        // There is no guarantee that margin and spot balances are going to be even, and no guarantee that each trade is even
        // So just going to have to divide them as best we can
        for (let coin of Object.keys(longTrades)) {
            // Work out the proportional number of trades for each wallet
            let marginCount = 0
            if (env().IS_TRADE_MARGIN_ENABLED && coin in balances[WalletType.MARGIN]) {
                // Work out the total free amount of this coin
                let total = new BigNumber(0)
                if (coin in balances[WalletType.SPOT]) total = total.plus(balances[WalletType.SPOT][coin].free)
                if (coin in balances[WalletType.MARGIN]) total = total.plus(balances[WalletType.MARGIN][coin].free)

                // Work out a proportional number of trades for margin
                // E.g. if 80% of the total free balance is in margin and there are 10 LONG trades, 8 will go to margin and 2 to spot
                // This doesn't take into consideration the size of the trades, we just assume they are generally equal
                marginCount = new BigNumber(balances[WalletType.MARGIN][coin].free).dividedBy(total).multipliedBy(longTrades[coin]).decimalPlaces(0).toNumber()
            }
            // Whatever is left over will go to spot

            // Now assign the wallets to each trade and count the total trade quantity
            let walletQty: Dictionary<BigNumber> = {}
            for (let wallet of Object.values(WalletType)) {
                walletQty[wallet] = new BigNumber(0)
            }
            const coinTrades = realTrades.filter(t => t.positionType == PositionType.LONG && tradingMetaData.markets[t.symbol].quote == coin)
            for (let trade of coinTrades) {
                // Do margin first because it is less likely to support the trading pair
                if (marginCount && tradingMetaData.markets[trade.symbol].margin) {
                    trade.wallet = WalletType.MARGIN
                    marginCount--
                } else {
                    trade.wallet = WalletType.SPOT
                }
                // Keep track of the total trade quantity in each wallet
                walletQty[trade.wallet] = walletQty[trade.wallet].plus(trade.quantity)
            }

            // Now that we know the total for each wallet and which trades use which wallets, we can assign the estimated quantities and costs
            for (let trade of coinTrades) {
                const market = tradingMetaData.markets[trade.symbol]

                // Estimate the proportion of the available funds that belong to this trade
                // Technically rounding it to a legal quantity could use up more than is available if there were multiple uneven trades, may need something fancier
                trade.quantity = getLegalQty(trade.quantity.dividedBy(walletQty[trade.wallet!]).multipliedBy(balances[trade.wallet!][market.base].free), market, trade.priceBuy!)
                trade.cost = trade.quantity.multipliedBy(trade.priceBuy!)

                // Check if we need to mop up any loans
                if (trade.wallet == WalletType.MARGIN && marginLoans[market.quote].borrowed) {
                    trade.borrow = new BigNumber(marginLoans[market.quote].borrowed)
                    if (trade.borrow.isGreaterThan(trade.quantity)) trade.borrow = trade.quantity
                    marginLoans[market.quote].borrowed -= trade.borrow.toNumber()
                }
            }
        }

        // TODO: Theoretically the rounding of estimated quantities could result in more funds allocated than we have free, so may need to clean this up

        // Better check that all the loans have been allocated to open trades
        for (let coin of Object.keys(marginLoans).filter(c => marginLoans[c].borrowed)) {
            logger.warn(`A margin loan of ${marginLoans[coin].borrowed} ${coin} has not been allocated to open trades, you will have to repay this manually in Binance.`)
        }
    }

    // Update optional properties for virtual trades, no way of matching the quantity so just use what was sent
    virtualTrades.forEach(trade => {
        switch (trade.positionType) {
            case PositionType.SHORT:
                trade.wallet = WalletType.MARGIN
                trade.cost = trade.quantity.multipliedBy(trade.priceSell!)
                trade.borrow = trade.quantity
                break
            case PositionType.LONG:
                if (!tradingMetaData.markets[trade.symbol].margin) {
                    trade.wallet = WalletType.SPOT
                } else {
                    trade.wallet = env().PRIMARY_WALLET
                }
                trade.cost = trade.quantity.multipliedBy(trade.priceBuy!)
                trade.borrow = new BigNumber(0)
                break
        }
    })

    // Keep the list of trades
    return prevTrades
}

export async function checkStrategyChanges(strategies: Dictionary<Strategy>) {
    // Check if a strategy has moved from real to virtual or vice versa and warn about open trades
    for (let strategy of Object.keys(strategies).filter(strategy =>
        strategy in tradingMetaData.strategies &&
        strategies[strategy].tradingType != tradingMetaData.strategies[strategy].tradingType)) {
            // Find all existing open trades for this strategy that have a different trading type (may have switched then switched back)
            const stratTrades = tradingMetaData.tradesOpen.filter(trade =>
                trade.strategyId == strategy &&
                trade.tradingType != strategies[strategy].tradingType)
            if (stratTrades.length) {
                const logMessage = `Strategy ${strategy} has moved from ${tradingMetaData.strategies[strategy].tradingType} to ${strategies[strategy].tradingType}, there are ${stratTrades.length} open trades that will remain as ${tradingMetaData.strategies[strategy].tradingType} so that they can be closed correctly.`
                if (tradingMetaData.strategies[strategy].tradingType == TradingType.real) {
                    logger.warn(logMessage + " If the trader restarts it will forget the original state of these trades, so you may want to close them in BVA now.")
                    // TODO: Notify of risky trades
                } else {
                    logger.info(logMessage)
                }
            }
    }

    // Check if a strategy has been removed and stop the open trades
    for (let strategy of Object.keys(tradingMetaData.strategies).filter(strategy => !(strategy in strategies))) {
        // Find all existing open trades for this strategy
        const stratTrades = tradingMetaData.tradesOpen.filter(trade => trade.strategyId == strategy)
        if (stratTrades.length) {
            const logMessage = `Strategy ${strategy} has been removed, there are ${stratTrades.length} open ${tradingMetaData.strategies[strategy].tradingType} trades that will be stopped. You will need to re-add the strategy to close these trades.`
            if (tradingMetaData.strategies[strategy].tradingType == TradingType.real) {
                logger.warn(logMessage)
                // TODO: Notify of stopped trades
            } else {
                logger.info(logMessage)
            }
            stratTrades.forEach(trade => trade.isStopped = true)
        }
    }

    // Check if a strategy has been re-added an restart the open trades
    for (let strategy of Object.keys(strategies).filter(strategy => !(strategy in tradingMetaData.strategies))) {
        // Find all existing open trades for this strategy
        const stratTrades = tradingMetaData.tradesOpen.filter(trade => trade.strategyId == strategy && trade.isStopped)
        if (stratTrades.length) {
            const logMessage = `Strategy ${strategy} has been restored, there are ${stratTrades.length} stopped ${tradingMetaData.strategies[strategy].tradingType} trades that will be restarted. If this is not intended, you will need to stop them again in BVA.`
            if (tradingMetaData.strategies[strategy].tradingType == TradingType.real) {
                logger.warn(logMessage)
                // TODO: Notify of restarted trades
            } else {
                logger.info(logMessage)
            }
            stratTrades.forEach(trade => trade.isStopped = false)
        }
    }
}

// Process automatic buy signal from BVA hub
// For a LONG trade it will buy first (then sell later on closing)
// For a SHORT trade this will buy and repay the loan to close the trade
export async function onBuySignal(signalJson: SignalJson) {
    const signal = new Signal(signalJson)

    // Determine whether this is a long or short trade
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
            // Undexpected entry type, this shouldn't happen
            logger.error(logDefaultEntryType)
            break
    }

    // Process the trade signal
    await exportFunctions.trade(signal).catch((reason) => {
        logger.debug("onBuySignal->trade: " + reason)
        return Promise.reject(reason)
    })
}

// Process automatic sell signal from BVA hub
// For a SHORT trade this will borrow and then sell first (then buy and replay later on closing)
// For a LONG trade this will sell to close the trade
export async function onSellSignal(signalJson: SignalJson) {
    const signal = new Signal(signalJson)

    // Determine whether this is a long or short trade
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
            // Undexpected entry type, this shouldn't happen
            logger.error(logDefaultEntryType)
            break
    }

    // Process the trade signal
    await exportFunctions.trade(signal).catch((reason) => {
        logger.debug("onSellSignal->trade: " + reason)
        return Promise.reject(reason)
    })
}

// Process close trade signal from BVA hub - this sells for LONG trades or buys for SHORT trades
// This is triggered when the user manually tells the trade to close
export async function onCloseTradedSignal(signalJson: SignalJson) {
    const signal = new Signal(signalJson)

    logger.info(`Received a close traded signal ${getOnSignalLogData(signal)}.`)

    signal.entryType = EntryType.EXIT

    await exportFunctions.trade(signal).catch((reason) => {
        logger.debug("onCloseTradedSignal->trade: " + reason)
        return Promise.reject(reason)
    })
}

// Process stop trade signal from BVA hub - this just terminates the trade without buying or selling
// This is triggered when the user manually tells the trade to stop
export function onStopTradedSignal(signalJson: SignalJson): boolean {
    const signal = new Signal(signalJson)

    logger.info(`Received a stop trade signal ${getOnSignalLogData(signal)}.`)

    const tradeOpen = getTradeOpen(signal)

    if (!tradeOpen) {
        logger.error(logTradeOpenNone)
        return false
    }

    tradeOpen.isStopped = true
    return true
}

// Validates that the trading signal is consistent with the selected strategies and configuration
export async function checkTradingData(signal: Signal): Promise<TradingData> {
    const strategy = tradingMetaData.strategies[signal.strategyId]

    if (!strategy) {
        const logMessage = `Skipping signal as strategy ${signal.strategyId} "${signal.strategyName}" isn't followed.`
        logger.warn(logMessage)
        return Promise.reject(logMessage)
    }

    if (!strategy.isActive) {
        const logMessage = `Skipping signal as strategy ${signal.strategyId} "${signal.strategyName}" isn't active.`
        logger.warn(logMessage)
        return Promise.reject(logMessage)
    }

    // Get the information on symbols and limits for this coin pair from Binance exchange
    await refreshMarkets() // Check if the cache needs to be refreshed
    const market = tradingMetaData.markets[signal.symbol]

    if (!market) {
        const logMessage = `Skipping signal as there is no market data for symbol ${signal.symbol}.`
        logger.error(logMessage)
        return Promise.reject(logMessage)
    }

    if (env().EXCLUDE_COINS) {
        // Check if either coin has been added to the exclude list (hopefully you would only exclude the base)
        const excluded = env().EXCLUDE_COINS.split(",").map(function(item: string) { return item.trim().toUpperCase() })
        if (excluded.includes(market.base) || excluded.includes(market.quote)) {
            const logMessage = `Skipping signal as trading is excluded for ${market.symbol}.`
            logger.error(logMessage)
            return Promise.reject(logMessage)
        }
    }

    if (!market.active) {
        const logMessage = `Failed to trade as the market for symbol ${market.symbol} is inactive.`
        logger.error(logMessage)
        return Promise.reject(logMessage)
    }

    if (!market.spot && !market.margin) {
        // Hopefully this won't happen
        const logMessage = `Failed to trade as neither margin trading nor spot trading is available for symbol ${market.symbol}.`
        logger.error(logMessage)
        return Promise.reject(logMessage)
    }

    if (signal.entryType === EntryType.EXIT) {
        // Find the previous open trade
        const tradeOpen = getTradeOpen(signal)

        // If this is supposed to be a trade exit, check the trade was actually open
        if (!tradeOpen) {
            logger.error(logTradeOpenNone)
            return Promise.reject(logTradeOpenNone)
        }

        logger.debug(`Getting position type from open tade: ${tradeOpen.positionType}.`)
        signal.positionType = tradeOpen.positionType
    }

    // Check if this type of trade can be executed
    switch (signal.positionType) {
        case PositionType.LONG: {
            if (!market.spot) {
                // I don't think this would ever happen              
                const logMessage = `Failed to trade as spot trading is unavailable for a long position on symbol ${market.symbol}.`
                logger.error(logMessage)
                return Promise.reject(logMessage)
            }

            if (signal.entryType === EntryType.ENTER && env().MAX_LONG_TRADES && getOpenTradeCount(signal.positionType, strategy.tradingType) >= env().MAX_LONG_TRADES) {
                const logMessage =
                    "Skipping signal as maximum number of short trades has been reached."
                logger.error(logMessage)
                return Promise.reject(logMessage)
            }

            break
        }
        case PositionType.SHORT: {
            // We can still close SHORT trades if they were previously opened on margin, so only skip the open trade signals
            if (signal.entryType === EntryType.ENTER) {
                if (!env().IS_TRADE_SHORT_ENABLED) {
                    const logMessage =
                        "Skipping signal as short trading is disabled."
                    logger.error(logMessage)
                    return Promise.reject(logMessage)
                }

                if (!env().IS_TRADE_MARGIN_ENABLED) {
                    const logMessage =
                        "Skipping signal as margin trading is disabled but is required for short trading."
                    logger.error(logMessage)
                    return Promise.reject(logMessage)
                }

                if (env().MAX_SHORT_TRADES && getOpenTradeCount(signal.positionType, strategy.tradingType) >= env().MAX_SHORT_TRADES) {
                    const logMessage =
                        "Skipping signal as maximum number of short trades has been reached."
                    logger.error(logMessage)
                    return Promise.reject(logMessage)
                }
            }

            if (!market.margin) {
                const logMessage = `Failed to trade as margin trading is unavailable for a short position on symbol ${market.symbol}.`
                logger.error(logMessage)
                return Promise.reject(logMessage)
            }

            break
        }
        default:
            // Hopefully this shouldn't happen
            logger.error(logDefaultPositionType)
            return Promise.reject(logDefaultPositionType)
    }

    return Promise.resolve({
        market,
        signal,
        strategy,
    })
}

// Adds the before, main action, and after functions to execute buy/sell and borrow/repay commands on Binance
export function getTradingSequence(
    tradeOpen: TradeOpen,
    entryType: EntryType
): Promise<TradingSequence> {
    const market = tradingMetaData.markets[tradeOpen.symbol]
    let tradingSequence: TradingSequence | undefined

    if (tradeOpen.isStopped) {
        const logMessage =
            "Skipping signal as trading is stopped for this position."
        logger.warn(logMessage)
        return Promise.reject(logMessage)
    }

    let action: ActionType | undefined
    let borrowAsset = ""

    // Just in case
    if (!tradeOpen.borrow) tradeOpen.borrow = new BigNumber(0)
    
    // Determine the action and asset to borrow based on the position and entry type
    switch (tradeOpen.positionType) {
        case PositionType.LONG:
            borrowAsset = market.quote
            switch (entryType) {
                case EntryType.ENTER:
                    action = ActionType.BUY
                    break
                case EntryType.EXIT:
                    action = ActionType.SELL
                    break
                default:
                    // This should never happen
                    logger.error(logDefaultEntryType)
                    return Promise.reject(logDefaultPositionType)
            }
            break
        case PositionType.SHORT:
            borrowAsset = market.base
            switch (entryType) {
                case EntryType.ENTER:
                    action = ActionType.SELL
                    break
                case EntryType.EXIT:
                    action = ActionType.BUY
                    break
                default:
                    // This should never happen
                    logger.error(logDefaultEntryType)
                    return Promise.reject(logDefaultPositionType)
            }
            break
        default:
            // This should never happen
            logger.error(logDefaultPositionType)
            return Promise.reject(logDefaultPositionType)
    }

    const order = () =>
        createMarketOrder(
            tradeOpen.symbol,
            action!,
            tradeOpen.quantity,
            undefined,
            {
                type: tradeOpen.wallet!,
            }
        )

    // Check if we need to borrow funds to open this trade
    const borrow = 
        tradeOpen.borrow.isGreaterThan(0) &&
        entryType == EntryType.ENTER
            ? () =>
                marginBorrow(
                    borrowAsset,
                    tradeOpen.borrow!,
                    Date.now()
                )
            : undefined

    // Check if we need to repay funds after closing this trade
    const repay =
        tradeOpen.borrow.isGreaterThan(0) &&
        entryType == EntryType.EXIT
        ? () =>
            marginRepay(
                borrowAsset,
                tradeOpen.borrow!,
                Date.now()
            )
        : undefined

    // Assemble the trading sequence
    tradingSequence = {
        before: borrow,
        mainAction: order,
        after: repay,
        socketChannel: `traded_${action}_signal`,
    }

    // Shall not be moved before the previous switch
    // so that paper trading gives the most realistic experience.
    if (tradeOpen.tradingType === TradingType.virtual) {
        logger.info(
            "Clearing trade sequence functions due to the trade being virtual."
        )
        // Replace actions with virtual balances
        tradingSequence = {
            ...tradingSequence,
            before: () => entryType == EntryType.ENTER ? virtualBorrow(tradeOpen.borrow!, borrowAsset) : Promise.resolve(),
            mainAction: () =>
                createVirtualOrder(
                    tradeOpen,
                    action!,
                ),
            after: () => entryType == EntryType.EXIT ? virtualRepay(tradeOpen.borrow!, borrowAsset) : Promise.resolve(),
        }
    }

    return Promise.resolve(tradingSequence)
}

// Simulates buy and sell transactions on the virtual balances
export async function createVirtualOrder(
    tradeOpen: TradeOpen,
    action: ActionType
) {
    const market = tradingMetaData.markets[tradeOpen.symbol]
    
    // Update virtual balances with buy and sell quantities
    switch (action) {
        case ActionType.BUY:
            virtualBalances[tradeOpen.wallet!][market.base] = virtualBalances[tradeOpen.wallet!][market.base].plus(tradeOpen.quantity)
            virtualBalances[tradeOpen.wallet!][market.quote] = virtualBalances[tradeOpen.wallet!][market.quote].minus(tradeOpen.quantity.multipliedBy(tradeOpen.priceBuy!))
            break
        case ActionType.SELL:
            virtualBalances[tradeOpen.wallet!][market.base] = virtualBalances[tradeOpen.wallet!][market.base].minus(tradeOpen.quantity)
            virtualBalances[tradeOpen.wallet!][market.quote] = virtualBalances[tradeOpen.wallet!][market.quote].plus(tradeOpen.quantity.multipliedBy(tradeOpen.priceSell!))
            break
    }

    logger.info(`After ${action}, current virtual balances are now ${virtualBalances[tradeOpen.wallet!][market.base]} ${market.base} and ${virtualBalances[tradeOpen.wallet!][market.quote]} ${market.quote}.`)
}

// Simulates borrowing on the virtual balances
export async function virtualBorrow(quantity: BigNumber, asset: string) {
    if (quantity.isGreaterThan(0)) {
        virtualBalances[WalletType.MARGIN][asset] = virtualBalances[WalletType.MARGIN][asset].plus(quantity)

        logger.info(`After borrow, current virtual balance is now ${virtualBalances[WalletType.MARGIN!][asset]} ${asset}.`)
    }
}

// Simulates repaying borrowed funds on the virtual balances
export async function virtualRepay(quantity: BigNumber, asset: string) {
    if (quantity.isGreaterThan(0)) {
        virtualBalances[WalletType.MARGIN][asset] = virtualBalances[WalletType.MARGIN][asset].minus(quantity)

        logger.info(`After repay, current virtual balance is now ${virtualBalances[WalletType.MARGIN!][asset]} ${asset}.`)
    }
}

// Excute the before, main action, and after commands in the trading sequence, this is triggered by processing the trading queue
export async function executeTradingTask(
    tradeOpen: TradeOpen,
    tradingSequence: TradingSequence,
    signal?: Signal
) {
    const socketChannel = tradingSequence.socketChannel

    logger.info(
        `Executing a ${tradeOpen.tradingType} trade of ${tradeOpen.quantity} units of symbol ${tradeOpen.symbol} at price ${tradeOpen.priceBuy ? tradeOpen.priceBuy : tradeOpen.priceSell} (${tradeOpen.cost} total).`
    )

    // This might be a borrow request for margin trading
    if (tradingSequence.before) {
        await tradingSequence
            .before()
            .then(() => {
                logger.info(
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

    // Ths would be the actual buy / sell request
    await tradingSequence
        .mainAction()
        .then(() => {
            logger.info(
                "Successfully executed the trading sequence's main action step."
            )

            socket.emitSignalTraded(socketChannel, tradeOpen.symbol, tradeOpen.strategyId, tradeOpen.strategyName, tradeOpen.quantity, tradeOpen.tradingType!)
        })
        .catch((reason) => {
            logger.error(
                `Failed to execute the trading sequence's main action step: ${reason}`
            )
            return
        })

    // This might be a repayment request for margin trading
    if (tradingSequence.after) {
        await tradingSequence
            .after()
            .then(() => {
                logger.info(
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

    // Update trade status after successful processing
    tradeOpen.executed = true

    // Send notifications (e.g. email) that signal is complete
    // Some trades may be the result of rebalancing, so no signal is available
    if (signal) {
        notifyAll(getNotifierMessage(signal, true)) // TODO: Notify on failure.
    } else {
        // TODO: Notify of non-signal triggered trades
    }
}

// Creates the trading sequence and adds it to the trading queue
export async function scheduleTrade(tradeOpen: TradeOpen, entryType: EntryType, signal?: Signal) {
    // Create the borrow / buy / sell sequence for the trade queue
    const tradingSequence = await getTradingSequence(tradeOpen!, entryType).catch(
        (reason) => {
            logger.debug("scheduleTrade->getTradingSequence: " + reason)
            return Promise.reject(reason)
        }
    )

    await queue
        .add(() => executeTradingTask(tradeOpen!, tradingSequence, signal))
        .catch((reason) => {
            logger.debug("scheduleTrade->executeTradingTask: " + reason)
            return Promise.reject(reason)
        }) // TODO: Check if async-await is needed.
}

// Processes the trade signal and schedules the trade actions
export async function trade(signal: Signal) {
    // Check that this is a signal we want to process
    const tradingData = await checkTradingData(signal).catch((reason) => {
        logger.debug("trade->checkTradingData: " + reason)
        return Promise.reject(reason)
    })

    // Notify after signal check.
    await notifyAll(getNotifierMessage(signal)).catch((reason) => {
        logger.debug("trade->notifyAll: " + reason)
        return Promise.reject(reason)
    })

    let tradeOpen: TradeOpen | undefined

    if (tradingData.signal.entryType === EntryType.ENTER) {
        // Calculate the cost and quantity for the new trade
        tradeOpen = await createTradeOpen(tradingData).catch(
            (reason) => {
                logger.debug("trade->createTradeOpen: " + reason)
                return Promise.reject(reason)
            }
        )
    } else {
        // Get previous trade (not even going to test if this was found because we wouldn't have reached here if it wasn't)
        tradeOpen = getTradeOpen(signal)   
        
        // Update buy / sell price
        if (tradingData.signal.positionType == PositionType.SHORT) tradeOpen!.priceBuy = tradingData.signal.price
        if (tradingData.signal.positionType == PositionType.LONG) tradeOpen!.priceSell = tradingData.signal.price
    }

    // Create the before / main action / after tasks and add to the trading queue
    await scheduleTrade(tradeOpen!, tradingData.signal.entryType, tradingData.signal).catch(
        (reason) => {
            logger.debug("trade->scheduleTrade: " + reason)
            return Promise.reject(reason)
        }
    )

    // If all went well, update the trade history
    // We need to do this now in the current thread even though the trade hasn't actually been executed yet, because other signals may need to reference it either for closing or auto balancing
    if (tradingData.signal.entryType == EntryType.ENTER) {
        // Add the new opened trade
        tradingMetaData.tradesOpen.push(tradeOpen!)
    } else {
        // Remove the closed trade
        tradingMetaData.tradesOpen =
            tradingMetaData.tradesOpen.filter(
                (tradesOpenElement) =>
                    tradesOpenElement !== tradeOpen
            )
    }
}

// Schedule the sell commands to rebalance an existing trade to a new cost, also update the current balance in the wallet
export async function rebalanceTrade(tradeOpen: TradeOpen, cost: BigNumber, wallet: WalletData) {
    if (!tradeOpen.cost) {
        // Hopefully this won't happen
        return Promise.reject(`Could not rebalance ${tradeOpen.symbol} trade, cost is undefined.`)
    }

    if (tradeOpen.borrow && tradeOpen.borrow.isGreaterThan(0)) {
        // Hopefully this won't happen as we shouldn't be rebalancing SHORT trades, and rebalancing model does not borrow for LONG trades
        return Promise.reject(`Could not rebalance ${tradeOpen.symbol} trade, involves borrowed funds.`)
    }

    if (!tradeOpen.priceBuy) {
        // Hopefully this won't happen as all LONG trades should have a purchase price
        return Promise.reject(`Could not rebalance ${tradeOpen.symbol} trade, no buy price.`)
    }

    // Calculate the difference in cost and quantity
    let diffCost = tradeOpen.cost.minus(cost)
    const diffQTY = getLegalQty(diffCost.dividedBy(tradeOpen.priceBuy), tradingMetaData.markets[tradeOpen.symbol], tradeOpen.priceBuy)
    // Recalculate the cost as the quantity may have rounded up
    diffCost = diffQTY.multipliedBy(tradeOpen.priceBuy)

    // Make sure the rebalance would not close the trade
    if (diffQTY.isGreaterThanOrEqualTo(tradeOpen.quantity)) {
        return Promise.reject(`Could not rebalance ${tradeOpen.symbol} trade, it would exceed remaining funds.`)
    }

    // Clone trade
    const tmpTrade = {
        ...tradeOpen,
        quantity: diffQTY,
        cost: diffCost
    }

    // Simulate closing the trade, but only for the difference in quantity
    await scheduleTrade(tmpTrade, EntryType.EXIT).catch(
        (reason) => {
            logger.debug("rebalanceTrade->scheduleTrade: " + reason)
            return Promise.reject(reason)
        }
    )

    // Adjust wallet balances
    wallet.free = wallet.free.plus(diffCost)
    wallet.locked = wallet.locked.minus(diffCost)

    return Promise.resolve()
}

// Calculates the trade quantity/cost for an open trade signal based on the user configuration, then generates a new TradeOpen structure
export async function createTradeOpen(tradingData: TradingData): Promise<TradeOpen> {
    // Start with the default quantity to buy (cost) as entered into BVA hub
    let cost = tradingData.strategy.tradeAmount // The amount of the quote coin to trade (e.g. BTC for ETHBTC)
    let quantity = new BigNumber(0) // The amount of the base coin to trade (e.g. ETH for ETHBTC)
    let borrow = new BigNumber(0) // The amount of either the base (for SHORT) or quote (for LONG) that needs to be borrowed

    // Initialise all wallets
    const wallets: Dictionary<WalletData> = {}
    Object.values(WalletType).forEach(w => wallets[w] = new WalletData(w))
    const primary = env().PRIMARY_WALLET.toLowerCase() as WalletType // Primary wallet for reference balance
    let preferred: WalletType[] = [WalletType.MARGIN] // Available wallets for this trade, sorted by priority, default to margin

    // Check which wallets can be used for this trade, SHORT will always be margin
    if (tradingData.signal.positionType == PositionType.LONG) {
        // Start with the primary wallet for LONG trades
        preferred[0] = primary
        // Check primary wallet can actually be used for this trade
        if (!tradingData.market[primary]) preferred.pop()
        // Add all the other types that can be used
        Object.values(WalletType).filter(w => w != primary && tradingData.market[w]).forEach(w => preferred.push(w))
    }

    // Remove margin if disabled
    if (!env().IS_TRADE_MARGIN_ENABLED) {
        preferred = preferred.filter(w => w != WalletType.MARGIN)
    }

    logger.info(`Identified ${preferred.length} potential wallet(s) to use for this trade, ${preferred[0]} is preferred.`)

    if (!preferred.length) {
        const logMessage = `Failed to trade as no potential wallets for this ${tradingData.signal.positionType} trade.`
        logger.error(logMessage)
        return Promise.reject(logMessage)
    }

    // Get the available balances each potential wallet
    for (let wallet of Object.values(wallets)) {
        if (tradingData.strategy.tradingType == TradingType.real) {
            // Just to save a bit of time, skip the balance lookup if we know it won't be used
            // But we will keep it in the array for now to make the other calculations easier later
            // Need to always load primary because it is used to calculate the reference balance
            if (wallet.type == primary || preferred.includes(wallet.type)) {
                // Get the current balance from Binance for the base coin (e.g. BTC)
                wallet.free = new BigNumber((await fetchBalance(wallet.type).catch((reason) => {
                    logger.debug("createTradeOpen->fetchBalance: " + reason)
                    return Promise.reject(reason)
                }))[tradingData.market.quote].free) // We're just going to use 'free', but I'm not sure whether 'total' is better
            }
        } else {
            // Initialise the virtual balances if not already used for these coins
            if (virtualBalances[wallet.type][tradingData.market.base] == undefined) virtualBalances[wallet.type][tradingData.market.base] = new BigNumber(0) // Start with zero base (e.g. ETH for ETHBTC)
            if (virtualBalances[wallet.type][tradingData.market.quote] == undefined) virtualBalances[wallet.type][tradingData.market.quote] = new BigNumber(env().VIRTUAL_WALLET_FUNDS) // Start with the default balance for quote (e.g. BTC for ETHBTC)

            wallet.free = virtualBalances[wallet.type][tradingData.market.quote]
        }
    }

    // Estimate total balances to calculate proportional trades, also subtract committed funds for SHORT trades
    // While we're looping through trades, also keep a few other indicators in case we want auto balancing
    // Only calculate trades that match this trading type (real vs. virtual)
    for (let trade of tradingMetaData.tradesOpen.filter(t => t.tradingType == tradingData.strategy.tradingType)) {
        // Ideally wallet and cost should have been initialised by now, but need to check to satisfy the compiler)
        if (trade.wallet && trade.cost) {
            // If the existing trade and this new signal share the same quote currency (e.g. both accumulating BTC)
            if (tradingMetaData.markets[trade.symbol].quote == tradingData.market.quote) {
                // SHORT trades will not have actually spent the funds in margin until they are closed, so these need to be subtracted from the free balance
                // Technically we could probably still use it for LONG trades if they were closed before the SHORT trade, but it would be a big gamble
                // We don't exactly know how much will be needed for the SHORT trade, hopefully it is less than the opening price but it could be higher
                // Also, there may be LONG trades that have not yet executed (i.e. still in the queue) so these funds will still appear in the wallet's free balance
                // Note: this is still not perfect, partial trade buy-backs could still be in the queue and not catered for, it might mean the trade is smaller than it could be
                if (trade.positionType == PositionType.SHORT || !trade.executed) {
                    wallets[trade.wallet].free = wallets[trade.wallet].free.minus(trade.cost)
                }

                // When a short trade is closed it will not increase the balance as the funds are borrowed, so rebalancing can only be done on LONG trades
                if (trade.positionType == PositionType.LONG) {
                    // Add up all the costs from active LONG trades
                    wallets[trade.wallet].locked = wallets[trade.wallet].locked.plus(trade.cost)

                    // Count the number of active LONG trades
                    wallets[trade.wallet].trades++

                    // Find the largest active LONG trade
                    // TODO: It would be nice to use current market price instead of cost calculated from opening price
                    if (wallets[trade.wallet].largest == undefined || trade.cost > wallets[trade.wallet].largest!.cost!) {
                        wallets[trade.wallet].largest = trade
                    }
                }
            }
            // If there is a different strategy that is using a different quote currency, but with open LONG trades sharing this base currency
            else if (tradingMetaData.markets[trade.symbol].base == tradingData.market.quote && trade.positionType == PositionType.LONG && trade.executed) {
                // We cannot use that purchased quantity as part of the balance because it may soon be sold
                wallets[trade.wallet].free = wallets[trade.wallet].free.minus(trade.quantity)
            }
        }
    }

    // Calculate wallet totals
    Object.values(wallets).forEach(wallet => wallet.total = wallet.free.plus(wallet.locked))

    // See if the cost should be converted to a fraction of the balance
    if (env().IS_BUY_QTY_FRACTION) {
        // Check that the quantity can actually be used as a fraction
        if (cost.isGreaterThan(1)) {
            const logMessage = `Failed to trade as quantity to buy is not a valid fraction: ${cost}.`
            logger.error(logMessage)
            return Promise.reject(logMessage)
        }

        // Calculate the fraction of the total balance
        cost = wallets[primary].total.multipliedBy(cost)
        logger.info(`${primary} wallet is ${wallets[primary].total} so target trade cost will be ${cost} ${tradingData.market.quote}`)
    }

    // Check for the minimum trade cost supported by the 
    // Need to do it here in case we have to borrow for the trade
    if (tradingData.market.limits.cost?.min && cost.isLessThan(tradingData.market.limits.cost.min)) {
        cost = new BigNumber(tradingData.market.limits.cost.min)
        logger.warn(
            `Default trade cost is not enough, pushing it up to the minimum of ${cost} ${tradingData.market.quote}.`
        )
    }

    // Calculate the cost for LONG trades based on the configured funding model
    if (tradingData.signal.positionType == PositionType.LONG) {
        const model = env().TRADE_LONG_FUNDS.toLowerCase() as LongFundsType
        if (model == LongFundsType.BORROW_ALL && tradingData.market.margin) {
            // Special case for always borrowing for LONG trades
            borrow = cost
        } else {
            // Find the best wallet based on free funds
            let use = getBestWallet(cost, preferred, wallets)
            // Check if we can just trade the full amount outright
            if (cost.isGreaterThan(use.free)) {
                // Otherwise, work out how to fund it
                switch (model) {
                    case LongFundsType.NONE:
                        // Purchase whatever we can
                        cost = use.free

                        // Check for the minimum cost to see if we can make the trade
                        if (tradingData.market.limits.cost?.min && cost.isLessThan(tradingData.market.limits.cost.min)) {
                            const logMessage = `Failed to trade as available ${use.type} funds of ${cost} ${tradingData.market.quote} would be less than the minimum trade cost of ${tradingData.market.limits.cost.min} ${tradingData.market.quote}.`
                            logger.error(logMessage)
                            return Promise.reject(logMessage)            
                        }
                        break
                    case LongFundsType.BORROW_MIN:
                    case LongFundsType.BORROW_ALL: // This is the fallback option, the preferred model is above
                        // Not enough free, so force to use margin and buy the remainder (if we can)
                        if (tradingData.market.margin) {
                            use = wallets[WalletType.MARGIN]
                            borrow = cost.minus(use.free)
                        } else {
                            // Margin not supported, so just purchase whatever we can
                            cost = use.free
                        }
                        break
                    case LongFundsType.SELL_ALL:
                    case LongFundsType.SELL_LARGEST:
                        // Calculate the potential for each wallet
                        for (let wallet of Object.values(wallets)) {
                            if (model == LongFundsType.SELL_ALL) {
                                // Assuming all trades were divided equally
                                wallet.potential = wallet.total.dividedBy(wallet.trades + 1)
                            } else {
                                // Using half of the largest trade plus the free balance, both trades should then be equal
                                // This may not halve the largest trade, it might only take a piece
                                if (wallet.largest) {
                                    wallet.potential = wallet.free.plus(wallet.largest.cost!).dividedBy(2)
                                }
                            }
                        }

                        // Get the best wallet based on the new potential
                        use = getBestWallet(cost, preferred, wallets)
                        cost = use.potential!

                        // Check for the minimum cost here as we don't want to start rebalancing if we can't make the trade
                        if (tradingData.market.limits.cost?.min && cost.isLessThan(tradingData.market.limits.cost.min)) {
                            const logMessage = `Failed to trade as rebalancing to ${cost} ${tradingData.market.quote} would be less than the minimum trade cost of ${tradingData.market.limits.cost.min} ${tradingData.market.quote}.`
                            logger.error(logMessage)
                            return Promise.reject(logMessage)            
                        }

                        logger.info(
                            `Attempting to rebalance existing trade(s) to make a new trade of ${cost} ${tradingData.market.quote}.`
                        )

                        // Rebalance
                        if (model == LongFundsType.SELL_ALL) {
                            // Can only rebalance LONG trades that use the same wallet and quote coin, and only those that are larger than the rebalanced cost
                            for (let trade of tradingMetaData.tradesOpen) {
                                if (trade.positionType == PositionType.LONG &&
                                    trade.wallet == use.type &&
                                    tradingMetaData.markets[trade.symbol].quote == tradingData.market.quote &&
                                    trade.cost && trade.cost.isGreaterThan(cost)) {
                                        await rebalanceTrade(trade, cost, use).catch(
                                            (reason) => {
                                                // Not actually going to stop processing, we may still be able to make the trade, so just log the error
                                                logger.error(reason)
                                            })
                                }
                            }
                        } else {
                            // Rebalance only the largest trade, note there may not be one
                            if (use.largest) {
                                await rebalanceTrade(use.largest, cost, use).catch(
                                    (reason) => {
                                        // Not actually going to stop processing, we may still be able to make the trade, so just log the error
                                        logger.error(reason)
                                    })
                            }
                        }

                        // Just to be sure, let's check the free balance again
                        if (use.free.isLessThan(cost)) {
                            cost = use.free
                            logger.info(
                                `Rebalancing resulted in a lower trade of only ${cost} ${tradingData.market.quote}.`
                            )
                        }
                        break
                }
            }
            // Remember the wallet for recording in the trade
            preferred = [use.type]
        }
    }

    // Calculate the purchase quantity based on the new cost
    quantity = getLegalQty(cost.dividedBy(tradingData.signal.price), tradingData.market, tradingData.signal.price)
    // Recalculate the cost because the quantity may have been rounded up to the minimum, it may also cause it to drop below the minimum cost due to precision
    // Note this may result in the trade failing due to insufficient funds, but hopefully the buffer will compensate
    cost = quantity.multipliedBy(tradingData.signal.price)

    if (tradingData.signal.positionType == PositionType.SHORT) {
        // Need to borrow the full amount that will be sold
        borrow = quantity
    }

    let msg = `${tradingData.signal.symbol} ${tradingData.signal.positionType} trade will be executed on ${preferred[0]}, total of ${quantity} ${tradingData.market.base} for ${cost} ${tradingData.market.quote}.`
    if (borrow.isGreaterThan(0)) {
        msg += `Also need to borrow ${borrow} ${tradingData.market.quote}.`
    }
    logger.info(msg)

    // Create the new trade
    return Promise.resolve({
        isStopped: false,
        positionType: tradingData.signal.positionType!,
        tradingType: tradingData.strategy.tradingType,
        priceBuy: tradingData.signal.positionType == PositionType.LONG ? tradingData.signal.price : undefined,
        priceSell: tradingData.signal.positionType == PositionType.SHORT ? tradingData.signal.price : undefined,
        quantity: quantity,
        cost: cost,
        borrow: borrow,
        wallet: preferred[0],
        strategyId: tradingData.signal.strategyId,
        strategyName: tradingData.signal.strategyName,
        symbol: tradingData.signal.symbol,
        timeUpdated: Date.now(),
        executed: false
    })
}

// Out of a prioritised list of wallets, find the one with the most free funds to make the trade
function getBestWallet(cost: BigNumber, preferred: WalletType[], wallets: Dictionary<WalletData>): WalletData {
    const walletMap = preferred.map(w => wallets[w])
    let largest = walletMap[0]
    for (let wallet of walletMap) {
        // Default potential to free
        if (wallet.potential == undefined) wallet.potential = wallet.free

        // First see if any have the complete balance
        if (wallet.potential.isGreaterThanOrEqualTo(cost)) return wallet

        // Otherwise keep the one with the largest balance
        if (wallet.potential.isGreaterThan(largest.potential!)) largest = wallet
    }

    return largest
}

export function getOnSignalLogData(signal: Signal): string {
    return `for strategy ${signal.strategyId} "${signal.strategyName}" and symbol ${signal.symbol}`
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

// Gets a count of the open active trades for a given position type, and also within the same real/virtual trading
export function getOpenTradeCount(positionType: PositionType, tradingType: TradingType) {
    return tradingMetaData.tradesOpen.filter(
        (tradeOpen) =>
            tradeOpen.positionType === positionType &&
            !tradeOpen.isStopped &&
            tradeOpen.tradingType == tradingType
    ).length
}

// Ensures that the order quantity is within the allowed limits and precision
// https://ccxt.readthedocs.io/en/latest/manual.html#precision-and-limits
export function getLegalQty(qty: BigNumber, market: Market, price: BigNumber): BigNumber {
    // Check min and max order quantity
    if (qty.isLessThan(market.limits.amount.min)) qty = new BigNumber(market.limits.amount.min)
    if (market.limits.amount.max && qty.isGreaterThan(market.limits.amount.max)) qty = new BigNumber(market.limits.amount.max)

    // We're generally using market price, so no need to check that
    //Order price >= limits['min']['price']
    //Order price <= limits['max']['price']
    // Precision of price must be <= precision['price']

    if (market.limits.cost) {
        const cost = qty.multipliedBy(price)
        if (cost.isLessThan(market.limits.cost.min)) qty = new BigNumber(market.limits.cost.min).dividedBy(price)
        // Technically the cost might have changed, but it is unlikely to have gone above the max, so no need to recalculate
        if (market.limits.cost.max && cost.isGreaterThan(market.limits.cost.max)) qty = new BigNumber(market.limits.cost.max).dividedBy(price)
    }

    return roundStep(qty, market.precision.amount)
}

// Ensures that the quantity only has the allowed number of decimal places
// https://github.com/jaggedsoft/node-binance-api/blob/28e1162ccb62bc3fdfc311cdf8e8953c6e14f42c/node-binance-api.js#L2578
// https://github.com/jaggedsoft/node-binance-api/blob/28e1162ccb62bc3fdfc311cdf8e8953c6e14f42c/LICENSE
export function roundStep(qty: BigNumber, precision: number): BigNumber {
    // Integers do not require rounding
    if (Number.isInteger(qty)) return qty
    const qtyString = qty.toFixed(16)
    const decimalIndex = qtyString.indexOf(".")
    return new BigNumber(qtyString.slice(0, decimalIndex + precision + 1))
}

// This will update the markets dictionary in the tradingMetaData every 24 hours
// Most of the time you don't need to check the return result, because even if it fails we should have the last set of data
let marketCached = 0
async function refreshMarkets() {
    const elapsed = Date.now() - marketCached
    // Only load if markets haven't been cached yet, or it has been more than 24 hours
    const reload = Object.keys(tradingMetaData.markets).length == 0 || elapsed >= 24 * 60 * 60 * 1000
    
    if (reload) {
        tradingMetaData.markets = await loadMarkets(reload).catch((reason) => {
            logger.debug("refreshMarkets->loadMarkets: " + reason)
            return Promise.reject(reason)
        })

        // Remember last cached time
        marketCached = Date.now()
    }
}

async function run() {
    logger.info("Trader starting...")

    // TODO: Validate configuration
    logger.debug(`Primary wallet is ${env().PRIMARY_WALLET.toLowerCase() as WalletType}`)

    initializeNotifiers()

    // Make sure the markets data is loaded at least once
    await refreshMarkets().catch((reason) => {
        logger.debug("run->refreshMarkets: " + reason)
        return Promise.reject(reason)
    })

    // Set up virtual wallets
    Object.values(WalletType).forEach(wallet => virtualBalances[wallet] = {})

    // Note, we can't get previously open trades here because we need to know whether they are real or virtual, so we have to wait for the payload

    socket.connect()
    startWebserver()

    logger.info("Trader started.")
}

if (process.env.NODE_ENV !== "test") {
    run().catch(() => process.exit())
}

const exportFunctions = {
    trade,
}

export default exportFunctions