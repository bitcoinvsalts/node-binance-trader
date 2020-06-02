const TeleBot = require('telebot')
const _ = require('lodash')

module.exports = function (use_telegram, telegramToken, telChanel, trading_pairs) {
    if (!use_telegram) {
        return true;
    }
     const telBot = new TeleBot({
        token: telegramToken, // Required. Telegram Bot API token.
        polling: { // Optional. Use polling.
            interval: 700, // Optional. How often check updates (in ms).
            timeout: 0, // Optional. Update polling timeout (0 - short polling).
            limit: 100, // Optional. Limits the number of updates to be retrieved.
            retryTimeout: 5000, // Optional. Reconnecting timeout (in ms).
            // proxy: 'http://username:password@yourproxy.com:8080' // Optional. An HTTP proxy to be used.
        },
        // webhook: { // Optional. Use webhook instead of polling.
        //     key: 'key.pem', // Optional. Private key for server.
        //     cert: 'cert.pem', // Optional. Public key.
        //     url: 'https://....', // HTTPS url to send updates to.
        //     host: '0.0.0.0', // Webhook server host.
        //     port: 443, // Server port.
        //     maxConnections: 40 // Optional. Maximum allowed number of simultaneous HTTPS connections to the webhook for update delivery
        // },
        allowedUpdates: [], // Optional. List the types of updates you want your bot to receive. Specify an empty list to receive all updates.
        usePlugins: ['askUser'], // Optional. Use user plugins from pluginFolder.
        pluginFolder: '../plugins/', // Optional. Plugin folder location.
        pluginConfig: { // Optional. Plugin configuration.
        // myPluginName: {
        //   data: 'my custom value'
        // }
        }
    });
    
    telBot.telChanel = telChanel;
    
    // GET CHANEL ID
    telBot.on('/info', async (msg) => {       
        let response = "Open Trades: "+ _.values(trading_pairs).length+"\n" 
        // response += "Chanel ID : "+msg.chat.id+"\n"  //IF UNCOMENT SHOW CHANEL ID 
        // telBot.telChanel = msg.chat.id
        return telBot.sendMessage(telChanel, response)
    });

    telBot.start();

    return telBot;

}
    
    
   