import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';

export class Cargo {
    private readonly path: string;

    private constructor(path: string) {
        this.path = path;
    }

    static async get(): Promise<Cargo> {
        const cargoPath = await io.which('cargo', true);
        return new Cargo(cargoPath);
    }

    async install(program: string): Promise<void> {
        const existing = await io.which(program, false);
        if (existing) {
            core.debug(`${program} already installed at ${existing}`);
            return;
        }
        core.info(`Installing ${program} via cargo install...`);
        await exec.exec(this.path, ['install', program, '--locked']);
    }

    async call(args: string[], options?: exec.ExecOptions): Promise<number> {
        return exec.exec(this.path, args, options);
    }
}
