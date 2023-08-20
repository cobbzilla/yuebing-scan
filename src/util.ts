import fs from "fs";
import { spawn } from "child_process";
import { basename, sha } from "mobiletto-orm-typedef";
import { SourceAssetType } from "yuebing-model";
import { ParsedProfile } from "yuebing-media";

export const prepareOutputDir = (assetDir: string, downloaded: string, profile: ParsedProfile): string => {
    const outDir = `${assetDir}/${profile.name}/${sha(downloaded)}`;
    const dirStat = !fs.statSync(outDir, { throwIfNoEntry: false });
    if (!dirStat) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    return outDir;
};

export const profileJobName = (sourceAsset: SourceAssetType, profile: ParsedProfile): string => {
    return [profile.name, sourceAsset.source, basename(sourceAsset.name), sha(sourceAsset.name)].join(":");
};

export type SpawnResult = {
    stdout: string;
    stderr: string;
    exitCode: number | null;
};

export const runExternalCommand = async (command: string, args: string[]): Promise<SpawnResult> => {
    return new Promise((resolve, reject) => {
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
