import { ZillaClock } from "zilla-util";
import { YbScanConfig } from "./config.js";
export declare class YbUploader {
    readonly config: YbScanConfig;
    readonly clock: ZillaClock;
    readonly removeLocalFiles: boolean;
    readonly uploaderPollInterval: number;
    timeout: number | object | null;
    running: boolean;
    stopping: boolean;
    constructor(config: YbScanConfig);
    start(): void;
    stop(): void;
}
