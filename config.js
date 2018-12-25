/* ============================================================
 * node-binance-trader
 * https://github.com/nillo/better-node-binance-trader
 * ============================================================
 * Copyright 2019, Nillo Felix - bbnillo@gmail.com
 * Forked from node-binance-trader ( v0.0.7 - 🐬 delphines 🐬 ) by Herve Fulchiron - herve76@gmail.com
 * Released under the MIT License
 * better-node-biance-trader v0.0.1 - unicorn
 * 01/01/2019
 * ============================================================ */


/////////////////////////////////////////////////////////////////////////////////
// https://www.binance.com/restapipub.html
// REPLACE xxx with your own API key key and secret.
//
export const config = {
    APIKEY: 'I0jz2Lc9oEfObCvFS9JUpgqmDlhP4kXYHmzOs7lEubx1hLDw78nA5UHX5VcBuag6',
    APISECRET: 'LS3j91sWKqwn5IAHynRMQp87J9sDmxzdVzOJAAr1xf6XKKhphg6K7y1StVUQ0Cxd'
};

export const defaults = {
    base_currency: "BTC",
    budget: "0.004021",
    fixed_buy_price: "0.00",
    currency_to_buy: "ADA",
    profit_pourcent: "0.80",
    loss_pourcent: "0.40",
    trailing_pourcent: "0.40"
};
