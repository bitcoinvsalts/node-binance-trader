const Task = function (job) {
    this.job = job
    this.onFinished = () => null
    this.onError = () => null
    this.currentRetry = 0
    this.maxRetries = 4
}

module.exports = Task
