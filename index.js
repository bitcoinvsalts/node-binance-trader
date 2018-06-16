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
const APIKEY = ''
const APISECRET = ''
//////////////////////////////////////////////////////////////////////////////////

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

const buy_bid_price_trial_max = 2

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
console.log(chalk.red('     USE THIS APP AT YOUR OWN RISK  '))
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

ask_buy_info = () => {
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

      const report = ora(chalk.grey('Starting the trade...')).start()
      step = 0

      // FIND OUT IF PAIR EXISTS AND THE PAIR QUOTE PRECISION:
      client.exchangeInfo().then(results => {

        // CHECK IF PAIR IS UNKNOWN:
        if (_.filter(results.symbols, {symbol: default_pair}).length > 0) {

          precision = _.filter(results.symbols, {symbol: default_pair})[0].filters[0].tickSize.indexOf("1") - 1

          client.book({ symbol: default_pair }).then(results => {
            buy_price = parseFloat(results.bids[0].price) * 1.0002
            console.log(chalk.grey(" Initial Buy Price :: " + buy_price))

            // TRY TO BUY AT THE LAST BID PRICE:
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
                + chalk.gray(" INITIAL BUY ORDER SET AT FIRST BID PRICE: " + buy_price)
              report.text = log_report
              step = 1

              // LISTEN TO KEYBOARD AND CLOSE THE TRADE IF (CRTL + C) OR Q PRESSED
              console.log(chalk.grey(" Press [ CTRL + c ] or q to exit. "))
              var stdin = process.stdin
              stdin.setRawMode( true )
              stdin.resume()
              stdin.setEncoding( 'utf8' )
              stdin.on( 'data', ( key ) => {
                if ( (key === '\u0003') || (key === 'q') ) {
                  if (order_id) {
                    stdin.removeAllListeners('data')
                    stdin.pause()
                    // CANCELLING CURRENT RUNNING ORDER
                    console.log(" --- cancelOrder ---  ")
                    client.cancelOrder({
                      symbol: default_pair,
                      orderId: order_id,
                      recvWindow: 1000000
                    })
                    .then( (order) => {
                      console.log(" CURRENT ORDER CANCELED ")
                      sell_at_market_price()
                    })
                    .catch((error) => {
                      console.error(" FINAL CANCEL ERROR : " + order_id + " : " + error)
                      sell_at_market_price()
                    })
                  }
                }
                //WRITE THE KEY TO STDOUT ALL NORMAL LIKE
                //process.stdout.write( key )
              })
              /////////////////////

              sell_at_market_price = () => {
                step = 99
                console.log(chalk.keyword('orange')(" SELLING AT MARKET PRICE NOW "))
                client.order({
                  symbol: default_pair,
                  side: 'SELL',
                  type: 'MARKET',
                  quantity: buy_amount,
                  recvWindow: 1000000
                })
                .then( order => {
                  clean_trades()
                  stdin.removeAllListeners('data')
                  stdin.pause()
                  step = 0
                  order_id = 0
                  buy_price  = 0.00
                  stop_price = 0.00
                  loss_price = 0.00
                  sell_price = 0.00
                  tot_cancel = 0
                  report.succeed( chalk.magenta(" THE BOT SOLD AT MARKET PRICE #777 ") )
                  setTimeout( () => { ask_buy_info(), 1000 } )
                })
                .catch( error => {
                  clean_trades()
                  stdin.removeAllListeners('data')
                  stdin.pause()
                  step = 0
                  order_id = 0
                  buy_price  = 0.00
                  stop_price = 0.00
                  loss_price = 0.00
                  sell_price = 0.00
                  tot_cancel = 0
                  report.fail( " ERROR #7771 " + buy_amount + " :: " + error )
                })
              }

              const clean_trades = client.ws.trades([default_pair], trade => {

                report.text = add_status_to_trade_report(trade, '')

                // CHECK IF INITIAL BUY ORDER HAS BEEN EXECUTED
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
                          var log_report = " AMOUNT NOT ALL EXECUTED "
                          report.text = add_status_to_trade_report(trade, log_report)
                          if (i > buy_bid_price_trial_max) {
                            // WE TRIED TO BUY AT THE FIRST BID PRICE BUT IT WAS NOT EXECUTED IN TIME:
                            client.cancelOrder({
                              symbol: default_pair,
                              orderId: order_result.orderId,
                              recvWindow: 1000000
                            })
                            .then( (order) => {
                              buy_amount = (parseFloat(order_result.origQty) - parseFloat(order_result.executedQty)).toFixed(15)
                              log_report = " BUY ORDER AT MARKET PRICE "
                              report.text = add_status_to_trade_report(trade, log_report)
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
                                var log_report = " BUY MARKET ORDER SET "
                                report.text = add_status_to_trade_report(trade, log_report)
                                buy_amount = parseFloat(order_result.origQty).toFixed(19)
                                step = 2
                              })
                              .catch((error) => {
                                console.error(" BUY MARKET Error... " + error)
                                step = 2
                              })
                            })
                            .catch((error) => {
                              console.error(" Order Cancelling Error... " + error)
                              process.exit()
                            })
                          }
                          else {
                            i++
                            checkOrderStatus()
                          }
                        }
                        else {
                          var log_report = " ALL AMOUNT EXECUTED "
                          report.text = add_status_to_trade_report(trade, log_report)
                          step = 2
                        }
                      })
                      .catch((error) => {
                        //console.error("ERROR 12 " + error)
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
                    console.log(chalk.gray(" BUY PRICE :: " + buy_price))

                    switch_price = (buy_price + (buy_price * 0.005 * profit_pourcent)).toFixed(precision)
                    stop_price = (buy_price - (buy_price * 0.010 * loss_pourcent)).toFixed(precision)
                    loss_price = (stop_price - (stop_price * 0.040)).toFixed(precision)
                    sell_price = (buy_price + (buy_price * 0.010 * profit_pourcent)).toFixed(precision)

                    //var log_report = " SETTING UP STOP LOSS NOW (1) "
                    //report.text = add_status_to_trade_report(trade, log_report)

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
                      console.error(" ERRROR #1233 :: " + buy_amount + " : " + error)
                      sell_at_market_price()
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
                        step = 0
                        clean_trades()
                        stdin.removeAllListeners('data')
                        stdin.pause()
                        order_id = 0
                        buy_price  = 0.00
                        stop_price = 0.00
                        loss_price = 0.00
                        sell_price = 0.00
                        tot_cancel = 0
                        report.succeed()
                        setTimeout( () => { ask_buy_info(), 1000 } )
                      })
                      .catch((error) => {
                        console.error(" ERROR 10 " + error)
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
                      step = 0
                      clean_trades()
                      stdin.removeAllListeners('data')
                      stdin.pause()
                      order_id = 0
                      buy_price  = 0.00
                      stop_price = 0.00
                      loss_price = 0.00
                      sell_price = 0.00
                      tot_cancel = 0
                      report.succeed()
                      setTimeout( () => { ask_buy_info(), 1000 } )
                    })
                    .catch((error) => {
                      console.error(" ERROR 11 " + error)
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
                      sell_at_market_price()
                    })
                  })
                  .catch((error) => {
                    // need to fix: ERROR 4 Error: UNKNOWN_ORDER
                    //console.error("ERROR 4 " + error)
                    //step = 5
                    step = 0
                    clean_trades()
                    stdin.removeAllListeners('data')
                    stdin.pause()
                    pnl = 100.00*(buy_price - trade.price)/buy_price
                    var log_report = chalk.magenta(" LOSS PRICE REACHED THE BOT SOLD EVERYTHING #454 ")
                    report.text = add_status_to_trade_report(trade, log_report)
                    order_id = 0
                    buy_price  = 0.00
                    stop_price = 0.00
                    loss_price = 0.00
                    sell_price = 0.00
                    tot_cancel = 0
                    report.fail()
                    setTimeout( () => { ask_buy_info(), 1000 } )
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
                      clean_trades()
                      stdin.removeAllListeners('data')
                      stdin.pause()
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
                      setTimeout( () => { ask_buy_info(), 1000 } )
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
                      var log_report = " STOP PRICE REACHED BUT NOT ALL EXECUTED -> " + order_result.executedQty + " / " + order_result.origQty
                      report.text = add_status_to_trade_report(trade, log_report)
                      step = 5
                    }
                    else {
                      pnl = 100.00*(buy_price - trade.price)/buy_price
                      // might be a bug here, got this message but bag not sold, need a fix ?!/
                      var log_report = chalk.magenta(" LOSS PRICE REACHED THE BOT SOLD EVERYTHING SUCCESSFULLY #746")
                      report.text = add_status_to_trade_report(trade, log_report)
                      step = 0
                      clean_trades()
                      stdin.removeAllListeners('data')
                      stdin.pause()
                      order_id = 0
                      buy_price  = 0.00
                      stop_price = 0.00
                      loss_price = 0.00
                      sell_price = 0.00
                      tot_cancel = 0
                      report.succeed()
                      setTimeout( () => { ask_buy_info(), 1400 } )
                    }
                  })
                  .catch((error) => {
                    console.error(" ERROR 9 " + error)
                  })
                }

              })


            })
            .catch((error) => {
              console.error(error)
              report.fail(chalk.yellow("There was an issue processing the Market Buy Order. Verify the minimum amount was reached and you have the right amount on your account."))
              ask_buy_info()
            })

          })
        }
        // PAIR UNKNOWN:
        else {
          report.fail(chalk.yellow(default_pair + "  => This pair is unknown to Binance. Please try another one."))
          ask_buy_info()
        }

      })

    }
    // NO ORDER CONFIRMATION, ASK FOR INPUTS AGAIN:
    else {
      ask_buy_info()
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
  ask_buy_info()
}

run()
