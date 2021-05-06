export interface Notifier {
    notify: (notifierMessage: NotifierMessage) => Promise<void>
}

export interface NotifierMessage {
    subject?: string
    content: string
    contentHtml?: string
}
