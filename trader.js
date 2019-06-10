const express = require('express')
const socket = require('socket.io-client')('http://localhost:4000')
const moment = require('moment')
const binance = require('binance-api-node').default
const _ = require('lodash')
const colors = require("colors")
const BigNumber = require('bignumber.js')
const fs = require('fs')

//////////////////////////////////////////////////////////////////////////////////

const app = express()
app.get('/', (req, res) => res.send(""))
app.listen(process.env.PORT || 8003, () => console.log('NBT trader running.'))

//////////////////////////////////////////////////////////////////////////////////

let trading_pairs = {}
let prices = {}
let api_last_call_ts = 0
let buy_prices = {}

//////////////////////////////////////////////////////////////////////////////////

const binance_client = binance()

socket.on('connect', () => {
    console.log("Trader connected.")
})
socket.on('disconnect', () => {
    console.log("Trader disconnected.")
})

socket.on('buy_signal', async (signal) => {
    console.log(colors.grey('=> BUY SIGNAL', signal.pair, signal.signal_name))
    if (trading_pairs[signal.pair+signal.signal_key] === undefined 
        || trading_pairs[signal.pair+signal.signal_key] === false) {
        await getPrices()
        buy_prices[signal.pair+signal.signal_key] = new BigNumber(prices[signal.pair])
        trading_pairs[signal.pair+signal.signal_key] = true
        console.log( 
            moment().format().grey.padStart(30), 
            colors.green("BUY").padStart(20),
            signal.pair.white.padStart(20),
            colors.blue(buy_prices[signal.pair+signal.signal_key]).padStart(35),
            signal.signal_name.padStart(30),
        )
    }
})

socket.on('sell_signal', async (signal) => {
    console.log(colors.grey('=> SELL SIGNAL', signal.pair, signal.signal_name))
    if (trading_pairs[signal.pair+signal.signal_key]) {
        await getPrices()
        trading_pairs[signal.pair+signal.signal_key] = false
        const sell_price = new BigNumber(prices[signal.pair])
        const pnl = sell_price.minus(buy_prices[signal.pair+signal.signal_key]).times(100).dividedBy(buy_prices[signal.pair+signal.signal_key])
        console.log( 
            moment().format().grey.padStart(30), 
            colors.red("SELL").padStart(20),
            signal.pair.white.padStart(20),
            colors.cyan(pnl.minus(0.1).decimalPlaces(2).toString()).padStart(35),
            signal.signal_name.padStart(30),
        )
    }
})

async function getPrices() {
    if (api_last_call_ts < Date.now() - 1000) {
        try {
            api_last_call_ts = Date.now()
            prices = await binance_client.prices()
            return prices
        } catch (e) {
            console.log(e)
        }
    }
}

//////////////////////////////////////////////////////////////////////////////////