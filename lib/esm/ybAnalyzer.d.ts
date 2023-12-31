import { ZillaClock } from "zilla-util";
import { SourceAssetType } from "yuebing-model";
import { YbScanConfig } from "./config.js";
export declare class YbAnalyzer {
    readonly config: YbScanConfig;
    readonly clock: ZillaClock;
    readonly analyzerPollInterval: number;
    readonly uploadPollInterval: number;
    timeout: number | object | null;
    running: boolean;
    paused: boolean;
    stopping: boolean;
    constructor(config: YbScanConfig);
    start(): void;
    stop(): void;
    downloadAndProcess(asset: SourceAssetType): Promise<boolean>;
}
