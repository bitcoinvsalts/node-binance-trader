import BigNumber from "bignumber.js"
import { Balances, Dictionary, Market, Order } from "ccxt"
import PQueue from "p-queue"

import logger from "../logger"
import {
    amountToPrecision,
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
import { MessageType } from "./types/notifier"
import { WalletType, TradingData, TradingMetaData, TradingSequence, LongFundsType, WalletData, ActionType, SourceType, Transaction, BalanceHistory } from "./types/trader"

// Standard error messages
const logDefaultEntryType =
    "It shouldn't be possible to have an entry type apart from enter or exit."
const logDefaultPositionType =
    "It shouldn't be possible to have an position type apart from long or short."
const logTradeOpenNone =
    "Skipping signal as there was no associated open trade found."

// Holds the information about the current strategies and open trades
export const tradingMetaData: TradingMetaData = {
    strategies: {}, // This comes from the payload data that is sent from NBT Hub, it is a dictionary of type Strategy (see bva.ts) indexed by the strategy ID
    tradesOpen: [], // This is an array of type TradeOpen (see bva.ts) containing all the open trades
    markets: {} // This is a dictionary of the different trading symbols and limits that are supported on the Binance exchange
}

// Initialise the virtual wallets and attempt to keep track of the balance for simulations
export const virtualBalances: Dictionary<Dictionary<BigNumber>> = {}
let virtualWalletFunds = new BigNumber(env().VIRTUAL_WALLET_FUNDS) // Default to environment variable, but can be changed later
const REFERENCE_SYMBOL = "BNBBTC" // Uses this market data to calculate wallet funds for other coins
export function setVirtualWalletFunds(value: BigNumber) { virtualWalletFunds = value }

// Initialise an array to keep a transaction history
export const transactions: Transaction[] = []

// Keeps the open and close balances over time for each quote coin, indexed by trading type then coin
export const balanceHistory: Dictionary<Dictionary<BalanceHistory[]>> = {}

// Configuration for the asynchronous queue that executes the trades on Binance
const queue = new PQueue({
    concurrency: 1,
    interval: 250,
})

// Receives the information on selected strategies from the NBT Hub
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
    // These have to be ignored because we don't know whether the trades were real or virtual
    const invalid = strategies.filter(s => new Strategy(s).tradingType == undefined || s.buy_amount <= 0)
    if (invalid.length) {
        logger.warn(`There are ${invalid.length} strategies that have not yet been configured, so will be ignored: ${invalid.map(s => s.stratid).join(", ")}.`)
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
    // Technically you may have had no strategies configured before, but then you should have no trades either
    if (Object.keys(tradingMetaData.strategies).length == 0) {
        tradingMetaData.tradesOpen = await loadPreviousOpenTrades(newStrategies).catch((reason) => {
            // This will prevent the strategies from being saved too, so this will prevent the trader from functioning until the problem is resolved
            logger.debug("onUserPayload->loadPreviousOpenTrades: " + reason)
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

// Retrieves the open trade list from the NBT Hub then tries to match them to existing balances and loans in Binance.
async function loadPreviousOpenTrades(strategies: Dictionary<Strategy>): Promise<TradeOpen[]> {
    // Retrieve the existing open trades from the NBT Hub
    let prevTrades = await getTradeOpenList().catch((reason) => {
        logger.debug("loadPreviousOpenTrades->getTradeOpenList: " + reason)
        return Promise.reject(reason)
    })

    // Check that all the previous open trades match to current strategies
    const badTrades = prevTrades.filter(trade => !(trade.strategyId in strategies))
    if (badTrades.length) {
        // There is no way to know if they were previously real or virtual
        const logMessage = `There are ${badTrades.length} previous open trades are no longer associated with any strategies, so will be discarded. If you want to close them, you will need to re-add the strategy in the NBT Hub and restart the trader.`
        logger.error(logMessage)
    }

    // Make sure trades are valid, then we don't have to check later
    for (let trade of prevTrades.filter(t => !badTrades.includes(t))) {
        // There is no way to know how the trade was previously opened, so have to assume it is still the same as the current strategy
        trade.tradingType = strategies[trade.strategyId].tradingType

        switch (trade.positionType) {
            case PositionType.SHORT:
                if (!trade.priceSell) {
                    // Hopefully this won't happen
                    logger.error(`${getLogName(trade)} trade is missing a sell price, it will be discarded.`)
                    badTrades.push(trade)
                }
                break
            case PositionType.LONG:
                if (!trade.priceBuy) {
                    // Hopefully this won't happen
                    logger.error(`${getLogName(trade)} trade is missing a buy price, it will be discarded.`)
                    badTrades.push(trade)
                }
                break
        }

        if (!tradingMetaData.markets[trade.symbol]) {
            // Hopefully this won't happen
            logger.error(`${getLogName(trade)} trade symbol is no longer supported on Binance, it will be discarded.`)
            badTrades.push(trade)
        }
    }

    // Remove bad trades so that they don't get considered for balance allocation
    prevTrades = prevTrades.filter(trade => !badTrades.includes(trade))

    // NBT Hub is not aware of the funding and balancing models, so we need to try to match these trades to Binance balances to estimate the remaining trade quantities and costs
    // Start by loading the current balances for each wallet
    const balances: Dictionary<Balances> = {}
    for (let wallet of Object.values(WalletType)) {
        balances[wallet] = await fetchBalance(wallet).catch((reason) => {
            logger.error("Trader is not operational, please restart.")
            return Promise.reject(reason)
        })
    }
    
    // Get current loans so we can match SHORT trades or borrowed LONG trades
    const marginLoans = getMarginLoans(balances[WalletType.MARGIN])    // Can only match real trades to balances, virtual balances will have reset
    
    const realTrades = prevTrades.filter(trade => trade.tradingType == TradingType.real)
    const virtualTrades = prevTrades.filter(trade => trade.tradingType == TradingType.virtual)

    if (realTrades.length) {
        // Potentially there can be multiple trades for the same coins from different strategies, so need to work out what the maximum allocation is
        // First lets start with SHORT trades, because the loans are less obscured
        const borrowed: Dictionary<BigNumber> = {}
        for (let trade of realTrades.filter(t => t.positionType == PositionType.SHORT)) {
            const market = tradingMetaData.markets[trade.symbol]
            if (!borrowed[market.base]) borrowed[market.base] = new BigNumber(0)
            borrowed[market.base] = borrowed[market.base].plus(trade.quantity)
        }

        // It may be possible for both a SHORT trade and a LONG trade to borrow the same asset, so the SHORT trade will get it first
        for (let trade of realTrades.filter(t => t.positionType == PositionType.SHORT)) {
            const market = tradingMetaData.markets[trade.symbol]

            // All SHORT trades are from margin
            trade.wallet = WalletType.MARGIN

            // As SHORT trades can't be rebalanced, the original quantity should be correct, so calculate cost and borrow
            trade.cost = trade.quantity.multipliedBy(trade.priceSell!)
            trade.borrow = trade.quantity

            // Now we need to take these funds away from the balances, because they can't be used for LONG trades
            // For example if you had a SHORT trade on ETHBTC and a LONG trade on BTCUSD, these would share the same balance
            balances[trade.wallet][market.quote].free -= trade.cost.toNumber()
            marginLoans[market.base].borrowed -= trade.borrow.toNumber()

            if (balances[trade.wallet][market.quote].free < 0) {
                logger.warn(`Insufficient funds in ${market.quote} ${trade.wallet} wallet, you might not be able to repay the short trade.`)
                balances[trade.wallet][market.quote].free = 0
            }

            // Check if we will pay back too much
            if (marginLoans[market.base].borrowed < 0) {
                // Take off the difference
                trade.borrow = trade.borrow.plus(marginLoans[market.base].borrowed)
                logger.warn(`Loaned amount for ${market.base} doesn't match open short trades, reducing the repayment amount for this trade.`)
            }
        }

        // We're going to hope that the trades haven't been rebalanced, so we'll try to assign the original quantity to wallets first
        // If there is only one trade in each coin, then it should match up well
        // But if there are multiple trades sharing the same coin, and they have been rebalanced, we have to assume that they were about even
        // So we may not always get back to exactly the same state as before the restart, but it should be close enough
        const wallets: Dictionary<Dictionary<WalletData>> = {}
        for (let trade of realTrades.filter(t => t.positionType == PositionType.LONG)) {
            const market = tradingMetaData.markets[trade.symbol]
            // Get the list of wallets that could have been used for this trade
            const {preferred, primary} = getPreferredWallets(market, trade.positionType)
            
            // Calculate the potential funds that could be used for this trade in each wallet
            preferred.forEach(w => {
                if (!wallets[market.base]) wallets[market.base] = {}
                if (!wallets[market.base][w]) {
                    wallets[market.base][w] = new WalletData(w)
                    wallets[market.base][w].free = new BigNumber(balances[w][market.base].free)
                    wallets[market.base][w].potential = wallets[market.base][w].free

                    logger.debug(`${w} wallet has ${wallets[market.base][w].free} ${market.base} free.`)
                }

                // If there is enough free balance, then use that as the potential
                wallets[market.base][w].potential = wallets[market.base][w].free.minus(wallets[market.base][w].total)
                if (wallets[market.base][w].potential! < trade.quantity) {
                    // Otherwise use equal portions of the balance for each trade
                    wallets[market.base][w].potential = wallets[market.base][w].free.dividedBy(wallets[market.base][w].trades.length + 1)
                }
            })
            
            // Use the preferred wallet or the one with with the best potential
            const wallet = getBestWallet(trade.quantity, preferred, wallets[market.base])
            
            // Assign this trade to the wallet and update the total and count
            trade.wallet = wallet.type
            wallet.total = wallet.total.plus(trade.quantity) // Will be rebalanced later
            wallet.trades.push(trade)
        }

        // Recalculate to an average quantity if the total is more than the free balance
        for (let coin of Object.keys(wallets)) {
            for (let walletType of Object.keys(wallets[coin])) {
                const wallet = wallets[coin][walletType]
                if (wallet.total.isGreaterThan(wallet.free)) {
                    // Each coin pair may have a different minimum quantity, so have to calculate the actual quantity per trade
                    // Also, we will update the free balance as each quantity is consumed, so remember the target now
                    const target = wallet.free.dividedBy(wallet.trades.length)
                    logger.info(`Insufficient ${coin} in ${walletType}, reducing ${wallet.trades.length} trades to about ${target} ${coin}.`)
                    logger.debug(`Needed ${wallet.total} but only have ${wallet.free}.`)

                    // Find all LONG trades that share this coin and wallet
                    for (let trade of realTrades.filter(t =>
                        t.positionType == PositionType.LONG &&
                        t.wallet == walletType &&
                        tradingMetaData.markets[t.symbol].base == coin)) {
                            const market = tradingMetaData.markets[trade.symbol]
                            // Try to use the target quantity
                            trade.quantity = getLegalQty(target, market, trade.priceBuy!) // LONG trades will always be buy price
                            trade.timeUpdated = new Date()

                            // Check if we have used more than is available
                            if (trade.quantity.isGreaterThan(wallet.free)) {
                                trade.quantity = getLegalQty(wallet.free, market, trade.priceBuy!)

                                if (trade.quantity.isGreaterThan(wallet.free)) {
                                    // Still not enough to make this trade
                                    logger.error(`${getLogName(trade)} trade does not have sufficient funds, it will be discarded.`)
                                    badTrades.push(trade)
                                    // Don't want to subtract the quantity, so skip to the next trade
                                    continue
                                }
                            }

                            // Track how much has been consumed
                            wallet.free = wallet.free.minus(trade.quantity)
                    }

                    // Make sure that the rebalancing consumed everything
                    if (wallet.free.isGreaterThan(0)) {
                        // Hopefully this is just a rounding issue, but it may be a result of maximum trade sizes too
                        logger.error(`Rebalancing ${coin} in ${walletType} did not allocate everything to trades, you may need to sell ${wallet.free.toFixed()} ${coin} manually in Binance.`)
                    }
                }
            }
        }

        // Calculate the cost for LONG trades, it may use the original quantity or new quantity
        for (let trade of realTrades.filter(t => t.positionType == PositionType.LONG)) {
            trade.cost = trade.quantity.multipliedBy(trade.priceBuy!)
        }

        // See if we can mop up any loans with the margin LONG trades
        for (let trade of realTrades.filter(t =>
            t.positionType == PositionType.LONG &&
            t.wallet == WalletType.MARGIN &&
            !badTrades.includes(t))) {
                const market = tradingMetaData.markets[trade.symbol]
                if (marginLoans[market.quote] && marginLoans[market.quote].borrowed) {
                    trade.borrow = new BigNumber(marginLoans[market.quote].borrowed)
                    if (trade.borrow.isGreaterThan(trade.quantity)) trade.borrow = trade.quantity
                    marginLoans[market.quote].borrowed -= trade.borrow.toNumber()

                    logger.info(`${getLogName(trade)} trade will repay loan of ${trade.borrow} ${market.quote}.`)
                }
        }

        // Remove bad trades so that they don't get started
        prevTrades = prevTrades.filter(trade => !badTrades.includes(trade))
    }

    // Notify of discarded trades
    badTrades.forEach(trade => 
        notifyAll(getNotifierMessage(MessageType.WARN, undefined, trade, "This previous trade was received from the NBT Hub but could not be reloaded. Check the log for details.")).catch((reason) => {
            logger.debug("loadPreviousOpenTrades->notifyAll: " + reason)
        })
    )

    // Better check that all the loans have been allocated to open real trades
    for (let coin of Object.keys(marginLoans).filter(c => marginLoans[c].borrowed)) {
        logger.error(`A margin loan of ${marginLoans[coin].borrowed} ${coin} has not been allocated to any open trades, you will have to repay this manually in Binance.`)
    }

    // Update optional properties for virtual trades, no way of matching the quantity so just use what was sent
    virtualTrades.forEach(trade => {
        const market = tradingMetaData.markets[trade.symbol]
        switch (trade.positionType) {
            case PositionType.SHORT:
                trade.wallet = WalletType.MARGIN
                trade.cost = trade.quantity.multipliedBy(trade.priceSell!)
                trade.borrow = trade.quantity
                break
            case PositionType.LONG:
                if (!market.margin) {
                    trade.wallet = WalletType.SPOT
                } else {
                    trade.wallet = env().PRIMARY_WALLET
                }
                trade.cost = trade.quantity.multipliedBy(trade.priceBuy!)
                trade.borrow = new BigNumber(0)
                break
        }
    })

    // Update virtual balances to match existing trades
    resetVirtualBalances(virtualTrades)

    // Log results
    prevTrades.forEach(trade =>
        logger.info(`Previous trade ${getLogName(trade)} assigned to ${trade.wallet}, quantity = ${trade.quantity}, cost = ${trade.cost}`)
    )

    // Keep the list of trades
    return prevTrades
}

// Compare differences between previously loaded strategy and the new strategies from the payload
async function checkStrategyChanges(strategies: Dictionary<Strategy>) {
    // Check if a strategy has moved from real to virtual or vice versa and warn about open trades
    for (let strategy of Object.keys(strategies).filter(strategy =>
        strategy in tradingMetaData.strategies &&
        strategies[strategy].tradingType != tradingMetaData.strategies[strategy].tradingType)) {
            // Find all existing open trades for this strategy that have a different trading type (may have switched then switched back)
            const stratTrades = tradingMetaData.tradesOpen.filter(trade =>
                trade.strategyId == strategy &&
                trade.tradingType != strategies[strategy].tradingType)
            if (stratTrades.length) {
                logger.warn(`Strategy ${strategy} has moved from ${tradingMetaData.strategies[strategy].tradingType} to ${strategies[strategy].tradingType}, there are ${stratTrades.length} open trades that will remain as ${tradingMetaData.strategies[strategy].tradingType} so that they can be closed correctly. If the trader restarts it will forget the original state of these trades, so you may want to close them in the NBT Hub now.`)
            }
    }

    // Check if a strategy has been removed and notify of the paused open trades
    for (let strategy of Object.keys(tradingMetaData.strategies).filter(strategy => !(strategy in strategies))) {
        // Find all existing open trades for this strategy
        const stratTrades = tradingMetaData.tradesOpen.filter(trade => trade.strategyId == strategy)
        if (stratTrades.length) {
            logger.warn(`Strategy ${strategy} has been removed, there are ${stratTrades.length} open trades that will be paused. You can still manually close them in the NBT Hub.`)
            // Notify of paused trades
            stratTrades.forEach(trade => 
                notifyAll(getNotifierMessage(MessageType.WARN, undefined, trade, "The strategy has been removed so this trade will be paused.")).catch((reason) => {
                    logger.debug("checkStrategyChanges->notifyAll: " + reason)
                })
            )
            // Note, we don't actually need to pause the trades as the signals will be ignored for these strategies anyway
        }
    }

    // Check if a strategy has been re-added so notify about resuming the open trades
    for (let strategy of Object.keys(strategies).filter(strategy => !(strategy in tradingMetaData.strategies))) {
        // Find all existing open trades for this strategy
        const stratTrades = tradingMetaData.tradesOpen.filter(trade => trade.strategyId == strategy && !trade.isStopped)
        if (stratTrades.length) {
            logger.warn(`Strategy ${strategy} has been restored, there are ${stratTrades.length} paused trades that will be restarted.`)
            // Notify of resumed trades
            stratTrades.forEach(trade => 
                notifyAll(getNotifierMessage(MessageType.WARN, undefined, trade, "The strategy has been restored so this trade will be resumed.")).catch((reason) => {
                    logger.debug("checkStrategyChanges->notifyAll: " + reason)
                })
            )
        }
    }

    // Copy the stopped flag and count of lost trades because these aren't sent from NBT Hub, but only if the trade (active) flag has not been switched
    // Note, I think if you turn trade off in the NBT Hub you don't get the strategy in the payload anyway
    for (let strategy of Object.keys(strategies).filter(strategy =>
        strategy in tradingMetaData.strategies &&
        strategies[strategy].isActive == tradingMetaData.strategies[strategy].isActive)) {
            strategies[strategy].isStopped = tradingMetaData.strategies[strategy].isStopped
            strategies[strategy].lossTradeRun = tradingMetaData.strategies[strategy].lossTradeRun
    }
}

// Process automatic buy signal from NBT Hub
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
    await trade(signal, SourceType.SIGNAL).catch((reason) => {
        logger.debug("onBuySignal->trade: " + reason)
        return Promise.reject(reason)
    })
}

// Process automatic sell signal from NBT Hub
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
    await trade(signal, SourceType.SIGNAL).catch((reason) => {
        logger.debug("onSellSignal->trade: " + reason)
        return Promise.reject(reason)
    })
}

// Process close trade signal from NBT Hub - this sells for LONG trades or buys for SHORT trades
// This is triggered when the user manually tells the trade to close
export async function onCloseTradedSignal(signalJson: SignalJson) {
    const signal = new Signal(signalJson)

    logger.info(`Received a close traded signal ${getOnSignalLogData(signal)}.`)

    signal.entryType = EntryType.EXIT

    await trade(signal, SourceType.MANUAL).catch((reason) => {
        logger.debug("onCloseTradedSignal->trade: " + reason)
        const tradeOpen = getTradeOpen(signal)
        // This is a special case where the user has stopped a trade then tried to close it and it failed
        // TODO: Need to create a special traded signal if there is no open trade (i.e. trade was discarded for some reason)
        if (tradeOpen && tradeOpen.isStopped) {
            logger.error(`Could not close stopped trade ${getLogName(tradeOpen)}  properly, so just going to fake a signal back to the NBT Hub and drop the trade.`)
            // Tell NBT Hub that the trade was closed even though it probably wasn't
            emitSignalTraded(`traded_${tradeOpen!.positionType == PositionType.SHORT ? ActionType.BUY : ActionType.SELL}_signal`, tradeOpen!)

            // Remove the closed trade
            tradingMetaData.tradesOpen =
            tradingMetaData.tradesOpen.filter(
                (tradesOpenElement) =>
                    tradesOpenElement !== tradeOpen
            )

            // Note, this doesn't update balances or PnL, so these might be incorrect now

            if (tradeOpen.tradingType == TradingType.virtual) {
                logger.warn(`A virtual trade was deleted, you will probably need to reset virtual balances.`)
            }
        } else {
            return Promise.reject(reason)
        }
    })
}

// Process stop trade signal from NBT Hub - this just terminates the trade without buying or selling
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
async function checkTradingData(signal: Signal, source: SourceType): Promise<TradingData> {
    const strategy = tradingMetaData.strategies[signal.strategyId]

    // Only check the strategy for auto trades, this allows you to manually close any trade
    if (source == SourceType.SIGNAL) {
        if (!strategy) {
            const logMessage = `Skipping signal as strategy ${getLogName(undefined, signal)} isn't followed.`
            logger.info(logMessage)
            return Promise.reject(logMessage)
        }

        if (!strategy.isActive) {
            const logMessage = `Skipping signal as strategy ${getLogName(undefined, signal)} isn't active.`
            logger.warn(logMessage)
            return Promise.reject(logMessage)
        }
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

    // Try to find a previous open trade
    const tradeOpen = getTradeOpen(signal)

    switch (signal.entryType) {
        case EntryType.ENTER:
            // Check if strategy has hit the losing trade limit
            if (!strategy || strategy.isStopped) {
                const logMessage = `Skipping signal as strategy ${getLogName(undefined, signal)} has been stopped, toggle the trade flag in the NBT Hub to restart it.`
                logger.error(logMessage)
                return Promise.reject(logMessage)
            }        

            // If this is supposed to be a new trade, check there wasn't an existing one
            // This is a workaround for an issue in the NBT Hub, if you miss a close signal while your trader is offline then you may get another open signal for something that is already open
            // It seems the NBT Hub will ignore the second traded_buy/sell_signal and only track the first open trade, so if we open a second one in the trader it will be orphaned and never close
            // So until we have a unique ID that is provided on the signal and NBT Hub can track them correctly, we're just going to have to ignore concurrent trades and treat this as a continuation
            if (tradeOpen) {
                const logMessage = `Skipping signal as existing open trade already found for ${getLogName(undefined, signal)}.`
                logger.error(logMessage)
                return Promise.reject(logMessage)
            }
            break
        case EntryType.EXIT:
            // If this is supposed to be a trade exit, check the trade was actually open
            if (!tradeOpen) {
                logger.error(logTradeOpenNone)
                return Promise.reject(logTradeOpenNone)
            }

            // Can't automatically close a stopped trade, but will still let through a manual close
            if (source == SourceType.SIGNAL && tradeOpen.isStopped) {
                const logMessage = `Skipping signal as trade ${getLogName(tradeOpen)} is stopped.`
                logger.warn(logMessage)
                return Promise.reject(logMessage)
            }

            logger.debug(`Getting position type from open trade: ${tradeOpen.positionType}.`)
            signal.positionType = tradeOpen.positionType

            // A manual close won't have a price, so just have to use the original open price
            if (!signal.price) signal.price = tradeOpen.priceBuy
            if (!signal.price) signal.price = tradeOpen.priceSell

            // Check to satisfy the compiler, if no price it will fail later anyway
            if (signal.price) {
                // Calculate whether this trade will make a profit or loss
                const net = tradeOpen.positionType == PositionType.LONG ? signal.price.minus(tradeOpen.priceBuy!) : tradeOpen.priceSell!.minus(signal.price)
                logger.debug(`Closing price difference is: ${net.toFixed()}.`)

                // Check if strategy has hit the losing trade limit, and this an automatic trade signal
                // Strategy may be undefined if no longer followed, but then we should only get here for a manual close
                if ((!strategy || strategy.isStopped) && source == SourceType.SIGNAL && signal.price) {
                    if (net.isNegative()) {
                        const logMessage = `Skipping signal as strategy ${getLogName(undefined, signal)} has been stopped and this trade will make another loss, close it manually or wait for a better close signal.`
                        logger.error(logMessage)
                        return Promise.reject(logMessage)
                    } else {
                        // Winning trades are allowed through
                        logger.info(`Strategy ${getLogName(undefined, signal)} has been stopped, but this should be a winning trade.`)
                    }
                }
            }
            
            break
    }

    // Always need a price
    if (!signal.price) {
        const logMessage = `Skipping signal for ${getLogName(undefined, signal)} as price was missing.`
        logger.error(logMessage)
        return Promise.reject(logMessage)        
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
                const logMessage = "Skipping signal as maximum number of short trades has been reached."
                logger.error(logMessage)
                return Promise.reject(logMessage)
            }

            break
        }
        case PositionType.SHORT: {
            // We can still close SHORT trades if they were previously opened on margin, so only skip the open trade signals
            if (signal.entryType === EntryType.ENTER) {
                if (!env().IS_TRADE_SHORT_ENABLED) {
                    const logMessage = "Skipping signal as short trading is disabled."
                    logger.error(logMessage)
                    return Promise.reject(logMessage)
                }

                if (!env().IS_TRADE_MARGIN_ENABLED) {
                    const logMessage = "Skipping signal as margin trading is disabled but is required for short trading."
                    logger.error(logMessage)
                    return Promise.reject(logMessage)
                }

                if (env().MAX_SHORT_TRADES && getOpenTradeCount(signal.positionType, strategy.tradingType) >= env().MAX_SHORT_TRADES) {
                    const logMessage = "Skipping signal as maximum number of short trades has been reached."
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
    entryType: EntryType,
    source: SourceType
): Promise<TradingSequence> {
    const market = tradingMetaData.markets[tradeOpen.symbol]
    let tradingSequence: TradingSequence | undefined

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

    // Execute the main buy/sell action for the trade
    const order = () => executeTradeAction(tradeOpen, source, action!, market.symbol, tradeOpen.quantity)

    // Check if we need to borrow funds to open this trade
    const borrow = 
        tradeOpen.borrow.isGreaterThan(0) &&
        entryType == EntryType.ENTER
            ? () => executeTradeAction(tradeOpen, source, ActionType.BORROW, borrowAsset, tradeOpen.borrow!)
            : undefined

    // Check if we need to repay funds after closing this trade
    const repay =
        tradeOpen.borrow.isGreaterThan(0) &&
        entryType == EntryType.EXIT
        ? () => executeTradeAction(tradeOpen, source, ActionType.REPAY, borrowAsset, tradeOpen.borrow!)
        : undefined

    // Assemble the trading sequence
    tradingSequence = {
        before: borrow,
        mainAction: order,
        after: repay,
        // Cannot send sell signals to the NBT Hub for auto balancing because it will be treated as a close
        socketChannel: source != SourceType.REBALANCE ? `traded_${action}_signal` : '',
    }

    return Promise.resolve(tradingSequence)
}

// Performs the actual buy, sell, borrow, or repay trade functions, and keeps a record of the transaction
async function executeTradeAction(
    tradeOpen: TradeOpen,
    source: SourceType,
    action: ActionType,
    symbolAsset: string,
    quantity: BigNumber
) {
    let result: Order | null = null

    logger.debug(`${action} ${quantity} ${symbolAsset} on ${tradeOpen.wallet}`)

    // Execute the real or virtual actions
    switch (action) {
        case ActionType.BUY:
        case ActionType.SELL:
            result = await (tradeOpen.tradingType == TradingType.real ?
                createMarketOrder(
                    symbolAsset,
                    action,
                    quantity,
                    undefined,
                    {
                        type: tradeOpen.wallet!,
                    }
                )
            :
                createVirtualOrder(
                    tradeOpen,
                    action,
                )
            ).catch((reason) => {
                logger.debug("execute => BUY/SELL: " + reason)
                return Promise.reject(reason)
            })
            break
        case ActionType.BORROW:
            result = await (tradeOpen.tradingType == TradingType.real ?
                marginBorrow(
                    symbolAsset,
                    quantity,
                    Date.now()
                )
            :
                virtualBorrow(
                    symbolAsset,
                    quantity
                )
            ).catch((reason) => {
                logger.debug("execute => BORROW: " + reason)
                return Promise.reject(reason)
            })
            break
        case ActionType.REPAY:
            result = await (tradeOpen.tradingType == TradingType.real ?
                marginRepay(
                    symbolAsset,
                    quantity,
                    Date.now()
                )
            :
                virtualRepay(
                    symbolAsset,
                    quantity
                )
            ).catch((reason) => {
                logger.debug("execute => REPAY: " + reason)
                return Promise.reject(reason)
            })
            break
    }

    if (result != null) {
        if (result.status == "closed") {
            // Check if the price and cost is different than we expected (it usually is)
            // TODO: It would be nice to feed these current prices back to the original trades when rebalancing
            if (result.cost && !tradeOpen.cost!.isEqualTo(result.cost)) {
                logger.debug(`${getLogName(tradeOpen)} trade cost changed to ${result.cost}`)
                // Update the cost for better accuracy
                tradeOpen.cost = new BigNumber(result.cost)
                tradeOpen.timeUpdated = new Date()
            }
            if (result.price) {
                switch (action) {
                    case ActionType.BUY:
                        if (!tradeOpen.priceBuy!.isEqualTo(result.price)) {
                            logger.debug(`${getLogName(tradeOpen)} trade buy price changed to ${result.price}`)
                            // Update the price for better accuracy
                            tradeOpen.priceBuy = new BigNumber(result.price)
                            tradeOpen.timeUpdated = new Date()
                        }
                        break
                    case ActionType.SELL:
                        if (!tradeOpen.priceSell!.isEqualTo(result.price)) {
                            logger.debug(`${getLogName(tradeOpen)} trade sell price changed to ${result.price}`)
                            // Update the price for better accuracy
                            tradeOpen.priceSell = new BigNumber(result.price)
                            tradeOpen.timeUpdated = new Date()
                        }
                        break
                }
            }
        } else {
            // Trade information will be added to the log message by the calling method
            return Promise.reject(`Result status was "${result.status}".`)
        }
    }

    // Record transaction
    transactions.push(new Transaction(tradeOpen, source, action, symbolAsset, quantity))
    // Truncate memory array
    while (transactions.length > 1 && transactions.length > env().MAX_LOG_LENGTH) {
        transactions.shift()
    }

    return Promise.resolve(result)
}

// Simulates buy and sell transactions on the virtual balances
async function createVirtualOrder(
    tradeOpen: TradeOpen,
    action: ActionType
): Promise<null> {
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

    logger.debug(`After ${action}, current ${tradeOpen.wallet} virtual balances are now ${virtualBalances[tradeOpen.wallet!][market.base]} ${market.base} and ${virtualBalances[tradeOpen.wallet!][market.quote]} ${market.quote}.`)
    return Promise.resolve(null)
}

// Simulates borrowing on the virtual balances
async function virtualBorrow(asset: string, quantity: BigNumber): Promise<null> {
    if (quantity.isGreaterThan(0)) {
        virtualBalances[WalletType.MARGIN][asset] = virtualBalances[WalletType.MARGIN][asset].plus(quantity)

        logger.debug(`After borrow, current ${WalletType.MARGIN} virtual balance is now ${virtualBalances[WalletType.MARGIN!][asset]} ${asset}.`)
    }
    return Promise.resolve(null)
}

// Simulates repaying borrowed funds on the virtual balances
async function virtualRepay(asset: string, quantity: BigNumber): Promise<null> {
    if (quantity.isGreaterThan(0)) {
        virtualBalances[WalletType.MARGIN][asset] = virtualBalances[WalletType.MARGIN][asset].minus(quantity)

        logger.debug(`After repay, current ${WalletType.MARGIN} virtual balance is now ${virtualBalances[WalletType.MARGIN!][asset]} ${asset}.`)
    }
    return Promise.resolve(null)
}

// Excute the before, main action, and after commands in the trading sequence, this is triggered by processing the trading queue
export async function executeTradingTask(
    tradeOpen: TradeOpen,
    tradingSequence: TradingSequence,
    signal?: Signal
) {
    logger.info(`${signal ? signal.entryType == EntryType.ENTER ? "Enter" : "Exit" : "Execut"}ing a ${tradeOpen.tradingType} ${tradeOpen.positionType} trade on ${tradeOpen.wallet} for ${tradeOpen.quantity} units of symbol ${tradeOpen.symbol}.`)

    // TODO: Track whether parts of the trade failed, perhaps use a retry queue

    // This might be a borrow request for margin trading
    if (tradingSequence.before) {
        await tradingSequence
            .before()
            .then(() => {
                logger.debug(`Successfully executed the ${getLogName(tradeOpen)} trading sequence's before step.`)
            })
            .catch((reason) => {
                const logMessage = `Failed to execute the ${getLogName(tradeOpen)} trading sequence's before step: ${reason}`
                logger.error(logMessage)
                notifyAll(getNotifierMessage(MessageType.ERROR, signal, tradeOpen, logMessage)).catch((reason) => {
                    logger.debug("executeTradingTask->notifyAll: " + reason)
                })
                return Promise.reject(logMessage)
            })
    }

    // Ths would be the actual buy / sell request
    await tradingSequence
        .mainAction()
        .then(() => {
            logger.debug(`Successfully executed the ${getLogName(tradeOpen)} trading sequence's main action step.`)

            // Notify NBT Hub that trade has been executed
            emitSignalTraded(tradingSequence.socketChannel, tradeOpen)
        })
        .catch((reason) => {
            const logMessage = `Failed to execute the ${getLogName(tradeOpen)} trading sequence's main action step: ${reason}`
            logger.error(logMessage)
            notifyAll(getNotifierMessage(MessageType.ERROR, signal, tradeOpen, logMessage)).catch((reason) => {
                logger.debug("executeTradingTask->notifyAll: " + reason)
            })
            return Promise.reject(logMessage)
        })

    // This might be a repayment request for margin trading
    if (tradingSequence.after) {
        await tradingSequence
            .after()
            .then(() => {
                logger.debug(`Successfully executed the ${getLogName(tradeOpen)} trading sequence's after step.`)
            })
            .catch((reason) => {
                const logMessage = `Failed to execute the ${getLogName(tradeOpen)} trading sequence's after step: ${reason}`
                logger.error(logMessage)
                notifyAll(getNotifierMessage(MessageType.ERROR, signal, tradeOpen, logMessage)).catch((reason) => {
                    logger.debug("executeTradingTask->notifyAll: " + reason)
                })
                return Promise.reject(logMessage)
            })
    }

    // Update trade status after successful processing
    tradeOpen.executed = true

    // Send notifications (e.g. email) that signal is complete
    // Some trades may be the result of rebalancing, so no signal is available
    notifyAll(getNotifierMessage(MessageType.SUCCESS, signal, tradeOpen)).catch((reason) => {
        logger.debug("executeTradingTask->notifyAll: " + reason)
    })
}

// Notify NBT Hub that the trade has been executed
function emitSignalTraded(channel: string, tradeOpen: TradeOpen) {
    // Some trades may be silent (i.e. auto balancing)
    if (channel != '') socket.emitSignalTraded(channel, tradeOpen.symbol, tradeOpen.strategyId, tradeOpen.strategyName, tradeOpen.quantity, tradeOpen.tradingType!)
}

// Creates the trading sequence and adds it to the trading queue
async function scheduleTrade(
    tradeOpen: TradeOpen,
    entryType: EntryType,
    source: SourceType,
    signal?: Signal
) {
    // Create the borrow / buy / sell sequence for the trade queue
    const tradingSequence = await getTradingSequence(tradeOpen!, entryType, source).catch(
        (reason) => {
            logger.debug("scheduleTrade->getTradingSequence: " + reason)
            return Promise.reject(reason)
        }
    )

    queue.add(() => executeTradingTask(tradeOpen!, tradingSequence, signal))
        .catch((reason) => {
            logger.debug("scheduleTrade->executeTradingTask: " + reason)

            if (source == SourceType.REBALANCE) {
                // TODO: Need to restore the quantity/cost to the parent trade
                logger.error("Failed rebalancing trades will mess up the trade sizes, please restart the trader.")
            }

            // Note, this won't return in this scheduleTrade method as the queue is processed asynchronously, so we have to drop the exception here
            // Hopefully the real error was already logged (typically a Binance trading issue)
        })
}

// Processes the trade signal and schedules the trade actions
export async function trade(signal: Signal, source: SourceType) {
    // Check that this is a signal we want to process
    const tradingData = await checkTradingData(signal, source).catch((reason) => {
        logger.debug("trade->checkTradingData: " + reason)
        return Promise.reject(reason)
    })

    // Notify of incoming signal that we want to process, we will also send a notification once the trade is executed
    // There is no need to wait for this to finish
    notifyAll(getNotifierMessage(MessageType.INFO, signal)).catch((reason) => {
        logger.debug("trade->notifyAll: " + reason)
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
        tradeOpen!.timeUpdated = new Date()
        if (tradingData.signal.positionType == PositionType.SHORT) {
            tradeOpen!.priceBuy = tradingData.signal.price
            tradeOpen!.timeBuy = new Date()
        } else {
            tradeOpen!.priceSell = tradingData.signal.price
            tradeOpen!.timeSell = new Date()
        }
    }

    // Create the before / main action / after tasks and add to the trading queue
    await scheduleTrade(tradeOpen!, tradingData.signal.entryType, source, tradingData.signal).catch(
        (reason) => {
            logger.debug("trade->scheduleTrade: " + reason)
            return Promise.reject(reason)
        }
    )

    // If all went well, update the trade history
    // We need to do this now in the current thread even though the trade hasn't actually been executed yet, because other signals may need to reference it either for closing or auto balancing
    logger.debug(`Were ${tradingMetaData.tradesOpen.length} open trades.`)
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
        
        // Calculate the change in value, for checking loss limit and updating balance history
        // Note, we don't track the change in value for rebalancing, so the only time we will get a different price is when it is initiated by a signal
        const newCost = tradeOpen!.quantity.multipliedBy(tradingData.signal.price!)
        const change = tradeOpen!.positionType == PositionType.SHORT
            ? tradeOpen!.cost!.minus(newCost) 
            : newCost.minus(tradeOpen!.cost!)

        const strategy = tradingMetaData.strategies[tradeOpen!.strategyId]
        // Manually closing a trade should not affect the count of losses
        if (strategy && source == SourceType.SIGNAL) {
            // Check for losing trade
            if (change.isLessThan(0)) {
                // Losing trade, increase the count
                strategy.lossTradeRun++

                // Check for the loss limit
                // Losing trades may still come through if they are closed manually, so only log the stop once
                if (!strategy.isStopped && env().STRATEGY_LOSS_LIMIT && strategy.lossTradeRun >= env().STRATEGY_LOSS_LIMIT) {
                    const logMessage = `${getLogName(undefined, signal)} has had too many losing trades, stopping new trades for this strategy.`
                    logger.error(logMessage)
                    strategy.isStopped = true
                    // Notify strategy is stopped
                    notifyAll(getNotifierMessage(MessageType.WARN, signal, undefined, logMessage)).catch((reason) => {
                        logger.debug("trade->notifyAll: " + reason)
                    })
                }
            } else {
                if (strategy.lossTradeRun > 0) logger.debug(`${getLogName(undefined, signal)} had ${strategy.lossTradeRun} losses in a row.`)

                // Winning trade, reset the count
                strategy.lossTradeRun = 0
            }
        }

        // Send the change value to the balance history
        updateBalanceHistory(tradeOpen!.tradingType!, tradingData.market.quote, tradingData.signal.entryType, undefined, change)
    }
    logger.debug(`Now ${tradingMetaData.tradesOpen.length} open trades.`)
}

// Schedule the sell commands to rebalance an existing trade to a new cost, also update the current balance in the wallet
async function rebalanceTrade(tradeOpen: TradeOpen, cost: BigNumber, wallet: WalletData) {
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

    if (tradeOpen.cost.isLessThanOrEqualTo(cost)) {
        // Maybe the largest trade is already smaller than the free balance, so we're just going to skip
        logger.warning(`Could not rebalance ${tradeOpen.symbol} trade, it is already below the target cost.`)
        // Technically this is successful even though it didn't free up any funds
        return Promise.resolve()
    }

    // Have to set a sell price so that it can update balances
    // TODO: It would be nice to use current market price instead of cost calculated from opening price
    if (!tradeOpen.priceSell) tradeOpen.priceSell = tradeOpen.priceBuy

    // Calculate the difference in cost and quantity
    let diffCost = tradeOpen.cost.minus(cost)
    const diffQTY = getLegalQty(diffCost.dividedBy(tradeOpen.priceBuy), tradingMetaData.markets[tradeOpen.symbol], tradeOpen.priceBuy)
    // Recalculate the cost as the quantity may have rounded up
    diffCost = diffQTY.multipliedBy(tradeOpen.priceBuy)

    // Make sure the rebalance would not close the trade
    if (diffQTY.isGreaterThanOrEqualTo(tradeOpen.quantity)) {
        return Promise.reject(`Could not rebalance ${tradeOpen.symbol} trade, it would exceed remaining funds.`)
    }

    // Clone trade just to execute the partial close
    const tmpTrade = {
        ...tradeOpen,
        quantity: diffQTY,
        cost: diffCost
    }

    // Simulate closing the trade, but only for the difference in quantity
    await scheduleTrade(tmpTrade, EntryType.EXIT, SourceType.REBALANCE).catch(
        (reason) => {
            logger.debug("rebalanceTrade->scheduleTrade: " + reason)
            return Promise.reject(reason)
        }
    )

    // If we got this far then we just have to assume that the rebalance trade will go through ok, so update the original trade
    tradeOpen.quantity = tradeOpen.quantity.minus(diffQTY)
    tradeOpen.cost = tradeOpen.cost!.minus(diffCost)
    tradeOpen.timeUpdated = new Date()
    tradeOpen.timeSell = new Date()

    // Adjust wallet balances
    wallet.free = wallet.free.plus(diffCost)
    wallet.locked = wallet.locked.minus(diffCost)
}

// Calculates the trade quantity/cost for an open trade signal based on the user configuration, then generates a new TradeOpen structure
async function createTradeOpen(tradingData: TradingData): Promise<TradeOpen> {
    // Start with the default quantity to buy (cost) as entered into NBT Hub
    let cost = tradingData.strategy.tradeAmount // The amount of the quote coin to trade (e.g. BTC for ETHBTC)
    let quantity = new BigNumber(0) // The amount of the base coin to trade (e.g. ETH for ETHBTC)
    let borrow = new BigNumber(0) // The amount of either the base (for SHORT) or quote (for LONG) that needs to be borrowed

    // Initialise all wallets
    const wallets: Dictionary<WalletData> = {}
    Object.values(WalletType).forEach(w => wallets[w] = new WalletData(w))
    let {preferred, primary} = getPreferredWallets(tradingData.market, tradingData.signal.positionType)

    if (!preferred.length) {
        const logMessage = `Failed to trade as no potential wallets for this ${tradingData.signal.positionType} trade.`
        logger.error(logMessage)
        return Promise.reject(logMessage)
    }

    // Get the available balances each potential wallet
    for (let wallet of Object.values(wallets)) {
        if (tradingData.strategy.tradingType == TradingType.real) {
            // Get the current balance from Binance for the base coin (e.g. BTC)
            wallet.free = new BigNumber((await fetchBalance(wallet.type).catch((reason) => {
                logger.debug("createTradeOpen->fetchBalance: " + reason)
                return Promise.reject(reason)
            }))[tradingData.market.quote].free) // We're just going to use 'free', but I'm not sure whether 'total' is better
        } else {
            initialiseVirtualBalances(wallet.type, tradingData.market)
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
                if ((trade.positionType == PositionType.SHORT && trade.executed) || (trade.positionType == PositionType.LONG && !trade.executed)) {
                    logger.debug(`${trade.cost} ${tradingData.market.quote} are allocated to a ${trade.positionType} trade that has ${trade.executed ? "" : "not "}been executed.`)
                    wallets[trade.wallet].free = wallets[trade.wallet].free.minus(trade.cost)
                }

                // When a short trade is closed it will not increase the balance as the funds are borrowed, so rebalancing can only be done on LONG trades
                if (trade.positionType == PositionType.LONG) {
                    // Add up all the costs from active LONG trades
                    wallets[trade.wallet].locked = wallets[trade.wallet].locked.plus(trade.cost)

                    // Count the number of active LONG trades
                    wallets[trade.wallet].trades.push(trade)

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
                logger.debug(`${trade.quantity} ${tradingData.market.quote} are allocated to a ${trade.positionType} trade that has ${trade.executed ? "" : "not "}been executed.`)
                wallets[trade.wallet].free = wallets[trade.wallet].free.minus(trade.quantity)
            }
        }
    }

    // Calculate wallet totals and subtract the buffer
    let totalBalance = new BigNumber(0)
    Object.values(wallets).forEach(wallet => {
        wallet.total = wallet.free.plus(wallet.locked)
        totalBalance = totalBalance.plus(wallet.total)

        if (env().WALLET_BUFFER) {
            const buffer = wallet.total.multipliedBy(env().WALLET_BUFFER)
            wallet.free = wallet.free.minus(buffer)
            wallet.total = wallet.total.minus(buffer)
        }
    })

    // We only look at the balances when opening a trade, so keep them for the history
    updateBalanceHistory(tradingData.strategy.tradingType, tradingData.market.quote, EntryType.ENTER, totalBalance)

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
        logger.info(`Total usable ${primary} wallet is ${wallets[primary].total} so target trade cost will be ${cost} ${tradingData.market.quote}`)
        logger.debug(`Total is made up of ${wallets[primary].free} free and ${wallets[primary].locked} locked ${tradingData.market.quote}`)
    }

    // Check for the minimum trade cost supported by the exchange
    // Need to do it here in case we have to borrow for the trade
    if (tradingData.market.limits.cost?.min && cost.isLessThan(tradingData.market.limits.cost.min)) {
        cost = new BigNumber(tradingData.market.limits.cost.min)
        logger.warn(
            `Default trade cost is not enough, pushing it up to the minimum of ${cost} ${tradingData.market.quote}.`
        )
    }

    // Check for the maximum trade cost supported by the exchange
    if (tradingData.market.limits.cost?.max && cost.isGreaterThan(tradingData.market.limits.cost.max)) {
        cost = new BigNumber(tradingData.market.limits.cost.max)
        logger.warn(
            `Default trade cost is too high, dropping it down to the maximum of ${cost} ${tradingData.market.quote}.`
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
                            // Margin not supported, so just trade whatever we can
                            cost = use.free
                        }
                        break
                    case LongFundsType.SELL_ALL:
                    case LongFundsType.SELL_LARGEST:
                        // Calculate the potential for each wallet
                        for (let wallet of Object.values(wallets)) {
                            // If there is nothing to rebalance, or the largest trade is already less than the free balance, then there is no point reducing anything
                            if (!wallet.largest || wallet.free.isGreaterThanOrEqualTo(wallet.largest.cost!)) {
                                wallet.potential = wallet.free
                                // Clear the trades so that we don't try to rebalance anything later
                                wallet.trades = []
                            } else {
                                if (model == LongFundsType.SELL_ALL) {
                                    // All trades may not have equivalent costs, due to the fact that we don't re-buy remaining trades after one is closed, i.e. new trades can use the full free balance
                                    // So we have to go through and work out which of the highest trades need to be rebalanced so that the new trade is of equal cost to at least one other
                                    let smaller = true
                                    // Loop through and kick out any trades that are smaller than the average, keep going until we have the exact set of trades to rebalance and the average of just those trades
                                    while (smaller) {
                                        smaller = false
                                        // Calculate the average trade size of the remaining trades and assuming the free balance will also be a trade
                                        wallet.potential = wallet.total.dividedBy(wallet.trades.length + 1)
                                        // Note we're going to overwrie the total and trades for this wallet because it is easier for processing, we shouldn't need the originals anymore
                                        wallet.total = new BigNumber(0)
                                        const largeTrades: TradeOpen[] = []
                                        wallet.trades.forEach(trade => {
                                            if (trade.cost!.isGreaterThanOrEqualTo(wallet.potential!)) {
                                                largeTrades.push(trade)
                                                // Keep a new total of only the large trades to calculate a new average
                                                wallet.total = wallet.total.plus(trade.cost!)
                                            } else {
                                                // This trade is below the average, so it won't get rebalanced
                                                logger.debug(`${getLogName(trade)} cost of ${trade.cost} is below the average of ${wallet.potential} so won't be rebalanced.`)
                                                // The list of trades is different, so we'll need to loop again and calculate a new average
                                                smaller = true
                                            }
                                        })
                                        // Add the usable free balance back to the remaining total trades
                                        wallet.total = wallet.total.plus(wallet.free)
                                        // Keep the remaining list of large trades
                                        wallet.trades = largeTrades
                                    }
                                } else {
                                    // Using half of the largest trade plus the free balance, both trades should then be equal
                                    // This may not halve the largest trade, it might only take a piece
                                    wallet.potential = wallet.free.plus(wallet.largest.cost!).dividedBy(2)
                                    // Overwrite the list of trades to make it easier for rebalancing later, we shouldn't need the original anymore
                                    wallet.trades = [wallet.largest]
                                }
                            }
                        }

                        // Get the best wallet based on the new potential
                        use = getBestWallet(cost, preferred, wallets)
                        // Maybe rebalancing could give us more than we need for this trade, e.g. if we have more than the maximum trade volume
                        if (use.potential!.isLessThan(cost)) cost = use.potential!

                        // Check for the minimum cost here as we don't want to start rebalancing if we can't make the trade
                        if (tradingData.market.limits.cost?.min && cost.isLessThan(tradingData.market.limits.cost.min)) {
                            const logMessage = `Failed to trade as rebalancing to free up ${cost} ${tradingData.market.quote} would be less than the minimum trade cost of ${tradingData.market.limits.cost.min} ${tradingData.market.quote}.`
                            logger.error(logMessage)
                            return Promise.reject(logMessage)            
                        }

                        logger.info(`Attempting to rebalance ${use.trades.length} existing trade(s) on ${use.type} to ${use.potential} ${tradingData.market.quote} to make a new trade of ${cost} ${tradingData.market.quote}.`)

                        // Rebalance all the remaining trades in this wallet to the calculated trade size
                        for (let trade of use.trades) {
                            await rebalanceTrade(trade, use.potential!, use).catch(
                                (reason) => {
                                    // Not actually going to stop processing, we may still be able to make the trade using the free balance, so just log the error
                                    logger.error(reason)
                                })
                        }

                        // Just to be sure, let's check the free balance again, this will probably alway happen due to rounding
                        if (use.free.isLessThan(cost)) {
                            // To limit spamming the logs, we'll only warn if there was more than 0.5% change
                            if (use.free.multipliedBy(1.005).isLessThan(cost)) {
                                logger.warn(`Rebalancing resulted in a lower trade of only ${use.free} ${tradingData.market.quote} instead of ${use.free} ${tradingData.market.quote}.`)
                            }
                            cost = use.free
                        }
                        break
                }
            }
            // Remember the wallet for recording in the trade
            preferred = [use.type]
        }
    }

    // Calculate the purchase quantity based on the new cost
    quantity = getLegalQty(cost.dividedBy(tradingData.signal.price!), tradingData.market, tradingData.signal.price!)
    // Recalculate the cost because the quantity may have been rounded up to the minimum, it may also cause it to drop below the minimum cost due to precision
    // Note this may result in the trade failing due to insufficient funds, but hopefully the buffer will compensate
    cost = quantity.multipliedBy(tradingData.signal.price!)

    if (tradingData.signal.positionType == PositionType.SHORT) {
        // Need to borrow the full amount that will be sold
        borrow = quantity
    }

    let msg = `${getLogName(undefined, tradingData.signal)} trade will be executed on ${preferred[0]}, total of ${quantity} ${tradingData.market.base} for ${cost} ${tradingData.market.quote}.`
    if (borrow.isGreaterThan(0)) {
        msg += `Also need to borrow ${borrow} ${tradingData.market.quote}.`
    }
    logger.info(msg)

    // Create the new trade
    return Promise.resolve({
        id: "T" + Date.now(), // Generate a temporary internal ID, because we only get one from the NBT Hub when reloading the payload
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
        timeUpdated: new Date(),
        timeBuy: tradingData.signal.positionType == PositionType.LONG ? new Date() : undefined,
        timeSell: tradingData.signal.positionType == PositionType.SHORT ? new Date() : undefined,
        executed: false
    })
}

// Get the list of wallets that are applicable for the market and trade position, sorted by priority
function getPreferredWallets(market: Market, positionType = PositionType.LONG) {
    const primary = env().PRIMARY_WALLET.toLowerCase() as WalletType // Primary wallet for reference balance
    let preferred: WalletType[] = [WalletType.MARGIN] // Available wallets for this trade, sorted by priority, default to margin

    // Check which wallets can be used for this trade, SHORT will always be margin
    if (positionType == PositionType.LONG) {
        // Start with the primary wallet for LONG trades
        preferred[0] = primary
        // Check primary wallet can actually be used for this trade
        if (!market[primary]) preferred.pop()
        // Add all the other types that can be used
        Object.values(WalletType).filter(w => w != primary && market[w]).forEach(w => preferred.push(w))
    }

    // Remove margin if disabled
    if (!env().IS_TRADE_MARGIN_ENABLED) {
        preferred = preferred.filter(w => w != WalletType.MARGIN)
    }

    logger.debug(`Identified ${preferred.length} potential wallet(s) to use for this trade, ${preferred[0]} is preferred.`)

    return { preferred, primary }
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

// Clears all virtual balances and corresponding balance history, then initialises balances from open trades
export function resetVirtualBalances(virtualTrades?: TradeOpen[]) {
    // Set up virtual wallets
    Object.values(WalletType).forEach(wallet => virtualBalances[wallet] = {})
    if (Object.keys(balanceHistory).includes(TradingType.virtual)) delete balanceHistory[TradingType.virtual]

    if (!virtualTrades) {
        virtualTrades = tradingMetaData.tradesOpen.filter(trade => trade.tradingType == TradingType.virtual)
    }

    virtualTrades.forEach(trade => {
        const market = tradingMetaData.markets[trade.symbol]
        initialiseVirtualBalances(trade.wallet!, market)
        switch (trade.positionType) {
            case PositionType.SHORT:
                // We've already borrowed and sold the asset, so we should have surplus funds
                virtualBalances[trade.wallet!][market.quote] = virtualBalances[trade.wallet!][market.quote].plus(trade.cost!)
                break
            case PositionType.LONG:
                // We've already bought the asset, so we should have less funds
                virtualBalances[trade.wallet!][market.base] = virtualBalances[trade.wallet!][market.base].plus(trade.quantity!)
                virtualBalances[trade.wallet!][market.quote] = virtualBalances[trade.wallet!][market.quote].minus(trade.cost!)
                // TODO: It would be better to rebalance the virtual trades to keep the defined open balance, but that will take some work
                if (virtualBalances[trade.wallet!][market.quote].isLessThan(0)) virtualBalances[trade.wallet!][market.quote] = new BigNumber(0)
                break
        }
    })
}

// Initialise the virtual balances if not already used for these coins
// Note, If you have different strategies using different quote assets but actively trading in each other's asset, one of them may miss out on the initial balance
function initialiseVirtualBalances(walletType: WalletType, market: Market) {
    if (virtualBalances[walletType][market.base] == undefined) virtualBalances[walletType][market.base] = new BigNumber(0) // Start with zero base (e.g. ETH for ETHBTC)
    if (virtualBalances[walletType][market.quote] == undefined) {
        let value = virtualWalletFunds
        const btc = tradingMetaData.markets[REFERENCE_SYMBOL]
        // If the quote asset is not BTC, then use the minimum costs to scale the opening balance
        if (market.quote != "BTC" && market.limits.cost && btc && btc.limits.cost) {
            value = value.dividedBy(btc.limits.cost.min).multipliedBy(market.limits.cost.min)
            logger.debug(`Calculated virtual opening balance of ${value} ${market.quote}`)
            if (!value.isGreaterThan(0)) value = virtualWalletFunds // Just in case
        }
    
        virtualBalances[walletType][market.quote] = value // Start with the default balance for quote (e.g. BTC for ETHBTC)
    }
}

// Updates the running balance for the current day
function updateBalanceHistory(tradingType: TradingType, quote: string, entryType: EntryType, balance?: BigNumber, change?: BigNumber) {
    if (!Object.keys(balanceHistory).includes(tradingType)) balanceHistory[tradingType] = {}
    if (!Object.keys(balanceHistory[tradingType]).includes(quote)) balanceHistory[tradingType][quote] = []

    // Get last history slice
    let h = balanceHistory[tradingType][quote].slice(-1).pop()
    if (!h && !balance) {
        // This usually happens when the trader is restarted with existing open trades, and a close signal comes through first
        logger.error(`No previous balance history for ${tradingType} ${quote}, cannot track this change.`)
        return
    }
    if (!balance) {
        // Copy the closing balance from the previous day
        balance = h!.closeBalance
    }
    // Initialise history here so that the timestamp is locked
    const tmpH = new BalanceHistory(balance)

    // Check if existing balance history is still the same date
    if (!h || !(h.timestamp.getFullYear() == tmpH.timestamp.getFullYear() && h.timestamp.getMonth() == tmpH.timestamp.getMonth() && h.timestamp.getDate() == tmpH.timestamp.getDate())) {
        balanceHistory[tradingType][quote].push(tmpH)
        h = tmpH
    }

    // Calculate number of concurrent open trades
    // This method should be called before the opened trade is added, or after the closed trade is removed, so that's why we add 1 to count the calling trade
    const openTradeCount = tradingMetaData.tradesOpen.filter(trade => trade.tradingType == tradingType && tradingMetaData.markets[trade.symbol].quote == quote).length + 1

    // Update latest balances and stats
    if (change) balance = balance.plus(change)
    h.closeBalance = balance
    if (h.minOpenTrades == undefined || openTradeCount-1 < h.minOpenTrades) h.minOpenTrades = openTradeCount-1 // Unless this fires on exactly midnight, there must have been a time before or after this trade
    if (h.maxOpenTrades == undefined || openTradeCount > h.maxOpenTrades) h.maxOpenTrades = openTradeCount
    if (entryType == EntryType.ENTER) {
        h.totalOpenedTrades++
    } else {
        h.totalClosedTrades++
    }

    // Remove previous history slices that are older than 1 year, but keep the very first entry for lifetime opening balance
    const lastYear = new Date(tmpH.timestamp.getFullYear()-1, tmpH.timestamp.getMonth(), tmpH.timestamp.getDate())
    while (balanceHistory[tradingType][quote].length > 1 && balanceHistory[tradingType][quote][1].timestamp <= lastYear) {
        balanceHistory[tradingType][quote].splice(1, 1)
    }
}

// Constructs a consistent name for trades, signals, and strategies for logging
function getLogName(tradeOpen?: TradeOpen, signal?: Signal, strategy?: Strategy) {
    if (tradeOpen) {
        return `${tradeOpen.strategyId} "${tradeOpen.strategyName}" ${tradeOpen.tradingType} ${tradeOpen.symbol} ${tradeOpen.positionType}`
    } else if (signal) {
        return `${signal.strategyId} "${signal.strategyName}" ${signal.symbol} ${signal.positionType ? signal.positionType : ""}`
    } else if (strategy) {
        return `${strategy.id} ${strategy.tradingType}`
    }

    return "[ERROR]"
}

export function getOnSignalLogData(signal: Signal): string {
    return `for strategy ${getLogName(undefined, signal)}`
}

export function getTradeOpen(signal: Signal): TradeOpen | undefined {
    const tradesOpenFiltered = getTradeOpenFiltered(signal)

    const logData = `in strategy ${getLogName(undefined, signal)}`

    if (tradesOpenFiltered.length > 1) {
        logger.warn(
            `There is more than one trade open ${logData}. Using the first found.`
        )
    } else if (tradesOpenFiltered.length === 0) {
        logger.debug(`No open trade found ${logData}.`)
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
    )
}

// Gets a count of the open active trades for a given position type, and also within the same real/virtual trading
function getOpenTradeCount(positionType: PositionType, tradingType: TradingType) {
    return tradingMetaData.tradesOpen.filter(
        (tradeOpen) =>
            tradeOpen.positionType === positionType &&
            !tradeOpen.isStopped &&
            tradeOpen.tradingType == tradingType
    ).length
}

// Ensures that the order quantity is within the allowed limits and precision
// https://ccxt.readthedocs.io/en/latest/manual.html#precision-and-limits
function getLegalQty(qty: BigNumber, market: Market, price: BigNumber): BigNumber {
    // Check min and max order quantity
    if (qty.isLessThan(market.limits.amount.min)) {
        qty = new BigNumber(market.limits.amount.min)
        logger.debug(`${market.symbol} trade quantity is below the minimum.`)
    }
    if (market.limits.amount.max && qty.isGreaterThan(market.limits.amount.max)) {
        qty = new BigNumber(market.limits.amount.max)
        logger.debug(`${market.symbol} trade quantity is above the maximum.`)
    }
    if (market.limits.market && market.limits.market.max && qty.isGreaterThan(market.limits.market.max)) {
        qty = new BigNumber(market.limits.market.max)
        logger.debug(`${market.symbol} trade quantity is above the market maximum.`)
    }

    // We're generally using market price, so no need to check that
    //Order price >= limits['min']['price']
    //Order price <= limits['max']['price']
    // Precision of price must be <= precision['price']

    if (market.limits.cost) {
        const cost = qty.multipliedBy(price)
        if (cost.isLessThan(market.limits.cost.min)) {
            qty = new BigNumber(market.limits.cost.min).dividedBy(price)
            logger.debug(`${market.symbol} trade cost is below the minimum.`)
        }
        // Technically the cost might have changed, but it is unlikely to have gone above the max, so no need to recalculate
        if (market.limits.cost.max && cost.isGreaterThan(market.limits.cost.max)) {
            qty = new BigNumber(market.limits.cost.max).dividedBy(price)
            logger.debug(`${market.symbol} trade cost is above the maximum.`)
        }
    }

    // Use the ccxt API to ensure the quantity only has the allowed number of decimal places
    return amountToPrecision(market.symbol, qty)
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

// Main function to start the trader
async function run() {
    logger.info(`NBT Trader v${env().VERSION} is starting...`)

    // Validate environment variable configuration
    let issues: string[] = []
    if (env().MAX_LOG_LENGTH <= 1) issues.push("MAX_LOG_LENGTH must be greater than 0.")
    if (!Number.isInteger(env().MAX_LOG_LENGTH)) issues.push("MAX_LOG_LENGTH must be a whole number.")
    if (env().WALLET_BUFFER < 0 || env().WALLET_BUFFER >= 1) issues.push("WALLET_BUFFER must be from 0 to 0.99.")
    if (env().MAX_SHORT_TRADES < 0) issues.push("MAX_SHORT_TRADES must be 0 or more.")
    if (!Number.isInteger(env().MAX_SHORT_TRADES)) issues.push("MAX_SHORT_TRADES must be a whole number.")
    if (env().MAX_LONG_TRADES < 0) issues.push("MAX_LONG_TRADES must be 0 or more.")
    if (!Number.isInteger(env().MAX_LONG_TRADES)) issues.push("MAX_LONG_TRADES must be a whole number.")
    if (env().STRATEGY_LOSS_LIMIT < 0) issues.push("STRATEGY_LOSS_LIMIT must be 0 or more.")
    if (!Number.isInteger(env().STRATEGY_LOSS_LIMIT)) issues.push("STRATEGY_LOSS_LIMIT must be a whole number.")
    if (env().VIRTUAL_WALLET_FUNDS <= 0) issues.push("VIRTUAL_WALLET_FUNDS must be greater than 0.")
    if (!env().IS_TRADE_MARGIN_ENABLED && env().PRIMARY_WALLET == WalletType.MARGIN) issues.push(`PRIMARY_WALLET cannot be ${WalletType.MARGIN} if IS_TRADE_MARGIN_ENABLED is false.`)
    if (issues.length) {
        issues.forEach(issue => logger.error(issue))
        return Promise.reject(issues.join(" "))
    }
    
    initializeNotifiers()

    // Make sure the markets data is loaded at least once
    await refreshMarkets().catch((reason) => {
        logger.debug("run->refreshMarkets: " + reason)
        return Promise.reject(reason)
    })

    // Note, we can't get previously open trades here because we need to know whether they are real or virtual, so we have to wait for the payload
    // Strategies also come down in the payload, so no signals will be accepted until that is processed

    socket.connect()
    startWebserver()

    logger.info("Trader started.")
}

// WARNING: Only use this function on the testnet API if you need to reset balances
async function sellEverything(base: string, fraction: number) {
    const balances = await fetchBalance(WalletType.SPOT)
    for (let quote of Object.keys(balances)) {
        const market = tradingMetaData.markets[quote + base]
        if (market && balances[quote].free) {
            const qty = balances[quote].free * fraction
            logger.debug(`Selling ${qty} ${quote}`)
            logger.debug(await createMarketOrder(quote + "/" + base, "sell", new BigNumber(qty)).then(order => `${order.status} ${order.cost}`).catch(e => e.name))
        }
    }
    await fetchBalance(WalletType.SPOT)
}

// Starts the trader
if (process.env.NODE_ENV !== "test") {
    run().catch(() => process.exit())
}

const exportFunctions = {
    trade,
}

export default exportFunctions