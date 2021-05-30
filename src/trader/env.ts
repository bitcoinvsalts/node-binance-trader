import path from "path"

import dotenv from "dotenv"
import { bool, cleanEnv, port, str, num } from "envalid"

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
        BINANCE_API_KEY: str({ devDefault: testOnly("BINANCE_API_KEY") }),
        BINANCE_SECRET_KEY: str({ devDefault: testOnly("BINANCE_SECRET_KEY") }),
        BVA_API_KEY: str({ devDefault: testOnly("BVA_API_KEY") }),

        IS_NOTIFIER_GMAIL_ENABLED: bool({ default: false }),
        NOTIFIER_GMAIL_ADDRESS: str({ default: "" }),
        NOTIFIER_GMAIL_APP_PASSWORD: str({ default: "" }),

        // To use Telegram, first talk to The Botfather and create a bot on Telegram: https://core.telegram.org/bots#3-how-do-i-create-a-bot
        // The Botfather will give you your token for the HTTP API, and that is what you set to be the TELEGRAM_API_KEY
        // Then talk to the @userinfobot at Telegram, and it will give you your personal receiver ID, and thats what you use for the TELEGRAM_RECEIVER_ID
        IS_NOTIFIER_TELEGRAM_ENABLED: bool({ default: false }),
        NOTIFIER_TELEGRAM_API_KEY: str({ default: "" }),
        NOTIFIER_TELEGRAM_RECEIVER_ID: str({ default: "" }),

        TRADER_PORT: port({
            default: 8003,
            desc: "The port to trader webserver runs",
        }),
        VERSION: str({ default: packageJson.version }),

        IS_BUY_QTY_FRACTION: bool({ default: false }), // Uses the "Quantity to Buy" from BVA as a fraction of your wallet balance (e.g. 0.1 is 10%)
        TRADE_LONG_FUNDS: str({ default: LongFundsType.NONE }), // '', 'borrow min', 'borrow all', 'sell all', or 'sell largest' - see README for explanation
        PRIMARY_WALLET: str({ default: WalletType.MARGIN }), // Primary wallet to execute LONG trades ('margin' or 'spot'), it may still swap to the other if there are insufficient funds
        WALLET_BUFFER: num({ default: 0.1 }), // Decimal fraction of the total balance of each wallet that should be reserved for slippage, spread, and bad short trades (especially when rebalancing)
        MAX_SHORT_TRADES: num({ default: 0 }), // Maximum number of SHORT trades that can be open concurrently (i.e. limit your borrowing), zero is no limit
        MAX_LONG_TRADES: num({ default: 0 }), // Maximum number of LONG trades that can be open concurrently (i.e. limit borrowing or rebalancing), zero is no limit
        EXCLUDE_COINS: str({ default: "" }), // Comma delimited list of coins to exclude from trading (e.g. DOGE)
        IS_TRADE_SHORT_ENABLED: bool({ default: true }), // SHORT trades will always borrow funds in margin to execute
        IS_TRADE_MARGIN_ENABLED: bool({ default: true}), // Used to disable margin trading for both LONG and SHORT trades
        VIRTUAL_WALLET_FUNDS: num({ default: 1 }), // The default starting balance for all virtual wallets (note this is really only intended for testing with one coin at a time due to different scales)
    })
}

export function setDefault(data?: Readonly<any>): void {
    env = data || getDefault()
}

let env: Readonly<any> = {}
setDefault()

export default (): Readonly<any> => env
