import { MobilettoClock } from "mobiletto-orm-scan-typedef";
import { SourceAssetType } from "yuebing-model";
import { YbScanConfig } from "./config.js";
export declare class YbAnalyzer {
    readonly config: YbScanConfig;
    readonly clock: MobilettoClock;
    readonly analyzerPollInterval: number;
    timeout: number | object | null;
    running: boolean;
    paused: boolean;
    stopping: boolean;
    constructor(config: YbScanConfig);
    start(): void;
    stop(): void;
    downloadAndProcess(asset: SourceAssetType): Promise<boolean>;
}
