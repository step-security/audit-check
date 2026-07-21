import * as github from '@actions/github';

type OctokitRest = ReturnType<typeof github.getOctokit>['rest'];

interface CheckOutput {
    title: string;
    summary: string;
    text?: string;
}

export class CheckReporter {
    private readonly client: OctokitRest;
    private readonly checkName: string;
    private checkRunId: number | undefined;

    constructor(client: OctokitRest, checkName: string) {
        this.client = client;
        this.checkName = checkName;
    }

    async startCheck(status: 'queued' | 'in_progress'): Promise<void> {
        const { owner, repo } = github.context.repo;
        const sha =
            github.context.payload.pull_request?.head.sha ?? github.context.sha;
        const response = await this.client.checks.create({
            owner,
            repo,
            name: this.checkName,
            head_sha: sha,
            status,
        });
        this.checkRunId = response.data.id;
    }

    async finishCheck(
        conclusion: 'success' | 'failure' | 'neutral' | 'cancelled',
        output: CheckOutput,
    ): Promise<void> {
        if (this.checkRunId == null) {
            throw new Error('Check run was not started');
        }
        const { owner, repo } = github.context.repo;
        await this.client.checks.update({
            owner,
            repo,
            check_run_id: this.checkRunId,
            status: 'completed',
            conclusion,
            output,
        });
    }

    async cancelCheck(): Promise<void> {
        if (this.checkRunId == null) return;
        const { owner, repo } = github.context.repo;
        await this.client.checks.update({
            owner,
            repo,
            check_run_id: this.checkRunId,
            status: 'completed',
            conclusion: 'cancelled',
        });
    }
}
