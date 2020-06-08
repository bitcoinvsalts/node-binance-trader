const express = require('express')
const io_client = require('socket.io-client')
const path = require('path')
const binance = require('binance-api-node').default
const moment = require('moment')
const BigNumber = require('bignumber.js')
const colors = require('colors')
const _ = require('lodash')
const tulind = require('tulind')
const axios = require('axios')
const { Client } = require('pg')

const PORT = process.env.PORT || 4000
const INDEX = path.join(__dirname, 'index.html')

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
//         PLEASE EDIT THE FOLLOWING VARIABLES JUST BELOW
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

const insert_into_db = false
const pg_connectionString = 'postgres://postgres@127.0.0.1:5432/postgres'
const pg_connectionSSL = false

// to monitor your strategy you can send your buy and sell signals to http://bitcoinvsaltcoins.com
const send_signal_to_bva = false
const bva_key = "replace_with_your_BvA_key"

const tracked_max = 200
const wait_time = 800

const nbt_vers = "0.2.2"

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

console.log("insert_into_db: ", insert_into_db)
console.log("send_signal_to_bva: ", send_signal_to_bva)

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
let candle_prices = {}
let srsi = {}
let prev_price = {}
let signaled_pairs = {}
let buy_prices = {}
let stop_profit = {}
let stop_loss = {}

/////////////////////////////////////////////////////////////////////////////////

let socket_client = {}
if (send_signal_to_bva) { 
    console.log("Connection to NBT HUB...")
    // retrieve previous open signals //
    axios.get('https://bitcoinvsaltcoins.com/api/useropensignals?key=' + bva_key)
    .then( (response) => {
        response.data.rows.map( s => {
            signaled_pairs[s.pair+s.stratname.replace(/\s+/g, '')] = true
            buy_prices[s.pair+s.stratname.replace(/\s+/g, '')] = new BigNumber(s.buy_price)
            stop_profit[s.pair+s.stratname.replace(/\s+/g, '')] = Number(s.stop_profit)
            stop_loss[s.pair+s.stratname.replace(/\s+/g, '')] = Number(s.stop_loss)
        })
        console.log("Open Trades:", _.values(signaled_pairs).length)
        console.log("Stop Losses:", _.values(stop_loss))
        console.log("Stop Profits:", _.values(stop_profit))
        console.log(_.keys(signaled_pairs))
    })
    .catch( (e) => {
        console.log("ERROR 8665")
        console.log(e.response.data)
    })
    // create a socket client connection to send your signals to NBT Hub (http://bitcoinvsaltcoins.com)
    socket_client = io_client('https://nbt-hub.herokuapp.com', { query: "v="+nbt_vers+"&type=server&key=" + bva_key })
}

//////////////////////////////////////////////////////////////////////////////////
let pg_client
if (insert_into_db && pg_connectionString) {
    console.log("Connecting to the Postgresql db...")
    pg_client = new Client({
        ssl: pg_connectionSSL,
        connectionString: pg_connectionString,
    })
    pg_client.connect()
}
//////////////////////////////////////////////////////////////////////////////////

const server = express()
    .use((req, res) => res.sendFile(INDEX) )
    .listen(PORT, () => console.log(`NBT server running on port ${ PORT }`))

//////////////////////////////////////////////////////////////////////////////////

const binance_client = binance()

//////////////////////////////////////////////////////////////////////////////////

async function run() {
    //pairs = await get_pairs()
    //pairs = pairs.slice(0, tracked_max)
    pairs.unshift('BTCUSDT')
    pairs.unshift('ETHBTC')
    console.log(" ")
    console.log("Total pairs: " + pairs.length)
    console.log(" ")
    console.log(JSON.stringify(pairs))
    console.log(" ")
    await sleep(wait_time)
    await trackData()
}

//////////////////////////////////////////////////////////////////////////////////

const arrAvg = arr => arr.reduce((a,b) => a + b, 0) / arr.length

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
    console.log('----')
	for (var i = 0, len = pairs.length; i < len; i++) {
        console.log('--> ' + pairs[i])
        if (insert_into_db) await createPgPairTable(pairs[i])
        await trackPairData(pairs[i])
		await sleep(wait_time)         //let's be safe with the api biance calls
    }
    console.log('----')
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
    candle_prices[pair] = []
    candle_highs[pair] = []
    candle_lowes[pair] = []
    candle_volumes[pair] = []
    interv_vols_sum[pair] = []
    prev_price[pair] = 0
    srsi[pair] = null

    const candles_15 = await binance_client.candles({ symbol: pair, interval: '15m' })
    for (var i = 0, len = candles_15.length; i < len; i++) {
        candle_closes[pair].push(Number(candles_15[i].close))
        candle_lowes[pair].push(Number(candles_15[i].low))
        candle_highs[pair].push(Number(candles_15[i].high))
        candle_opens[pair].push(Number(candles_15[i].open))
        candle_volumes[pair].push(Number(candles_15[i].volume))
        candle_prices[pair].push(Number(candles_15[i].close))
    }

    await sleep(wait_time)

    const candles_clean = binance_client.ws.candles(pair, '15m', async candle => {

        if (candle.isFinal) {
            candle_opens[pair][candle_opens[pair].length-1] = Number(candle.open)
            candle_closes[pair][candle_closes[pair].length-1] = Number(candle.close)
            candle_lowes[pair][candle_lowes[pair].length-1] = Number(candle.low)
            candle_highs[pair][candle_highs[pair].length-1] = Number(candle.high)
            candle_volumes[pair][candle_volumes[pair].length-1] = Number(candle.volume)
            // //
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
        candle_prices[pair].push(Number(candle.close))

        try {
            await tulind.indicators.stochrsi.indicator([candle_closes[pair]], [100] )
            .then((results) => {
                srsi[pair] = new BigNumber(results[0][results[0].length-1] * 100)
            })
        }
        catch(e) {
            console.log(pair, "SRSI ERROR!!!")
            //console.log(e)
            srsi[pair] = null
        }

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

        const last_sum_bids_bn = new BigNumber(sum_bids[pair][sum_bids[pair].length-1])
        const last_sum_asks_bn = new BigNumber(sum_asks[pair][sum_asks[pair].length-1])

        if (last_sum_bids_bn.isLessThan(last_sum_asks_bn)) {
            depth_report = "-" + last_sum_asks_bn.dividedBy(last_sum_bids_bn).decimalPlaces(2).toString()
        }
        else {
            depth_report = "+" + last_sum_bids_bn.dividedBy(last_sum_asks_bn).decimalPlaces(2).toString()
        }
        
        interv_vols_sum[pair].push(Number(_.sumBy(volumes[pair], 'volume')))
        trades[pair].push(volumes[pair].length)
        
        const makers_count = new BigNumber(_.filter(makers[pair], (o) => { if (o.maker) return o }).length)
        const makers_total = new BigNumber(makers[pair].length)
        const maker_ratio = makers_count > 0 ? makers_count.dividedBy(makers_total).times(100) : new BigNumber(0)

        if ( prices[pair].isGreaterThan(0) 
            && candle_closes[pair].length 
            && last_sum_bids_bn.isGreaterThan(0) 
            && last_sum_asks_bn.isGreaterThan(0)
            && interv_vols_sum[pair].length 
            && first_bid_price[pair]>0 
            && first_ask_price[pair]>0 
            && candle_prices[pair].length
        ) {

            const price_open = Number(candle_opens[pair][candle_opens[pair].length-1])
            const price_high = Number(candle_highs[pair][candle_highs[pair].length-1])
            const price_low = Number(candle_lowes[pair][candle_lowes[pair].length-1])
            const price_last = Number(candle_prices[pair][candle_prices[pair].length-1])

            // DATABASE INSERT
            if (insert_into_db) {
                const insert_values = [
                    Date.now(), 
                    moment(Date.now()).format(),
                    Number(prices[pair].toString()), 
                    price_open,
                    price_high,
                    price_low,
                    price_last,
                    interv_vols_sum[pair][interv_vols_sum[pair].length-1], 
                    trades[pair][trades[pair].length-1],
                    Number(maker_ratio.decimalPlaces(2).toString()),
                    Number(depth_report),
                    Number(last_sum_bids_bn), 
                    Number(last_sum_asks_bn),
                    Number(first_bid_price[pair]), 
                    Number(first_ask_price[pair]), 
                    Number(first_bid_qty[pair]), 
                    Number(first_ask_qty[pair]),
                    ( (srsi[pair] === null) ? null : Number(srsi[pair].decimalPlaces(2).toString()) ),
                ]
                const insert_query = 'INSERT INTO ' + nbt_prefix + pair 
                    + '(eventtime, datetime, price, candle_open, candle_high, candle_low, candle_close, sum_interv_vols, trades, makers_count, depth_report, sum_bids, sum_asks, first_bid_price, first_ask_price, first_bid_qty, first_ask_qty, srsi)' 
                    + ' VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING * '
                pg_client.query(insert_query, insert_values)
                .then(res => {})
                .catch( e => { console.log(e) } )
            }

            //////////////////////////////////////////////////////////////////////////////////////////

            let curr_price = new BigNumber(0)
            let pnl = new BigNumber(0)
            let stratname, signal_key

            const stop_loss_pnl = -1.0
            const stop_profit_pnl = 7.6

            /////////////////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////// SIGNAL DECLARATION - START /////////////////////////////////
            //////////////////////////////// THIS IS WHERE YOU CODE YOUR STRATEGY ///////////////////////
            /////////////////////////////////////////////////////////////////////////////////////////////
            
            stratname = "DEMO STRATS"
            signal_key = stratname.replace(/\s+/g, '')
            stop_loss[pair+signal_key] = stop_loss[pair+signal_key] ? stop_loss[pair+signal_key] : stop_loss_pnl
            stop_profit[pair+signal_key] = stop_profit[pair+signal_key] ? stop_profit[pair+signal_key] : stop_profit_pnl

            //////// BUY SIGNAL DECLARATION ///////
            if ( (interv_vols_sum[pair][interv_vols_sum[pair].length-1] * Number(first_ask_price[pair].toString())) > 1.0
                && price_last > prev_price[pair]
                && prev_price[pair] > 0
                && interv_vols_sum[pair][interv_vols_sum[pair].length-1] > interv_vols_sum[pair][interv_vols_sum[pair].length-2] * 1.3
                && interv_vols_sum[pair][interv_vols_sum[pair].length-1] > 10
                && trades[pair][trades[pair].length-1] > 100
                && Number(depth_report) < -1
                && maker_ratio.isLessThan(30)
                && srsi[pair] !== null
                && srsi[pair].isGreaterThanOrEqualTo(10)
                && !signaled_pairs[pair+signal_key]
            ) {
                signaled_pairs[pair+signal_key] = true
                buy_prices[pair+signal_key] = first_ask_price[pair]
                stop_loss[pair+signal_key] = stop_loss_pnl
                console.log(moment().format() 
                    + " " + Date.now() 
                    + " p1:" + price_last
                    + " v1:" + interv_vols_sum[pair][interv_vols_sum[pair].length-1] 
                    + " td:" + trades[pair][trades[pair].length-1]
                    + " dr:" + depth_report 
                    + " mk:" + maker_ratio.decimalPlaces(3).toString()
                    + " si:" + srsi[pair].decimalPlaces(3).toString()
                    + " " + first_ask_price[pair] 
                    + " " + pair.green 
                    + " BUY => " + stratname.green
                    + " SP: " + stop_profit[pair+signal_key] + "%")
                const buy_signal = {
                    key: bva_key,
                    stratname: stratname,
                    pair: pair, 
                    buy_price: first_ask_price[pair],
                    message: Date.now(),
                    stop_profit: Number(stop_profit[pair+signal_key]),
                    stop_loss: Number(stop_loss[pair+signal_key]),
                }
                if (send_signal_to_bva) { socket_client.emit("buy_signal", buy_signal) }
            }
            else if (signaled_pairs[pair+signal_key]) 
            {
                //////// SELL SIGNAL DECLARATION ///////
                curr_price = BigNumber(first_bid_price[pair])
                pnl = curr_price.minus(buy_prices[pair+signal_key]).times(100).dividedBy(buy_prices[pair+signal_key])
                if ( pnl.isLessThan(stop_loss[pair+signal_key]) || pnl.isGreaterThan(stop_profit[pair+signal_key]) ) {
                    signaled_pairs[pair+signal_key] = false
                    console.log(moment().format() + " " + Date.now() + " " + first_bid_price[pair] + " " + pair.red + " SELL =>   " + stratname.red + " " + pnl.toFormat(2) + "%")
                    const sell_signal = {
                        key: bva_key,
                        stratname: stratname, 
                        pair: pair, 
                        sell_price: first_bid_price[pair]
                    }
                    if (send_signal_to_bva) { socket_client.emit("sell_signal", sell_signal) }
                }
            }
            
            ///////////////////////////////////////////////////////////////////////////////////////////
            //////////////////////////////// SIGNAL DECLARATION - END /////////////////////////////////
            ///////////////////////////////////////////////////////////////////////////////////////////

            prev_price[pair] = price_last
            
        }
        ///////////////////////////////////////////////////////////////////////////////////////////

        // clean up arrays...
        makers[pair] = _.filter(makers[pair], (v) => { return (v.timestamp >= (Date.now()-interv_time)) })
        volumes[pair] = _.filter(volumes[pair], (v) => { return (v.timestamp >= (Date.now()-interv_time)) })
        sum_asks[pair] = sum_asks[pair].slice(sum_asks[pair].length - 33, 33)
        sum_bids[pair] = sum_bids[pair].slice(sum_bids[pair].length - 33, 33)
        candle_opens[pair] = candle_opens[pair].slice(candle_opens[pair].length - 10000, 10000)
        candle_closes[pair] = candle_closes[pair].slice(candle_closes[pair].length - 10000, 10000)
        candle_prices[pair] = candle_prices[pair].slice(candle_prices[pair].length - 10000, 10000)
        candle_highs[pair] = candle_highs[pair].slice(candle_highs[pair].length - 10000, 10000)
        candle_lowes[pair] = candle_lowes[pair].slice(candle_lowes[pair].length - 10000, 10000)
        candle_volumes[pair] = candle_volumes[pair].slice(candle_volumes[pair].length - 10000, 10000)
        interv_vols_sum[pair] = interv_vols_sum[pair].slice(interv_vols_sum[pair].length - 10000, 10000)
        trades[pair] = trades[pair].slice(trades[pair].length - 10000, 10000)

    }, 1000)
}

async function createPgPairTable(pair) {
    return pg_client.query('CREATE TABLE '+nbt_prefix+pair+'(id bigserial primary key, eventtime bigint NOT NULL, datetime varchar(200), price decimal, candle_open decimal, candle_high decimal, candle_low decimal, candle_close decimal, sum_interv_vols decimal, trades integer, makers_count real, depth_report decimal, sum_bids real, sum_asks real, first_bid_price decimal, first_ask_price decimal, first_bid_qty decimal, first_ask_qty decimal, srsi real)')
    .then(res => {
        console.log("TABLE "+nbt_prefix+pair+" CREATION SUCCESS")
    })
    .catch(e => {
        //console.log(e)
    })
}

sleep = (x) => {
	return new Promise(resolve => {
		setTimeout(() => { resolve(true) }, x )
	})
}

run()
