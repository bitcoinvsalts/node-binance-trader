import BigNumber from "bignumber.js"

export enum Pages {
    TRADES = "Open Trades",
    STRATEGIES = "Strategies",
    VIRTUAL = "Virtual Balances",
    LOG_MEMORY = "Log (Since Restart)",
    LOG_DB = "Log (History)",
    TRANS_MEMORY = "Transactions (Since Restart)",
    TRANS_DB = "Transactions (History)",
    PNL = "Profit n Loss / Balance History"
}

export const URLs = {
    [Pages.TRADES]: "trades?",
    [Pages.STRATEGIES]: "strategies?",
    [Pages.VIRTUAL]: "virtual?",
    [Pages.LOG_MEMORY]: "log?",
    [Pages.LOG_DB]: "log?db=%d&", // Page number will be inserted as needed
    [Pages.TRANS_MEMORY]: "trans?",
    [Pages.TRANS_DB]: "trans?db=%d&", // Page number will be inserted as needed
    [Pages.PNL]: "pnl?",
}

export class Percent {
    value: BigNumber
    precision: number

    constructor(value: BigNumber, precision: number = 2) {
        this.value = value
        this.precision = precision
    }

    public toString = () : string => {
        return this.value.toFixed(this.precision) + "%"
    }
}