#!/usr/bin/env node

/* ============================================================
 * node-binance-trader
 * https://github.com/jsappme/node-binance-trader
 * ============================================================
 * Copyright 2018, Herve Fulchiron - herve76@gmail.com
 * Released under the MIT License
 * v0.0.4 - 🐬 delphines 🐬
 * 6/16/2018
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

let pnl = 0
let step = 0
let trade_count = 0
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

const buy_bid_price_trial_max = 5

//////////////////////////////////////////////////////////////////////////////////

// Binance API initialization //
const client = binance({apiKey: APIKEY, apiSecret: APISECRET})

const conf = new Configstore('nbt')
let default_pair    = conf.get('nbt.default_pair')?conf.get('nbt.default_pair'):"BTCUSDT"
let buy_amount      = conf.get('nbt.buy_amount')?parseFloat(conf.get('nbt.buy_amount')):1.00
let profit_pourcent = conf.get('nbt.profit_pourcent')?conf.get('nbt.profit_pourcent'):0.80
let loss_pourcent   = conf.get('nbt.loss_pourcent')?conf.get('nbt.loss_pourcent'):0.40

clear()

console.log(chalk.yellow(figlet.textSync('_N_B_T_', { horizontalLayout: 'fitted' })))
console.log(' ')
console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
console.log(" 🐬 ".padEnd(10) + chalk.bold.underline.cyan('Node Binance Trader') + " 🐬 ".padStart(11))
console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
console.log(' ')
console.log(chalk.yellow('     USE THIS APP AT YOUR OWN RISK  '))
console.log(' ')

var buy_info_request = [
  {
    type: 'input',
    name: 'pair',
    message: chalk.cyan('What pair would you like to trade?'),
    default: default_pair
  },
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
    message: chalk.hex('#FF6347')('Enter the stop loss percentage:'),
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
    message: chalk.hex('#3CB371')('Enter the profit percentage:'),
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

const report = ora(chalk.grey('Starting the trade...'))

ask_trade_info = () => {
  inquirer.prompt(buy_info_request).then(answers => {

    conf.set('nbt.default_pair', answers.pair.toUpperCase())
    conf.set('nbt.buy_amount', answers.buy_amount)
    conf.set('nbt.profit_pourcent', answers.profit_pourcent)
    conf.set('nbt.loss_pourcent', answers.loss_pourcent)

    default_pair    = answers.pair.toUpperCase()
    buy_amount      = parseFloat(answers.buy_amount)
    profit_pourcent = answers.profit_pourcent
    loss_pourcent   = answers.loss_pourcent

    buy_info_request[0].default  = default_pair
    buy_info_request[1].default  = buy_amount
    buy_info_request[2].default  = loss_pourcent
    buy_info_request[3].default  = profit_pourcent

    // ORDER CONFIRMED BY USER, LET'S HAVE FUN:
    if (answers.confirm) {

      step = 1
      report.text = ""
      report.start()

      // FIND OUT IF PAIR EXISTS AND THE PAIR QUOTE PRECISION:
      client.exchangeInfo().then(results => {

        // CHECK IF PAIR IS UNKNOWN:
        if (_.filter(results.symbols, {symbol: default_pair}).length > 0) {
          precision = _.filter(results.symbols, {symbol: default_pair})[0].filters[0].tickSize.indexOf("1") - 1

          // GET ORDER BOOK
          client.book({ symbol: default_pair }).then(results => {

            // SO WE CAN TRY TO BUY AT THE 1ST BID PRICE + %0.02:
            buy_price = parseFloat(results.bids[0].price) * 1.0002
            console.log(chalk.grey(" INITIAL BUY ORDER PRICE (1st BID + %0.02) : " + buy_price))
            client.order({
              symbol: default_pair,
              side: 'BUY',
              quantity: buy_amount,
              price: buy_price.toFixed(precision),
              recvWindow: 1000000
            })
            .then( (order_result) => {

              order_id = order_result.orderId
              /*
              var log_report = chalk.grey(moment().format('h:mm:ss').padStart(8))
              + chalk.yellow(default_pair.padStart(10))
              + chalk.gray(" INITIAL BUY ORDER SET " + buy_price)
              report.text = log_report
              */
              process.stdin.resume()
              process.stdin.setRawMode(true)
              console.log(chalk.grey(" Press [ CTRL + c ] or q to exit. "))

              checkOrderStatus(1)

              const curr_trade = trade_count
              const clean_trades = client.ws.trades([default_pair], trade => {

                if (curr_trade !== trade_count) clean_trades()
                report.text = add_status_to_trade_report(trade, '')

                // SWITCH PRICE REACHED SETTING UP SELL FOR PROFIT ORDER
                if ( order_id && (step === 3) && (trade.price > switch_price) ) {
                  step = 99
                  console.log(chalk.grey(" CANCEL STOP LOSS AND GO FOR PROFIT "))
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
                      var log_report = chalk.grey(" SELL ORDER READY ")
                      console.log(log_report)
                    })
                    .catch((error) => {
                      var log_report = chalk.magenta(" ERROR #555 ")
                      console.error(log_report + error)
                    })
                  })
                  .catch((error) => {
                    console.log(" ERROR #547 ")
                    console.error(error)
                  })
                }

                // PRICE BELLOW BUY PRICE SETTING UP STOP LOSS ORDER
                if ( order_id && (step === 5) && (trade.price < buy_price) ) {
                  step = 99
                  console.log(chalk.grey(" CANCEL PROFIT SETTING UP STOP LOSS "))
                  tot_cancel = tot_cancel + 1
                  client.cancelOrder({
                    symbol: default_pair,
                    orderId: order_id,
                    recvWindow: 1000000
                  })
                  .then(() => {
                    set_stop_loss_order()
                  })
                  .catch((error) => {
                    pnl = 100.00*(buy_price - trade.price)/buy_price
                    var log_report = chalk.magenta(" LOSS PRICE REACHED THE BOT SHOULD HAVE SOLD EVERYTHING #454 ")
                    //report.text = add_status_to_trade_report(trade, log_report)
                    report.fail(add_status_to_trade_report(trade, log_report))
                    reset_trade()
                    setTimeout( () => { ask_trade_info(), 1000 } )
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
                      var log_report = chalk.grey(" PROFIT PRICE REACHED BUT NOT ALL EXECUTED " + order_result.executedQty )
                      report.text = add_status_to_trade_report(trade, log_report)
                      step = 5
                    }
                    else {
                      clean_trades()
                      pnl = 100.00*(trade.price - buy_price)/buy_price
                      var log_report = chalk.greenBright(" 🐬 !!! WE HAVE A WINNER !!! 🐬 ")
                      report.text = add_status_to_trade_report(trade, log_report)
                      reset_trade()
                      report.succeed()
                      setTimeout( () => { ask_trade_info(), 1000 } )
                    }
                  })
                  .catch((error) => {
                    console.error(" ERROR 8 " + error)
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
                      var log_report = chalk.grey(" STOP PRICE REACHED BUT NOT ALL EXECUTED " + order_result.executedQty )
                      report.text = add_status_to_trade_report(trade, log_report)
                      step = 5
                    }
                    else {
                      clean_trades()
                      pnl = 100.00*(buy_price - trade.price)/buy_price
                      var log_report = chalk.magenta(" STOP LOSS ALL EXECUTED")
                      report.text = add_status_to_trade_report(trade, log_report)
                      reset_trade()
                      report.succeed()
                      setTimeout( () => { ask_trade_info(), 1400 } )
                    }
                  })
                  .catch((error) => {
                    console.error(" API ERROR #9 " + error)
                    clean_trades()
                    pnl = 100.00*(buy_price - trade.price)/buy_price
                    var log_report = chalk.magenta(" TRADE STOPPED ")
                    report.text = add_status_to_trade_report(trade, log_report)
                    reset_trade()
                    report.fail()
                    setTimeout( () => { ask_trade_info(), 1400 } )
                  })
                }

              })
            })
            .catch((error) => {
              //console.error(error)
              report.fail(chalk.yellow("Verify the minimum amount was reached (min. value should be more than 10 USD) and you have this amount available on your balance."))
              ask_trade_info()
            })
          })
        }
        // PAIR UNKNOWN:
        else {
          report.fail(chalk.yellow(default_pair + "  => This pair is unknown to Binance. Please try another one."))
          ask_trade_info()
        }
      })
    }
    // NO ORDER CONFIRMATION, ASK FOR INPUTS AGAIN:
    else {
      ask_trade_info()
    }
  })
}

sell_at_market_price = () => {
  console.log(chalk.keyword('orange')(" SELLING AT MARKET PRICE "))
  client.order({
    symbol: default_pair,
    side: 'SELL',
    type: 'MARKET',
    quantity: buy_amount,
    recvWindow: 1000000
  })
  .then( order => {
    reset_trade()
    report.succeed( chalk.magenta(" THE BOT SOLD AT MARKET PRICE #777 ") )
    setTimeout( () => { ask_trade_info(), 2500 } )
  })
  .catch( error => {
    report.fail( " ERROR #7771 " + buy_amount + " :: " + error )
    reset_trade()
    setTimeout( () => { ask_trade_info(), 2500 } )
  })
}

checkOrderStatus = (i) => {
  setTimeout( () => {
    client.getOrder({
      symbol: default_pair,
      orderId: order_id,
      recvWindow: 1000000
    })
    .then( (order_result) => {
      if ( parseFloat(order_result.executedQty) < parseFloat(order_result.origQty) ) {
        console.log(chalk.grey(" NOT ALL AMOUNT EXECUTED (" + i + ") " + order_result.executedQty ))
        if (i > buy_bid_price_trial_max) {
          // WE TRIED TO BUY AT THE FIRST BID PRICE BUT IT WAS NOT EXECUTED IN TIME:
          client.cancelOrder({
            symbol: default_pair,
            orderId: order_result.orderId,
            recvWindow: 1000000
          })
          .then( (order) => {
            if (parseFloat(order_result.executedQty) === 0.00) {
              console.log(chalk.grey(" NOTHING WAS EXECUTED "))
              // SETUP MARKET BUY ORDER
              client.order({
                symbol: default_pair,
                side: 'BUY',
                type: 'MARKET',
                quantity: buy_amount,
                recvWindow: 1000000
              })
              .then((order) => {
                order_id = order.orderId
                console.log(chalk.grey(" BUY MARKET ORDER SET "))
                check_market_buy_order()
              })
              .catch((error) => {
                console.error(" BUY MARKET ERROR " + error)
              })
            }
            else {
              console.log(chalk.grey(" WE KEEP GOING WITH PARTIAL FILLED AMOUNT "))
              client.getOrder({ symbol: default_pair, orderId: order_id, recvWindow: 1000000 }).then( order => {
                buy_amount = parseFloat(order.executedQty)
                buy_price = parseFloat(order.price)
                console.log(chalk.grey(" FINAL BUY PRICE ") + chalk.cyan(buy_price))
                switch_price = (buy_price + (buy_price * 0.005 * profit_pourcent)).toFixed(precision)
                stop_price = (buy_price - (buy_price * 0.010 * loss_pourcent)).toFixed(precision)
                loss_price = (stop_price - (stop_price * 0.040)).toFixed(precision)
                sell_price = (buy_price + (buy_price * 0.010 * profit_pourcent)).toFixed(precision)
                set_stop_loss_order()
              })
            }

          })
          .catch((error) => {
            console.error(" ORDER CANCELLING ERROR " + error)
            client.myTrades({ symbol: default_pair, recvWindow: 1000000, limit: 1 }).then( mytrade => {
              buy_price = parseFloat(mytrade[0].price)
              console.log(chalk.gray(" FINAL BUY PRICE ::: ") + chalk.cyan(buy_price))
              switch_price = (buy_price + (buy_price * 0.005 * profit_pourcent)).toFixed(precision)
              stop_price = (buy_price - (buy_price * 0.010 * loss_pourcent)).toFixed(precision)
              loss_price = (stop_price - (stop_price * 0.040)).toFixed(precision)
              sell_price = (buy_price + (buy_price * 0.010 * profit_pourcent)).toFixed(precision)
              set_stop_loss_order()
            })
          })
        }
        else {
          checkOrderStatus(i+1)
        }
      }
      else {
        var log_report = chalk.grey(" ALL AMOUNT EXECUTED ")
        console.log(log_report)
        client.myTrades({ symbol: default_pair, recvWindow: 1000000, limit: 1 }).then( mytrade => {
          buy_price = parseFloat(mytrade[0].price)
          switch_price = (buy_price + (buy_price * 0.005 * profit_pourcent)).toFixed(precision)
          stop_price = (buy_price - (buy_price * 0.010 * loss_pourcent)).toFixed(precision)
          loss_price = (stop_price - (stop_price * 0.040)).toFixed(precision)
          sell_price = (buy_price + (buy_price * 0.010 * profit_pourcent)).toFixed(precision)
          console.log(chalk.gray(" FINAL BUY PRICE ::: ") + chalk.cyan(buy_price))
          set_stop_loss_order()
        })
      }
    })
    .catch((error) => {
      console.error("API ERROR #12 " + error)
      client.myTrades({ symbol: default_pair, recvWindow: 1000000, limit: 1 }).then( mytrade => {
        buy_price = parseFloat(mytrade[0].price)
        console.log(chalk.gray(" FINAL BUY PRICE ::: ") + chalk.cyan(buy_price))
        switch_price = (buy_price + (buy_price * 0.005 * profit_pourcent)).toFixed(precision)
        stop_price = (buy_price - (buy_price * 0.010 * loss_pourcent)).toFixed(precision)
        loss_price = (stop_price - (stop_price * 0.040)).toFixed(precision)
        sell_price = (buy_price + (buy_price * 0.010 * profit_pourcent)).toFixed(precision)
        set_stop_loss_order()
      })
    })
  }, 1000)
}

check_market_buy_order = () => {
  client.getOrder({ symbol: default_pair, orderId: order_id, recvWindow: 1000000 })
  .then( order => {
    if (order.status === "FILLED") {
      console.log(chalk.gray(" MARKET BUY ORDER FILLED "))
      client.myTrades({ symbol: default_pair, recvWindow: 1000000, limit: 1 }).then( mytrade => {
        buy_price = parseFloat(mytrade[0].price)
        console.log(chalk.gray(" FINAL BUY PRICE ::: ") + chalk.cyan(buy_price))
        switch_price = (buy_price + (buy_price * 0.005 * profit_pourcent)).toFixed(precision)
        stop_price = (buy_price - (buy_price * 0.010 * loss_pourcent)).toFixed(precision)
        loss_price = (stop_price - (stop_price * 0.040)).toFixed(precision)
        sell_price = (buy_price + (buy_price * 0.010 * profit_pourcent)).toFixed(precision)
        set_stop_loss_order()
      })
    }
    else {
      console.log(chalk.gray(" MARKET BUY ORDER NOT YET FILLED "))
      check_market_buy_order()
    }
  })
}

set_stop_loss_order = () => {
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
    var log_report = chalk.grey(" STOP LOSS READY (" + tot_cancel + ") ") + chalk.cyan(stop_price)
    console.log(log_report)
    step = 3
  })
  .catch((error) => {
    console.error(" ERRROR #1233 " + error )
    sell_at_market_price()
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

reset_trade = () => {
  step = 0
  trade_count = trade_count + 1
  order_id = 0
  buy_price  = 0.00
  stop_price = 0.00
  loss_price = 0.00
  sell_price = 0.00
  tot_cancel = 0
}

////////////////////////////////////////////////////////////////////
// LISTEN TO KEYBOARD AND STOP THE TRADE IF (CRTL + C) OR Q PRESSED
process.stdin.setEncoding( 'utf8' )
process.stdin.on('keypress', ( key ) => {
  if ( (key === '\u0003') || (key === 'q') ) {
    if (order_id) {
      trade_count = trade_count + 1
      console.log(" --- STOPPING THE TRADE ---  ")
      client.cancelOrder({
        symbol: default_pair,
        orderId: order_id,
        recvWindow: 1000000
      })
      .then( (order) => {
        console.log(" CURRENT ORDER CANCELED ")
        client.getOrder({
          symbol: default_pair,
          orderId: order_id,
          recvWindow: 1000000
        })
        .then( (order_result) => {
          if (order_result.status === "FILLED") {
            console.log("PREV ORDER FILLED")
            sell_at_market_price()
          }
          else if (order_result.status === "PARTIALLY_FILLED") {
            console.log("PREV ORDER PARTIALLY_FILLED")
            if (order_result.side === "BUY") {
              buy_amount = parseFloat(order_result.executedQty)
              sell_at_market_price()
            }
            else {
              buy_amount = parseFloat(order_result.origQty) - parseFloat(order_result.executedQty)
              sell_at_market_price()
            }
          }
          else if (order_result.status === "CANCELED") {
            if (order_result.side === "SELL") {
              sell_at_market_price()
            }
            else {
              reset_trade()
              report.succeed( chalk.magenta(" THE BOT STOPPED THE TRADE #3365 ") )
              setTimeout( () => { ask_trade_info(), 2500 } )
            }
          }
        })
        .catch((error) => {
          console.error(" GET FINAL ORDER ERROR : " + order_id + " : " + error)
          sell_at_market_price()
        })
      })
      .catch((error) => {
        console.error(" FINAL CANCEL ERROR : " + order_id + " : " + error)
        sell_at_market_price()
      })
    }
  }
})
////////////////////////////////////////////////////////////////////

const run = async () => {
  ask_trade_info()
}

run()
