import winston from "winston"

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({
            format: "YYYY-MM-DD HH:mm:ss"
        }),
        winston.format.colorize({ all: true }),
        winston.format.printf(info => `${info.timestamp} | ${info.level} | ${info.message}`)
    ),
    transports: [new winston.transports.Console({
        silent: process.argv.indexOf("--silent") >= 0,
    })],
})

export default logger
