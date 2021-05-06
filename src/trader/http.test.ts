import * as http from "http"
import request from "supertest"
import startWebserver from "./http"

describe("GET /", function() {
    let server: http.Server

    beforeAll(() => {
        server = startWebserver()
    })

    afterAll(() => {
        server.close()
    })

    it("starts webserver", async function() {
        const res = await request(server)
            .get("/")
            .send()

        expect(res.headers["content-type"])
            .toEqual("text/html; charset=utf-8")
        expect(res.status)
            .toEqual(200)
        expect(res.text)
            .toEqual("Node Binance Trader is running.")
    })
})
