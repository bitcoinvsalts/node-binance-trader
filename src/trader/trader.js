const env = require("../env")
const tradeService = require("./tradeService")
const express = require("express")

const app = express()
app.get("/", (req, res) => res.send(""))
app.listen(env.TRADER_PORT, () => console.log("NBT auto trader running.".grey))


tradeService.init();
