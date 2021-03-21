module.exports = {
    plugins: [
        "@semantic-release/commit-analyzer",
        "@semantic-release/release-notes-generator",
        "@semantic-release/changelog",
        "@semantic-release/npm",
        "@semantic-release/github",
        "@semantic-release/git",
    ],
    // eslint-disable-next-line no-template-curly-in-string
    tagFormat: "${version}",
}
