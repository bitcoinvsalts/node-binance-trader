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
    set_terminal_title
} from './screen';

import {
    ask_pair_budget,
    ask_buy_sell_options,
    ask_trailing_percent,
    ask_loss_profit_percents,
    ask_fixed_buy_price
} from './questions';

import {
    check_if_pair_is_known,
    get_prices,
    start_trading
} from './tradehelpers';

clear();
process.stdin.setEncoding('utf8');

// update user with intro screen
messages.showIntro();

const questionOne = async () => {
    const pair = await ask_pair_budget();
    const pairIsKnown = await check_if_pair_is_known(pair);
    if (pairIsKnown) {
        set_terminal_title(pair);
        const {
            bid_price
        } = await get_prices(pair);

        // update user with message
        messages.showBidPrice(bid_price, pair);
        return pair;
    } else {
        console.log(chalk.magenta("SORRY THE PAIR ") + chalk.green(pair) + chalk.magenta(" IS UNKNOWN BY BINANCE. Please try another one."));
        throw new Error('pair-not-found');
    }
}

const questionTwo = async (pair) => {
    const {
        action,
        data = {}
    } = await ask_buy_sell_options(pair);
    return {
        action,
        data
    };
}

const questionThree = async (pair, previousActionResult, previousActionData) => {
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
        // Question One, initial steps get user input for trade.
        const pair = await questionOne();

        // Question Two, get user input for sell / buy options.
        const {
            action: questionTwoAction,
            data: questionTwoData
        } = await questionTwo(pair);

        // Question Three, extra trade info
        const {
            action: questionThreeAction
        } = await questionThree(pair, questionTwoAction, questionTwoData);

        // conditional force restart
        if (questionThreeAction === 'run') return rerun();

        // start trade.
        await start_trading(pair);

    } catch (err) {
       rerun(err);
    }
};

run();
