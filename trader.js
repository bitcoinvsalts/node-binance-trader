const express = require('express')
const io = require('socket.io-client')
const moment = require('moment')
const binance = require('binance-api-node').default
const _ = require('lodash')
const colors = require("colors")
const BigNumber = require('bignumber.js')
const axios = require('axios')

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////
//         PLEASE EDIT WITH YOUR BITCOINvsALTCOINS.com KEY HERE BELLOW
//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

                const bva_key = "replace_with_your_BvA_key" 

//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

const app = express()
app.get('/', (req, res) => res.send(""))
app.listen(process.env.PORT || 8003, () => console.log('NBT auto trader running.'.grey))

//////////////////////////////////////////////////////////////////////////////////

let trading_pairs = {}
let buy_prices = {}
let user_payload = []

//////////////////////////////////////////////////////////////////////////////////

const binance_client = binance({
    apiKey: 'replace_with_your_Binance_apiKey',
    apiSecret: 'replace_with_your_Binance_apiSecret',
})

//////////////////////////////////////////////////////////////////////////////////
const nbt_vers = "0.2.0"
// Retrieve previous open trades //
axios.get('https://bitcoinvsaltcoins.com/api/useropentradedsignals?key=' + bva_key )
.then( (response) => {
    response.data.rows.map( s => {
        trading_pairs[s.pair+s.stratid] = true
        buy_prices[s.pair+s.stratid] = new BigNumber(s.buy_price)
    })
    console.log("Open Trades:", _.values(trading_pairs).length)
})
.catch( (e) => {
    console.log(e.response.data)
})
//////////////////////////////////////////////////////////////////////////////////

const socket = io('https://nbt-hub.herokuapp.com', { query: "v="+nbt_vers+"&type=client&key=" + bva_key })

socket.on('connect', () => {
    console.log("Auto Trader connected.".grey)
})

socket.on('disconnect', () => {
    console.log("Auto Trader disconnected.".grey)
})

socket.on('message', (message) => {
    console.log(colors.magenta("NBT Message: " + message))
})

socket.on('buy_signal', async (signal) => {
    const tresult = _.findIndex(user_payload, (o) => { return o.stratid == signal.stratid })
    if ( (trading_pairs[signal.pair+signal.stratid] === undefined || trading_pairs[signal.pair+signal.stratid] === false) && (tresult > -1) ) {
        console.log(colors.grey('NBT HUB => Buy signal received :: ', signal.stratname, signal.stratid, signal.pair))
        trading_pairs[signal.pair+signal.stratid] = true
        const price = await getBuyPrice(signal.pair)
        buy_prices[signal.pair+signal.stratid] = new BigNumber(price)
        if (user_payload[tresult].trading_type === "real") {
            binance_client.order({
                symbol: signal.pair,
                side: 'BUY',
                quantity: Number(user_payload[tresult].buy_amount),
                type: 'MARKET',
            })
            .then( (order_result) => {
                console.log("BUY ORDER RESULT", signal.pair)
                console.log(order_result)
                if (order_result.status === 'FILLED') {
                    console.log("BUY PRICE: ", order_result.fills[0].price)
                }
            })
            .catch( (error) => {
                console.log("ERROR 7868678")
                console.error(JSON.stringify(error))
            })
        }
        const traded_buy_signal = {
            key: bva_key,
            stratname: signal.stratname,
            stratid: signal.stratid,
            trading_type: user_payload[tresult].trading_type,
            pair: signal.pair, 
            buy_price: Number(buy_prices[signal.pair+signal.stratid].toString()),
        }
        socket.emit("traded_buy_signal", traded_buy_signal)
        console.log( 
            moment().format().grey.padStart(30), 
            colors.green("BUY").padStart(20),
            signal.pair.white.padStart(20),
            colors.blue(buy_prices[signal.pair+signal.stratid]).padStart(35),
            signal.stratname.padStart(30),
        )
    }
})

socket.on('sell_signal', async (signal) => {
    const tresult = _.findIndex(user_payload, (o) => { return o.stratid == signal.stratid })
    if ( (trading_pairs[signal.pair+signal.stratid]) && (tresult > -1) ) {
        console.log(colors.grey('NBT HUB => Sell signal received :: ', signal.stratname, signal.pair))
        trading_pairs[signal.pair+signal.stratid] = false
        const price = await getSellPrice(signal.pair)
        const sell_price = new BigNumber(price)
        const pnl = sell_price.minus(buy_prices[signal.pair+signal.stratid]).times(100).dividedBy(buy_prices[signal.pair+signal.stratid])
        if (user_payload[tresult].trading_type === "real") {
            binance_client.order({
                symbol: signal.pair,
                side: 'SELL',
                quantity: Number(user_payload[tresult].buy_amount),
                type: 'MARKET',
            })
            .then( (order_result) => {
                console.log("SELL ORDER RESULT", signal.pair)
                console.log(order_result)
                if (order_result.status === 'FILLED') {
                    console.log("SELL PRICE: ", order_result.fills[0].price)
                }
            })
            .catch( (error) => {
                console.error(JSON.stringify(error))
            })
        }
        const traded_sell_signal = {
            key: bva_key,
            stratname: signal.stratname,
            stratid: signal.stratid,
            trading_type: user_payload[tresult].trading_type,
            pair: signal.pair, 
            sell_price: Number(sell_price.toString()),
            pnl: Number(pnl.minus(0.1).decimalPlaces(2).toString()),
        }
        socket.emit("traded_sell_signal", traded_sell_signal)
        console.log( 
            moment().format().grey.padStart(30), 
            colors.red("SELL").padStart(20),
            signal.pair.white.padStart(20),
            colors.cyan(pnl.minus(0.1).decimalPlaces(2).toString()).padStart(35),
            signal.stratname.padStart(30),
        )
    }
})

socket.on('close_traded_signal', async (data) => {
    console.log(colors.grey('NBT HUB =====> close_traded_signal', data.stratid, data.pair, data.trading_type))
    const tresult = _.findIndex(user_payload, (o) => { return o.stratid == data.stratid })
    if ( (trading_pairs[ data.pair+data.stratid]) && (tresult > -1) ) {
        trading_pairs[ data.pair+data.stratid] = false
        const price = await getSellPrice(data.pair)
        const sell_price = new BigNumber(price)
        const pnl = sell_price.minus(buy_prices[data.pair+data.stratid]).times(100).dividedBy(buy_prices[data.pair+data.stratid])
        if (user_payload[tresult].trading_type === "real") {
            binance_client.order({
                symbol: data.pair,
                side: 'SELL',
                quantity: Number(user_payload[tresult].buy_amount),
                type: 'MARKET',
            })
            .then( (order_result) => {
                console.log("CLOSE ORDER RESULT", data.pair)
                console.log(order_result)
                if (order_result.status === 'FILLED') {
                    console.log("CLOSE PRICE: ", order_result.fills[0].price)
                }
            })
            .catch( (error) => {
                console.error(JSON.stringify(error))
            })
        }
        const traded_sell_signal = {
            key: bva_key,
            stratname: "closing traded signal",
            stratid: data.stratid,
            trading_type: data.trading_type,
            pair: data.pair, 
            sell_price: Number(sell_price.toString()),
            pnl: Number(pnl.minus(0.1).decimalPlaces(2).toString()),
        }
        socket.emit("traded_sell_signal", traded_sell_signal)
        console.log( 
            moment().format().grey.padStart(30), 
            colors.red("SELL").padStart(20),
            data.pair.white.padStart(20),
            colors.cyan(pnl.minus(0.1).decimalPlaces(2).toString()).padStart(35),
            "closing traded signal".padStart(30),
        )
    }
})

socket.on('user_payload', async (data) => {
    console.log(colors.grey('NBT HUB => user strategies + trading setup updated'))
    //console.log(data)
    user_payload = data
})

//////////////////////////////////////////////////////////////////////////////////

async function getBuyPrice(pair) {
    try {
        const book = await binance_client.book({ symbol: pair })
        return book.asks[0].price
    } catch (e) {
        console.log(e)
        return 0
    }
}

async function getSellPrice(pair) {
    try {
        const book = await binance_client.book({ symbol: pair })
        return await book.bids[0].price
    } catch (e) {
        console.log(e)
        return 0
    }
}

//////////////////////////////////////////////////////////////////////////////////