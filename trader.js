const express = require('express')
const io = require('socket.io-client')
const moment = require('moment')
const binance = require('binance-api-node').default
const _ = require('lodash')
const colors = require("colors")
const BigNumber = require('bignumber.js')
const fs = require('fs')

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
let prices = {}
let api_last_call_ts = 0
let buy_prices = {}
let user_payload = []

//////////////////////////////////////////////////////////////////////////////////

const binance_client = binance()

const nbt_vers = "0.1.2"
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
    console.log(colors.grey('NBT HUB => Buy signal received :: ', signal.stratname, signal.stratid, signal.pair))
    console.log(trading_pairs[signal.pair+signal.stratid])
    console.log(user_payload)
    const tresult = _.findIndex(user_payload, (o) => { return o.stratid == signal.stratid })
    console.log(tresult)
    if ( (trading_pairs[signal.pair+signal.stratid] === undefined || trading_pairs[signal.pair+signal.stratid] === false) && (tresult > -1) ) {
        console.log(user_payload)
        await getPrices()
        buy_prices[signal.pair+signal.stratid] = new BigNumber(prices[signal.pair])
        trading_pairs[signal.pair+signal.stratid] = true
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
    console.log(colors.grey('NBT HUB => Sell signal received :: ', signal.stratname, signal.pair))
    const tresult = _.findIndex(user_payload, (o) => { return o.stratid == signal.stratid })
    if ( (trading_pairs[signal.pair+signal.stratid]) && (tresult > -1) ) {
        await getPrices()
        const sell_price = new BigNumber(prices[signal.pair])
        const pnl = sell_price.minus(buy_prices[signal.pair+signal.stratid]).times(100).dividedBy(buy_prices[signal.pair+signal.stratid])
        trading_pairs[signal.pair+signal.stratid] = false
        console.log( 
            moment().format().grey.padStart(30), 
            colors.red("SELL").padStart(20),
            signal.pair.white.padStart(20),
            colors.cyan(pnl.minus(0.1).decimalPlaces(2).toString()).padStart(35),
            signal.stratname.padStart(30),
        )
    }
})

socket.on('user_payload', async (data) => {
    console.log(colors.grey('NBT HUB => user strategies + trading setup updated'))
    user_payload = data
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