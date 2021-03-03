const BigNumber = require("bignumber.js")
const colors = require("colors")
const _ = require("lodash")
const moment = require("moment")
const { Client } = require("pg")
const env = require("./env")

//////////////////////////////////////////////////////////////////////////////////

const test_pair = env.BACKTEST_TEST_PAIR
const pg_connectionString = env.DATABASE_URL
const pg_connectionSSL = env.DATABASE_CONNECT_VIA_SSL

const stop_loss_pnl = -1.0
const stop_profit_pnl = 7.5

const nbt_prefix = "nbt_"
const max_rows = 600000
const showReport = true
const trading_fees = 0.2

//////////////////////////////////////////////////////////////////////////////////

const pg_client = new Client({
    ssl: pg_connectionSSL,
    connectionString: pg_connectionString,
})
pg_client.connect()

//////////////////////////////////////////////////////////////////////////////////

async function getData(pair) {
    const select_query =
        "SELECT * FROM " +
        nbt_prefix +
        pair +
        " ORDER BY eventtime DESC LIMIT " +
        max_rows
    return pg_client
        .query(select_query)
        .then((res) => {
            return res.rows.reverse()
        })
        .catch((e) => {
            console.log(e)
            return []
        })
}

const arrAvg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length

async function backtest(lines) {
    let curr_pnl = new BigNumber(0)
    let first_price = new BigNumber(0)
    let last_price = new BigNumber(0)
    let start_price = new BigNumber(0)
    let max_pnl = new BigNumber(0)
    let min_pnl = new BigNumber(0)

    let trading = false
    let amount_sold = 0
    let trading_report = ""
    let trading_count = 0
    let trading_start = 0
    let trading_win_count = 0
    let trading_loss_count = 0
    let pnl = new BigNumber(0)

    let prices = []
    let volumes = []
    let trades = []
    let sentiments = []
    let srsis = []
    let sum_asks = []
    let sum_bids = []

    let stop_loss = stop_loss_pnl
    let stop_profit = stop_profit_pnl

    for (var i in lines) {
        const time = Number(lines[i].eventtime)
        const price = Number(lines[i].candle_close)
        const trade = Number(lines[i].trades)
        const volume = Number(lines[i].sum_interv_vols)
        const sentiment = Number(lines[i].sentiment_h)
        const srsi = Number(lines[i].srsi)

        const interv_vols_sum = new BigNumber(lines[i].sum_interv_vols)
        const first_ask_price = new BigNumber(lines[i].first_ask_price)
        const first_bid_price = new BigNumber(lines[i].first_bid_price)
        const depth_report = new BigNumber(lines[i].depth_report)
        const makers_count = new BigNumber(lines[i].makers_count)

        if (i == 0) {
            first_price = BigNumber(price)
        }

        if (i == lines.length - 1) {
            last_price = BigNumber(price)
            if (trading) {
                const lpnl = last_price
                    .minus(start_price)
                    .times(100)
                    .dividedBy(start_price)
                trading_report =
                    trading_report +
                    "\n" +
                    trading_count +
                    " " +
                    time +
                    " " +
                    moment(time).format() +
                    " HODL @".magenta +
                    price +
                    " MinPNL %" +
                    colors.red(min_pnl.toFormat(2)) +
                    " MaxPNL %" +
                    colors.cyan(max_pnl.toFormat(2)) +
                    " CPNL %" +
                    colors.grey(lpnl.toFormat(2)) +
                    "\n"
            }
        }

        sum_asks.push(Number(lines[i].sum_asks))
        sum_bids.push(Number(lines[i].sum_bids))

        prices.push(price)
        trades.push(trade)
        sentiments.push(sentiment)
        srsis.push(srsi)
        volumes.push(volume)

        if (i % 1000000 === 0) {
            console.log(i)
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////
        ////////////////////////////////////////////////////////////////////////////////////////////////////
        ////////////////////////////////////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////BUYING CONDITIONS////////////////////////////////////////
        ////////////////////////////////////////////////////////////////////////////////////////////////////
        ////////////////////////////////////////////////////////////////////////////////////////////////////
        ////////////////////////////////////////////////////////////////////////////////////////////////////

        if (
            interv_vols_sum.times(first_ask_price).isGreaterThan(1) &&
            prices[prices.length - 1] > prices[prices.length - 2] &&
            volumes[volumes.length - 1] > volumes[volumes.length - 2] * 1.3 &&
            volumes[volumes.length - 1] > 10 &&
            trades[trades.length - 1] > 150 &&
            depth_report.isLessThan(-1) &&
            makers_count.isLessThan(20) &&
            srsi >= 10
        ) {
            if (!trading) {
                max_pnl = BigNumber(0)
                min_pnl = BigNumber(0)
                trading_count = trading_count + 1
                trading_report =
                    trading_report +
                    "\n\n" +
                    trading_count +
                    " " +
                    time +
                    " " +
                    moment(time).format() +
                    " BUY @".blue +
                    price +
                    " " +
                    colors.red(prices[prices.length - 1]) +
                    " " +
                    colors.blue(parseInt(volumes[volumes.length - 1])) +
                    " dr:".grey +
                    depth_report.decimalPlaces(2).toString().yellow +
                    " mk:".grey +
                    makers_count.decimalPlaces(2).toString().yellow +
                    " si:".grey +
                    colors.blue(srsi) +
                    " trd:".grey +
                    colors.white(trades[trades.length - 1])
                trading = true
                trading_start = time

                start_price = BigNumber(price)
            } else {
                trading_report =
                    trading_report +
                    "\n" +
                    trading_count +
                    " " +
                    time +
                    " " +
                    moment(time).format() +
                    " CONF @".cyan +
                    price +
                    " PNL %" +
                    colors.yellow(pnl.toFormat(2)) +
                    " " +
                    colors.red(prices[prices.length - 1]) +
                    " " +
                    colors.blue(parseInt(volumes[volumes.length - 1])) +
                    " dr:".grey +
                    depth_report.decimalPlaces(2).toString().yellow +
                    " mk:".grey +
                    makers_count.decimalPlaces(2).toString().yellow +
                    " si:".grey +
                    colors.blue(srsi) +
                    " trd:".grey +
                    colors.white(trades[trades.length - 1])
            }
        } else if (trading) {
            pnl = first_bid_price
                .minus(start_price)
                .times(100)
                .dividedBy(start_price)
            if (max_pnl.isLessThan(pnl)) {
                max_pnl = pnl
            }
            if (min_pnl.isGreaterThan(pnl)) {
                min_pnl = pnl
            }

            if (pnl.isLessThan(stop_loss)) {
                trading = false
                curr_pnl = curr_pnl
                    .plus(pnl * (1 - amount_sold))
                    .minus(trading_fees)
                amount_sold = 0
                if (pnl.isGreaterThan(0)) {
                    trading_win_count = trading_win_count + 1
                    trading_report =
                        trading_report +
                        "\n" +
                        trading_count +
                        " " +
                        time +
                        " " +
                        moment(time).format().grey +
                        " SELL @".yellow +
                        colors.grey(first_bid_price) +
                        " MinPNL " +
                        colors.red(min_pnl.toFormat(2)) +
                        " MaxPNL " +
                        colors.cyan(max_pnl.toFormat(2)) +
                        " PNL %" +
                        colors.yellow(pnl.toFormat(2)) +
                        "\n"
                } else {
                    trading_loss_count = trading_loss_count + 1
                    trading_report =
                        trading_report +
                        "\n" +
                        trading_count +
                        " " +
                        time +
                        " " +
                        moment(time).format().red +
                        " SELL @".red +
                        colors.red(first_bid_price) +
                        " MinPNL " +
                        colors.red(min_pnl.toFormat(2)) +
                        " MaxPNL " +
                        colors.cyan(max_pnl.toFormat(2)) +
                        " PNL %" +
                        colors.red(pnl.toFormat(2)) +
                        "\n"
                }
                stop_loss = stop_loss_pnl
                stop_profit = stop_profit_pnl
                pnl = BigNumber(0)
            }

            if (pnl.isGreaterThan(stop_profit)) {
                trading_report =
                    trading_report +
                    "\n" +
                    trading_count +
                    " " +
                    time +
                    " " +
                    moment(time).format().green +
                    " SELL!!! @".green +
                    colors.green(first_bid_price) +
                    " MinPNL " +
                    colors.red(min_pnl.toFormat(2)) +
                    " MaxPNL " +
                    colors.cyan(max_pnl.toFormat(2)) +
                    " PNL %" +
                    colors.green(pnl.toFormat(2)) +
                    "\n"
                trading = false
                trading_win_count = trading_win_count + 1
                curr_pnl = curr_pnl
                    .plus(pnl * (1 - amount_sold))
                    .minus(trading_fees)
                amount_sold = 0
                stop_loss = stop_loss_pnl
                stop_profit = stop_profit_pnl
                pnl = BigNumber(0)
            }
        }
    }

    if (showReport) console.log(trading_report)
    const days =
        (Number(lines[lines.length - 1].eventtime) -
            Number(lines[0].eventtime)) /
        86400000
    console.log("-----------")
    console.log(moment().format().grey)
    console.log("-----------")
    console.log(colors.grey(days, "days"))
    console.log(
        moment(Number(lines[0].eventtime)).format(),
        moment(Number(lines[0].eventtime)).fromNow(),
        lines[0].candle_close
    )
    console.log(
        moment(Number(lines[lines.length - 1].eventtime)).format(),
        moment(Number(lines[lines.length - 1].eventtime)).fromNow(),
        lines[lines.length - 1].candle_close
    )
    console.log("-----------")
    console.log("test_pair: " + test_pair)
    console.log("trading_fees: " + trading_fees)
    console.log("stop_loss_pnl: %".red + colors.red(stop_loss_pnl))
    console.log("stop_profit_pnl: %".green + colors.green(stop_profit_pnl))
    console.log("first_price: " + first_price)
    console.log("last_price: " + last_price)
    console.log("trading_count: ".cyan + String(trading_count).magenta)
    console.log("trading_win_count: ".cyan + String(trading_win_count).blue)
    console.log("trading_loss_count: ".red + String(trading_win_count).red)
    console.log(
        "HODL PnL: %".grey +
            last_price
                .minus(first_price)
                .dividedBy(first_price)
                .times(100)
                .minus(0.1)
                .toFormat(3).grey
    )
    console.log("Strat PnL: %".yellow + curr_pnl.toFormat(3).yellow)
    console.log(
        "Daily PnL: ".cyan +
            colors.cyan(
                curr_pnl.dividedBy(days).decimalPlaces(3).toString().cyan
            ) +
            "% /day".cyan
    )
    console.log("-----------")
    return true
}
////////////////////////////////////////////////////////////////////////////////////

async function run() {
    console.log("Retrieving DB data...".green)
    const lines = await getData(test_pair)
    console.log("Running backtest... ".green + lines.length)
    let startBacktest = Date.now()
    console.log("starting backtest... ".green)
    await backtest(lines)
    console.log(
        "Ending backtest... ".green + parseInt((Date.now() - startBacktest) / 1000)
    )

    process.exit(0)
}

run()
////////////////////////////////////////////////////////////////////////////////////
