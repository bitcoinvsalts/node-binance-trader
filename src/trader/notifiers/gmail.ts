import env from "../env"
import nodeMailer from "nodemailer"
import { Notifier, NotifierMessage } from "../types/notifier"

export default function (): Notifier {
    return {
        notify
    }
}

const gmailAddress = env.NOTIFIER_GMAIL_ADDRESS
const gmailAppPassword = env.NOTIFIER_GMAIL_APP_PASSWORD

const mailTransport = nodeMailer.createTransport(
    `smtps://${encodeURIComponent(gmailAddress)}:${encodeURIComponent(
        gmailAppPassword
    )}@smtp.gmail.com`
)

async function notify(message: NotifierMessage): Promise<void> {
    if (!env.IS_NOTIFIER_GMAIL_ENABLED) return

    return mailTransport.sendMail({
        from: "\"🐬  BVA \" <no-reply@gmail.com>",
        to: gmailAddress,
        subject: message.subject,
        text: message.content,
        html: message.contentHtml,
    })
}
