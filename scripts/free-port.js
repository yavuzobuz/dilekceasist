import { execSync } from 'node:child_process';

const port = Number(process.argv[2] || 3001);

function run(cmd) {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function getListeningPidsWindows(targetPort) {
    const output = run(`cmd /c netstat -ano | findstr :${targetPort}`);
    const lines = output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => /\bLISTENING\b/i.test(line));

    const pids = lines
        .map(line => {
            const parts = line.split(/\s+/);
            return Number(parts[parts.length - 1]);
        })
        .filter(pid => Number.isInteger(pid) && pid > 0);

    return [...new Set(pids)];
}

function killWindowsPid(pid) {
    run(`cmd /c taskkill /PID ${pid} /F`);
}

function main() {
    if (process.platform !== 'win32') {
        return;
    }

    let pids = [];
    try {
        pids = getListeningPidsWindows(port);
    } catch {
        pids = [];
    }

    if (pids.length === 0) {
        return;
    }

    for (const pid of pids) {
        try {
            killWindowsPid(pid);
            console.log(`[free-port] Freed port ${port} by terminating PID ${pid}`);
        } catch (error) {
            console.error(`[free-port] Failed to kill PID ${pid}: ${error.message}`);
            process.exit(1);
        }
    }
}

main();
