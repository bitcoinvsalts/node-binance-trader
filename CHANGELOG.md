## [1.2.0] (2021-08-09)

### Features

* **trader:** added estimation of taker fees for better PnL calculation.
* **trader:** limited decimal places for numbers in the web UI.

## [1.1.0] (2021-08-09)

### Bug Fixes

* **trader:** report initial connection failure.

### Features

* **trader:** added option to manually close trades from the web diagnostics.
* **trader:** added BNB Free Threshold check.
* **trader:** added Stop, Resume, Close, and Delete buttons to Open Trades page.

## [1.0.1] (2021-08-03)

### Bug Fixes

* **trader:** Telegram notifications now work, and /info command will work without configuring a valid Chat ID.

## [1.0.0] (2021-08-01)

### Bug Fixes

* **trader:** margin borrow and repay functions now work.
* **trader:** identify when a trade request was not fulfilled in Binance.
* **trader:** correct calculation of trade quantity to account for LOT_SIZE and precision.
* **trader:** only allow one concurrent open trade per strategy + symbol + position, this matches the NBT Hub rules.
* **trader:** support (as a workaround) for running on Binance Testnet.
* **trader:** use cached market data.
* **trader:** truncate memory logs.

### Features
* **server:** added description and max_concurrent parameters.
* **trader:** configurable logging levels.
* **trader:** a lot more validation.

These are all for **trader**. Refer to the README for more details:
* ***CONFIG:* Quantity as Fraction**
* ***CONFIG:* Funding / Auto-Balancing for LONG Trades**
* ***CONFIG:* Repay Loan Interest**
* ***CONFIG:* Primary Wallet**
* ***CONFIG:* Wallet Buffer**
* ***CONFIG:* Maximum Count of Trades**
* ***CONFIG:* Disable SHORT Trades**
* ***CONFIG:* Disable Margin Trades**
* ***CONFIG:* Disable Coins**
* ***CONFIG:* Strategy Loss Limit**
* ***CONFIG:* Virtual Wallet Funds**
* **Alternate Wallet Fall Back**
* **Database Backup**
* **Web Diagnostics**
* **Individual Tracking of Real / Virtual Trades**
* **Clean Up Stopped Trades**
* **Track Order Price / Cost**
* **Additional Notifications**
* ***CONFIG:* Additional Logging**

## [0.3.1](https://github.com/jsappme/node-binance-trader/compare/0.3.0...0.3.1) (2021-03-08)


### Reverts

* Revert "refactor: reformat code" ([1fd45ae](https://github.com/jsappme/node-binance-trader/commit/1fd45aeb6fd70c37d8d998ca040ab1767ac91e33))

# [0.3.0](https://github.com/jsappme/node-binance-trader/compare/0.2.2...0.3.0) (2021-03-03)


### Bug Fixes

* **backtest:** remove output of pg_connection string ([8d4803c](https://github.com/jsappme/node-binance-trader/commit/8d4803c88db1508d4b6136d34c34ca0302aaf7c1))
* **deps:** unignore npm lockfile ([275b05a](https://github.com/jsappme/node-binance-trader/commit/275b05a5f1de5e0344bf454c059a7cb0df036ebb))
* **docker:** replace yarn with npm ([1b5940a](https://github.com/jsappme/node-binance-trader/commit/1b5940ad3f87ab4ea4ada0809f80fb967cc86c3b))
* **npm:** set private ([3e5bc54](https://github.com/jsappme/node-binance-trader/commit/3e5bc541a28b87fc1c7e15ec127218b26b1947d6))
* **trader:** crash error: can't access `.minQty` of 'undefined' ([0b214a7](https://github.com/jsappme/node-binance-trader/commit/0b214a70ff61abd803bf9cf4ac8c47b335938d00))
* **trader:** don't log unfollowed sell signals ([f7104de](https://github.com/jsappme/node-binance-trader/commit/f7104de828d97341078ee0d0e0e1a6cdcb447d05))


### Features

* add editorconfig ([e050de0](https://github.com/jsappme/node-binance-trader/commit/e050de0ecf3193dbd867bfe9b3c333c348ffc6cb))
* add renovate configuration ([2b6b3df](https://github.com/jsappme/node-binance-trader/commit/2b6b3dff2751bc639725a0bae618e9ab9b14e76f))
* **backtest:** discard abbreviation ([7ba1b8d](https://github.com/jsappme/node-binance-trader/commit/7ba1b8dc06cadedb348244ce860c85f5758998b6))
* **docker:** add Dockerfile ([2b92e07](https://github.com/jsappme/node-binance-trader/commit/2b92e076c99666e15ce170a35c4594b33b2c549d))
* **docs:** convert getting started guide to markdown ([1dfb156](https://github.com/jsappme/node-binance-trader/commit/1dfb156da41e649abc3ca034ab420bbf7b9848f3))
* add docker secret examples ([f09cca0](https://github.com/jsappme/node-binance-trader/commit/f09cca00b9bb7acbaa68ff617a638b3c68c38b82))
* **docker:** improve compose file ([3d3a7dc](https://github.com/jsappme/node-binance-trader/commit/3d3a7dcddd33337efbf6176fee64004383cf37ab))
* **gmail:** add gmail address and app password to env ([6511855](https://github.com/jsappme/node-binance-trader/commit/6511855d50a3a2bca791f861b245aee3a95ca822))
