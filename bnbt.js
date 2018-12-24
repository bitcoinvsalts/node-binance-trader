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

import binance from 'binance-api-node';
import storage from 'node-persist';
import { config } from './config';

let pairs = {};

class BNBT {
    constructor(){
        if(!BNBT.instance){
            this.init();
            BNBT.instance = this;
        }
        
        return BNBT.instance;
    }

    client = binance({ 
        apiKey: config.APIKEY,
        apiSecret: config.APISECRET,
        useServerTime: true 
    });

    init = async () => { 
        // Configure storage
        await storage.init({
            dir: './data',
            stringify: JSON.stringify,
            parse: JSON.parse,
            encoding: 'utf8',
            logging: false,  // can also be custom logging function
            ttl: false, // ttl* [NEW], can be true for 24h default or a number in MILLISECONDS or a valid Javascript Date object
            // expiredInterval: 2 * 60 * 1000, // every 2 minutes the process will clean-up the expired cache
            // in some cases, you (or some other service) might add non-valid storage files to your
            // storage dir, i.e. Google Drive, make this true if you'd like to ignore these files and not throw an error
            forgiveParseErrors: false
        });
    }

    // primary storage setter
    setToStorage = (data) => {
        pairs = data;
    };

    // getters and setters pairs
    getAllPairs = () => pairs;

    getDataForPair = (pair) => {
        const storedPairs = this.getAllPairs();
        return storedPairs[pair];
    }

    setDataForPair = (pair, pairData) => {
        const storedPair = this.getDataForPair(pair);
        const mergedPairData = { 
            [pair]: {
                ...storedPair,
                ...pairData 
            }
        };
        this.setPairs(mergedPairData);
    }

    setPairs = (pairData) => {
        const storedPairs = this.getAllPairs();
        this.setToStorage({ ...storedPairs, ...pairData });
    }

    //  add pairs
    newPair = async (pair, tradeRequestData) => {
        const pairData = {
            [pair]: {
                pair_name: pair,
                pnl: 0,
                step: 0,
                trade_count: 0,
                order_id: 0,
                buy_price: 0.00,
                bid_price: 0.00,
                ask_price: 0.00,
                switch_price: 0.00,
                stop_price: 0.00,
                loss_price: 0.00,
                sell_price: 0.00,
                buy_amount: 0.00,
                stepSize: 0,
                tickSize: 8,
                tot_cancel: 0,
                pair: "",
                buying_method: "",
                selling_method: "",
                init_buy_filled: false,
                base_currency: '',
                budget: '',
                fixed_buy_price: '',
                currency_to_buy: '',
                profit_pourcent: '',
                loss_pourcent: '',
                trailing_pourcent: '',
                trade_active: false,
                orderData: {},
                ...tradeRequestData
            }
        } 
        this.setPairs(pairData);
    }

    // primary hard storage getter
    getFromHardStorage = (item) => storage.getItem(item);

    // primary hard storage setter
    setToHardStorage = (item, data) => storage.setItem(item, data);

    // getters and setters pairs
    getAllPairsFromHardStorage = () => this.getFromHardStorage('pairs');

    getDataForPairFromHardStorage = async (pair) => {
        const storedPairs = await this. getAllPairsFromHardStorage();
        return storedPairs[pair];
    };

    setPairsToHardStorage = async (pairData) => {
        const storedPairs = await this.getAllPairs();
        await this.setToHardStorage('pairs', { ...storedPairs, ...pairData });
    }

}

const instance = new BNBT();

Object.freeze(instance);

export default instance;