const env = require("../env")

const gmail_address = env.GMAIL_ADDRESS
const gmail_app_password = env.GMAIL_APP_PASSWORD

function createMailMessage(subject, html) {
  return {
    from: '"🐬  BVA " <no-reply@gmail.com>',
    to: gmail_address,
    subject,
    text: html,
    html,
  }
}

function createSignalMessage(base, signal) {
  const subject =
    base + " :: " +
    signal.stratname +
    " " +
    signal.pair +
    " " +
    signal.price;

  const text =
    (signal.score
      ? "score: " + signal.score
      : "score: NA") + "\n";

  return createMailMessage(subject, text)
}

module.exports = function () {
  if (!env.USE_GMAIL) return {};

  const mailTransport = require("nodemailer").createTransport(
    `smtps://${encodeURIComponent(gmail_address)}:${encodeURIComponent(gmail_app_password)}@smtp.gmail.com`
  )

  function send(message) {
    if (!env.USE_GMAIL) return;

    if (typeof message === "string") {
      message = createMailMessage("Tading Bot Message", message)
    }

    return mailTransport
      .sendMail(message)
      .catch((error) => {
        console.error(
          "There was an error while sending the email ... trying again...", error
        )
        setTimeout(() => {
          mailTransport
            .sendMail(message)
            .catch((error) => {
              console.error(
                "There was an error while sending the email: stop trying", error
              )
            })
        }, 2000)
      })
  }

  function notifyBuyToCoverSignal(signal) {
    return send(createSignalMessage("<i>BUY_SIGNAL :: BUY TO COVER SHORT TRADE</i>", signal));
  }
  function notifyBuyToCoverTraded(signal) {
    return send(createSignalMessage("<b>>> SUCCESS! BUY_SIGNAL :: BUY TO COVER SHORT TRADE</b>", signal));
  }
  function notifyEnterLongSignal(signal) {
    return send(createSignalMessage("<i>BUY_SIGNAL :: ENTER LONG TRADE</i>", signal));
  }
  function notifyEnterLongTraded(signal) {
    return send(createSignalMessage("<b>>> SUCCESS! BUY_SIGNAL :: ENTER LONG TRADE</b>", signal));
  }
  function notifyEnterShortSignal(signal) {
    return send(createSignalMessage("<i>SEL_SIGNAL :: ENTER SHORT TRADE</i>", signal));
  }
  function notifyEnterShortTraded(signal) {
    return send(createSignalMessage("<b>>> SUCCESS! SELL_SIGNAL :: ENTER SHORT TRADE</b>", signal));
  }
  function notifyExitLongSignal(signal) {
    return send(createSignalMessage("<i>SELL_SIGNAL :: SELL TO EXIT LONG TRADE</i>", signal));
  }
  function notifyExitLongTraded(signal) {
    return send(createSignalMessage("<b>>> SUCCESS! SELL_SIGNAL :: SELL TO EXIT LONG TRADE</b>", signal));
  }

  return {
    notifyBuyToCoverSignal,
    notifyBuyToCoverTraded,
    notifyEnterLongSignal,
    notifyEnterLongTraded,
    notifyEnterShortSignal,
    notifyEnterShortTraded,
    notifyExitLongSignal,
    notifyExitLongTraded,
    send,
  }
}
