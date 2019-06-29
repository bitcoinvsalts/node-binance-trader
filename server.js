const express = require('express')
const socketIO = require('socket.io')
const io_client = require('socket.io-client')
const path = require('path')
const binance = require('binance-api-node').default
const moment = require('moment')
const BigNumber = require('bignumber.js')
const colors = require("colors")
const _ = require('lodash')
const fs = require('fs')

const PORT = process.env.PORT || 4000
const INDEX = path.join(__dirname, 'index.html')

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
//         PLEASE EDIT THE FOLLOWING VARIABLES JUST BELLOW
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

const insert_into_files = false                 // to back up pair data to txt files in the data sub-folder 
const send_signal_to_bva = false                // to monitor your strategies and send your signals to NBT Hub a.k.a http://bitcoinvsaltcoins.com
const bva_key = "replace_with_your_BvA_key"     // if send_signal_to_bva true, please enter your ws key that you will find after signing up at http://bitcoinvsaltcoins.com

const tracked_max = 200             // max of pairs to be tracked (useful for testing)
const wait_time = 800               // to time out binance api calls (a lower number than 800 can result in api rstriction)

const stop_loss_pnl = -0.41         // to set your stop loss per trade
const stop_profit_pnl = 1.81        // to set your stop profit per trade

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

console.log("insert_into_files: ", insert_into_files)
console.log("send_signal_to_bva: ", send_signal_to_bva)

/////////////////////////////////////////////////////////////////////////////////

let socket_client = {}
if (send_signal_to_bva) { 
    console.log("Connection to NBT HUB...")
    const nbt_vers = "0.1.4"
    // create a socket client connection to send your signals to NBT Hub (http://bitcoinvsaltcoins.com)
    socket_client = io_client('https://nbt-hub.herokuapp.com', { query: "v="+nbt_vers+"&type=server&key=" + bva_key }) 
}

/////////////////////

let pairs = []
const nbt_prefix = "nbt_"
const interv_time = 10000
let sum_bids = {}
let sum_asks = {}
let first_bid_qty = {}
let first_ask_qty = {}
let first_bid_price = {}
let first_ask_price = {}
let prices = {}
let volumes = {}
let trades = {}
let makers = {}
let interv_vols_sum = {}
let candle_opens = {}
let candle_closes = {}
let candle_lowes = {}
let candle_highs = {}
let candle_volumes = {}
let signaled_pairs = {}
let buy_prices = {}

//////////////////////////////////////////////////////////////////////////////////

const server = express()
    .use((req, res) => res.sendFile(INDEX) )
    .listen(PORT, () => console.log(`NBT server running on port ${ PORT }`))

const io = socketIO(server)

io.on('connection', (socket) => {
    console.log(' ...client connected'.grey);
    socket.on('disconnect', () => console.log(' ...client disconnected'.grey))
    socket.on('message', (message) => console.log(' ...client message :: ' + message))
})

//////////////////////////////////////////////////////////////////////////////////
// BINANCE API initialization //

const binance_client = binance()

//////////////////////////////////////////////////////////////////////////////////

async function run() {
    pairs = await get_pairs()
    pairs = pairs.slice(0, tracked_max)
    pairs.unshift('BTCUSDT')
    console.log(" ")
    console.log("Total pairs: " + pairs.length)
    console.log(" ")
    console.log(JSON.stringify(pairs))
    console.log(" ")
    await sleep(wait_time)
    await trackData()
}

async function get_pairs() {
    const exchange_info = await binance_client.exchangeInfo()
    const pre_USDT_select = exchange_info.symbols.filter( pair => pair.symbol.endsWith('USDT') && pair.status == 'TRADING').map(pair=>{
        return pair.symbol.substring(0, pair.symbol.length-4)
    })
    const pre_BTC_select = exchange_info.symbols.filter( pair => pair.symbol.endsWith('BTC') && pair.status == 'TRADING').map(pair=>{
        return pair.symbol.substring(0, pair.symbol.length-3)
    })
    const assets = _.intersection(pre_USDT_select, pre_BTC_select)
    return assets.map(asset => asset+'BTC')
}

async function trackData() {
	for (var i = 0, len = pairs.length; i < len; i++) {
        await trackPairData(pairs[i])
		await sleep(wait_time)         //let's be safe with the api biance calls
	}
}

async function trackPairData(pair) {

    sum_bids[pair] = []
    sum_asks[pair] = []
    first_bid_qty[pair] = new BigNumber(0)
    first_ask_qty[pair] = new BigNumber(0)
    first_bid_price[pair] = new BigNumber(0)
    first_ask_price[pair] = new BigNumber(0)
    prices[pair] = new BigNumber(0)
    volumes[pair] = []
    makers[pair] = []
    trades[pair] = []
    candle_opens[pair] = []
    candle_closes[pair] = []
    candle_highs[pair] = []
    candle_lowes[pair] = []
    candle_volumes[pair] = []
    prev_price = new BigNumber(0)
    interv_vols_sum[pair] = new BigNumber(0)

    const candles_15 = await binance_client.candles({ symbol: pair, interval: '15m' })
    for (var i = 0, len = candles_15.length; i < len; i++) {
        candle_closes[pair].push(Number(candles_15[i].close))
        candle_lowes[pair].push(Number(candles_15[i].low))
        candle_highs[pair].push(Number(candles_15[i].high))
        candle_opens[pair].push(Number(candles_15[i].open))
        candle_volumes[pair].push(Number(candles_15[i].volume))
    }

    await sleep(wait_time)

    const candles_clean = binance_client.ws.candles(pair, '15m', async candle => {

        if (candle.isFinal) {
            candle_opens[pair].push(Number(candle.open))
            candle_closes[pair].push(Number(candle.close))
            candle_lowes[pair].push(Number(candle.low))
            candle_highs[pair].push(Number(candle.high))
            candle_volumes[pair].push(Number(candle.volume))
        }
        else {
            candle_opens[pair][candle_opens[pair].length-1] = Number(candle.open)
            candle_closes[pair][candle_closes[pair].length-1] = Number(candle.close)            
            candle_lowes[pair][candle_lowes[pair].length-1] = Number(candle.low)
            candle_highs[pair][candle_highs[pair].length-1] = Number(candle.high)
            candle_volumes[pair][candle_volumes[pair].length-1] = Number(candle.volume)
        }

        //////////////////////////////////////////////////////////////////////////////////////////

        let curr_price = new BigNumber(0)
        let pnl = new BigNumber(0)
        let stratname, signal_key



        /////////////////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////// SIGNAL DECLARATION - START /////////////////////////////////
        //////////////////////////////// THIS IS WHERE YOU CODE YOUR STRATEGY ///////////////////////
        /////////////////////////////////////////////////////////////////////////////////////////////
        stratname = "NBT SIGNAL DEMO"                   // enter the name of your strategy
        signal_key = stratname.replace(/\s+/g, '')
        //////// BUY SIGNAL DECLARATION ///////
        if ( interv_vols_sum[pair].times(first_ask_price[pair]).isGreaterThan(1.0) 
            && trades[pair].length >= 666
            && first_ask_price[pair].dividedBy(first_bid_price[pair]).minus(1.0).isLessThan(0.003)
            && candle_closes[pair][candle_closes[pair].length-1] > 0.0001
            && candle_closes[pair][candle_closes[pair].length-1] > _.mean(candle_closes[pair].slice(-3, candle_closes[pair].length-1))
            && trades[pair][trades[pair].length-1] > 33
            && _.mean(trades[pair].slice(-3, trades[pair].length-1)) > 17
            && trades[pair][trades[pair].length-1] > _.mean(trades[pair].slice(-666)) * 6.666
            && !signaled_pairs[pair+signal_key]
        ) {
            signaled_pairs[pair+signal_key] = true
            buy_prices[pair+signal_key] = first_ask_price[pair]
            console.log(moment().format().padEnd(30)+ " BUY => " + pair.green + " " + stratname.green)
            const buy_signal = {
                key: bva_key,
                stratname: stratname,
                pair: pair, 
                buy_price: first_ask_price[pair]
            }
            io.emit('buy_signal', buy_signal)
            if (send_signal_to_bva) { socket_client.emit("buy_signal", buy_signal) }
        }
        //////// SELL SIGNAL DECLARATION ///////
        curr_price = BigNumber(first_bid_price[pair])
        pnl = curr_price.minus(buy_prices[pair+signal_key]).times(100).dividedBy(buy_prices[pair+signal_key])
        if ( candle_closes[pair][candle_closes[pair].length-1] < candle_closes[pair][candle_closes[pair].length-2]
            && (pnl.isLessThan(stop_loss_pnl) || pnl.isGreaterThan(stop_profit_pnl))
            && signaled_pairs[pair+signal_key]
        ) {
            signaled_pairs[pair+signal_key] = false
            console.log(moment().format().padEnd(30)+ " SELL => " + pair.red + " " + stratname.red + " " + pnl.toFormat(2) + "%")
            const sell_signal = {
                key: bva_key,
                stratname: stratname, 
                pair: pair, 
                sell_price: first_bid_price[pair]
            }
            io.emit('sell_signal', sell_signal)
            if (send_signal_to_bva) { socket_client.emit("sell_signal", sell_signal) }
        }
        ///////////////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////// SIGNAL DECLARATION - END /////////////////////////////////
        ///////////////////////////////////////////////////////////////////////////////////////////



        /////////////////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////// ANOTHER SIGNAL DECLARATION - START /////////////////////////
        //////////////////////////////// THIS IS WHERE YOU CODE YOUR STRATEGY ///////////////////////
        /////////////////////////////////////////////////////////////////////////////////////////////
        stratname = "NBT SIGNAL DEMO 2"                   // enter the name of your strategy
        signal_key = stratname.replace(/\s+/g, '')
        //////// BUY SIGNAL DECLARATION ///////
        if ( interv_vols_sum[pair].times(first_ask_price[pair]).isGreaterThan(1.0) 
            && trades[pair].length >= 666
            && first_ask_price[pair].dividedBy(first_bid_price[pair]).minus(1.0).isLessThan(0.002)
            && candle_closes[pair][candle_closes[pair].length-1] > 0.001
            && candle_closes[pair][candle_closes[pair].length-1] > _.mean(candle_closes[pair].slice(-3, candle_closes[pair].length-1))
            && trades[pair][trades[pair].length-1] > 66
            && _.mean(trades[pair].slice(-3, trades[pair].length-1)) > 17
            && trades[pair][trades[pair].length-1] > _.mean(trades[pair].slice(-666)) * 6.666
            && !signaled_pairs[pair+signal_key]
        ) {
            signaled_pairs[pair+signal_key] = true
            buy_prices[pair+signal_key] = first_ask_price[pair]
            console.log(moment().format().padEnd(30)+ " BUY => " + pair.green + " " + stratname.green)
            const buy_signal = {
                key: bva_key,
                stratname: stratname,
                pair: pair, 
                buy_price: first_ask_price[pair]
            }
            io.emit('buy_signal', buy_signal)
            if (send_signal_to_bva) { socket_client.emit("buy_signal", buy_signal) }
        }
        //////// SELL SIGNAL DECLARATION ///////
        curr_price = BigNumber(first_bid_price[pair])
        pnl = curr_price.minus(buy_prices[pair+signal_key]).times(100).dividedBy(buy_prices[pair+signal_key])
        if ( candle_closes[pair][candle_closes[pair].length-1] < candle_closes[pair][candle_closes[pair].length-2]
            && (pnl.isLessThan(stop_loss_pnl) || pnl.isGreaterThan(stop_profit_pnl+2))
            && signaled_pairs[pair+signal_key]
        ) {
            signaled_pairs[pair+signal_key] = false
            console.log(moment().format().padEnd(30)+ " SELL => " + pair.red + " " + stratname.red + " " + pnl.toFormat(2) + "%")
            const sell_signal = {
                key: bva_key,
                stratname: stratname, 
                pair: pair, 
                sell_price: first_bid_price[pair]
            }
            io.emit('sell_signal', sell_signal)
            if (send_signal_to_bva) { socket_client.emit("sell_signal", sell_signal) }
        }
        ///////////////////////////////////////////////////////////////////////////////////////////
        //////////////////////////////// SIGNAL DECLARATION - END /////////////////////////////////
        ///////////////////////////////////////////////////////////////////////////////////////////



        // ADD MORE SIGNAL DECLARATIONS HERE BY COPY/PASTE/EDIT FROM ONE DECLARATION FROM ABOVE. //

    })

    await sleep(wait_time)

    const depth_clean = binance_client.ws.partialDepth({ symbol: pair, level: 10 }, depth => {
        sum_bids[pair].push(_.sumBy(depth.bids, (o) => { return Number(o.quantity) }))
        sum_asks[pair].push(_.sumBy(depth.asks, (o) => { return Number(o.quantity) }))
        first_bid_qty[pair] = BigNumber(depth.bids[0].quantity)
        first_ask_qty[pair] = BigNumber(depth.asks[0].quantity)
        first_bid_price[pair] = BigNumber(depth.bids[0].price)
        first_ask_price[pair] = BigNumber(depth.asks[0].price)
    })

    await sleep(wait_time)

    const trades_clean = binance_client.ws.trades([pair], trade => {
        prices[pair] = BigNumber(trade.price)
        volumes[pair].unshift({
            'timestamp': Date.now(), 
            'volume': parseFloat(trade.quantity),
        })
        makers[pair].unshift({
            'timestamp': Date.now(), 
            'maker': trade.maker, 
        })
    })

    setInterval( () => {

        let depth_report = ""
        let depth_report_colored = ""

        const last_sum_bids_bn = new BigNumber(sum_bids[pair][sum_bids[pair].length-1])
        const last_sum_asks_bn = new BigNumber(sum_asks[pair][sum_asks[pair].length-1])

        if (last_sum_bids_bn.isLessThan(last_sum_asks_bn)) {
            depth_report_colored = last_sum_asks_bn.dividedBy(last_sum_bids_bn).decimalPlaces(2).toString().magenta
            depth_report = "-" + last_sum_asks_bn.dividedBy(last_sum_bids_bn).decimalPlaces(2).toString()
        }
        else {
            depth_report_colored = last_sum_bids_bn.dividedBy(last_sum_asks_bn).decimalPlaces(2).toString().blue
            depth_report = "+" + last_sum_bids_bn.dividedBy(last_sum_asks_bn).decimalPlaces(2).toString()
        }
        
        interv_vols_sum[pair] = BigNumber(_.sumBy(volumes[pair], 'volume'))
        trades[pair].push(volumes[pair].length)
        
        const makers_count = new BigNumber(_.filter(makers[pair], (o) => { if (o.maker) return o }).length)
        const makers_total = new BigNumber(makers[pair].length)
        const maker_ratio = makers_count > 0 ? makers_count.dividedBy(makers_total).times(100) : new BigNumber(0)

        if (prices[pair].isGreaterThan(0) && last_sum_bids_bn.isGreaterThan(0) && last_sum_asks_bn.isGreaterThan(0)) {
                
            const insert_values = [
                Date.now(), 
                Number(prices[pair].toString()), 
                Number(interv_vols_sum[pair].decimalPlaces(3).toString()), 
                Number(volumes[pair].length), //trades
                Number(maker_ratio.decimalPlaces(2).toString()),
                Number(depth_report),
                Number(last_sum_bids_bn), 
                Number(last_sum_asks_bn), 
                Number(first_bid_price[pair]), 
                Number(first_ask_price[pair]), 
                Number(first_bid_qty[pair]), 
                Number(first_ask_qty[pair])
            ]

            io.emit(pair, insert_values)

            // FILE INSERT
            if (insert_into_files) {
                const log_report = moment().format().padStart(30) +
                    pair.padStart(20) +
                    prices[pair].toString().padStart(30) +
                    interv_vols_sum[pair].decimalPlaces(3).toString().padStart(30) +
                    String(volumes[pair].length).padStart(20) +
                    maker_ratio.decimalPlaces(2).toString().padStart(20) +
                    depth_report.padStart(30) +
                    last_sum_bids_bn.decimalPlaces(3).toString().padStart(30) +
                    last_sum_asks_bn.decimalPlaces(3).toString().padStart(30) +
                    first_bid_price[pair].toString().padStart(30) +
                    first_bid_qty[pair].decimalPlaces(6).toString().padStart(30) +
                    first_ask_qty[pair].decimalPlaces(6).toString().padStart(30) +
                    first_ask_price[pair].toString().padStart(30)
                fs.appendFileSync( "data/" + nbt_prefix + pair + ".txt", log_report + "\n" )
            }
        }

        // clean up arrays...
        makers[pair] = _.filter(makers[pair], (v) => { return (v.timestamp >= (Date.now()-interv_time)) })
        volumes[pair] = _.filter(volumes[pair], (v) => { return (v.timestamp >= (Date.now()-interv_time)) })
        sum_asks[pair] = sum_asks[pair].slice(sum_asks[pair].length - 33, 33)
        sum_bids[pair] = sum_bids[pair].slice(sum_bids[pair].length - 33, 33)

        prev_price = BigNumber(prices[pair].toString())

    }, 1000)
}

sleep = (x) => {
	return new Promise(resolve => {
		setTimeout(() => { resolve(true) }, x )
	})
}

run()