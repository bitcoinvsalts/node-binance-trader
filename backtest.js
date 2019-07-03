var rl = require('readlines')
var BigNumber = require('bignumber.js')
var colors = require('colors')
const plotly = require('plotly')('ploty_username', 'ploty_key') // use your own info https://plot.ly/api_signup
const _ = require('lodash')
const moment = require('moment')
const talib = require('talib')

//////////////////////////////////////////////////////////////////////////////////

const test_pair = "BTCUSDT"
const stop_loss_pnl = -0.81      
const stop_profit_pnl = 1.81

const nbt_prefix = "nbt_"
const max_rows = 9000000
const plot_result = false

//////////////////////////////////////////////////////////////////////////////////

async function backtest(lines) {

    let curr_pnl = new BigNumber(0)
    let first_price = new BigNumber(0)
    let last_price = new BigNumber(0)
    let start_price = new BigNumber(0)

    let trading = false
    let trading_report = ""
    let trading_count = 0
    let trading_win_count = 0

    let buy_triggered = false
    let buy_trigger = 0
    const annotations = []
    let pnl = new BigNumber(0)

    let prices = {
        x: [],
        y: [],
        type: 'scatter',
    }

    let volumes = {
        x: [],
        y: [],
        yaxis: 'y2',
        type: 'scatter'
    }

    let signals = {
        x: [],
        y: [],
        yaxis: 'y2',
        type: 'scatter',
        line: {shape: 'dashdot'}
    }

    for (var line in lines) {

        var arr = lines[line].replace(/\s\s+/g, ' ')
        var data = arr.split(' ')
        const time = data[1]
        const price = Number(data[3])
        const volume = Number(data[4])

        if ( line == 0 ) {
            first_price = BigNumber(price)
        }

        if (line == max_rows || line == lines.length-2 ) { 
            last_price = BigNumber(price)
            break 
        }

        prices.x.push(time)
        prices.y.push(price)

        let srsi = new BigNumber(0)
        try {
            var srsi_result = talib.execute({
                name: 'STOCHRSI',
                startIdx:  0 ,
                endIdx: prices.y.length -1,
                inReal: prices.y,
                optInTimePeriod: 100,  //RSI 14 default
                optInFastK_Period: 100, // K 5 default
                optInFastD_Period: 1, // D 3 default
                optInFastD_MAType: 0 // type of Fast D default 0 
            })
            srsi = BigNumber(srsi_result.result.outFastK[srsi_result.result.outFastK.length-1])
        }
        catch (e) {
            srsi = BigNumber(0)
        }

        volumes.x.push(time)
        volumes.y.push(volume)

        signals.x.push(time)
        signals.y.push(srsi.toFormat(2))

        if ( !trading 
            && (volume * price > 10)
            && srsi.isGreaterThan(69) 
        ) {
            console.log(volume, (volume * price), srsi.toFormat(2) )
            trading_count = trading_count + 1
            trading_report = trading_report + "\n" + trading_count + " BUY @" + price
            trading = true
            start_price = BigNumber(price)
            annotations.push({
                x: time,
                y: price,
                xref: 'x',
                yref: 'y',
                text: 'BUY',
                showarrow: true,
                align: 'center',
                arrowhead: 2,
                arrowsize: 1,
                arrowwidth: 2,
                arrowcolor: '#27AE60',
                borderwidth: 1,
                borderpad: 4,
                bgcolor: '#27AE60',
                opacity: 0.8
            })
        }
        else if (trading) 
        {
            const end_price = new BigNumber(price)
            pnl = end_price.minus(start_price).times(100).dividedBy(start_price)

            if (pnl.isLessThan(stop_loss_pnl)) {
                trading = false
                curr_pnl = curr_pnl.plus(pnl).minus(0.10)
                trading_report = trading_report + "\n" 
                    + trading_count + " SELL @" + price + " PNL " + pnl.toFormat(2) + "\n"
                annotations.push({
                    x: time,
                    y: price,
                    xref: 'x',
                    yref: 'y',
                    text: 'SELL-',
                    showarrow: true,
                    align: 'center',
                    arrowhead: 2,
                    arrowsize: 1,
                    arrowwidth: 2,
                    arrowcolor: '#FF5733',
                    borderwidth: 1,
                    borderpad: 4,
                    bgcolor: '#FF5733',
                    opacity: 0.8
                })
            }

            if (pnl.isGreaterThan(stop_profit_pnl)) {
                trading = false
                trading_win_count = trading_win_count + 1
                curr_pnl = curr_pnl.plus(pnl).minus(0.10)
                trading_report = trading_report + "\n" 
                    + trading_count + " SELL @" + price + " PNL " + pnl.toFormat(2) + "\n"
                annotations.push({
                    x: time,
                    y: price,
                    xref: 'x',
                    yref: 'y',
                    text: 'SELL+',
                    showarrow: true,
                    align: 'center',
                    arrowhead: 2,
                    arrowsize: 1,
                    arrowwidth: 2,
                    arrowcolor: '#FF5733',
                    borderwidth: 1,
                    borderpad: 4,
                    bgcolor: '#FF5733',
                    opacity: 0.8
                })
            }
        }
    }

    console.log("-----------")
    console.log(trading_report)
    console.log("-----------")
    console.log("first_price: " + first_price)
    console.log("last_price: " + last_price)
    console.log("trading_count: " + String(trading_count).magenta)
    console.log("trading_win_count: " + String(trading_win_count).blue)
    console.log("hodl_pnl: " + last_price.minus(first_price).dividedBy(first_price).times(100).toFormat(2).grey)
    console.log("pnl: " + curr_pnl.toFormat(2).green)
    console.log("-----------")

    if (plot_result && trading_count) {
        var data = [ prices, volumes, signals ]
        var layout = {
            title: test_pair,
            yaxis: {},
            yaxis2: { overlaying: "y1", side: "right" },
            yaxis3: { overlaying: "y1", side: "right" },
            yaxis4: { overlaying: "y1", side: "right" },
            annotations: annotations,
        }
        var graphOptions = {
            layout: layout,
            filename: "date-axes", 
            fileopt: "overwrite",
        }
        console.log("Ploting the chart...")
        plotly.plot(data, graphOptions, function (err, msg) {
            console.log(msg)
            console.log(err)
        })
    }

    return true
}
////////////////////////////////////////////////////////////////////////////////////

async function run() {
    const lines = await rl.readlinesSync('./data/' + nbt_prefix + test_pair + '.txt')
    console.log("Starting backtest... " + lines.length)
    await backtest(lines)
    //process.exit(0)
}

run()
////////////////////////////////////////////////////////////////////////////////////