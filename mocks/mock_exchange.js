import fixed_order from './fixed_order.mock.js';
import get_order from './get_order.mock.js';
import listed_pairs from './listed_pairs.mock.js';
import market_order from './market_order.mock.js';
import my_trades from './my_trades.mock.js';
import order_book from './order_book.mock.js';
import bid_order from './bid_order.mock';
import cancel_order from './cancel_order.mock.js';

const create_order = ({ price, amount }) => {
    let order = { 
        eventType: 'trade',
        eventTime: new Date().getTime(),
        symbol: 'ADABTC',
        price: price,
        quantity: amount,
        maker: true,
        isBuyerMaker: true,
        tradeId: 74653894 
    };
    return order;
}

const plusValue = (price) => parseFloat((price + 0.00000001).toFixed(8), 10);
const minusValue = (price) => parseFloat((price - 0.00000001).toFixed(8), 10);

const random_select_order_type_when_not_market_order = () => {
    const order_types = [
        bid_order,
        fixed_order
    ];

    return order_types[Math.floor(Math.random() * order_types.length)];
};

class MockExchange {
  cancelOrder = () => Promise.resolve(cancel_order);

  order(order_data) {
      if (order_data.type === 'MARKET') {
          console.log('market-order-active');
          return Promise.resolve(market_order);
      }
      return Promise.resolve(random_select_order_type_when_not_market_order());
  }

  getOrder = () => Promise.resolve(get_order);

  exchangeInfo = () => Promise.resolve(listed_pairs);

  book = () => Promise.resolve(order_book);

  myTrades = () => Promise.resolve(my_trades);

  ws = {
    trades: (pair, cb, direction) => {
        console.log('starting mocktrade for pair: ', pair);
        let price = parseFloat(0.00001064);
        this.interval = setInterval(() => {
            const amount = parseFloat((Math.random() * (3305.00000000 - 0.00000005) + 0.000001).toFixed(8), 10);
            price = (direction === 'up') ? plusValue(price) : minusValue(price)
            const order = create_order({ price: price, amount });
            return cb(order);               
        }, 1000);    
    },
    close: () => {
        console.log('closing mocksocket');
        clearInterval(this.interval);
    }
  }

}

export default new MockExchange();