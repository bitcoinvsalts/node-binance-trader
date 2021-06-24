import { Writable } from "stream"

import winston from "winston"
import env from "./trader/env"

export let loggerOutput: string[] = [""]
const stream = new Writable()
stream._write = (chunk, encoding, next) => {
    // Split the chunk into lines and add to the memory array
    let lines = chunk.toString() as string
    while (lines != "") {
        // Look for the null character we added at the end of the log entry
        if (lines.indexOf("\0")) {
            const pos = lines.indexOf("\0")
            loggerOutput[loggerOutput.length-1] += lines.substr(0, pos)
            // Even though we put the null character at the end, winston will add a new line after
            let cut = pos + 2
            // Not sure if new line is always \r\n, or just \n, so allow for both cases
            if (lines.substr(cut, 1) == '\n') cut++
            lines = lines.substr(cut)
            loggerOutput.push("") // Start a new line
        } else {
            // If no null character on the last line it must be mid stream, so it will get appended with the next chunk
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

// HTML colours for each log level
const colours = {
    silly: "#2472C8",
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
                winston.format.colorize({ all: process.env.NODE_ENV != "production" }), // When running in Heroku we can't use colours in the console
                winston.format.printf(
                    (info) => `${info.timestamp} | ${info.level} | ${info.message}`
                )
            )
        }),
        new winston.transports.Stream({
            stream, // Memory stream used for displaying the logs in HTML
            format: winston.format.combine(
                winston.format.timestamp({
                    format: "YYYY-MM-DD HH:mm:ss",
                }),
                winston.format.printf(
                    // Includes a null character at the end so we can detect where each log entry ends in the stream
                    (info) => `<font color=${colours[info.level]}>${info.timestamp} | ${info.level} | ${info.message}</font>\0`
                ),
            )
        }),
    ],
    level: process.env.LOG_LEVEL || "info"
})

export default logger
