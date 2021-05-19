import path from "path"

import dotenv from "dotenv"
import { bool, cleanEnv, port, str } from "envalid"

import * as packageJson from "../../package.json"

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
        IS_NOTIFIER_TELEGRAM_ENABLED: bool({ default: false }),
        IS_TRADE_MARGIN_ENABLED: bool({ default: true }),
        NOTIFIER_GMAIL_ADDRESS: str({ default: "" }),
        NOTIFIER_GMAIL_APP_PASSWORD: str({ default: "" }),
        NOTIFIER_TELEGRAM_API_KEY: str({ default: "" }),
        NOTIFIER_TELEGRAM_RECEIVER_ID: str({ default: "" }),
        TRADER_PORT: port({
            default: 8003,
            desc: "The port to trader webserver runs",
        }),
        VERSION: str({ default: packageJson.version }),
    })
}

export function setDefault(data?: Readonly<any>): void {
    env = data || getDefault()
}

let env: Readonly<any> = {}
setDefault()

export default (): Readonly<any> => env
