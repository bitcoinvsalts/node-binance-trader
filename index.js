#!/usr/bin/env node

const chalk       = require('chalk')
const ora         = require('ora')
const moment      = require('moment')
const numeral     = require('numeral')
const clear       = require('clear')
const figlet      = require('figlet')
const Configstore = require('configstore')
const binance     = require('binance-api-node').default
const inquirer    = require("inquirer")

//////////////////////////////////////////////////////////////////////////////////

// https://www.binance.com/restapipub.html
const APIKEY = ''
const APISECRET = ''

//////////////////////////////////////////////////////////////////////////////////

const budget = 0.01
let tracking = false
let trading = false
let pnl = 0
let tot_trades = 0
let tot_cancel = 0
let step = 0
let order_id = 0
let buy_price  = 0.00
let stop_price = 0.00
let loss_price = 0.00
let sell_price = 0.00
let minute_price = 0.00
let minute_prices = []
let minute_volume = 0.00
let long_min_delta = 0.00
let minute_delta = 0.00
let short_min_delta = 0.00
let last_volume = 9999.00
let last_price = 0.00
let price_direction = 0

//////////////////////////////////////////////////////////////////////////////////

// Binance API initialization //
const client = binance({apiKey: APIKEY, apiSecret: APISECRET})

const conf = new Configstore('nbt')
let default_pair = conf.get('nbt.default_pair')?conf.get('nbt.default_pair'):"BTCUSDT"

clear()

console.log(chalk.yellow(figlet.textSync('_N_B_T_', { horizontalLayout: 'fitted' })))
console.log(' ')
console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
console.log(" 🐬 ".padEnd(10) + chalk.bold.underline.cyan('Node Binance Trader') + " 🐬 ".padStart(11))
console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
console.log(" 🐬 ".padEnd(10) + chalk.italic.cyan('Test Drive Version') + " 🐬 ".padStart(12))
console.log(" 🐬 ".padEnd(5) + chalk.cyan('-------------------------------') + " 🐬 ")
console.log(' ')
console.log(chalk.cyan('Welcome to the test drive of a very basic Binance trading bot.'))
console.log(' ')
console.log(chalk.red('-------------------------------------------------------'))
console.log(chalk.red('   This bot is for education purpose only.'))
console.log(chalk.red('   You are responsible for your own use.'))
console.log(chalk.red('-------------------------------------------------------'))
console.log(' ')
console.log(chalk.cyan('The mission of this bot is to make one simple trade.'))

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
    default_pair_input[0].default = default_pair
    conf.set('nbt.default_pair', default_pair)
    const report = ora('Loading 1 min candles...').start()
    client.candles({ symbol: default_pair })
    .then(candles => { 
      report.text = "Current Price: " + candles[candles.length-1].close
      report.color = 'yellow'
      const clean = client.ws.candles(default_pair, '1m', candle => {
        if (!tracking) {
          tracking = true
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.once('data', function () {
            report.succeed()
            if (tracking) {
              tracking = false
              clean() 
              setTimeout(() => { ask_default_pair() }, 1000 )
            }
          })
        }
        minute_volume = parseFloat(candle.volume)
        minute_price = parseFloat(candle.close)
        minute_prices.unshift(parseFloat(candle.close))
        minute_delta    = (minute_prices.length > 60) ? 100.00*(minute_prices[0]-minute_prices[60])/minute_prices[60] : 100.00*(parseFloat(candle.close)-parseFloat(candle.open))/parseFloat(candle.close)
        short_min_delta = (minute_prices.length > 30) ? 100.00*(minute_prices[0]-minute_prices[30])/minute_prices[30] : 100.00*(parseFloat(candle.close)-parseFloat(candle.open))/parseFloat(candle.close)
        long_min_delta  = (minute_prices.length > 120) ? 100.00*(minute_prices[60]-minute_prices[120])/minute_prices[120] : 100.00*(parseFloat(candle.close)-parseFloat(candle.open))/parseFloat(candle.close)
        price_direction = (parseFloat(candle.close) > last_price) ? 1 : ( (parseFloat(candle.close) < last_price) ? -1 : 0 )
        if (minute_prices.length > 130) minute_prices.pop()
        last_volume = parseFloat(candle.volume)
        last_price = parseFloat(candle.close)
        report.color = 'cyan'
        report.text = moment().format('h:mm:ss')
          + " :: " + ((price_direction===1)?"+":((price_direction===-1)?"-":" ")) + " ::   "
          + numeral(minute_price).format("0.00").padStart(8)
          + " [" + numeral(long_min_delta).format("0.00").padStart(6)
          + "%] [" + numeral(minute_delta).format("0.00").padStart(6)
          + "%] [" + numeral(short_min_delta).format("0.00").padStart(6)
          + "%] :: " + numeral(minute_volume).format("0.00").padStart(6)
          + " :: "
      })
    })
    .catch(error => { 
      report.fail(chalk.yellow("--> Sorry, Invalid Pair!!!")) 
      ask_default_pair()
    })
  })
}

var new_price_request = [
  {
    type: 'confirm',
    name: 'askAgain',
    message: 'Would you like to buy at this price?',
    default: true
  },
]

ask_new_price_request = () => {
  inquirer.prompt(new_price_request).then(answer => {
    if (answer.askAgain) {
      client.candles({ symbol: default_pair })
      .then(candles => { 
        //console.log(JSON.stringify(candles[candles.length-1]))
        console.log('\n--------------------------------------------')
        console.log('Current Price is ' + candles[candles.length-1].close)
        console.log('Current Volume is ' + candles[candles.length-1].volume)
        console.log('Candle - % -> ' + 100.00*(candles[candles.length-1].close-candles[candles.length-1].open)/candles[candles.length-1].open )
        console.log('--------------------------------------------\n')
        ask_new_price_request()
      })
    }
    else {
      process.exit()
    }
  })
}

const run = async () => {
  ask_default_pair()
}

run()
