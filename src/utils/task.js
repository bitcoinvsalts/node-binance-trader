const Task = function (job) {
    this.job = job
    this.onFinished = () => null
    this.onError = () => null
    this.currentRetry = 0
    // The maximum number of times a task will auto-retry.
    // 4 seems to work pretty well, increase if needed.
    this.maxRetries = 4
}

module.exports = Task
