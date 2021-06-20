<h1 align="center">Node Binance Trader (NBT)</h1>

<h4 align="center">NBT is a Cryptocurrency Trading Strategy & Portfolio Management Development Framework for <a href='https://www.binance.com/en-AU/register?ref=141340247' target="_new">Binance</a>.</h4>

## About this fork

This is a fork of the source NBT repo, however the focus of my changes are on the trader.ts and associated components. This is the script that receives the buy/sell signals from the NBT Hub (BitcoinVsAltcoins.com) and executes them on Binance. I have not modified the server.

**Important Note:** Many of the new features (e.g. transaction and balance history) are only held in memory while the trader is running. If the trader restarts then everything will reset. So it is best to ensure that you have reliable uptime on your webserver.

The new features that I have added to the trader include:
* ***CONFIG:* Quantity as Fraction**
  * If enabled, this will interpret the "Quantity to Buy" that you have configured on the NBT Hub as a fraction of your total balance in [Binance](https://www.binance.com/en-AU/register?ref=141340247). E.g. if you say 0.1 BTC it will actually spend 10% of your balance on each trade. However, it will only use the balance from a single wallet, it will not add the two together. This will apply to both SHORT and LONG trades, even though SHORT will not use the actual balance. Both trades will always be calculated relative the **Primary Wallet** (see below), regardless of which wallet is actually chosen to execute the trade.
  * As the funds can be locked up in active trades, the trader will calculate an estimated total balance rather than just using the current free balance. This may not always be exactly right because it uses the original price when the trades were opened, not the current market price.
  * NOTE: It is never a good idea to use 100% of your balance for a single trade. The rule of thumb is about 10%, but you can choose higher or lower depending on your preferred level of risk. The calculated PnL that is displayed on the NBT Hub does not take into consideration the trade quantities. So a strategy with a reported PnL of 500% would only increase your balance by a maximum of 50% if you set the trade quantity to 10%.
* ***CONFIG:* Funding / Auto-Balancing for LONG Trades**
  * Several options are now available for choosing where the funds come from for LONG trades. Please make sure you fully understand the implications of these before using them, as they can provide greater gains but can also cause greater losses. I encourage you to take a look at the code and understand the decisions that are being made by each model.
    * **(Default)**: This will use the available funds in margin or spot wallets, and will stop opening new trades when funds run out (low risk).
    * **Borrow Minimum**: This will use the available funds in margin or spot wallets, and will then start borrowing funds in margin to execute new trades (medium risk).
    * **Borrow All**: This will always borrow funds in margin to execute new trades regardless of available funds (high risk).
    * **Sell All**: This will use the available funds in margin or spot wallets, then re-sell a small portion of every active trade in order to free up funds for the new trades. The aim is to get all active trades to have the same investment. E.g. 4 active trades will use 25% of your balance each, if a 5th trade opens then it will sell a portion from the previous 4 so that all 5 trades are using 20% of your balance. However, once trades start to close it will not re-buy the remaining open trades, so this can result in some variation over time.
    * **Sell Largest**: This will use the available funds in margin or spot wallets, then re-sell half of the largest trade. E.g. (assuming you set the fraction quantity to 1) 1st trade will use 100% of your balance, the 2nd trade will sell 50% of the first trade and use that, the 3rd trade will sell 50% of the first trade so now you have 1st @ 25%, 2nd @ 50%, 3rd @ 25% of your total balance. The difference between this and the "All" model is that it only re-sells from a single existing trade whenever a new one comes in. This means that sometimes the trade sizes will not be equal. This also will not re-buy for remaining open trades.
  * Each model will first attempt to use the "Quantity to Buy" from the NBT Hub (either as an absolute or a fraction), this will represent the largest possible trade value. Only if there are insufficient funds, then it will apply one of the options or reduce the trade quantity.
  * The models that calculate a quantity relative to your current balance will only use the total balance from the primary wallet (margin by default). Also, if some or all of that balance is locked up in active LONG trades, it will estimate the total balance based on the original opening price of those trades (not current market price).
  * Only LONG trades consume your available balance (all SHORT trades are done through borrowing).
* ***CONFIG:* Primary Wallet**
  * You can choose whether to use the spot or margin wallet as your primary wallet for LONG trades. It will also use the total balance from this primary wallet to calculate the size of SHORT trades if you are using **Quantity as Fraction**.
  * The default is margin.
* ***CONFIG:* Wallet Buffer**
  * As slippage, spread, and bad trades are difficult to predict, it is good to keep some additional funds in your wallet to cover these costs. You can specify a buffer amount as a fraction of your wallet which will not be used for opening LONG trades.
  * The default is 0.1 which is 10%.
* ***CONFIG:* Maximum Count of Trades**
  * You can set maximum counts for SHORT and for LONG trades to limit how many can be active at one time. This can be used to limit your exposure to risk when borrowing, or to limit the number of times a LONG trade gets rebalanced. If a trade is stopped it will not count towards the limit.
  * The defaults are zero, which is unlimited.
* ***CONFIG:* Disable SHORT Trades**
  * Because SHORT trades will always borrow the full amount of the trade, you can choose to ignore SHORT trades to prevent borrowing.
  * NOTE: you can still choose to allow borrowing for LONG trades using one of the borrow funding options above.
* ***CONFIG:* Disable Margin Trades**
  * This will prevent any trades from executing on your margin wallet. All LONG trades will then execute on spot, and SHORT trades will be disabled as a result.
  * NOTE: even if a LONG trade is executed on your margin wallet it will not borrow any funds by default. You would have to choose one of the borrow funding options above.
* ***CONFIG:* Disable Coins**
  * You can provide a comma delimited list of coins that you want to ignore trade signals for (e.g. DOGE).
* ***CONFIG:* Strategy Loss Limit**
  * You can set a limit on the number of sequential losses for a strategy. If this many losing trades occur for a strategy then that strategy will be stopped. The trader will ignore all open signals for that strategy, and will only process close signals if the price is better (i.e. higher than the open price for LONG trades and lower for SHORT trades). You can still manually close the trades regardless of the price.
  * Once a strategy has been stopped, you will have to untick the trade option on the NBT Hub and the re-tick it. Toggling the trade option, or restarting the trader will clear the stopped flag and reset the count of losing trades.
  * The default is zero, which is unlimited.
* ***CONFIG:* Virtual Wallet Funds**
  * You can set a default balance for virtual trades, this allows you to simulate some of the auto-balancing or funding models above. The value represents roughly the equivalent BTC amount. For example, if you set the funds to 1 but you are trading in USDT, it will use the minimum purchase volumes to estimate a 'similar' USDT value of 1 BTC as the starting balance. This is not current market price, it is just a pre-determined scale set by Binance.
  * The default is 0.1 BTC which (at the time of writing) converts to 10,000 USDT.
  * NOTE: All virtual balances will be reset if the trader restarts, but it will attempt to recreate them using the open trades. However, as the NBT Hub has no record of auto balancing, all virtual trades and balances will reset based on the original opening quantity/cost.
* **Alternate Wallet Fall Back**
  * If you do not have sufficient funds in your primary wallet (e.g. margin) to make LONG trades, it will automatically try to make the trade from your other wallet (e.g. spot).
* **Web Diagnostics**
  * You can connect to the trader webserver to view the internal information that is being tracked (e.g. http://localhost:8003/log). The following commands are available:
    * /log - Internal log (newest entries at the top)
    * /pnl - Calculated rate of return and history of open and close balances (best estimation based on available data)
    * /strategies - Configured strategies
    * /trades - Current open trades list
    * /trans - Log of actual buy, sell, borrow, repay transactions (newest entries at the top)
    * /virtual - Views the current virtual balances. You can also apply a 'reset' parameter to clear and reload the virtual balances and virtual PnL, if you pass a number on the reset it will change the default value for **Virtual Wallet Funds** (e.g. ?reset=true or ?reset=100)
  * You can also configure a **Web Password** in the environment variables to restrict access to these commands (e.g. http://localhost:8003/log?mysecret).
* **Individual Tracking of Real / Virtual Trades**
  * In the original trader if you started a strategy in virtual trading and switched to real trading, or vice versa, it would attempt to close trades based on the current status of the strategy, rather than how the trade was originally opened. This means it could try to close a trade on Binance that was originally opened virtually, or never close the open trade on Binance because you've now switched the strategy to virtual. Now, if the trade opened on Binance it will close on Binance even if the strategy has been switched to virtual. If you don't want this to happen, make sure you close or stop the open trades before switching modes.
  * This is a useful way to soft close a strategy. Rather than manually closing the live trades yourself, you can switch the strategy to virtual and wait for the automatic close signals for any remaining open trades.
  * NOTE: It can only remember the previous state while the trader is running. If the trader restarts with mixed states, all trades will be reloaded with the current state of the strategy.
* **Clean Up Stopped Trades**
  * If you stop a trade on the NBT Hub then manually close it, first it will actually try to close the trade on Binance, but if that fails it will still respond to the NBT Hub with a close signal so that the open trade does not hang around forever. This is important for the calculations used in the auto balancing, as they rely on the current list of open trades. So if you want to purge a stopped trade like this, first make sure you have moved any funds from Binance so that it cannot execute the close.
  * Previously you could switch a strategy to virtual then close the trade, but as mentioned above each trade now remembers its original state, so a live trade will remain live even if you switch the strategy to virtual.
  * Also, if there are any issues loading previous open trades after a restart the trader will say these are discarded. But if you manually close one of these trades it will just notify the BVA Hub that the close was successful to clean it up. It will not attempt to buy or sell anything on Binance.
* **Track Order Price / Cost**
  * When a real trade is successfully executed on Binance the actual buy or sell price and cost will be saved from the response. These prices and cost will be reported in the notifications and transactions, as well as used for calculating the closing balances for the PnL. This can be useful if you want to get a better idea of slippage.
* **Additional Notifications**
  * If a trade fails to execute it will now send a notification with the error message.
  * If there are any issues loading previous trades after the trader restarts it will now send a notification message.
  * Trade notifications now include the quantity, cost, borrowed amount, wallet, trading type (live or virtual), and actual buy and sell prices from the transaction.
* **Comments**
  * I've added extensive comments to the trader.ts code to (hopefully) help you understand how it works. But please feel free to find me on Discord if you have any questions.

See the **[Quick start guide 🚀](./docs/GETTING-STARTED.md)** for instructions on configuring any of these options.

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

> NOTE: If you are a first-time user and you just want to follow the existing strategies on [Bitcoin vs. Altcoins](https://bitcoinvsaltcoins.com), all you need to worry about is the **trader** script. Just follow the **[Quick start guide 🚀](./docs/GETTING-STARTED.md)** to deploy the **trader** on Heroku. The **server** and **backtest** scripts are only needed if you want to start creating your own strategies.

* the **trader**: [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/PostmanSpat/node-binance-trader)

  * this script allows you to auto trade the signals received from the NBT hub or your own server. this script can run locally or on cloud services like Heroku. This new auto trader script allows you to trade with leverage when the pair is available for margin trading.

* the **server**:

  * to track a selection of asset pairs and record all [Binance](https://www.binance.com/en-AU/register?ref=141340247) api data (candles, depths, trades) into a Postgres database.
  * to detect buy or sell signals
  * (optional) to send trading signals to the NBT Hub / [Bitcoin vs. Altcoins](https://bitcoinvsaltcoins.com) to monitor performances and auto trade those signals (virtually or for real).

* the **backtest**:

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

Refer to [source repo](https://github.com/jsappme/node-binance-trader) for latest donation options.

## Getting in touch 💬

* **Discord**: [Invite Link](https://discord.gg/4EQrEgj)

<p align="center">
  <a href="https://discord.gg/4EQrEgj"><img alt="Discord chat" src="docs/images/discord_button.png" /></a>
</p>

## Final Notes

Feel free to fork and add new pull request to this repo.
If you have any questions/suggestions, or simply you need some help building your trading bot, or mining historical data or improving your strategies using the latest AI/ML algorithms, please feel free to <a href="mailto:herve76@gmail.com" target="_blank">contact herve76</a>.