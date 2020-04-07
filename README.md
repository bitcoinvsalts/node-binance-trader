<h1 align="center">Node Binance Trader NBT</h1>

<h6 align="center">Version 0.2.3</h6>

[![Donate NIM](https://www.nimiq.com/accept-donations/img/donationBtnImg/light-blue-small.svg)](https://safe.nimiq.com/#_request/NQ19KM8LP7SGUMFBNHSL4MV4D8M2ULBS4JSF_)

<img src="nbt_diagram.png">

<h4 align="center">NBT is an open cryptocurrency trading bot development framework for the Binance exchange.</h4>

NBT includes 3 main JS scripts:

* the **server**:

  * to track a selection of asset pairs and record all binance api data (candles, depths, trades) into a Postgres database.
  * to detect buy or sell signals
  * (optional) to send trading signals to the NBT Hub / [Bitcoin vs. Altcoins](https://bitcoinvsaltcoins.com) to monitor performances and auto trade those signals (virtually or for real).

* the **trader**:

  * this script allows you to auto trade the signals received from the NBT hub or your own server. this script can run locally or on cloud services like Heroku. This new auto trader script allows you to trade with leverage when the pair is available for margin trading.

* the **backtest** :

  * to backtest your strategies on the historical tick data (Postgres database) recorded by the server.

# Requirements

* [Git](https://git-scm.com/download/) (see if it is already installed with the command: *git --version*)
* [Node.JS](http://nodejs.org) (see if it is already installed with the command: *npm --version*)

# Installation 📦

```
git clone https://github.com/jsappme/node-binance-trader
cd node-binance-trader
npm i --unsafe-perm
```

# Usage ⚡️


**To start the server** to save pair data, define strategies and emit trading signals:
```
npm run start
```

**To start the auto trader** to monitor strategies and signals received from the server or the NBT Hub:
```
npm run trader
```

**To backtest** strategies using the data recorded by the server:
```
npm run bt
```

# Web Socket API specifications 📡

Connect your Node.js script to the NBT hub to monitor the performance of your signals and strategies. 
You can also communicate via the NBT hub to your auto trader to track your traded signals.

**Send a Buy Signal** to the NBT hub:
```
const buy_signal = {
    key: bva_key,
    stratname: stratname,
    pair: pair, 
    buy_price: first_ask_price[pair],
    message: Date.now(),
    stop_profit: Number(stop_profit[pair+signal_key]),
    stop_loss: Number(stop_loss[pair+signal_key]),
}
socket_client.emit("buy_signal", buy_signal)
```

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

<p align="center">
  <a href="https://discord.gg/4EQrEgj"><img alt="Discord chat" src="Discord_button.png" /></a>
</p>
