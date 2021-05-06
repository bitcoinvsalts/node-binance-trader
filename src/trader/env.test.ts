import { testOnly } from "./env"

const OLD_ENV = process.env

beforeAll(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
})

afterAll(() => {
    jest.useRealTimers()
    process.env = OLD_ENV
})

describe("env", () => {
    it("returns undefined in development environment", async () => {
        process.env.NODE_ENV = "development"
        expect(testOnly("value"))
            .toEqual(undefined)
    })
    it("returns value in test environment", async () => {
        process.env.NODE_ENV = "test"
        expect(testOnly("value"))
            .toEqual("value")
    })
    it("returns undefined in production environment", async () => {
        process.env.NODE_ENV = "production"
        expect(testOnly("value"))
            .toEqual(undefined)
    })
})
