<h1 align="center">
  <br>
  <img src="nbt_demo.gif">
</h1>

<h4 align="center">Node-Binance-Trader</h4>

<p align="center">
  <a href="https://discord.gg/4EQrEgj"><img alt="Discord chat" src="Discord_button.png" /></a>
</p>

<h4 align="center">An efficient cryptocurrency trading bot command line framework for Binance using Node.js</h4>

<p align="center">
  <img alt="Discord chat" src="Screenshot.png" />
  Screenshot of my trading setup: the Binance Desktop app plus NBT on a floating iTerm2 console.
</p>

<h4 align="center">
🙏  If you’re feeling generous or simply want show your support, you can buy me a 🍻  by sending me a quick <a href="https://www.paypal.me/jsappme">PayPal</a> payment. 🙏
</h4>

# Time to upgrade your crypto trading 🤔

My name is Herve Fulchiron, I’m a passionate full stack JS engineer and a cryptocurrency enthusiast/trader. I mostly use <a href="https://www.binance.com/?ref=10177791" target="_blank">Binance</a> for my cryptocurrency trading. Like most of the people I used to trade manually via the Binance website. I was slow to execute and beating the market gets more difficult every days.  It was time to upgrade my trading execution. Console apps run on the Terminal (or Command Prompt), and they provide an easy and efficient way to execute difficult tasks like **low latency cryptocurrency trading**. The minimalism of the graphical interface give them an edge on the speed of execution vs. manual retail trading.

Here is the article that comes with this repository: <a href="https://jsapp.me/how-to-build-an-efficient-trading-bot-for-binance-using-node-js-43d5fd174f8b" target="_blank">How to build an efficient trading bot for Binance using Node.js</a>

# What is Node-Binance-Trader? 📡

Today NBT is a trading bot console app that will:

* ask which currency you want to use to buy the wanted currency
* ask for the budget for the trade
* ask which currency you want to buy
* ask for buying method: market price, bid price or fixed buy price
* ask for selling method: trailing stop loss or maximum loss n profit percentages.
* automatically auto trade the whole operation as fast and efficient as possible.
* stop the trade and sell everything at the current market price if the user pressed q or CTRL+c.

# Requirements

* A Binance Account with some BNB available to pay for the trading fees.
* [Git](https://git-scm.com/download/)
* [Node.JS v8 min.](http://nodejs.org)

# Installation 📦

```
git clone https://github.com/jsappme/node-binance-trader
cd node-binance-trader
npm i
npm i -g
```

# Configuration 🛠️

1. Signup Binance ( Referral url: https://www.binance.com/?ref=10177791 )
2. Enable Two-factor Authentication    
3. Go API Center, https://www.binance.com/userCenter/createApi.html
4. Create New Key
        [✓] Read Info [✓] Enable Trading [X] Enable Withdrawals
5. Copy the API key and secret to index.js

# Usage ⚡️

```
node index.js
```
or simply:

```
nbt
```

# Roadmap 🚧

* ✔️  Stop Loss + Take Profit Trading Execution
* ✔️  Trailing Stop Loss
* Add TA signals
* Add AI/ML "brain" signals and risk mgmt


# Disclaimer 📖

```
I am not responsible for anything done with this bot.
You use it at your own risk.
There are no warranties or guarantees expressed or implied.
You assume all responsibility and liability.
```

# Final Notes 🙏

Feel free to fork and add new pull request to this repo.
If you have any questions/suggestions, or simply you need some help building your trading bot, or mining historical data or improving your strategies using the latest AI/ML algorithms, please feel free to <a href="mailto:herve76@gmail.com" target="_blank">contact me</a>.

If this repo helped you in any way, you can always leave me a BNB tip at 0xf0c499c0accddd52d2f96d8afb6778be0659ee0c

# GETTING IN TOUCH 💬

* **Discord**: [Invite Link](https://discord.gg/4EQrEgj)
