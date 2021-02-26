const TradeQueue = function () {
    const {
        setIntervalAsync,
        clearIntervalAsync,
    } = require("set-interval-async/dynamic")
    const colors = require("colors")

    const queue = []
    const interval = 250
    let setIntervalAsyncHandle

    const addToQueue = (task) => {
        queue.push(task)
    }

    const startQueue = () => {
        setIntervalAsyncHandle = setIntervalAsync(
            () => processQueue(),
            interval
        )
    }

    const stopQueue = async () => {
        await clearIntervalAsync(setIntervalAsyncHandle)
    }

    const processQueue = async () => {
        if (queue.length === 0) {
            return
        }

        while (queue.length > 0) {
            const task = queue[0]

            try {
                const res = await task.job()
                task.onFinished(res)
                queue.shift() // Remove current task
            } catch (error) {
                task.onError(error)
                if (error.body) {
                    console.error(error.body)
                } else {
                    console.error("ERROR IN QUEUE!", JSON.stringify(error))
                }

                if (task.currentRetry >= task.maxRetries) {
                    queue.shift() // Remove current task
                    console.log("No more retries left".red)
                } else {
                    console.log(
                        `Retries left: ${task.maxRetries - task.currentRetry}`
                            .magenta
                    )
                    task.currentRetry += 1
                }
            }
        }
    }

    return {
        addToQueue: (task) => {
            return addToQueue(task)
        },
        startQueue: () => {
            return startQueue()
        },
        stopQueue: () => {
            return stopQueue()
        },
    }
}

module.exports = TradeQueue
