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

# Why Node-Binance-Trader? 📖

My name is Herve Fulchiron, I’m a passionate full stack JS engineer, and I also trade cryptocurrencies on a weekly basis. I mostly use <a href="https://www.binance.com/?ref=10177791" target="_blank">Binance</a> for my altcoins trading. The high volatility of the crypto market makes it an emotional rollercoster that requires high awareness and constant attention. This demands a lot of time to monitor always more trading pairs and more data to process. Like most of the people I used to trade manually via the Binance website. I was slow to execute and beating the market gets more difficult every days.  It was time to automate my strategy testing and my trading operations. I tried <a href="https://github.com/askmike/gekko" target="_blank">Gekko</a>, it's a nice tool specially for back testing but I wanted something much more simplier, faster, dedicated to Binance, so I could test my strategies as fast and as easy as possible live on the crypto market. I wrote this one simple but efficient node.js script to:

* monitor in real time all the BTC trading pairs on Binance
* apply one or multiple strategies to the live market
* record live performances of those strategies over time
* auto trade the most successful strategies

# What is Node-Binance-Trader? 📡

Today NBT is an experimental node.js script that asynchronosly run api calls and listen to websockets connected to binance. It can track the 100 btc pairs currently available and apply the predefined strategies for testing purposes. This way I can tell if a strategy is working under the actual market conditions very quickly. The buy and sell signals and their performance can be emailed or even notified via a sound. This is still a work in progress so please take it with a grain of salt. I keep optimizing it so it uses as less cpu as possible. 

# Configuration ⚡️

1. Signup Binance ( Referral url: https://www.binance.com/?ref=10177791 )
2. Enable Two-factor Authentication    
3. Go API Center, https://www.binance.com/userCenter/createApi.html
4. Create New Key
        [✓] Read Info [✓] Enable Trading [X] Enable Withdrawals 
5. Copy the API key and secret to index.js