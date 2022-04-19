import { jest } from "@jest/globals"
import logform from "logform"

// https://stackoverflow.com/a/59392688/4682621

import * as winston from 'winston'

jest.mock("winston", () => {
    const format = {
        colorize: jest.fn(),
        combine: jest.fn(),
        timestamp: jest.fn(),
        printf: jest.fn(),
    }
    const transports = {
        Console: jest.fn(),
        Stream: jest.fn(),
    }
    const logger = {}
    return {
        format,
        transports,
        createLogger: jest.fn(() => logger),
    }
})

const formatMocked = jest.mocked(winston.format, true)

describe("logger", () => {
    it("should pass", () => {
        const templateFunctions: any[] = []
        formatMocked.mockImplementation((templateFn: logform.TransformFunction) => {
            templateFunctions.push(templateFn)
            return () => new logform.Format()
        })
        require("./logger")
        const info = {
            timestamp: 123,
            level: "info",
            message: "haha",
        }
        const templateFunction1 = templateFunctions.shift()
        expect(templateFunction1(info)).toBe(
            `${info.timestamp} | ${info.level} | ${info.message}`
        )
    })
})
