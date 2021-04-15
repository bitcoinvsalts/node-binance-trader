const env = require("../env")

const gmail_address = env.GMAIL_ADDRESS
const gmail_app_password = env.GMAIL_APP_PASSWORD

module.exports = function () {
    if (!env.USE_GMAIL) return {}

    const mailTransport = require("nodemailer").createTransport(
        `smtps://${encodeURIComponent(gmail_address)}:${encodeURIComponent(
            gmail_app_password
        )}@smtp.gmail.com`
    )

    function send(message) {
        if (!env.USE_GMAIL) return

        if (typeof message === "string") {
            message = createMailMessage("Trading Bot Message", message)
        }

        return mailTransport.sendMail(message).catch((error) => {
            console.error(
                "There was an error while sending the email ... trying again...",
                error
            )
            setTimeout(() => {
                mailTransport.sendMail(message).catch((error) => {
                    console.error(
                        "There was an error while sending the email: stop trying",
                        error
                    )
                })
            }, 2000)
        })
    }

    return {
        notifyEnterLongSignal,
        notifyEnterLongSignalTraded,
        notifyEnterShortSignal,
        notifyEnterShortSignalTraded,
        notifyExitLongSignal,
        notifyExitLongSignalTraded,
        notifyExitShortSignal,
        notifyExitShortSignalTraded,
        send,
    }
}

function createSignalMessage(base, signal) {
    return createMailMessage(
        base,
        base +
            "\n" +
            "strategy: " +
            signal.stratname +
            "\n" +
            "price: " +
            signal.price +
            "\n" +
            "score: " +
            (signal.score || "N/A")
    )
}

function createMailMessage(subject, html) {
    return {
        from: '"🐬  BVA " <no-reply@gmail.com>',
        to: gmail_address,
        subject,
        text: html,
        html,
    }
}

function notifyEnterLongSignal(signal) {
    return send(
        createSignalMessage(`<b>Enter ${signal.pair} long trade.</b>`, signal)
    )
}
function notifyEnterLongSignalTraded(signal) {
    return send(
        createSignalMessage(`<b>SUCCESS!</b> Entered ${signal.pair} long trade.`, signal)
    )
}
function notifyEnterShortSignal(signal) {
    return send(
        createSignalMessage(`<b>Enter ${signal.pair} short trade.</b>`, signal)
    )
}
function notifyEnterShortSignalTraded(signal) {
    return send(
        createSignalMessage(`<b>SUCCESS!</b> Entered ${signal.pair} short trade.`, signal)
    )
}
function notifyExitLongSignal(signal) {
    return send(
        createSignalMessage(`<b>Exit ${signal.pair} long trade.</b>`, signal)
    )
}
function notifyExitLongSignalTraded(signal) {
    return send(
        createSignalMessage(`<b>SUCCESS!</b> Exited ${signal.pair} long trade.`, signal)
    )
}
function notifyExitShortSignal(signal) {
    return send(
        createSignalMessage(`<b>Exit ${signal.pair} short trade.</b>`, signal)
    )
}
function notifyExitShortSignalTraded(signal) {
    return send(
        createSignalMessage(`<b>SUCCESS!</b> Exited ${signal.pair} short trade.`, signal)
    )
}
