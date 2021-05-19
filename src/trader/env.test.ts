import env, { setDefault, testOnly } from "./env"

const OLD_ENV = process.env

beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
})

afterEach(() => {
    setDefault()
    jest.useRealTimers()
    process.env = OLD_ENV
})

describe("env", () => {
    describe("test only", () => {
        it("returns undefined in development environment", async () => {
            process.env.NODE_ENV = "development"
            expect(testOnly("value")).toEqual(undefined)
        })

        it("returns value in test environment", async () => {
            process.env.NODE_ENV = "test"
            expect(testOnly("value")).toEqual("value")
        })

        it("returns undefined in production environment", async () => {
            process.env.NODE_ENV = "production"
            expect(testOnly("value")).toEqual(undefined)
        })
    })

    it("gets default", () => {
        expect(() => {
            env().INEXISTENT
        }).toThrow(ReferenceError)
        expect(env().BVA_API_KEY).toBe("BVA_API_KEY")
        expect(typeof env().BVA_API_KEY).toBe("string")
    })

    it("sets default", () => {
        setDefault({ BVA_API_KEY: "custom" })
        expect(env().BVA_API_KEY).toBe("custom")
        expect(typeof env().BVA_API_KEY).toBe("string")
    })
})
