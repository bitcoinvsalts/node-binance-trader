import { Writable } from "stream"

import winston from "winston"
import env from "./trader/env"

export let loggerOutput: string[] = [""]
const stream = new Writable()
stream._write = (chunk, encoding, next) => {
    // Split the chunk into lines and add to the memory array
    let lines = chunk.toString() as string
    while (lines != "") {
        if (lines.indexOf("\n")) {
            let pos = lines.indexOf("\n")
            const cut = pos+1
            if (lines.substr(pos-1, 1) == "\r") pos--
            loggerOutput[loggerOutput.length-1] += lines.substr(0, pos)
            lines = lines.substr(cut)
            loggerOutput.push("") // Start a new line
        } else {
            // If no line feed on the last line, then it will get appended next time
            loggerOutput[loggerOutput.length-1] += lines
            lines = ""
        }
    }

    // Truncate memory array
    while (loggerOutput.length > 1 && loggerOutput.length > env().MAX_LOG_LENGTH) {
        loggerOutput.shift()
    }

    next()
}
export function resetLoggerOutput(): void {
    loggerOutput = [""]
}

const colours = {
    debug: "#808080",
    info: "#008000",
    warn: "#ffa500",
    error: "#ff0000",
} as any

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            silent: process.env.NODE_ENV === "test",
            format: winston.format.combine(
                winston.format.timestamp({
                    format: "YYYY-MM-DD HH:mm:ss",
                }),
                winston.format.colorize({ all: true }),
                winston.format.printf(
                    (info) => `${info.timestamp} | ${info.level} | ${info.message}`
                )
            )
        }),
        new winston.transports.Stream({
            stream,
            format: winston.format.combine(
                winston.format.timestamp({
                    format: "YYYY-MM-DD HH:mm:ss",
                }),
                winston.format.printf(
                    (info) => `<font color=${colours[info.level]}>${info.timestamp} | ${info.level} | ${info.message}</font>`
                ),
            )
        }),
    ],
    level: process.env.LOG_LEVEL || "info"
})

export default logger
