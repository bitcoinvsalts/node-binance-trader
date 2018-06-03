#!/usr/bin/env node

/* ============================================================
 * node-binance-trader
 * https://github.com/jsappme/node-binance-trader
 * ============================================================
 * Copyright 2018, Herve Fulchiron - herve76@gmail.com
 * Released under the MIT License
 * v0.0.2 - 🐬 delphines 🐬
 * 3/13/2018
 * ============================================================ */

const chalk       = require('chalk')
const ora         = require('ora')
const moment      = require('moment')
const _           = require('lodash')
const numeral     = require('numeral')
const clear       = require('clear')
const figlet      = require('figlet')
const Configstore = require('configstore')
const binance     = require('binance-api-node').default
const inquirer    = require("inquirer")

//////////////////////////////////////////////////////////////////////////////////
// https://www.binance.com/restapipub.html
// REPLACE xxx with your own API key key and secret.
//
const APIKEY = 'xxx'
const APISECRET = 'xxx'
//////////////////////////////////////////////////////////////////////////////////

let tracking = false
let trading = false
let pnl = 0
let step = 0
let order_id = 0
let buy_price  = 0.00
let switch_price  = 0.00
let stop_price = 0.00
let loss_price = 0.00
let sell_price = 0.00
let minute_price = 0.00
let minute_prices = []
let minute_volume = 0.00
let curr_min_delta = 0.000
let last_min_delta = 0.000
let prev_min_delta = 0.000
let half_hour_delta = 0.000
let one_hour_delta = 0.000
let two_hour_delta = 0.000
let last_price = 0.00
let price_direction = 0
let precision = 8
let tot_cancel = 0

//////////////////////////////////////////////////////////////////////////////////

// Binance API initialization //
const client = binance({apiKey: APIKEY, apiSecret: APISECRET})

const conf = new Configstore('nbt')
let default_pair    = conf.get('nbt.default_pair')?conf.get('nbt.default_pair'):"BTCUSDT"
let buy_amount      = conf.get('nbt.buy_amount')?conf.get('nbt.buy_amount'):1.00
let profit_pourcent = conf.get('nbt.profit_pourcent')?conf.get('nbt.profit_pourcent'):0.80
let loss_pourcent   = conf.get('nbt.loss_pourcent')?conf.get('nbt.loss_pourcent'):0.40

clear()

console.log(chalk.yellow(figlet.textSync('_N_B_T_', { horizontalLayout: 'fitted' })))
console.log(' ')
console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
console.log(" 🐬 ".padEnd(10) + chalk.bold.underline.cyan('Node Binance Trader') + " 🐬 ".padStart(11))
console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
console.log(" 🐬 ".padEnd(10) + chalk.italic.cyan('Test Drive Version') + " 🐬 ".padStart(12))
console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
console.log(' ')
console.log(chalk.cyan('Welcome to the test drive of a very basic Binance trading bot.'))
console.log(' ')
console.log(chalk.red('-------------------------------------------------------'))
console.log(chalk.red('   This bot is for education purpose only.'))
console.log(chalk.red('   You are responsible for your own use.'))
console.log(chalk.red('-------------------------------------------------------'))
console.log(' ')
console.log(chalk.cyan('The mission of this bot is to make one simple dynamic trade.'))

var default_pair_input = [
  {
    type: 'input',
    name: 'pair',
    message: chalk.cyan('What pair would you like to trade?'),
    default: default_pair
  },
]

ask_default_pair = () => {
  console.log(" ")
  inquirer.prompt(default_pair_input).then(answers => {
    default_pair = answers.pair.toUpperCase()
    const report = ora('Loading 1 min candles...').start()
    
    client.candles({ symbol: default_pair, interval: '1m' }).then(candles => { 

      conf.set('nbt.default_pair', default_pair)
      default_pair_input[0].default = default_pair
      
      candles.forEach((candle) => {
        minute_prices.unshift(parseFloat(candle.close))
      })

      minute_price = parseFloat(candles[candles.length-1].close)
      minute_volume = parseFloat(candles[candles.length-1].volume)
      curr_min_delta  = 100.00*(candles[candles.length-1].close-candles[candles.length-1].open)/candles[candles.length-1].open
      last_min_delta  = 100.00*(candles[candles.length-2].close-candles[candles.length-2].open)/candles[candles.length-2].open
      prev_min_delta  = 100.00*(candles[candles.length-3].close-candles[candles.length-3].open)/candles[candles.length-3].open
      half_hour_delta = 100.00*(candles[candles.length-1].close-candles[candles.length-30].close)/candles[candles.length-30].open
      one_hour_delta  = 100.00*(candles[candles.length-1].close-candles[candles.length-60].close)/candles[candles.length-60].open
      two_hour_delta  = 100.00*(candles[candles.length-1].close-candles[candles.length-120].close)/candles[candles.length-120].open
      price_direction = (parseFloat(candles[candles.length-1].close) > last_price) ? 1 : ( (parseFloat(candles[candles.length-1].close) < last_price) ? -1 : 0 )
      last_price = parseFloat(candles[candles.length-1].close)

      report.text = candle_report()
      const clean_candles = client.ws.candles(default_pair, '1m', candle => {

        if (candle.isFinal) {
          minute_prices.unshift(parseFloat(candle.close))
        }

        minute_volume = parseFloat(candle.volume)
        minute_price = parseFloat(candle.close)
        curr_min_delta  = 100.00*(candle.close-candle.open)/candle.open
        last_min_delta  = 100.00*(minute_prices[0]-minute_prices[1])/minute_prices[1]
        prev_min_delta  = 100.00*(minute_prices[1]-minute_prices[2])/minute_prices[2]
        half_hour_delta = 100.00*(minute_prices[0]-minute_prices[30])/minute_prices[30]
        one_hour_delta  = 100.00*(minute_prices[0]-minute_prices[60])/minute_prices[60]
        two_hour_delta  = 100.00*(minute_prices[0]-minute_prices[120])/minute_prices[120]
        price_direction = (parseFloat(candle.close) > last_price) ? 1 : ( (parseFloat(candle.close) < last_price) ? -1 : 0 )
        last_price = parseFloat(candle.close)

        report.text = candle_report()
        
        if (minute_prices.length > 130) minute_prices.pop()
      })

      if (!tracking) {
        tracking = true
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once('data', () => {
          report.succeed()
          if (tracking) {
            tracking = false
            clean_candles() 
            minute_prices = []
            console.log(" ")
            setTimeout(() => { ask_buy_or_change() }, 1000 )
          }
        })
      }
    })
    .catch(error => { 
      report.fail(chalk.yellow("--> Sorry, Invalid Pair!!!")) 
      console.error("ERROR 6 " + error)
      ask_default_pair()
    })
  })
}

candle_report = () => {
  return chalk.grey(moment().format('h:mm:ss').padStart(8))
    + chalk.yellow(default_pair.padStart(10))
    + ((price_direction===1)?chalk.green(" + "):((price_direction===-1)?chalk.red(" - "):"   "))
    + chalk.cyan(minute_price).padEnd(20)
    + chalk.white(" vol: ")
    + chalk.white(String(minute_volume).padEnd(12))
    + ((curr_min_delta>0)?chalk.green((numeral(curr_min_delta).format("0.000")+"%").padEnd(7)):chalk.red((numeral(curr_min_delta).format("0.000")+"%").padEnd(7)))
    + chalk.gray(" <-1m: ")
    + ((last_min_delta>0)?chalk.green((numeral(last_min_delta).format("0.000")+"%").padEnd(7)):chalk.red((numeral(last_min_delta).format("0.000")+"%").padEnd(7)))
    + chalk.gray(" <-2m: ")
    + ((prev_min_delta>0)?chalk.green((numeral(prev_min_delta).format("0.000")+"%").padEnd(7)):chalk.red((numeral(prev_min_delta).format("0.000")+"%").padEnd(7)))
    + chalk.gray(" <-30m: ")
    + ((half_hour_delta>0)?chalk.green((numeral(half_hour_delta).format("0.000")+"%").padEnd(7)):chalk.red((numeral(half_hour_delta).format("0.000")+"%").padEnd(7)))
    + chalk.gray(" <-1h: ")
    + ((one_hour_delta>0)?chalk.green((numeral(one_hour_delta).format("0.000")+"%").padEnd(7)):chalk.red((numeral(one_hour_delta).format("0.000")+"%").padEnd(7)))
    + chalk.gray(" <-2h: ")
    + ((two_hour_delta>0)?chalk.green((numeral(two_hour_delta).format("0.000")+"%").padEnd(7)):chalk.red((numeral(two_hour_delta).format("0.000")+"%").padEnd(7)))
}

var buy_or_change_request = [
  {
    type: 'list',
    name: 'menu',
    default: 1,
    message: chalk.cyan('What to do next?'),
    choices: ['Change Pair', 'Market Buy Now', 'Quit Bot']
  },
]

ask_buy_or_change = () => {
  inquirer.prompt(buy_or_change_request).then(answer => {
    if (answer.menu === 'Change Pair') {
      ask_default_pair()
    }
    else if (answer.menu === 'Market Buy Now') {
      ask_buy_info()
    }
    else if (answer.menu === 'Quit Bot') {
      process.exit()
    }
  })
}

var ask_buy_info_request = [
  {
    type: 'input',
    name: 'buy_amount',
    default: buy_amount,
    message: chalk.cyan('Enter the amount to buy:'),
    validate: function(value) {
      var valid = !isNaN(parseFloat(value)) && (value>0)
      return valid || 'Please enter a number superior than 0'
    },
    filter: Number
  },
  {
    type: 'input',
    name: 'loss_pourcent',
    default: loss_pourcent,
    message: chalk.magenta('Enter the stop loss pourcentage:'),
    validate: function(value) {
      var valid = !isNaN(parseFloat(value)) && (value>0.10) && (value<100.00)
      return valid || 'Please enter a number between 0.10 and 99.99'
    },
    filter: Number
  },
  {
    type: 'input',
    name: 'profit_pourcent',
    default: profit_pourcent,
    message: chalk.green('Enter the profit pourcentage:'),
    validate: function(value) {
      var valid = !isNaN(parseFloat(value)) && (value>0.10) && (value<100.00)
      return valid || 'Please enter a number between 0.10 and 99.99'
    },
    filter: Number
  },
  {
    type: 'confirm',
    name: 'confirm',
    message: chalk.cyan('Please confirm Buy Order at Market Price?'),
    default: true
},
]

ask_buy_info = () => {
  inquirer.prompt(ask_buy_info_request).then(answers => {
    conf.set('nbt.buy_amount', answers.buy_amount)
    conf.set('nbt.profit_pourcent', answers.profit_pourcent)
    conf.set('nbt.loss_pourcent', answers.loss_pourcent)
    buy_amount      = answers.buy_amount
    profit_pourcent = answers.profit_pourcent
    loss_pourcent   = answers.loss_pourcent
    ask_buy_info_request[0].default  = buy_amount
    ask_buy_info_request[2].default  = profit_pourcent
    ask_buy_info_request[1].default  = loss_pourcent
    if (answers.confirm) {

      const report = ora('Starting the trade...').start()

      // Find out the order quote precision
      client.exchangeInfo().then(results => {
        
        precision = _.filter(results.symbols, {symbol: default_pair})[0].filters[0].tickSize.indexOf("1") - 1
        report.text = chalk.grey(moment().format('h:mm:ss').padStart(8))
          + chalk.yellow(default_pair.padStart(10))
          + chalk.white(" Quote precision for " + default_pair + " is " + precision)

        // Find out the last trade price:
        client.trades({ symbol: default_pair, limit: 1 })
        .then( last_trade => {
          buy_price = parseFloat(last_trade[0].price)
          report.text = chalk.grey(moment().format('h:mm:ss').padStart(8))
            + chalk.yellow(default_pair.padStart(10))
            + chalk.white(" Last trade price was: " + buy_price + " Let's try to buy at this price.")
          
          // Try to buy at the last price:
          client.order({
            symbol: default_pair,
            side: 'BUY',
            quantity: buy_amount,
            price: buy_price.toFixed(precision),
            recvWindow: 1000000
          })
          .then( (order_result) => {
            order_id = order_result.orderId
            var log_report = chalk.grey(moment().format('h:mm:ss').padStart(8))
              + chalk.yellow(default_pair.padStart(10))
              + chalk.white(" INITIAL BUY ORDER SET AT " + buy_price)
            report.text = log_report
            step = 1

            const clean_trades = client.ws.trades([default_pair], trade => {

              report.text = add_status_to_trade_report(trade, '')

              // CHECK WHEN INITIAL BUY ORDER HAS BEEN EXECUTED
              if ( order_id && (step === 1) ) {
                step = 99
                var i = 1
                checkOrderStatus = () => {
                  setTimeout( () => {  
                    client.getOrder({
                      symbol: default_pair,
                      orderId: order_id,
                      recvWindow: 1000000
                    })
                    .then( (order_result) => {
                      if ( parseFloat(order_result.executedQty) < parseFloat(order_result.origQty) ) {
                        var log_report = " AMOUNT NOT ALL EXECUTED -> " + order_result.executedQty + " / " + order_result.origQty
                        report.text = add_status_to_trade_report(trade, log_report)
                        if (i > 10) {
                          client.cancelOrder({
                            symbol: default_pair,
                            orderId: order_result.orderId,
                            recvWindow: 1000000
                          })
                          .then( (order) => {
                            var log_report = " BUY ORDER CANCELED. "
                            report.text = add_status_to_trade_report(trade, log_report)

                            log_report = " BUY ORDER AT MARKET PRICE "
                            report.text = add_status_to_trade_report(trade, log_report)

                            // SETUP MARKET BUY ORDER
                            client.order({
                              symbol: default_pair,
                              side: 'BUY',
                              type: 'MARKET',
                              quantity: (parseFloat(order_result.origQty) - parseFloat(order_result.executedQty)),
                              recvWindow: 1000000
                            })
                            .then((order) => {
                              order_id = order.orderId
                              var log_report = " BUY MARKET ORDER SET "
                              report.text = add_status_to_trade_report(trade, log_report)
                              step = 2
                            })
                            .catch((error) => {
                              //step = 1
                              console.error("Order BUY MARKET Error... " + error)
                            })
                          })
                          .catch((error) => {
                            //step = 1
                            console.error("Order Cancelling Error... " + error)
                          })
                        }
                        else {
                          i++
                          checkOrderStatus()
                        }
                      }
                      else {
                        var log_report = " ALL AMOUNT EXECUTED -> " + order_result.executedQty + " / " + order_result.origQty
                        report.text = add_status_to_trade_report(trade, log_report)
                        step = 2
                      }
                    })
                    .catch((error) => {
                      console.error("ERROR 12 " + error)
                    })
                  }, 1000)
                }
                checkOrderStatus()
              }

              // SETTING INITIAL STOP LOSS (1)
              if ( order_id && (step === 2) ) {
                step = 99
                // FIND OUT OUR BUY PRICE
                client.myTrades({ symbol: default_pair, recvWindow: 1000000, limit: 1 }).then( mytrade => {
                  buy_price = parseFloat(mytrade[0].price)
                  switch_price = (buy_price + (buy_price * 0.005 * profit_pourcent)).toFixed(precision)
                  stop_price = (buy_price - (buy_price * 0.010 * loss_pourcent)).toFixed(precision)
                  loss_price = (stop_price - (stop_price * 0.040)).toFixed(precision)
                  sell_price = (buy_price + (buy_price * 0.010 * profit_pourcent)).toFixed(precision)
                  var log_report = " SETTING UP STOP LOSS NOW (1) "
                  report.text = add_status_to_trade_report(trade, log_report)
                  client.order({
                    symbol: default_pair,
                    side: 'SELL',
                    type: 'STOP_LOSS_LIMIT',
                    stopPrice: stop_price,
                    quantity: buy_amount,
                    price: loss_price,
                    recvWindow: 1000000
                  })
                  .then((order) => {
                    order_id = order.orderId
                    var log_report = " STOP LOSS READY (1) " 
                    report.text = add_status_to_trade_report(trade, log_report)
                    step = 3
                  })
                  .catch((error) => {
                    //console.error(error)
                    // Error: Order would trigger immediately
                    // Sell the bag at market price
                    var log_report = " SELLING AT MARKET PRICE "
                    report.text = add_status_to_trade_report(trade, log_report)
                    client.order({
                      symbol: default_pair,
                      side: 'SELL',
                      type: 'MARKET',
                      quantity: buy_amount,
                      recvWindow: 1000000
                    })
                    .then((order) => {
                      step = 0
                      var log_report = chalk.magenta(" PRICE BELLOW LOSS PRICE THE BOT SOLD AT MARKET PRICE #789")
                      report.text = add_status_to_trade_report(trade, log_report)
                      order_id = 0
                      buy_price  = 0.00
                      stop_price = 0.00
                      loss_price = 0.00
                      sell_price = 0.00
                      tot_cancel = 0
                      report.succeed()
                      clean_trades()
                      ask_buy_or_change()
                    })
                    .catch((error) => {
                      step = 0
                      pnl = 100.00*(buy_price - trade.price)/buy_price
                      var log_report = chalk.magenta(" STOP LOSS PRICE REACHED THE BOT TRIED TO SELL EVERYTHING AT MARKET PRICE #651 ")
                      report.text = add_status_to_trade_report(trade, log_report)
                      order_id = 0
                      buy_price  = 0.00
                      stop_price = 0.00
                      loss_price = 0.00
                      sell_price = 0.00
                      tot_cancel = 0
                      report.succeed()
                      clean_trades()
                      ask_buy_or_change()
                    })
                  })
                })
              }

              // SWITCH PRICE REACHED SETTING UP SELL FOR PROFIT ORDER
              if ( order_id && (step === 3) && (trade.price > switch_price) ) {
                step = 99
                var log_report = " CANCEL STOP LOSS AND GO FOR PROFIT "
                report.text = add_status_to_trade_report(trade, log_report)
                tot_cancel = tot_cancel + 1
                client.cancelOrder({
                  symbol: default_pair,
                  orderId: order_id,
                  recvWindow: 1000000
                })
                .then(() => {
                  client.order({
                    symbol: default_pair,
                    side: 'SELL',
                    quantity: buy_amount,
                    price: sell_price,
                    recvWindow: 1000000
                  })
                  .then((order) => {
                    step = 5
                    order_id = order.orderId
                    var log_report = " SELL ORDER READY "
                    report.text = add_status_to_trade_report(trade, log_report)
                  })
                  .catch((error) => {
                    var log_report = chalk.magenta(" WE LOST THIS ONE 5 ")
                    report.text = add_status_to_trade_report(trade, log_report)
                    //console.error(error)
                    client.getOrder({
                      symbol: default_pair,
                      orderId: order_id,
                      recvWindow: 1000000
                    })
                    .then( (order_result) => {
                      //console.log(JSON.stringify(order_result))
                      order_id = 0
                      buy_price  = 0.00
                      stop_price = 0.00
                      loss_price = 0.00
                      sell_price = 0.00
                      tot_cancel = 0
                      report.succeed()
                      clean_trades()
                      ask_buy_or_change()
                    })
                    .catch((error) => {
                      console.error("ERROR 10 " + error)
                    })
                  })
                })
                .catch((error) => {
                  //console.log("  --- error 2 ---")
                  //console.error(error)
                  var log_report = chalk.magenta(" STOP LOSS EXECUTED #456 ")
                  report.text = add_status_to_trade_report(trade, log_report)
                  client.getOrder({
                    symbol: default_pair,
                    orderId: order_id,
                    recvWindow: 1000000
                  })
                  .then( (order_result) => {
                    //console.log(JSON.stringify(order_result))
                    order_id = 0
                    buy_price  = 0.00
                    stop_price = 0.00
                    loss_price = 0.00
                    sell_price = 0.00
                    tot_cancel = 0
                    report.succeed()
                    clean_trades()
                    ask_buy_or_change()
                  })
                  .catch((error) => {
                    console.error("ERROR 11 " + error)
                  })
                })
              }

              // PRICE BELLOW BUY PRICE SETTING UP STOP LOSS ORDER
              if ( order_id && (step === 5) && (trade.price < buy_price) ) {
                step = 99
                var log_report = " CANCEL PROFIT AND SETTING UP STOP LOSS NOW (2) !!! "
                report.text = add_status_to_trade_report(trade, log_report)
                tot_cancel = tot_cancel + 1
                client.cancelOrder({
                  symbol: default_pair,
                  orderId: order_id,
                  recvWindow: 1000000
                })
                .then(() => {
                  client.order({
                    symbol: default_pair,
                    side: 'SELL',
                    type: 'STOP_LOSS_LIMIT',
                    stopPrice: stop_price,
                    quantity: buy_amount,
                    price: loss_price,
                    recvWindow: 1000000
                  })
                  .then((order) => {
                    order_id = order.orderId
                    var log_report = " STOP LOSS READY (2) "
                    report.text = add_status_to_trade_report(trade, log_report)
                    step = 3
                  })
                  .catch((error) => {
                    //console.error(error)
                    // Error: Order would trigger immediately
                    // Sell the bag at market price
                    var log_report = " SELLING AT MARKET PRICE (2)"
                    report.text = add_status_to_trade_report(trade, log_report)
                    client.order({
                      symbol: default_pair,
                      side: 'SELL',
                      type: 'MARKET',
                      quantity: buy_amount,
                      recvWindow: 1000000
                    })
                    .then((order) => {
                      step = 0
                      var log_report = chalk.magenta(" LOSS PRICE REACHED THE BOT SOLD AT MARKET PRICE #111")
                      report.text = add_status_to_trade_report(trade, log_report)
                      order_id = 0
                      buy_price  = 0.00
                      stop_price = 0.00
                      loss_price = 0.00
                      sell_price = 0.00
                      tot_cancel = 0
                      report.succeed()
                      clean_trades()
                      ask_buy_or_change()
                    })
                    .catch((error) => {
                      step = 0
                      pnl = 100.00*(buy_price - trade.price)/buy_price
                      var log_report = chalk.magenta(" LOSS PRICE REACHED THE BOT TRIED TO SELL EVERYTHING AT MARKET PRICE #333 ")
                      report.text = add_status_to_trade_report(trade, log_report)
                      order_id = 0
                      buy_price  = 0.00
                      stop_price = 0.00
                      loss_price = 0.00
                      sell_price = 0.00
                      tot_cancel = 0
                      report.succeed()
                      clean_trades()
                      ask_buy_or_change()
                    })
                  })
                })
                .catch((error) => {
                  console.error("ERROR 4 " + error)
                  step = 5
                })
              }

              // CURRENT PRICE REACHED SELL PRICE
              if ( order_id && (step === 5) && (trade.price >= sell_price) ) {
                step = 99
                client.getOrder({
                  symbol: default_pair,
                  orderId: order_id,
                  recvWindow: 1000000
                })
                .then( (order_result) => {
                  if ( parseFloat(order_result.executedQty) < parseFloat(order_result.origQty) ) {
                    var log_report = " PROFIT PRICE REACHED BUT NOT ALL EXECUTED -> " + order_result.executedQty + " / " + order_result.origQty
                    report.text = add_status_to_trade_report(trade, log_report)
                    step = 5
                  }
                  else {
                    step = 0
                    pnl = 100.00*(trade.price - buy_price)/buy_price
                    var log_report = chalk.greenBright(" 🐬 !!! WE HAVE A WINNER !!! 🐬 THE BOT SOLD EVERYTHING AT PROFIT")
                    report.text = add_status_to_trade_report(trade, log_report)
                    order_id = 0
                    buy_price  = 0.00
                    stop_price = 0.00
                    loss_price = 0.00
                    sell_price = 0.00
                    tot_cancel = 0
                    report.succeed()
                    clean_trades()
                    ask_buy_or_change() 
                  }
                })
                .catch((error) => {
                  console.error("ERROR 8 " + error)
                })
              }

              // CURRENT PRICE REACHED STOP PRICE
              if ( order_id && (step === 3) && (trade.price <= stop_price) ) {
                step = 99
                client.getOrder({
                  symbol: default_pair,
                  orderId: order_id,
                  recvWindow: 1000000
                })
                .then( (order_result) => {
                  if ( parseFloat(order_result.executedQty) < parseFloat(order_result.origQty) ) {
                    var log_report = " STOP PRICE REACHED BUT NOT ALL EXECUTED -> " + order_result.executedQty + " / " + order_result.origQty
                    report.text = add_status_to_trade_report(trade, log_report)
                    step = 5
                  }
                  else {
                    step = 0
                    pnl = 100.00*(buy_price - trade.price)/buy_price
                    var log_report = chalk.magenta(" LOSS PRICE REACHED THE BOT SOLD EVERYTHING SUCCESSFULLY #746")
                    report.text = add_status_to_trade_report(trade, log_report)
                    order_id = 0
                    buy_price  = 0.00
                    stop_price = 0.00
                    loss_price = 0.00
                    sell_price = 0.00
                    tot_cancel = 0
                    report.succeed()
                    clean_trades()
                    ask_buy_or_change()
                  }
                })
                .catch((error) => {
                  console.error("ERROR 9 " + error)
                })
              }

            })
          })
          .catch( error => {
            //console.error(error)
            report.fail(chalk.yellow("There was an issue processing the Buy Order. Verify the minimum amount was reached and you have the amount on your account."))
            ask_buy_info()
          })
        })

      })
    }
    else {
      ask_buy_or_change()
    }
  })
}

add_status_to_trade_report = (trade, status) => {
  var pnl = 100.00*(parseFloat(trade.price)-buy_price)/buy_price
  return chalk.grey(moment().format('h:mm:ss').padStart(8))
    + chalk.yellow(trade.symbol.padStart(10))
    + (!trade.maker?chalk.green((chalk.grey("qty:")+numeral(trade.quantity).format("0.000")).padStart(24)):chalk.red((chalk.grey("qty:")+numeral(trade.quantity).format("0.000")).padStart(24)))
    + chalk.grey(" @ ") + chalk.cyan(trade.price).padEnd(24)
    + ((pnl >= 0)?chalk.green((chalk.grey("pnl:")+numeral(pnl).format("0.000")).padStart(16)):chalk.red((chalk.grey("pnl:")+numeral(pnl).format("0.000")).padStart(16)))
    + chalk.white(status)
}

const run = async () => {
  ask_default_pair()
}

run()
