import fs from "fs";
import { spawn } from "child_process";
import { basename, sha } from "mobiletto-orm-typedef";
import { SourceAssetType } from "yuebing-model";
import { ParsedProfile } from "yuebing-media";

export const prepareOutputDir = (assetDir: string, downloaded: string, profile: ParsedProfile): string => {
    const outDir = `${assetDir}/${profile.name}/${sha(downloaded)}`;
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    return outDir;
};

export const profileJobName = (sourceAsset: SourceAssetType, profile: ParsedProfile): string => {
    return [profile.name, basename(sourceAsset.name), sha(sourceAsset.name)].join("~");
};

export type SpawnResult = {
    stdout: string;
    stderr: string;
    exitCode: number | null;
};

export const runExternalCommand = async (command: string, args: string[]): Promise<SpawnResult> => {
    return new Promise((resolve, reject) => {
        if (typeof args === "string") args = [args];
        const process = spawn(command, args);

        let stdout = "";
        let stderr = "";

        process.stdout.on("data", (data) => {
            stdout += data;
        });

        process.stderr.on("data", (data) => {
            stderr += data;
        });

        process.on("close", (code) => {
            resolve({
                stdout: stdout.toString(),
                stderr: stderr.toString(),
                exitCode: code,
            });
        });

        process.on("error", (err) => {
            reject(err);
        });
    });
};

const MIN_XFER_TIMEOUT = 1000 * 60; // 1 minute
const MAX_XFER_TIMEOUT = 1000 * 60 * 60 * 4; // 4 hours

const MIN_BANDWIDTH = 500 * 1000; // ~500Kbps

export const transferTimeout = (size: number, bandwidth?: number, minTimeout?: number, maxTimeout?: number): number => {
    bandwidth ||= MIN_BANDWIDTH;
    minTimeout ||= MIN_XFER_TIMEOUT;
    maxTimeout ||= MAX_XFER_TIMEOUT;
    const millis = 1000 * Math.floor(size / bandwidth);
    return Math.min(Math.max(millis, minTimeout), maxTimeout);
};
