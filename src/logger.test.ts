// https://stackoverflow.com/a/59392688/4682621

jest.mock("winston", () => {
    const format = {
        colorize: jest.fn(),
        combine: jest.fn(),
        timestamp: jest.fn(),
        printf: jest.fn(),
    }
    const transports = {
        Console: jest.fn(),
    }
    const logger = {}
    return {
        format,
        transports,
        createLogger: jest.fn(() => logger),
    }
})

import { format } from "winston"

describe("logger", () => {
    it("should pass", () => {
        const templateFunctions: any[] = [];
        (format.printf as jest.Mock).mockImplementation((templateFn) => {
            templateFunctions.push(templateFn)
        })
        require("./logger")
        const info = {
            timestamp: 123,
            level: "info",
            message: "haha",
        }
        const templateFunction1 = templateFunctions.shift()
        expect(templateFunction1(info))
            .toBe(`${info.timestamp} | ${info.level} | ${info.message}`)
    })
})
