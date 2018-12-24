/* ============================================================
 * node-binance-trader
 * https://github.com/nillo/better-node-binance-trader
 * ============================================================
 * Copyright 2019, Nillo Felix - bbnillotrader@gmail.com
 * Forked from node-binance-trader ( v0.0.7 - 🐬 delphines 🐬 ) by Herve Fulchiron - herve76@gmail.com
 * Released under the MIT License
 * better-node-biance-trader v0.0.1 - unicorn
 * 01/01/2019
 * ============================================================ */

import chalk from 'chalk';
import inquirer from 'inquirer';
import BNBT from './bnbt';
import messages from './messages';
import {
    defaults
} from './config';

//  options within questions;
const buy_info_request = [
    {
        type: 'input',
        name: 'base_currency',
        message: chalk.cyan('What base currency would you use for the trade? (USDT, BTC, BNB or ETH)'),
        default: defaults.base_currency,
        validate: function (value) {
            var valid = ((value.toUpperCase() === 'BTC') || (value.toUpperCase() === 'USDT') || (value.toUpperCase() === 'ETH') || (value.toUpperCase() === 'BNB'))
            return valid || 'Currency not valid, please chose between USDT, BTC, BNB, ETH'
        },
  },
    {
        type: 'input',
        name: 'budget',
        default: defaults.budget,
        message: chalk.cyan('What is your budget for this trade? (in base currency)(total value. > 15 USD.)'),
        validate: function (value) {
            var valid = !isNaN(parseFloat(value)) && (value > 0)
            return valid || 'Please enter a number superior than 0'
        },
        filter: Number
  },
    {
        type: 'input',
        name: 'currency_to_buy',
        message: chalk.cyan('What currency would you like to buy?'),
        default: defaults.currency_to_buy,
  },
];

const buy_sell_options = [
    {
        type: 'list',
        name: 'buy_option',
        message: chalk.cyan('How would you like to buy:'),
        choices: ['Buy at Market Price', 'Set a Buy Order just above Bid Price', 'Set a Buy Order at a Fixed Buy Price'],
        filter: (val) => {
            if (val.includes('Market')) {
                return 'Market';
            }
            if (val.includes('Bid')) {
                return 'Bid';
            }
            if (val.includes('Fixed')) {
                return 'Fixed';
            }
        }
  },
    {
        type: 'list',
        name: 'sell_option',
        message: chalk.cyan('How would you like to sell:'),
        choices: ['Set a Trailing Stop Loss', 'Set Stop Loss and Profit Percentages'],
        filter: (val) => {
            if (val.includes('Trailing')) {
                return 'Trailing'
            }
            return 'Profit';
        }
  },
];

const fixed_buy_price_input = [
    {
        type: 'input',
        name: 'fixed_buy_price',
        default: defaults.fixed_buy_price,
        message: chalk.cyan('What is Fixed Buy Price? (in base currency)'),
        validate: function (value) {
            var valid = !isNaN(parseFloat(value)) && (value > 0)
            return valid || 'Please enter a number superior than 0'
        },
        filter: Number
  }
];

const loss_profit_inputs = [
    {
        type: 'input',
        name: 'loss_pourcent',
        default: defaults.loss_pourcent,
        message: chalk.hex('#FF6347')('Enter the stop loss percentage:'),
        validate: function (value) {
            var valid = !isNaN(parseFloat(value)) && (value > 0.10) && (value < 100.00)
            return valid || 'Please enter a number between 0.10 and 99.99'
        },
        filter: Number
  },
    {
        type: 'input',
        name: 'profit_pourcent',
        default: defaults.profit_pourcent,
        message: chalk.hex('#3CB371')('Enter the profit percentage:'),
        validate: function (value) {
            var valid = !isNaN(parseFloat(value)) && (value > 0.10) && (value < 100.00)
            return valid || 'Please enter a number between 0.10 and 99.99'
        },
        filter: Number
  },
    {
        type: 'confirm',
        name: 'confirm',
        message: chalk.cyan('Start the trade now?'),
        default: true
  },
];

const trailing_loss_input = [
    {
        type: 'input',
        name: 'trailing_pourcent',
        default: defaults.trailing_pourcent,
        message: chalk.hex('#FF6347')('Enter the Trailing Loss Percentage:'),
        validate: function (value) {
            var valid = !isNaN(parseFloat(value)) && (value > 0.10) && (value < 100.00)
            return valid || 'Please enter a number between 0.10 and 99.99'
        },
        filter: Number
  },
    {
        type: 'confirm',
        name: 'confirm',
        message: chalk.cyan('Start the trade now?'),
        default: true
  },
];

// questions 
export const ask_pair_budget = async () => {
    try {
        const answers = await inquirer.prompt(buy_info_request);
        const tradeRequestData = {
            pair: (answers.currency_to_buy + answers.base_currency)
                .toUpperCase(),
            base_currency: (answers.base_currency)
                .toUpperCase(),
            currency_to_buy: (answers.currency_to_buy)
                .toUpperCase(),
            budget: parseFloat(answers.budget)
        };

        BNBT.newPair(tradeRequestData.pair, tradeRequestData);
        return tradeRequestData.pair;
    } catch (err) {
        console.log(chalk.red(err))
    };
};

export const ask_buy_sell_options = async (pair) => {
    console.log(' ')
    try {
        const {
            buy_option,
            sell_option
        } = await inquirer.prompt(buy_sell_options);
        const methodsOfTrade = {
            buying_method: buy_option,
            selling_method: sell_option
        };

        BNBT.setDataForPair(pair, methodsOfTrade);

        if (buy_option !== 'Fixed') {
            if (sell_option === 'Trailing') {
                return {
                    action: 'ask_trailing_percent'
                };
            }
            return {
                action: 'ask_loss_profit_percents'
            };
        }
        return {
            action: 'ask_fixed_buy_price',
            data: sell_option
        };

    } catch (err) {
        console.log(chalk.red(err))
    }
};

// fix actions trading / ask_pair_budget
export const ask_trailing_percent = async (pair) => {
    console.log(' ')
    try {
        const answers = await inquirer.prompt(trailing_loss_input);
        if (answers.confirm) {
            const trailingOpts = {
                trailing_pourcent: answers.trailing_pourcent
            };

            BNBT.setDataForPair(pair, trailingOpts);
            return {
                action: 'start_trading'
            };
        } else {
            return {
                action: 'run'
            };
        }
    } catch (err) {
        console.log(chalk.red(err))
    }
}

export const ask_loss_profit_percents = async (pair) => {
    console.log(' ');
    try {
        const answers = await inquirer.prompt(loss_profit_inputs)
        if (answers.confirm) {
            const opts = {
                profit_pourcent: parseFloat(answers.profit_pourcent),
                loss_pourcent: parseFloat(answers.loss_pourcent)
            };

            BNBT.setDataForPair(pair, opts);
            return {
                action: 'start_trading'
            };
        } else {
            return {
                action: 'run'
            };
        }
    } catch (err) {
        console.log(chalk.red(err))
    }
};

export const ask_fixed_buy_price = async (pair, sell_option) => {
    try {
        const answers = await inquirer.prompt(fixed_buy_price_input);
        let opts = {
            fixed_buy_price: parseFloat(answers.fixed_buy_price)
        };

        messages.showSetOrderAtBuyPrice(answers.fixed_buy_price);

        if (sell_option.includes("Trailing")) {
            opts.selling_method = 'Trailing';
            BNBT.setDataForPair(pair, opts);

            return {
                action: 'ask_trailing_percent'
            };
        } else {
            opts.selling_method = 'Profit';
            BNBT.setDataForPair(pair, opts);

            return {
                action: 'ask_loss_profit_percents'
            };
        }
    } catch (err) {
        console.log(chalk.red(err));
    }
};
