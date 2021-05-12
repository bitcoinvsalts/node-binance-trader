import { Writable } from "stream"

import winston from "winston"

export let loggerOutput = ""
const stream = new Writable()
stream._write = (chunk, encoding, next) => {
    loggerOutput = loggerOutput += chunk.toString()
    next()
}
export function resetLoggerOutput(): void {
    loggerOutput = ""
}

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({
            format: "YYYY-MM-DD HH:mm:ss"
        }),
        winston.format.colorize({ all: true }),
        winston.format.printf(info => `${info.timestamp} | ${info.level} | ${info.message}`)
    ),
    transports: [
        new winston.transports.Console({
            silent: process.argv.indexOf("--silent") >= 0,
        }),
        new winston.transports.Stream({ stream }),
    ],
})

export default logger
