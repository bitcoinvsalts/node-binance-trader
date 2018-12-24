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

import figlet from 'figlet';
import chalk from 'chalk';
import moment from 'moment';
import clear from 'clear';
import numeral from 'numeral';

export default {
    showIntro: () => {
        console.log(chalk.yellow(figlet.textSync('B_N_B_T_', {
            horizontalLayout: 'fitted'
        })))
        console.log(' ')
        console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
        console.log(" 🐬 ".padEnd(10) + chalk.bold.underline.cyan('Better-Node-Binance-Trader') + " 🐬 ".padStart(11))
        console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
        console.log(' ')
        console.log(chalk.yellow('  ⚠️  USE THIS APP AT YOUR OWN RISK ⚠️'))
        console.log(' ')
    },

    showBidPrice: (bid_price, pair) => {
        console.log(chalk.grey(moment()
                .format('h:mm:ss')
                .padStart(8)) +
            chalk.yellow(pair.padStart(10)) +
            chalk.grey(` - CURRENT 1ST BID PRICE: ${bid_price}`));
    },

    showSetOrderAtBuyPrice: (fixed_buy_price) => {
        console.log(chalk.grey(`The bot will set a buy order at ${fixed_buy_price}`));
    },

    showOrderInfo: (pair, order) => {
        clear();
        console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
        console.log(chalk.yellow(figlet.textSync('B_N_B_T_', {
            horizontalLayout: 'fitted'
        })))
        console.log(" 🐬 ".padEnd(10) + '                   ' + " 🐬 ".padStart(11))
        console.log(chalk.yellow(`THE BOT WILL TRADE FOR PAIR [${pair}] WITH THE FOLLOWING SETTINGS:`));
        console.log(chalk.green(JSON.stringify(order, null, 4)));
    },

    showError: (err) => {
        console.log(chalk.yellow('⚠️  Failed to make trade'));
        console.log(chalk.yellow('The following error occured: '));
        console.log(chalk.red(err));
        console.log(chalk.yellow('Please try again.'));
    },

    showCancelAndSellMarket: () => {
        console.log(chalk.grey(' ⚠️  Press [ CTRL + c ] or q to cancel the trade and sell everything at market price. ⚠️ '));
        console.log(" ");
    },

    showTradeReport: (trade, pnl, status) => {
        return chalk.grey(moment()
                .format('h:mm:ss')
                .padStart(8)) +
            chalk.yellow(trade.symbol.padStart(10)) +
            (!trade.maker ? chalk.green((chalk.grey("qty:") + numeral(trade.quantity)
                    .format("0.000"))
                .padStart(30)) : chalk.red((chalk.grey("qty:") + numeral(trade.quantity)
                    .format("0.000"))
                .padStart(30))) +
            chalk.grey(" @ ") + chalk.cyan(trade.price)
            .padEnd(24) +
            ((pnl >= 0) ? chalk.green((chalk.grey("pnl:") + numeral(pnl)
                    .format("0.000"))
                .padStart(20)) : chalk.red((chalk.grey("pnl:") + numeral(pnl)
                    .format("0.000"))
                .padStart(20))) +
            chalk.white(status);
    },

    print(text) {
        return chalk.grey(text);
    },

    printColor(color, text) {
        const chalker = chalk[color] || chalk.white;
        return console.log(chalk[color](text));
    }
};
