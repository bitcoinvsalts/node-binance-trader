const io = require("socket.io-client")
const env = require('../env');
const colors = require("colors")
const nbt_vers = env.VERSION
const bva_key = env.BVA_API_KEY
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

module.exports = {
    socket
};
