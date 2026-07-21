import * as process from 'process';
import * as os from 'os';

import * as core from '@actions/core';
import * as github from '@actions/github';
import fs from 'fs';
import axios, { isAxiosError } from 'axios';

import { Cargo } from './rs-actions-core';

import * as input from './input';
import * as interfaces from './interfaces';
import * as reporter from './reporter';

async function validateSubscription() {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    let repoPrivate: boolean | undefined;

    if (eventPath && fs.existsSync(eventPath)) {
        const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
        repoPrivate = eventData?.repository?.private;
    }

    const upstream = 'rustsec/audit-check';
    const action = process.env.GITHUB_ACTION_REPOSITORY;
    const docsUrl =
        'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';

    core.info('');
    core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
    core.info(`Secure drop-in replacement for ${upstream}`);
    if (repoPrivate === false)
        core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
    core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
    core.info('');

    if (repoPrivate === false) return;

    const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
    const body: Record<string, string> = { action: action || '' };
    if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
    try {
        await axios.post(
            `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
            body,
            { timeout: 3000 },
        );
    } catch (error) {
        if (isAxiosError(error) && error.response?.status === 403) {
            core.error(
                `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`,
            );
            core.error(
                `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`,
            );
            process.exit(1);
        }
        core.info('Timeout or API not reachable. Continuing to next step.');
    }
}

async function getData(
    ignore: string[] | undefined,
    workingDirectory: string,
): Promise<interfaces.Report> {
    const cargo = await Cargo.get();
    await cargo.install('cargo-audit');

    let stdout = '';
    try {
        core.startGroup('Calling cargo-audit (JSON output)');
        const commandArray = ['audit'];
        for (const item of ignore ?? []) {
            commandArray.push('--ignore', item);
        }
        commandArray.push('--json');
        commandArray.push('--file', `${workingDirectory}/Cargo.lock`);
        await cargo.call(commandArray, {
            ignoreReturnCode: true,
            listeners: {
                stdout: (buffer) => {
                    stdout += buffer.toString();
                },
            },
        });
    } finally {
        // Cool story: `cargo-audit` JSON output is missing the trailing `\n`,
        // so the `::endgroup::` annotation from the line below is being
        // eaten by it.
        // Manually writing the `\n` to denote the `cargo-audit` end
        process.stdout.write(os.EOL);
        core.endGroup();
    }

    return JSON.parse(stdout);
}

function removeTrailingSlash(str) {
    if (str[str.length - 1] === '/') {
        return str.substr(0, str.length - 1);
    }
    return str;
}

export async function run(actionInput: input.Input): Promise<void> {
    const ignore = actionInput.ignore;
    const workingDirectory = removeTrailingSlash(actionInput.workingDirectory);
    const report = await getData(ignore, workingDirectory);
    let shouldReport = false;
    if (!report.vulnerabilities.found) {
        core.info('No vulnerabilities were found');
    } else {
        core.warning(`${report.vulnerabilities.count} vulnerabilities found!`);
        shouldReport = true;
    }

    // In `cargo-audit < 0.12` report contained an array of `Warning`.
    // In `cargo-audit >= 0.12` it is a JSON object,
    // where key is a warning type, and value is an array of `Warning` of that type.
    let warnings: Array<interfaces.Warning> = [];
    if (Array.isArray(report.warnings)) {
        warnings = report.warnings;
    } else {
        for (const items of Object.values(report.warnings)) {
            warnings = warnings.concat(items);
        }
    }

    if (warnings.length === 0) {
        core.info('No warnings were found');
    } else {
        core.warning(`${warnings.length} warnings found!`);
        shouldReport = true;
    }

    if (!shouldReport) {
        return;
    }

    // const octokit = github.getOctokit(actionInput.token, {userAgent: USER_AGENT});
    const advisories = report.vulnerabilities.list;
    if (github.context.eventName == 'schedule') {
        core.debug(
            'Action was triggered on a schedule event, creating an Issues report',
        );
        await reporter.reportIssues(actionInput.token, advisories, warnings);
    } else {
        core.debug(
            `Action was triggered on a ${github.context.eventName} event, creating a Check report`,
        );
        await reporter.reportCheck(actionInput.token, advisories, warnings);
    }
}

async function main(): Promise<void> {
    await validateSubscription();
    try {
        const actionInput = input.get();
        await run(actionInput);
    } catch (error) {
        core.setFailed((error as Error).message);
    }

    return;
}

void main();
