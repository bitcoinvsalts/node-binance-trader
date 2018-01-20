/* ============================================================
 * node-binance-trader
 * https://github.com/jsappme/node-binance-trader
 * ============================================================
 * Copyright 2018, Herve Fulchiron - contact@jsapp.me
 * Released under the MIT License
 * ============================================================ */

const express = require('express')
const path = require('path')
const binance = require('./node-binance-api.js');
var _ = require('lodash');
var moment = require('moment');
var numeral = require('numeral');
var readline = require('readline');
var fs = require('fs');
const play = require('audio-play');
const load = require('audio-loader');
const nodemailer = require('nodemailer');

//////////////////////////////////////////////////////////////////////////////////

// https://www.binance.com/restapipub.html
const APIKEY = 'xxx'
const APISECRET = 'xxx'

const sound_alert = true
const tracked_max = 10
const depth_limit = 10
const wait_time = 1000 			// ms
const trading_fee = 0.1 		// pourcent

// https://medium.com/@manojsinghnegi/sending-an-email-using-nodemailer-gmail-7cfa0712a799
const send_email = true
const gmail_address = 'xxx@gmail.com'
const gmail_password = 'xxx'
const gmailEmail = encodeURIComponent(gmail_address);
const gmailPassword = encodeURIComponent(gmail_password);
const mailTransport = nodemailer.createTransport(`smtps://${gmailEmail}:${gmailPassword}@smtp.gmail.com`);

//////////////////////////////////////////////////////////////////////////////////

let btc_price = 0

let pairs = []

let depth_bids = {}
let depth_asks = {}
let depth_diff = {}

let minute_prices = {}
let hourly_prices = {}

let tracked_pairs = []
let tracked_data = {}
let total_pnl = {}

//////////////////////////////////////////////////////////////////////////////////
// that's where you define your buying conditions:
//////////////////////////////////////////////////////////////////////////////////

buying_up_trend = (pair) => {
	const ma_s = 3
	const ma_m = 13
	const ma_l = 99
	const ma_h_s = hourly_prices[pair].slice(0,ma_s).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(hourly_prices[pair].slice(0,ma_s).length)
	const ma_h_m = hourly_prices[pair].slice(0,ma_m).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(hourly_prices[pair].slice(0,ma_m).length)
	const ma_h_l = hourly_prices[pair].slice(0,ma_l).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(hourly_prices[pair].slice(0,ma_l).length)
	const ma_m_s = minute_prices[pair].slice(0,ma_s).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(minute_prices[pair].slice(0,ma_s).length)
	const ma_m_m = minute_prices[pair].slice(0,ma_m).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(minute_prices[pair].slice(0,ma_m).length)
	const ma_m_l = minute_prices[pair].slice(0,ma_l).reduce((sum, price) => (sum + parseFloat(price)), 0) / parseFloat(minute_prices[pair].slice(0,ma_l).length)
	if ( (ma_h_s >= ma_h_m) && (ma_h_m >= ma_h_l) && (ma_m_s >= ma_m_m) && (ma_m_m >= ma_m_l) ) { 
		return "BUY"
	}
	else {
		return "SELL"
	}
}

buying_low_depth_diff = (pair) => {
	const max_ask_bid_ratio = 3.0 	// depth_asks/depth_bids < max_ask_bid_ratio
	const min_depth_volume = 2.0  	// btc
	const max_depth_diff = 0.003 	// pourcent(ask-bid/bid)
	if ( (parseFloat(depth_bids[pair])>=(parseFloat(depth_asks[pair])*max_ask_bid_ratio)) 
		&& (parseFloat(depth_bids[pair])>=min_depth_volume) 
		&& (parseFloat(depth_diff[pair])<=parseFloat(max_depth_diff)) ) { 
		return "BUY"
	}
	else {
		return "SELL"
	}
}

let strategies = [ 
	{ name: "UP_TREND", condition: buying_up_trend }, 
	{ name: "LOW_DEPTH_DIFF", condition: buying_low_depth_diff },
]

//////////////////////////////////////////////////////////////////////////////////

// API initialization //
binance.options({ 'APIKEY': APIKEY, 'APISECRET': APISECRET, 'reconnect': true });

console.log('------------ NBT starting -------------')

async function run() {

	if (sound_alert) load('./alert.mp3').then(play);
	await sleep(2)

	console.log('------------------------------')
	console.log(' start get_BTC_price')
	console.log('------------------------------')
	btc_price = await get_BTC_price()
	console.log('------------------------------')
	console.log('BTC price: $' + numeral(btc_price).format('0,0'))
	console.log('------------------------------')

	await sleep(2)

	console.log('------------------------------')
	console.log(' get_BTC_pairs start')
	console.log('------------------------------')
	pairs = await get_BTC_pairs()
	console.log('------------------------------')
	pairs = pairs.slice(0, tracked_max) //for debugging purpose
	console.log("Total BTC pairs: " + pairs.length)
	console.log('------------------------------')
	
	await sleep(2)

	console.log('------------------------------')
	console.log(' trackDepthData start')
	console.log('------------------------------')
	await trackDepthData()
	console.log('------------------------------')

	await sleep(2)

	console.log('------------------------------')
	console.log(' getHourlyPrevPrices start')
	console.log('------------------------------')
	await getHourlyPrevPrices()
	console.log('------------------------------')

	await sleep(2)

	console.log('------------------------------')
	console.log(' trackMinutePrices start')
	console.log('------------------------------')
	await trackMinutePrices()
	console.log('------------------------------')

	console.log('------------ we are ready to track all strategies -------------')
	if (sound_alert) load('./alert.mp3').then(play)
}

sleep = (x) => {
	return new Promise(resolve => {
		setTimeout(() => { resolve(true) }, x )
	});
}

get_BTC_price = () => {
	return new Promise(resolve => {
		binance.websockets.candlesticks(['BTCUSDT'], "1m", (candlesticks) => {
			let { e:eventType, E:eventTime, s:symbol, k:ticks } = candlesticks;
			let { o:open, h:high, l:low, c:close, v:volume, n:trades, i:interval, x:isFinal, q:quoteVolume, V:buyVolume, Q:quoteBuyVolume } = ticks;
			btc_price = close
			resolve(btc_price)
		})
	})
}

get_BTC_pairs = () => {
	return new Promise(resolve => {
		binance.exchangeInfo((error, data) => {
			if (error) {
				console.log( error )
				resolve([])
			}
			if (data) {
				console.log( data.symbols.length + " total pairs")
				resolve( data.symbols.filter( pair => pair.symbol.endsWith('BTC') ).map(pair=>pair.symbol) )
			}
		})
	})
}

trackDepthPair = (pair) => {
	return new Promise(resolve => {
		console.log( "> starting tracking depth data for " + pair )
		binance.websockets.depthCache([pair], (symbol, depth) => {
			var bids = binance.sortBids(depth.bids, depth_limit)
			var asks = binance.sortAsks(depth.asks, depth_limit)
			depth_asks[pair] = _.sum(_.values(asks).slice(0,depth_limit))*binance.first(asks)
			depth_bids[pair] = _.sum(_.values(bids).slice(0,depth_limit))*binance.first(bids)
			depth_diff[pair] = 100 * (binance.first(asks) - binance.first(bids)) / (binance.first(bids))
		}, depth_limit);
		resolve(true)
	}, depth_limit)
}

async function trackDepthData() {
	for (var i = 0, len = pairs.length; i < len; i++) {
		var pair = pairs[i]
		await trackDepthPair(pair)
		await sleep(wait_time)
		console.log( (i+1) + " > " + pair + " depth tracked a:" + numeral(depth_asks[pair]).format("0.00") + " / b:" + numeral(depth_bids[pair]).format("0.00") )
	}
}

getPairHourlyPrices = (pair) => {
	return new Promise(resolve => {
		binance.candlesticks(pair, "1h", (error, ticks, symbol) => {
			if (error) {
				console.log( symbol + " > hourly prices ERROR " + error )
				resolve(true)
			}
			if (ticks) {
				//console.log( symbol + " >>>>>> hourly prices retrieved " + ticks[ticks.length-1][4])
				//var last_tick = ticks[ticks.length - 2];
				//let [time, open, high, low, close, volume, closeTime, assetVolume, trades, buyBaseVolume, buyAssetVolume, ignored] = last_tick;
				hourly_prices[symbol] =  _.drop(_.reverse( ticks.map( tick => (tick[4]) ) ) ) //we use close price
				console.log( symbol + " > " + hourly_prices[symbol].length + " hourly prices retrieved p:" + hourly_prices[symbol][0])
				resolve(true)	
			}
		})
	})
}

async function getHourlyPrevPrices() {
	for (var i = 0, len = pairs.length; i < len; i++) {
		await getPairHourlyPrices(pairs[i])
		await sleep(wait_time)
	}
}

getPrevMinutePrices = (pair) => {
	return new Promise(resolve => {
		binance.candlesticks(pair, "1m", (error, ticks, symbol) => {
			if (error) {
				console.log( pair + " getPrevMinutePrices ERROR " + error )
				resolve(true)
			}
			if (ticks) {
				minute_prices[symbol] = _.drop(_.reverse( ticks.map( tick => (tick[4]) ) ) )
				resolve(true)
			}
		})
	})
}

async function trackMinutePrices() {
	for (var i = 0, len = pairs.length; i < len; i++) {
		await getPrevMinutePrices(pairs[i])
		await sleep(wait_time)
		console.log( (i+1) + " > " + pairs[i] + " " + minute_prices[pairs[i]].length + " minute prices retrieved")
		await trackFutureMinutePrices(pairs[i])
		await sleep(wait_time)
		console.log( (i+1) + " > " + pairs[i] + " future prices tracked.")
	}
}

trackFutureMinutePrices = (pair) => {
	return new Promise(resolve => {
		//console.log( "> starting tracking future prices for " + pair)
		binance.websockets.candlesticks([pair], "1m", (candlesticks) => {
			let { e:eventType, E:eventTime, s:symbol, k:ticks } = candlesticks
			let { o:open, h:high, l:low, c:close, v:volume, n:trades, i:interval, x:isFinal, q:quoteVolume, V:buyVolume, Q:quoteBuyVolume } = ticks
			strategies.map( strat => { 
				var tracked_index = _.findIndex(tracked_pairs, (o) => { return ( (o.strat === strat.name) && (o.symbol === pair) )})
				if ( tracked_index > -1) {
					tracked_data[symbol][strat.name].push({ 
						date: moment().format('h:mm:ss a'),
						price: close,
						depth_asks: parseFloat(depth_asks[symbol]),
						depth_bids: parseFloat(depth_bids[symbol]),
						depth_diff: parseFloat(depth_diff[symbol]),
					})
				}
			})
			if (isFinal) {
				minute_prices[symbol].unshift(close)
				if ( (moment().format('m')%1 === 0) && (symbol==="ETHBTC") ) { 
					console.log("------------------ " + moment().format('h:mm:ss') + " - new minute price added ------------------") 
				}
				if ( moment().format('m')==='59' ){ 
					hourly_prices[symbol].unshift(close) 
					if (symbol==="ETHBTC") { console.log("------------------ " + moment().format('h:mm:ss') + " - new hourly price added ------------------") }
				}
				strategies.map( strat => { 
					if (strat.condition(symbol)==="BUY") {
						var tracked_index = _.findIndex(tracked_pairs, (o) => { return ( (o.strat === strat.name) && (o.symbol === symbol) )})
						if ( tracked_index === -1 ) {
							console.log(moment().format('h:mm:ss') + " :: " + symbol 
								+ " BUY :: " + strat.name + " :: "
								+ " A:" + numeral(depth_asks[symbol]).format("0.00") 
								+ " B:" + numeral(depth_bids[symbol]).format("0.00") 
								+ " C:" + close 
								+ " D:%" + numeral(depth_diff[symbol]).format("0.000") 
								+ " https://www.binance.com/tradeDetail.html?symbol=" + symbol.slice(0, -3) + "_BTC")
							if (sound_alert) load('./alert.mp3').then(play)
							if ( typeof tracked_data[symbol] === 'undefined' ) {
								tracked_data[symbol] = {}
							}
							tracked_data[symbol][strat.name] = []
							tracked_pairs.push({ 
								symbol: symbol, 
								date: moment().format('MMMM Do YYYY, h:mm:ss a'),
								timestamp: Date.now(),
								price: close,
								volume: volume,
								usdvolume: volume*close*btc_price,
								strat: strat.name
							})
						}
					} 
					if (strat.condition(symbol)==="SELL") {
						var tracked_index = _.findIndex(tracked_pairs, (o) => { return ( (o.strat === strat.name) && (o.symbol === symbol) )})
						if ( tracked_index > -1) {
							if ( typeof total_pnl[strat.name] === 'undefined' ) {
								total_pnl[strat.name] = []
							}
							total_pnl[strat.name].unshift({ 
								symbol: symbol, 
								date: moment().format('MMMM Do YYYY, h:mm:ss a'),
								timestamp: Date.now(),
								pnl: ( 100.00*((parseFloat(close)/parseFloat(tracked_pairs[tracked_index].price))-1) - trading_fee*2.0),
							})
							console.log(moment().format('h:mm:ss') + " :: " + symbol 
								+ " SELL :: " + strat.name + " :: "
								//+ " max:%" + numeral(100.00*(parseFloat((_.maxBy(tracked_data[symbol], 'price').price)/parseFloat(tracked_pairs[tracked_index].price))-1)).format("0.000") 
								+ " pnl:%" + numeral(100.00*((parseFloat(close)/parseFloat(tracked_pairs[tracked_index].price))-1)).format("0.000") 
								+ " tpnl:%" + numeral(_.sumBy(total_pnl[strat.name], 'pnl')).format("0.000") 
								+ " ::  A:" + numeral(depth_asks[symbol]).format("0.00") 
								+ " B:" + numeral(depth_bids[symbol]).format("0.00") 
								+ " C:" + close 
								+ " D:%" + numeral(depth_diff[symbol]).format("0.000") 
								+ " https://www.binance.com/tradeDetail.html?symbol=" + symbol.slice(0, -3) + "_BTC")
							if (send_email) {
								const mailOptions = {
									from: '"My NBT Bot" <contact@jsapp.me>',
									to: gmail_address,
									subject: symbol + " SELL :: " + strat.name + " :: "
										+ " pnl:%" + numeral(100.00*((parseFloat(close)/parseFloat(tracked_pairs[tracked_index].price))-1)).format("0.000") 
										+ " tpnl:%" + numeral(_.sumBy(total_pnl[strat.name], 'pnl')).format("0.000") 
										+ " ::  A:" + numeral(depth_asks[symbol]).format("0.00") 
										+ " B:" + numeral(depth_bids[symbol]).format("0.00") 
										+ " C:" + close 
										+ " D:%" + numeral(depth_diff[symbol]).format("0.000"), 
									text: "https://www.binance.com/tradeDetail.html?symbol=" + symbol.slice(0, -3) + "_BTC \n"
										+ "  ------------------------------------------ \n"
										+ tracked_data[symbol][strat.name].map(item => JSON.stringify(item)+"\n") + "\n"
								};
								mailTransport.sendMail(mailOptions).then(() => {
								}).catch(error => {
									console.error('There was an error while sending the email ... trying again...')
									setTimeout(() => {
										mailTransport.sendMail(mailOptions).then(() => {
										}).catch(error => { console.error('There was an error while sending the email: stopped trying') })
									}, 2000 )
								});
							}
							if (sound_alert) load('./alert.mp3').then(play)
							tracked_pairs = tracked_pairs.filter(o => !( (o.strat === strat.name) && (o.symbol === symbol) ))
						}
					} 
				})
			}
		});
		resolve(true)
	})
}

run()

console.log("----------------------")

const app = express()
app.get('/', (req, res) => res.send(tracked_pairs))
app.listen(process.env.PORT || 80, () => console.log('NBT api accessable on port 80'))