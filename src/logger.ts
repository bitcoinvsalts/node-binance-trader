import { Writable } from "stream"

import winston from "winston"
import { toJSON } from "./trader/apis/json"
import { saveRecord } from "./trader/apis/postgres"
import env from "./trader/env"

export let loggerOutput: string[] = [""]
const stream = new Writable()
stream._write = (chunk, encoding, next) => {
    // Split the chunk into lines and add to the memory array
    let lines = chunk.toString() as string
    while (lines != "") {
        // Look for the null character we added at the end of the log entry
        if (lines.indexOf("\0")) {
            // Split the line and append the start to the previous chunk
            const [head, tail] = splitLog(lines)
            loggerOutput[loggerOutput.length-1] += head
            lines = tail

            // Start a new line
            loggerOutput.push("")
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

let dbBuffer = ""
const dbStream = new Writable()
dbStream._write = (chunk, encoding, next) => {
    // Split the chunk into lines and write to the database
    let lines = chunk.toString() as string
    while (lines != "") {
        // Look for the null character we added at the end of the log entry
        if (lines.indexOf("\0")) {
            // Split the line and log to the database with the previous chunk
            const [head, tail] = splitLog(lines)
            saveRecord("log", dbBuffer + head)
            lines = tail

            // Start a new line
            dbBuffer = ""
        } else {
            // If no null character on the last line it must be mid stream, so it will get appended with the next chunk
            dbBuffer += lines
            lines = ""
        }
    }
    
    next()
}

function splitLog(lines: string): [string, string] {
    const pos = lines.indexOf("\0")

    // Even though we put the null character at the end, winston will add a new line after
    let cut = pos + 2
    // Not sure if new line is always \r\n, or just \n, so allow for both cases
    if (lines.substr(cut, 1) == '\n') cut++

    return [lines.substr(0, pos), lines.substr(cut)]
}

// HTML colours for each log level
const colours = {
    silly: "#2472C8",
    debug: "#808080",
    info: "#008000",
    warn: "#ffa500",
    error: "#ff0000",
} as any

const timestamp = winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
})

const consoleFormat = winston.format.printf(
    (info) => `${info.timestamp} | ${info.level} | ${info.message}`
)

const htmlFormat = winston.format.printf(
    // Add html formatting for coloured logs
    // Includes a null character at the end so we can detect where each log entry ends in the stream
    (info) => `<font color=${colours[info.level]}>${info.timestamp} | ${info.level} | ${info.message}</font>\0`
)

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            silent: process.env.NODE_ENV == "test",
            format: process.env.NODE_ENV == "production"
                ? winston.format.combine(
                    timestamp,
                    consoleFormat
                )
                : winston.format.combine(
                    timestamp,
                    winston.format.colorize({ all: true }), // When running in Heroku we can't use colours in the console, so only allow this in non-production environments
                    consoleFormat
                )
        }),
        new winston.transports.Stream({
            stream, // Memory stream used for displaying the logs in HTML
            format: winston.format.combine(
                timestamp,
                htmlFormat
            )
        }),
        new winston.transports.Stream({
            stream: dbStream, // Memory stream used for writing raw logs to the database
            format: winston.format.combine(
                timestamp,
                htmlFormat
            ),
            level: "info" // To limit the size of the logs, and avoid an infinite loop, only log 'info' or higher
        }),
    ],
    level: env().LOG_LEVEL || "info"
})

export default logger
