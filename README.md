<h1 align="center">Node Binance Trader a.k.a. NBT</h1>

<h6 align="center">New Version</h6>

<h4 align="center">NBT is an open cryptocurrency trading bot development framework for the Binance exchange.</h4>

NBT includes 3 main scripts:

* a script to run the **server**:

  * to track a selection of asset pairs and record all their binance data (candles, depths, trades) into text files
  * if a buy signal condition is detected, the server will emit a web socket signal to:
    * the concurrent running trader client.
    * (optional) the NBT Hub a.k.a. [Bitcoin vs. Altcoins](https://bitcoinvsaltcoins.com) to rank your signals.

* a script to run the **client / trader**:
  * to follow and compute the PnL for each received signals

* a script to **backtest** your signals

# Requirements

* [Git](https://git-scm.com/download/) (see if it is already installed with the command: *git --version*)
* [Node.JS](http://nodejs.org) (see if it is already installed with the command: *npm --version*)

# Installation 📦

```
git clone https://github.com/jsappme/node-binance-trader
cd node-binance-trader
npm i
```

# Usage ⚡️

Execute the following commands in their own terminal.

**To start the server** to record pair data and generate the trading signals:
```
npm run start
```
**To start the trader/client** to compute the signals received by the trader:

```
npm run trader
```
**To backtest** signals using the data recorded by the server:

```
npm run bt
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
