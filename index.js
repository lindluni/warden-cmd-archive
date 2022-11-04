const core = require('@actions/core')
const {Octokit} = require("@octokit/rest")
const {retry} = require("@octokit/plugin-retry")
const {throttling} = require("@octokit/plugin-throttling")

const _Octokit = Octokit.plugin(retry, throttling)

async function newClient (token) {
    return new _Octokit({
        auth: token,
        baseUrl: process.env.GITHUB_API_URL,
        retries: 10,
        throttle: {
            onRateLimit: (retryAfter, options, octokit) => {
                octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                if (options.request.retryCount === 0) {
                    octokit.log.info(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
            },
            onSecondaryRateLimit: (retryAfter, options, octokit) => {
                octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`);
                if (options.request.retryCount === 0) {
                    octokit.log.info(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
            },
        }
    });
}

async function main() {
    const actor = core.getInput('actor', {required: true, trimWhitespace: true})
    const adminToken = core.getInput('admin_token', {required: true, trimWhitespace: true})
    const _body = core.getInput('body', {required: true, trimWhitespace: true}).trim().split(' ')
    const issueNumber = core.getInput('issue_number', {required: true, trimWhitespace: true})
    const org = core.getInput('org', {required: true, trimWhitespace: true})
    const repo = core.getInput('repo', {required: true, trimWhitespace: true})
    const githubToken = core.getInput('token', {required: true, trimWhitespace: true})
    const repoToArchive = _body[_body.length - 1]

    let failed = false
    try {
        core.info('Creating client')
        const client = await newClient(adminToken)
        core.debug('Client created')

        core.info('Creating issue')
        await client.repos.update({
            owner: org,
            repo: repoToArchive,
            archived: true
        })
        core.debug('Issue created')
    } catch (e){
        failed = true
        core.setFailed(`Failed to archive repo: ${e.message}`)
    }

    try {
        core.info('Creating client')
        const client = await newClient(githubToken)
        core.debug('Client created')

        let message
        if(failed) {
            message = `@${actor} failed to archive repo ${repoToArchive}`
        } else {
            message = `@${actor} archived repo ${repoToArchive}`
        }
        core.info('Creating issue')
        await client.issues.createComment({
            owner: org,
            repo: repo,
            issue_number: issueNumber,
            body: message
        })
        core.debug('Issue created')
    } catch (e) {
        core.setFailed(`Failed to comment on issue: ${e.message}`)
    }
}

main().catch(e => core.setFailed(e.message))
