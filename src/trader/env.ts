import path from "path"

import dotenv from "dotenv"
import { bool, cleanEnv, port, str, num, email } from "envalid"

import * as packageJson from "../../package.json"
import { LongFundsType, WalletType } from "./types/trader"

export function testOnly(value: string): string | undefined {
    return process.env.NODE_ENV === "test" ? value : undefined
}

export function getDefault(): Readonly<any> {
    dotenv.config({
        path: path.resolve(
            process.cwd(),
            process.env.NODE_ENV === "test" ? ".env.testing" : ".env"
        ),
    })

    return cleanEnv(process.env, {
        // Required configuration
        BINANCE_API_KEY: str({ devDefault: testOnly("BINANCE_API_KEY"), desc: "Your Binance API Key" }),
        BINANCE_SECRET_KEY: str({ devDefault: testOnly("BINANCE_SECRET_KEY"), desc: "Your Binance API Secret" }),
        BVA_API_KEY: str({ devDefault: testOnly("BVA_API_KEY"), desc: "Your BitcoinVsAltcoins.com Account API Key" }),

        // Gmail nofications
        // Make sure you have allowed 'less secure apps' in your Google account: https://myaccount.google.com/lesssecureapps
        IS_NOTIFIER_GMAIL_ENABLED: bool({ default: false, desc: "Selects if Gmail will be used (Enable less secure apps https://myaccount.google.com/lesssecureapps)" }),
        NOTIFIER_GMAIL_ADDRESS: str({ default: "", desc: "Gmail email to get notifications" }),
        NOTIFIER_GMAIL_APP_PASSWORD: str({ default: "", desc: "Gmail password to get notifications" }),

        // To use Telegram, first talk to The Botfather and create a bot on Telegram: https://core.telegram.org/bots#3-how-do-i-create-a-bot
        // The Botfather will give you your token for the HTTP API, and that is what you set to be the TELEGRAM_API_KEY
        // Then talk to the @userinfobot at Telegram, and it will give you your personal receiver ID, and thats what you use for the TELEGRAM_RECEIVER_ID
        IS_NOTIFIER_TELEGRAM_ENABLED: bool({ default: false, desc: "Selects if Telegram will be used" }),
        NOTIFIER_TELEGRAM_API_KEY: str({ default: "", desc: "Telegram Key for your bot (To create one follow https://core.telegram.org/bots#6-botfather)" }),
        NOTIFIER_TELEGRAM_RECEIVER_ID: str({ default: "", desc: "Unique identifier for the target chat (as a number) or username of the target channel (in the format @channelusername)" }),

        // Additional configuration options for trader features
        IS_BUY_QTY_FRACTION: bool({ default: false, desc: "Uses the 'Quantity to Buy' from the NBT Hub as a fraction of your wallet balance (e.g. 0.1 is 10%)" }),
        TRADE_LONG_FUNDS: str({ default: LongFundsType.NONE, choices: Object.values(LongFundsType), desc: "See README for explanation" }), // '', 'borrow min', 'borrow all', 'sell all', or 'sell largest'
        PRIMARY_WALLET: str({ default: WalletType.MARGIN, choices: Object.values(WalletType), desc: "Primary wallet to execute LONG trades ('margin' or 'spot'), it may still swap to the other if there are insufficient funds" }),
        WALLET_BUFFER: num({ default: 0.1, desc: "Decimal fraction of the total balance of each wallet that should be reserved for slippage, spread, and bad short trades (e.g. 0.1 is 10%)" }),
        MAX_SHORT_TRADES: num({ default: 0, desc: "Maximum number of SHORT trades that can be open concurrently (i.e. limit your borrowing), zero is no limit" }),
        MAX_LONG_TRADES: num({ default: 0, desc: "Maximum number of LONG trades that can be open concurrently (i.e. limit borrowing or rebalancing), zero is no limit" }),
        EXCLUDE_COINS: str({ default: "", desc: "Comma delimited list of coins to exclude from trading (e.g. DOGE)" }),
        STRATEGY_LOSS_LIMIT: num({ default: 0, desc: "Number of sequential losses before a strategy is stopped" }),
        IS_TRADE_SHORT_ENABLED: bool({ default: true, desc: "SHORT trades will always borrow the full funds in margin to execute, disable if you don't want this" }),
        IS_TRADE_MARGIN_ENABLED: bool({ default: true, desc: "Used to disable use of margin wallet trading for both LONG and SHORT trades" }),
        IS_PAY_INTEREST_ENABLED: bool({ default: true, desc: "Automatically repays all BNB interest before repaying margin loans" }),
        BNB_FREE_THRESHOLD: num({ default: 0.04, desc: "Creates a warning if your available BNB balance is below the threshold (too low for fees and interest)"}),
        TAKER_FEE_PERCENT: num({ default: 0.075, desc: "The spot trading Taker Fee as quoted on Binance"}),
        VIRTUAL_WALLET_FUNDS: num({ default: 0.1, desc: "The (roughly) equivalent BTC value used as the default starting balance for all virtual wallets" }),
        WEB_PASSWORD: str({ default: "", desc: "Password to restrict access to the internal diagnostics webserver" }),

        // Internal configuration options that can be changed but shouldn't need to be
        TRADER_PORT: port({ default: 8003, desc: "The port to trader webserver runs" }),
        VERSION: str({ default: packageJson.version }),
        LOG_LEVEL: str({ default: "info", choices: ["silly", "debug", "info", "warn", "error" ]}),
        MAX_LOG_LENGTH: num({ default: 1000, desc: "Maximum number of entries for in-memory logging and transactions" }),
        MAX_DATABASE_ROWS: num({ default: 10000, desc: "Maximum number of records that can be written to the database" }),
        MAX_WEB_COLOURS: num({ default: 10, desc: "Maximum number unique colours used to differentiate string data in the web UI" }),
        MAX_WEB_PRECISION: num({ default: 8, desc: "Maximum number decimal places to display for Big Numbers in the web UI" }),
        REFERENCE_SYMBOL: str({ default: "BNBBTC", desc: "Uses this market data to calculate wallet funds for other coins" }),
        BALANCE_SYNC_DELAY: num({ default: 1500, desc: "Number of milliseconds to wait after making a trade before fetching current balances" }),
    })
}

export function setDefault(data?: Readonly<any>): void {
    env = data || getDefault()
}

let env: Readonly<any> = {}
setDefault()

export default (): Readonly<any> => env
