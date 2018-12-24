<h1 align="center">
  <br>
  <img src="nbt_demo.gif">
</h1>

<h4 align="center">Better-Node-Binance-Trader</h4>

<h3 align="center">Use at own risk!</h3>

<h4 align="center">An efficient cryptocurrency trading bot command line framework for Binance using Node.js</h4>

<h4 align="center">
🙏  If you’re feeling generous or simply want show your support 🙏 <br>
 you can buy me a 🍻  by sending me a BNB tip at 0x7d6016c189192ae6527c590679083acf42b21e11
</h4>

# Time to upgrade your crypto trading 🤔

My name is Nillo Felix and i saw this project from Herve Fulchiron, but because it wasn't updated that often, i forked it, and decided to make my own version. Thats about it.

Here is the article that comes with the original project: <a href="https://jsapp.me/how-to-build-an-efficient-trading-bot-for-binance-using-node-js-43d5fd174f8b" target="_blank">How to build an efficient trading bot for Binance using Node.js</a>

# What is Node-Binance-Trader? 📡

Today NBT is a trading bot console app that will:

-   ask which currency you want to use to buy the wanted currency
-   ask for the budget for the trade
-   ask which currency you want to buy
-   ask for buying method: market price, bid price or fixed buy price
-   ask for selling method: trailing stop loss or maximum loss n profit percentages.
-   automatically auto trade the whole operation as fast and efficient as possible.
-   stop the trade and sell everything at the current market price if the user pressed q or CTRL+c.

# What more will this do 📡

-   keep beeing updated
-   Allow deamon mode (bypass questions at start by adding params to start command)
-   Use signals from twitter accounts to initialise trading
-   Trade multiple coins at once
-   Recovery mode (If process is abrupted and order is still available, order can pick up where it was abrupted)
-   History (A history of the trades that where made)
-   Bypass sell all at market price ( I have no clue why this was here :P ) so forcefully.

# Requirements

-   A Binance Account with some BNB available to pay for the trading fees.
-   [Git](https://git-scm.com/download/)
-   [Node.JS v9 min.](http://nodejs.org)

# Installation 📦

```
git clone https://github.com/jsappme/node-binance-trader
cd node-binance-trader
yarn (must have yarn installed, if you prefer npm use npm)
```

# Configuration 🛠️

1. Signup Binance ( Referral url: https://www.binance.com/?ref=36145529 )
2. Enable Two-factor Authentication
3. Go API Center, https://www.binance.com/userCenter/createApi.html
4. Create New Key
   [✓] Read Info [✓] Enable Trading [X] Enable Withdrawals
5. Copy the API key and secret to index.js

# Usage ⚡️

```
yarn start
```

# Roadmap 🚧

-   ✔️ Stop Loss + Take Profit Trading Execution
-   ✔️ Trailing Stop Loss
-   Add TA signals
-   Add AI/ML "brain" signals and risk mgmt

# Disclaimer 📖

```
I am not responsible for anything done with this bot.
You use it at your own risk.
There are no warranties or guarantees expressed or implied.
You assume all responsibility and liability.
```

# Final Notes 🙏

Feel free to fork and add new pull request to this repo.
If you have any questions/suggestions, please feel free to <a href="mailto:bbnillotrader@gmail.com" target="_blank">contact me</a>.

If this repo helped you in any way, you can always leave me a BNB tip at 0x7d6016c189192ae6527c590679083acf42b21e11
