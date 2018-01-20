<h1 align="center">
  <br>
  <a href="https://jsapp.me" target="_blank"><img src="https://avatars0.githubusercontent.com/u/13439477?s=200&v=4" width="180"></a>
</h1>

<h4 align="center">Node-Binance-Trader</h4>

<p align="center">
  <img src="https://img.shields.io/github/license/jsappme/node-binance-trader.svg">
  <img src="https://img.shields.io/github/stars/jsappme/node-binance-trader.svg">
  <img src="https://img.shields.io/github/issues/jsappme/node-binance-trader.svg">
</p>

<h4 align="center">An efficient cryptocurrency trading bot for Binance using Node.js 💸</h4>

# Why Node-Binance-Trader? 🤔

My name is Herve Fulchiron, I’m a passionate full stack JS engineer, and I also trade cryptocurrencies on a weekly basis. I mostly use <a href="https://www.binance.com/?ref=10177791" target="_blank">Binance</a> for my altcoins trading. The high volatility of the crypto market makes it an emotional rollercoster that requires high awareness and constant attention. This demands a lot of time to monitor always more trading pairs and more data to process. Like most of the people I used to trade manually via the Binance website. I was slow to execute and beating the market gets more difficult every days.  It was time to speed up the testing of my strategies and to automate my trading operations. I tried <a href="https://github.com/askmike/gekko" target="_blank">Gekko</a>, it's a nice tool specially for back testing but I wanted something much more simplier, faster, dedicated to Binance, so I could test my strategies as fast and as easy as possible live on the crypto market. I wrote this one simple but efficient node.js script to:

* monitor in real time all the BTC trading pairs on Binance
* apply one or multiple strategies to the live market
* record live performances of those strategies over time
* auto trade the most successful strategies

# What is Node-Binance-Trader? 📡

Today NBT is an experimental node.js script that asynchronosly run api calls and listen to websockets connected to binance. It can track the 100 btc pairs currently available and apply the predefined strategies for testing purposes. This way I can tell if a strategy is working under the actual market conditions very quickly. The buy and sell signals and their performance can be emailed or even notified via a sound. This is still a work in progress so please take it with a grain of salt. I keep optimizing it so it uses as less cpu as possible. 

# Installation 📦

```
git clone https://github.com/jsappme/node-binance-trader
```

# Configuration 🔑

1. Signup Binance ( Referral url: https://www.binance.com/?ref=10177791 )
2. Enable Two-factor Authentication    
3. Go API Center, https://www.binance.com/userCenter/createApi.html
4. Create New Key
        [✓] Read Info [✓] Enable Trading [X] Enable Withdrawals 
5. Copy the API key and secret to index.js

# Usage ⚡️

```
yarn
yarn start
```
or 

```
npm install
npm run start
```

# Customization 🛠️

To add new strategies to the script, you need to add your own buying/selling conditions by adding new functions to the strategies section in the code.

In the following example, I wrote two strats, one is buying when the Moving Averages are showing the beginning of an hourly and minutely uptrend and the second one is buying when the asking and bidding first prices are very close to each others. This example is for education purpose to show you the use of the different types of data available as of today.

```
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
```

# Roadmap 🚧

* ✔️ All BTC Pair tracking.
* ✔️ Live testing of 1 or n strats.
* Auto Trading.
* Add an AI/ML "brain" to the bot.


# Disclaimer 📖

```
I am not responsible for anything done with this bot. 
You use it at your own risk. 
There are no warranties or guarantees expressed or implied. 
You assume all responsibility and liability.
```

# Final Notes 🙏

Feel free to fork and add new pull request to this repo. 
If you have any questions/suggestions, or simply you need some help building your trading bot, or mining historical data or improving your strategies using the latest AI/ML algorithms, please feel free to <a href="mailto:contact@jsapp.me" target="_blank">contact me</a>.

Special thank you to Jon for his very helpful repo https://github.com/jaggedsoft/node-binance-api 

If this repo helped you in any way, you can always leave me a BNB tip at 0xf0c499c0accddd52d2f96d8afb6778be0659ee0c

