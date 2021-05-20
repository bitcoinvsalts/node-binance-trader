[![build status](https://github.com/jsappme/node-binance-trader/workflows/CI/badge.svg)](https://github.com/jsappme/node-binance-trader/actions?query=workflow%3ACI "build status")

<h1 align="center">Node Binance Trader NBT</h1>

<h4 align="center">NBT is a Cryptocurrency Trading Strategy & Portfolio Management Development Framework for <a href='https://www.binance.com/en/register?ref=DULNH2ZZ' target="_new">Binance</a>.</h4>

## About this fork

This is a fork of the source NBT repo, however the focus of my changes are on the trader.js. This is the script that receives the buy/sell signals from BVA and executes them on Binance. Apart from this documentation and the trader, nothing else has been changed.

The new features that I have added to the trader include:
* **Auto-balancing**
  * Several options are now available for choosing how much to spend on a trade. Please make sure you fully understand the implications of these before using them, they can provide greater gains but can also cause greater losses.
    * **Default**: This will use the buy quantity that you have configured in BVA, same as the original trader.
    * **Fraction**: This will interpret the buy quantity (that you have configured in BVA) as a fraction of your total balance in Binance. E.g. if you say 0.1 it will use 10% of your balance.
    * **All**: This will use the maximum balance, then re-sell a small portion of every active trade in order to free up funds for the new trades. All active trades will have the same investment. E.g. 4 active trades will use 25% of your balance each, if a 5th trade opens then it will sell a portion from the previous 4 so that all 5 trades are using 20% of your balance.
    * **Largest**: This will use the maximum balance, then re-sell half of the largest trade. E.g. (assuming no minimum) 1 trade will use 100% of your balance, the 2nd trade will sell 50% of the first trade and use that, the 3rd trade will sell 50% of the first trade so now you have 1st @ 25%, 2nd @ 50%, 3rd @ 25% of your total balance. The difference between this and the "All" model is that it only re-sells from a single existing trade whenever a new one comes in, but it does mean that not all trade sizes are equal.
* **Disable Coins**
  * You can provide a comma delimited list of coins that you want to ignore trade signals for.
* **Disable Margin**
  * You can choose to disable trading from your margin wallet, and do everything from spot (this will also disable short trades).
* **Spot Fall Back**
  * If you do not have sufficient funds in your margin wallet, it will automatically try to make the trade from your spot wallet.
* **Comments**
  * I've added extensive comments to the trader.js code to help newbies better understand it themselves.

## Table of contents

1. **[Documentation 📖](#documentation-📖)**
1. **[Technical overview 👨‍💻](#technical-overview-👨‍💻)**
1. **[Disclaimer 📖](#disclaimer-📖)**
1. **[Donate 🙏](#donate-🙏)**
1. **[Getting in touch 💬](#getting-in-touch-💬)**
1. **[Final Notes](#final-notes)**

## Documentation 📖

- **[Quick start guide 🚀](./docs/GETTING-STARTED.md)**: bootstrap using Heroku
- **[Manual setup guide 👨‍💻](./docs/GETTING-STARTED-MANUALLY.md)**: bootstrap using your own client
- **[Web socket API specification 📡](./docs/WEB-SOCKET-API-SPECIFICATION.md)**

## Technical overview 👨‍💻

<img src="docs/images/nbt_diagram.png">

NBT includes 3 main scripts:

* the **server**:

  * to track a selection of asset pairs and record all [Binance](https://www.binance.com/en/register?ref=DULNH2ZZ) api data (candles, depths, trades) into a Postgres database.
  * to detect buy or sell signals
  * (optional) to send trading signals to the NBT Hub / [Bitcoin vs. Altcoins](https://bitcoinvsaltcoins.com) to monitor performances and auto trade those signals (virtually or for real).

* the **trader**: [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/jsappme/node-binance-trader)

  * this script allows you to auto trade the signals received from the NBT hub or your own server. this script can run locally or on cloud services like Heroku. This new auto trader script allows you to trade with leverage when the pair is available for margin trading.

* the **backtest** :

  * to backtest your strategies on the historical tick data (Postgres database) recorded by the server.

## Disclaimer 📖

> No owner or contributor is responsible for anything done with this bot.
> You use it at your own risk.
> There are no warranties or guarantees expressed or implied.
> You assume all responsibility and liability.

## Donate 🙏

**Donations for Spat**

If you like my fork you can always leave me a tip:
* BNB (ERC20) 0xbb2f5e8b145a3c96512b4943d88ed62487f49bff
* USDT (ERC20) 0xbb2f5e8b145a3c96512b4943d88ed62487f49bff
* BTC 1L2NZPK8s7otCHJnn3KHQLfWrL6NUe1uwc

**Donations for herve76 (original creator)**

Refer to <a href="https://github.com/jsappme/node-binance-trader">source repo</a> for latest donation options.

## Getting in touch 💬

* **Discord**: [Invite Link](https://discord.gg/4EQrEgj)

<p align="center">
  <a href="https://discord.gg/4EQrEgj"><img alt="Discord chat" src="docs/images/discord_button.png" /></a>
</p>

## Final Notes

Feel free to fork and add new pull request to this repo.
If you have any questions/suggestions, or simply you need some help building your trading bot, or mining historical data or improving your strategies using the latest AI/ML algorithms, please feel free to <a href="mailto:herve76@gmail.com" target="_blank">contact herve76</a>.