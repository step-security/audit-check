import * as core from '@actions/core';

export function getInput(name: string, options?: core.InputOptions): string {
    return core.getInput(name, options);
}

export function getInputList(
    name: string,
    options?: core.InputOptions,
): string[] {
    return core
        .getInput(name, options)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
