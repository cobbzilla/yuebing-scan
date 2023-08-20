import { MobilettoClock } from "mobiletto-orm-scan-typedef";
import { YbScanConfig } from "./config.js";
export declare class YbUploader {
    readonly config: YbScanConfig;
    readonly clock: MobilettoClock;
    readonly jobPollInterval: number;
    timeout: number | object | null;
    running: boolean;
    stopping: boolean;
    constructor(config: YbScanConfig);
    start(): void;
    stop(): void;
}
