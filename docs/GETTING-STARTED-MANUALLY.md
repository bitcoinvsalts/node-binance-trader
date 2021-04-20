# Getting started manually

## Table of contents

1. **[Requirements](#requirements)**
1. **[Installation 📦](#installation-📦)**
1. **[Usage ⚡️](#usage-⚡️)**

## Requirements

* [Git](https://git-scm.com/download/) (see if it is already installed with the command: *git --version*)
* [Node.JS](http://nodejs.org) (see if it is already installed with the command: *npm --version*)

## Installation 📦

```
git clone https://github.com/jsappme/node-binance-trader
cd node-binance-trader
npm i --unsafe-perm
```

## Usage ⚡️

Before everything, please review the source code of the JS scripts (server.js, trader.js) and then add your secret data to `.env`.

To kickstart, just duplicate the `.env.example`, name it  `.env` and insert your secret values:
```bash
cp .env.example .env
$EDITOR .env
```
**Never check in your `.env` file!**
It contains your most private information.

**This project can be used as a Docker container!** Use the `docker init` commands below, after building the container:
`docker build -t jsappme/node-binance-trader .`

**To start the server** to save pair data, define strategies and emit trading signals:
```
npm init start
// or
docker init -d --name node-binance-trader -v "$PWD/.env:/srv/app/.env" -p 4000:4000 jsappme/node-binance-trader npm init start
```

**To start the auto trader** to monitor strategies and signals received from the server or the NBT Hub:

<i>Important note: Always make sure to have some BNB available on your corresponding wallet to pay for the fees.</i>

```
npm init trader
// or
docker init -d --name node-binance-trader -v "$PWD/.env:/srv/app/.env" jsappme/node-binance-trader npm init trader
```

**To backtest** strategies using the data recorded by the server:
```
npm init backtest
// or
docker init -d --name node-binance-trader -v "$PWD/.env:/srv/app/.env" jsappme/node-binance-trader npm init backtest
```
