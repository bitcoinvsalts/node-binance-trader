#!/usr/bin/env node

/* ============================================================
 * better-node-binance-trader
 * https://github.com/nillo/better-node-binance-trader
 * ============================================================
 * Copyright 2019, Nillo Felix - bbnillotrader@gmail.com
 * Forked from node-binance-trader ( v0.0.7 - 🐬 delphines 🐬 ) by Herve Fulchiron - herve76@gmail.com
 * Released under the MIT License
 * better-node-biance-trader v0.0.1 - pow pow
 * 01/01/2019
 * ============================================================ */

import _ from 'lodash';
import chalk from 'chalk';
import clear from 'clear';
import messages from './messages';
import {
    setTerminalTitle
} from './screen';

import {
    ask_pair_budget,
    ask_buy_sell_options,
    ask_trailing_percent,
    ask_loss_profit_percents,
    ask_fixed_buy_price
} from './questions';

import {
    checkIfPairIsKnown,
    getPrices,
    start_trading
} from './tradehelpers';

clear();
process.stdin.setEncoding('utf8');

// update user with intro screen
messages.showIntro();

const stepOne = async () => {
    const pair = await ask_pair_budget();
    const pairIsKnown = await checkIfPairIsKnown(pair);
    if (pairIsKnown) {
        setTerminalTitle(pair);
        const {
            bid_price
        } = await getPrices(pair);

        // update user with message
        messages.showBidPrice(bid_price, pair);
        return pair;
    } else {
        console.log(chalk.magenta("SORRY THE PAIR ") + chalk.green(pair) + chalk.magenta(" IS UNKNOWN BY BINANCE. Please try another one."));
        throw new Error('pair-not-found');
    }
}

const stepTwo = async (pair) => {
    const {
        action,
        data = {}
    } = await ask_buy_sell_options(pair);
    return {
        action,
        data
    };
}

const stepThree = async (pair, previousActionResult, previousActionData) => {
    const stepTwoActions = {
        ask_trailing_percent: () => ask_trailing_percent(pair),
        ask_loss_profit_percents: () => ask_loss_profit_percents(pair),
        ask_fixed_buy_price: () => ask_fixed_buy_price(pair, previousActionData),
    };

    const {
        action,
        data = {}
    } = await stepTwoActions[previousActionResult]();
    return {
        action,
        data
    };
}

export const rerun = (err) => {
    clear();
    messages.showIntro();
    if (err) {
        messages.showError(err);
        console.log(' ');
    } else {
        console.log(' ');
    }
    run();
};

const run = async () => {
    try {
        // initial step get user input for trade (question 1).
        const pair = await stepOne();

        // secondary step get user input for sell / buy options (question 2).
        const {
            action: step2ActionResult,
            data: step2ActionResultData
        } = await stepTwo(pair);

        // third step extra trade info (question 3).
        const {
            action: step3ActionResult
        } = await stepThree(pair, step2ActionResult, step2ActionResultData);

        // conditional force restart
        if (step3ActionResult === 'run') return rerun();

        // start trade.
        await start_trading(pair);

    } catch (err) {
       rerun(err);
    }
};

run();
