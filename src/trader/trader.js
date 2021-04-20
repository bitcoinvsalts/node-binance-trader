const env = require("../env")
const tradeService = require("./tradeService")
const express = require("express")
const io = require("socket.io-client")
const colors = require("colors")
const nbt_vers = env.VERSION
const bva_key = env.BVA_API_KEY

const app = express()
app.get("/", (req, res) => res.send(""))
app.listen(env.TRADER_PORT, () => console.log("NBT auto trader running.".grey))
const socket = io("https://nbt-hub.herokuapp.com", {
    query: "v=" + nbt_vers + "&type=client&key=" + bva_key,
})
socket.on("connect", () => {
    console.log("Auto Trader connected.".grey)
})
socket.on("disconnect", () => {
    console.log("Auto Trader disconnected.".grey)
})
socket.on("message", (message) => {
    console.log(colors.magenta("NBT Message: " + message))
})
socket.on("buy_signal", tradeService.onBuySignal)
socket.on("sell_signal", tradeService.onSellSignal)
socket.on("close_traded_signal", tradeService.onCloseTradedSignal)
socket.on("stop_traded_signal", tradeService.onStopTradedSignal)
socket.on("user_payload", tradeService.onUserPayload)

tradeService.init();
