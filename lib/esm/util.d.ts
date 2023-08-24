import { SourceAssetType } from "yuebing-model";
import { ParsedProfile } from "yuebing-media";
export declare const prepareOutputDir: (assetDir: string, downloaded: string, profile: ParsedProfile) => string;
export declare const profileJobName: (sourceAsset: SourceAssetType, profile: ParsedProfile) => string;
export type SpawnResult = {
    stdout: string;
    stderr: string;
    exitCode: number | null;
};
export declare const runExternalCommand: (command: string, args: string[]) => Promise<SpawnResult>;
export declare const transferTimeout: (size: number, bandwidth?: number, minTimeout?: number, maxTimeout?: number) => number;
