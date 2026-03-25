const childProcess = require('node:child_process');

const originalExec = childProcess.exec;

childProcess.exec = function patchedExec(command, options, callback) {
    let normalizedOptions = options;
    let normalizedCallback = callback;

    if (typeof normalizedOptions === 'function') {
        normalizedCallback = normalizedOptions;
        normalizedOptions = undefined;
    }

    try {
        return originalExec.call(this, command, normalizedOptions, normalizedCallback);
    } catch (error) {
        const normalizedCommand = String(command || '').trim().toLowerCase();
        const isWindowsNetUseProbe = process.platform === 'win32' && normalizedCommand === 'net use';

        if (!isWindowsNetUseProbe) {
            throw error;
        }

        if (typeof normalizedCallback === 'function') {
            process.nextTick(() => {
                normalizedCallback(error, '', '');
            });
        }

        return {
            pid: undefined,
            kill() {
                return false;
            },
        };
    }
};
