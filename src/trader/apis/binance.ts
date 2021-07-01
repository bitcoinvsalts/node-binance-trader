import ccxt, { Dictionary } from "ccxt"

import env from "../env"
import logger from "../../logger"
import BigNumber from "bignumber.js"
import { WalletType } from "../types/trader"

const logBinanceUndefined = "Binance client is undefined!"

let binanceClient: ccxt.binance
const sandbox = process.env.NODE_ENV === "staging"

if (process.env.NODE_ENV !== "test") {
    binanceClient = new ccxt.binance({
        apiKey: env().BINANCE_API_KEY,
        enableRateLimit: true,
        secret: env().BINANCE_SECRET_KEY,
    })

    if (sandbox) {
        binanceClient.setSandboxMode(true)
    }
}

export interface Loan {
    borrowed: number
    interest: number
}

// Gets all of the supported coin pairs (symbols) and associated flags and limits
export function loadMarkets(isReload?: boolean): Promise<ccxt.Dictionary<ccxt.Market>> {
    return new Promise((resolve, reject) => {
        binanceClient
            .loadMarkets(isReload)
            .then((value) => {
                logger.silly(`Loaded markets: ${JSON.stringify(value)}`)
                const markets = JSON.parse(JSON.stringify(value)) // Clone object.
                Object.keys(markets).forEach((key) => { // Work around the missing slash ("/") in BVA's signal data.
                    const keyNew = markets[key].id
                    markets[keyNew] = markets[key]
                    delete markets[key]
                })
                logger.debug(`Loaded ${Object.keys(markets).length} markets.`)
                resolve(markets)
            })
            .catch((reason) => {
                logger.error(`Failed to get markets: ${reason}`)
                reject(reason)
            })
    })
}

// Gets the current balances for a given wallet type 'margin' or 'spot'
export function fetchBalance(type: WalletType): Promise<ccxt.Balances> {
    // Hack, as you can't look up margin balances on testnet (NotSupported error), but this is only for testing
    if (sandbox) type = WalletType.SPOT

    return new Promise((resolve, reject) => {
        binanceClient
            .fetchBalance({
                type: type
            })
            .then((value) => {
                logger.silly(`Fetched balance: ${JSON.stringify(value)}`)
                logger.debug(`Loaded ${Object.keys(value).length} ${type} balances.`)
                resolve(value)
            })
            .catch((reason) => {
                logger.error(`Failed to get ${type} balance: ${reason}`)
                reject(reason)
            })
    })
}

// Takes the output from fetchBalance(MARGIN) and extracts the borrowed and interest values for each asset
export function getMarginLoans(marginBalance: ccxt.Balances): Dictionary<Loan> {
    if (sandbox) {
        // Hack, as you can't look up margin balances on testnet (NotSupported error), but this is only for testing
        const fake: Dictionary<Loan> = {}
        for (let asset of Object.keys(marginBalance)) {
            if (marginBalance[asset] instanceof Object && 'free' in marginBalance[asset]) {
                fake[asset] = {
                    borrowed: 0.0,
                    interest: 0.0
                }
            }
        }
        return fake
    } else {
        if (!('userAssets' in marginBalance.info)) {
            logger.error("Invalid margin balances, cannot extract loans.")
        }

        // Extract the loans from the secret property, and remap to a dictionary of assets
        return marginBalance.info.userAssets.reduce((output: Dictionary<Loan>, asset: {asset: string, borrowed: string, interest: string}) => {
            output[asset.asset] = { // Use asset as the key
                borrowed: parseFloat(asset.borrowed),
                interest: parseFloat(asset.interest)
            }
            return output
        }, {})
    }
}

export async function createMarketOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: BigNumber,
    price?: BigNumber,
    params?: ccxt.Params
): Promise<ccxt.Order> {
    if (!binanceClient) return Promise.reject(logBinanceUndefined)
    return binanceClient.createMarketOrder(symbol, side, amount.toNumber(), price?.toNumber(), params)
}

export async function marginBorrow(
    asset: string,
    amount: BigNumber
): Promise<ccxt.Order> {
    if (!binanceClient) return Promise.reject(logBinanceUndefined)
    return binanceClient.sapiPostMarginLoan({
        asset,
        isIsolated: false, // "false" for cross margin borrow without specification of a symbol.
        amount
    })
}

export async function marginRepay(
    asset: string,
    amount: BigNumber
): Promise<ccxt.Order> {
    if (!binanceClient) return Promise.reject(logBinanceUndefined)
    return binanceClient.sapiPostMarginRepay({
        asset,
        isIsolated: false, // "false" for cross margin repay without specification of a symbol.
        amount
    })
}

// Applies precition / step size to the order quantity, also checks lot size
export function amountToPrecision(symbol: string, quantity: BigNumber) {
    return new BigNumber(binanceClient.amountToPrecision(symbol, quantity.toNumber()))
}