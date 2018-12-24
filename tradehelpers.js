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

import {
    filter,
    get
} from 'lodash';
import chalk from 'chalk';
import ora from 'ora';
import BNBT from './bnbt';
import messages from './messages';
import {
    rerun
} from './index';
const {
    client
} = BNBT;

const report = ora(chalk.grey('Starting the trade...'));

const cancel_order = async (pair, orderId, cb) => {
    try {
        await client.cancelOrder({
            symbol: pair,
            orderId: orderId,
            recvWindow: 1000000,
        });
        if (cb) return cb();
    } catch (err) {
        if (cb) return cb(err);
        const log_report = chalk.magenta(" ERROR #547 ");
        console.error(log_report + err);
    }
};

const do_order = async (order, cb) => {
    try {
        const result = await client.order(order);
        return result;
    } catch (err) {
        if (cb) return cb(err);
        const log_report = chalk.magenta(" ERROR #555 ");
        console.error(log_report + err);
    }
}

const get_order = async (order, cb) => {
    try {
        const result = await client.getOrder(order);
        return result;
    } catch (err) {
        if (cb) return cb(err);
        const log_report = chalk.magenta(" ERROR #8 ");
        console.error(log_report + err);
    }
}

export const checkIfPairIsKnown = async (pair) => {
    // FIND OUT IF PAIR EXISTS AND THE PAIR QUOTE INFO:
    const results = await client.exchangeInfo();
    const pairStatus = filter(results.symbols, {
            symbol: pair
        })
        .length > 0;

    if (pairStatus) {
        let activePair = filter(results.symbols, {
            symbol: pair
        })[0];
        let filters = get(activePair, 'filters', null);

        if (activePair && filters) {
            const tempTickSize = get(filter(filters, (item => item.tickSize)), '[0].tickSize', null);
            if (!tempTickSize) throw new Error('Failed to get tickSize');

            const tempStepSize = get(filter(filters, (item => item.stepSize)), '[0].stepSize', null);
            if (!tempStepSize) throw new Error('Failed to get stepSize');

            BNBT.setDataForPair(pair, {
                tickSize: tempTickSize.indexOf("1") - 1,
                stepSize: tempStepSize
            });
        }
    }
    return pairStatus;
};

export const getPrices = async (pair) => {
    // GET ORDER BOOK
    const orderBookResults = await client.book({
        symbol: pair
    });
    const prices = {
        bid_price: parseFloat(orderBookResults.bids[0].price),
        ask_price: parseFloat(orderBookResults.asks[0].price)
    };

    // SO WE CAN TRY TO BUY AT THE 1ST BID PRICE + %0.02:
    BNBT.setDataForPair(pair, prices);
    return prices;
};

export const start_trading = async (pair) => {
    const tradeData = BNBT.getDataForPair(pair);

    const {
        stepSize,
        tickSize,
        budget,
        buying_method,
        currency_to_buy,
        fixed_buy_price,
        bid_price,
        ask_price
    } = tradeData;

    const precision = stepSize.toString()
        .split('.')[1].length || 0;
    const opts = {};

    if (buying_method === "Fixed") {
        opts.buy_amount = ((((budget / fixed_buy_price) / parseFloat(stepSize)) | 0) * parseFloat(stepSize))
            .toFixed(precision);
        opts.buy_price = parseFloat(fixed_buy_price);
        console.log(chalk.grey("BUYING " + opts.buy_amount + " OF " + currency_to_buy + " AT FIXED PRICE ") + chalk.green(opts.buy_price.toFixed(tickSize)));

    } else if (buying_method === "Bid") {
        opts.buy_amount = ((((parseFloat(budget) / (parseFloat(bid_price) * 1.0002)) / parseFloat(stepSize)) | 0) * parseFloat(stepSize))
            .toFixed(precision);
        opts.buy_price = parseFloat(bid_price) * 1.0002
        console.log(chalk.grey("BUYING " + opts.buy_amount + " OF " + currency_to_buy + " AT JUST ABOVE 1ST BID PRICE ") + chalk.green(opts.buy_price.toFixed(tickSize)));

    } else if (buying_method === "Market") {
        opts.buy_amount = ((((parseFloat(budget) / (parseFloat(ask_price) * 1.0002)) / parseFloat(stepSize)) | 0) * parseFloat(stepSize))
            .toFixed(precision);
        opts.buy_price = parseFloat(ask_price);
        console.log(chalk.green("BUYING " + opts.buy_amount + " OF " + currency_to_buy + " AT MARKET PRICE"));
    }

    try {
        let orderData = {
            symbol: pair,
            side: 'BUY',
            quantity: opts.buy_amount,
            price: opts.buy_price.toFixed(tickSize),
            recvWindow: 1000000,
        };

        if (buying_method === 'Market') {
            delete orderData.price
            orderData.type = 'MARKET';
        }

        messages.showOrderInfo(pair, orderData);
        const order_result = await client.order(orderData);

        opts.order_id = order_result.orderId;
        opts.trade_active = !!order_result.orderId
        opts.orderData = order_result;

        BNBT.setDataForPair(pair, opts);
        auto_trade(pair);
    } catch (err) {
        report.fail(err);
        rerun(err);
    }
};

const auto_trade = (pair) => {
    const opts = {
        step: 1,
    };
    BNBT.setDataForPair(pair, opts);
    const {
        trade_count
    } = BNBT.getDataForPair(pair);

    report.text = '';
    report.start();
    // LISTEN TO KEYBOARD PRSEED KEYS
    // process.stdin.resume()
    // process.stdin.setRawMode(true)

    messages.showCancelAndSellMarket();

    const curr_trade = trade_count;
    const clean_trades = client.ws.trades([pair], async trade => {
        const {
            step,
            ...pairData
        } = BNBT.getDataForPair(pair);

        if (curr_trade !== pairData.trade_count) clean_trades();
        report.text = add_status_to_trade_report(pair, trade, '');


        // CHECK IF INITIAL BUY ORDER IS EXECUTED
        if (pairData.order_id && (step === 1)) {
            console.log('hit');
            opts.step = 99;
            BNBT.setDataForPair(pair, opts);
            await checkBuyOrderStatus(pair);
        }

        console.log('tp:', trade.price, 'sp:', pairData.switch_price, 'step: ', step, 'sm: ', pairData.selling_method, 'profittargetReach: ', trade.price > pairData.switch_price);
        // SWITCH PRICE REACHED SETTING UP SELL FOR PROFIT ORDER
        if ((pairData.selling_method === "Profit") &&
            pairData.order_id &&
            (step === 3) &&
            (trade.price > pairData.switch_price)) {
            opts.step = 99
            BNBT.setDataForPair(pair, opts);
            messages.printColor('grey', 'CANCEL STOP LOSS AND GO FOR PROFIT');

            await cancel_order(pair, pairData.order_id);
            const order = await do_order({
                symbol: pair,
                side: 'SELL',
                quantity: pairData.buy_amount,
                price: pairData.sell_price,
                recvWindow: 1000000,
            });

            opts.step = 5;
            opts.order_id = order.orderId;
            BNBT.setDataForPair(pair, opts);
            messages.print(" SELL ORDER READY ");
        }

        // INCREASE THE TRAILING STOP LOSS PRICE
        if ((pairData.selling_method === "Trailing") &&
            pairData.order_id &&
            (step === 3) &&
            (trade.price > pairData.switch_price)) {

            opts.step = 99;
            opts.tot_cancel = pairData.tot_cancel + 1;
            BNBT.setDataForPair(pair, opts);

            messages.printColor('grey', 'CANCEL CURRENT STOP LOSS');

            await cancel_order(pair, pairData.order_id);

            opts.stop_price = (parseFloat(pairData.stop_price) + (parseFloat(pairData.stop_price) * pairData.trailing_pourcent / 100.00))
                .toFixed(pairData.tickSize);
            messages.printColor('green',`NEW Stop price set @: ${opts.stop_price}`);

            opts.loss_price = (parseFloat(opts.stop_price) - (parseFloat(opts.stop_price) * 0.040))
                .toFixed(pairData.tickSize);
            messages.printColor('green',`NEW Loss price set @: ${opts.loss_price}`);

            BNBT.setDataForPair(pair, opts);
            await set_stop_loss_order(pair);

            opts.switch_price = (parseFloat(pairData.switch_price) + (parseFloat(pairData.switch_price) * pairData.trailing_pourcent / 100.00))
                .toFixed(pairData.tickSize)
            messages.printColor('green',`New Switch price set @ ${opts.switch_price}`);
            opts.step = 3;

            BNBT.setDataForPair(pair, opts);
        }

        // PRICE BELLOW BUY PRICE SETTING UP STOP LOSS ORDER
        if ((pairData.selling_method === 'Profit') &&
            pairData.order_id &&
            (step === 5) &&
            (trade.price < pairData.buy_price)) {
            opts.step = 99;
            messages.printColor('grey','CANCEL PROFIT SETTING UP STOP LOSS');
            opts.tot_cancel = pairData.tot_cancel + 1
            BNBT.setDataForPair(pair, opts);

            await cancel_order(pair, pairData.order_id, () => {
                opts.pnl = 100.00 * (pairData.buy_price - trade.price) / pairData.buy_price;
                BNBT.setDataForPair(pair, opts);
                const log_report = chalk.magenta(" LOSS PRICE REACHED THE BOT SHOULD HAVE SOLD EVERYTHING #454 ");
                report.fail(add_status_to_trade_report(pair, trade, log_report));
                reset_trade(pair);
                setTimeout(() => rerun(), 1000);
            });
            await set_stop_loss_order(pair);
        }

        // CURRENT PRICE REACHED SELL PRICE
        if ((pairData.selling_method === "Profit") &&
            pairData.order_id &&
            (step === 5) &&
            (trade.price >= pairData.sell_price)) {
            opts.step = 99;
            BNBT.setDataForPair(pair, opts);

            const order_result = await get_order({
                symbol: pair,
                orderId: pairData.order_id,
                recvWindow: 1000000,
            });

            if (parseFloat(order_result.executedQty) < parseFloat(order_result.origQty)) {
                const log_report = chalk.grey(" PROFIT PRICE REACHED BUT NOT ALL EXECUTED " + order_result.executedQty);
                report.text = add_status_to_trade_report(pair, trade, log_report);
                opts.step = 5;

                BNBT.setDataForPair(pair, opts);
            } else {
                clean_trades();

                ops.pnl = 100.00 * (trade.price - pairData.buy_price) / pairData.buy_price;
                BNBT.setDataForPair(pair, opts);

                const log_report = chalk.greenBright(" 🐬 !!! WE HAVE A WINNER !!! 🐬 ");
                report.text = add_status_to_trade_report(pair, trade, log_report);

                reset_trade(pair);
                report.succeed();

                setTimeout(() => {
                    rerun(), 1000
                });
            }
        }

        // CURRENT PRICE REACHED STOP PRICE
        if (pairData.order_id && (step === 3) && (trade.price <= pairData.stop_price)) {
            opts.step = 99;
            BNBT.setDataForPair(pair, opts);

            const order_result = await get_order({
                symbol: pair,
                orderId: pairData.order_id,
                recvWindow: 1000000,
            }, (err) => {
                console.error(" API ERROR #9 " + err);
                clean_trades();

                opts.pnl = 100.00 * (pairData.buy_price - trade.price) / pairData.buy_price;
                BNBT.setDataForPair(pair, opts);

                const log_report = chalk.magenta("TRADE STOPPED");
                report.text = add_status_to_trade_report(pair, trade, log_report);

                reset_trade(pair);
                report.fail();

                setTimeout(() => rerun(), 1400);
            });

            if (parseFloat(order_result.executedQty) < parseFloat(order_result.origQty)) {
                const log_report = chalk.grey(" STOP PRICE REACHED BUT NOT ALL EXECUTED " + order_result.executedQty);
                report.text = add_status_to_trade_report(pair, trade, log_report);
                opts.step = 5;

                BNBT.setDataForPair(pair, opts);
            } else {
                clean_trades();
                opts.pnl = 100.00 * (pairData.buy_price - trade.price) / pairData.buy_price;
                BNBT.setDataForPair(pair, opts);

                const log_report = chalk.magenta(" STOP LOSS ALL EXECUTED");
                report.text = await add_status_to_trade_report(pair, trade, log_report);

                reset_trade(pair);
                report.succeed();

                setTimeout(() => rerun(), 1400);
            }
        }
    });
}

const sell_at_market_price = async (pair) => {
    const {
        buy_amount
    } = BNBT.getDataForPair(pair);
    console.log(chalk.keyword('orange')(" SELLING AT MARKET PRICE "));
    try {
        await client.order({
            symbol: pair,
            side: 'SELL',
            type: 'MARKET',
            quantity: buy_amount,
            recvWindow: 1000000,
        });

        reset_trade(pair);
        report.succeed(chalk.magenta(" THE BOT SOLD AT MARKET PRICE #777 "));
        setTimeout(() => rerun(), 2500);
    } catch (err) {
        report.fail(" ERROR #7771 " + buy_amount + " :: " + err);
        reset_trade(pair);
    };
}

const checkBuyOrderStatus = async (pair) => {
    const {
        order_id,
        selling_method,
        trailing_pourcent,
        tickSize,
        loss_pourcent,
        profit_pourcent
    } = BNBT.getDataForPair(pair);

    try {
        const order = await client.getOrder({
            symbol: pair,
            orderId: order_id,
            recvWindow: 1000000
        });

        const opts = {};
        if (order.status === "FILLED") {
            opts.init_buy_filled = true;
            opts.buy_amount = parseFloat(order.executedQty);
            console.log(chalk.white(" INITAL BUY ORDER FULLY EXECUTED "));

            const mytrade = await client.myTrades({
                symbol: pair,
                limit: 1,
                recvWindow: 1000000
            });
            opts.buy_price = parseFloat(mytrade[0].price);
            console.log(chalk.gray(" FINAL BUY PRICE @ ") + chalk.cyan(opts.buy_price));

            if (selling_method === "Trailing") {
                opts.stop_price = (opts.buy_price - (opts.buy_price * trailing_pourcent / 100.00))
                    .toFixed(tickSize);
                messages.printColor('green',`Stop price set @: ${opts.stop_price}`);

                opts.loss_price = (opts.stop_price - (opts.stop_price * 0.040))
                    .toFixed(tickSize);
                messages.printColor('green',`Loss price set @: ${opts.loss_price}`);

                BNBT.setDataForPair(pair, opts);
                await set_stop_loss_order(pair);

                opts.switch_price = (opts.buy_price + (opts.buy_price * trailing_pourcent / 100.00))
                    .toFixed(tickSize);
                messages.printColor('green',`Switch price set @: ${opts.switch_price}`);

            } else {
                opts.stop_price = (opts.buy_price - (opts.buy_price * loss_pourcent / 100.00))
                    .toFixed(tickSize);
                opts.loss_price = (opts.stop_price - (opts.stop_price * 0.040))
                    .toFixed(tickSize);

                BNBT.setDataForPair(pair, opts);
                await set_stop_loss_order(pair);

                opts.witch_price = (opts.buy_price + (opts.buy_price * profit_pourcent / 200.00))
                    .toFixed(tickSize);
                opts.sell_price = (opts.buy_price + (opts.buy_price * profit_pourcent / 100.00))
                    .toFixed(tickSize);
            }
        } else {
            messages.printColor('gray', 'BUY ORDER NOT YET FULLY EXECUTED');
            opts.init_buy_filled = false;
            opts.step = 1;
        }
        BNBT.setDataForPair(pair, opts);

    } catch (err) {
        console.log(chalk.red(err));
    }
}

const set_stop_loss_order = async (pair) => {
    const {
        stop_price,
        buy_amount,
        loss_price,
        tot_cancel
    } = BNBT.getDataForPair(pair);

    try {
        const opts = {};
        const orderData = {
            symbol: pair,
            side: 'SELL',
            type: 'STOP_LOSS_LIMIT',
            stopPrice: stop_price,
            quantity: buy_amount,
            price: loss_price,
            recvWindow: 1000000
        };
        const order = await do_order(orderData);
        opts.order_id = order.orderId;

        const log_report = chalk.grey(" STOP LOSS READY (" + tot_cancel + ") @ ") + chalk.cyan(stop_price);
        console.log(log_report);

        opts.step = 3;
        BNBT.setDataForPair(pair, opts);

    } catch (err) {
        console.error(" ERRROR #1233 STOP PRICE (" + stop_price + ") " + err);
        if (String(err)
            .includes("MIN_NOTIONAL")) {
            console.error("⚠️  PLEASE MAKE SURE YOUR BUDGET VALUE IS SUPERIOR THAN 15 USD ⚠️");
        }
        await sell_at_market_price(pair);
    }
}

const add_status_to_trade_report = (pair, trade, status) => {
    const {
        init_buy_filled,
        buy_price
    } = BNBT.getDataForPair(pair);
    const opts = {};
    if (init_buy_filled) {
        opts.pnl = 100.00 * (parseFloat(trade.price) - parseFloat(buy_price)) / parseFloat(buy_price);
    } else {
        opts.pnl = 0.00;
    }
    BNBT.setDataForPair(pair, opts);
    return messages.showTradeReport(trade, opts.pnl, status);
}

const reset_trade = (pair) => {
    const {
        trade_count
    } = BNBT.getDataForPair(pair);
    const opts = {
        step: 0,
        trade_count: trade_count + 1,
        order_id: 0,
        buy_price: 0.00,
        stop_price: 0.00,
        loss_price: 0.00,
        sell_price: 0.00,
        tot_cancel: 0,
        init_buy_filled: false
    };
    BNBT.setDataForPair(pair, opts);
};
