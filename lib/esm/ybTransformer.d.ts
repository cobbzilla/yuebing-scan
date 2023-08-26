import { ZillaClock } from "zilla-util";
import { YbScanConfig } from "./config.js";
export declare class YbTransformer {
    readonly config: YbScanConfig;
    readonly clock: ZillaClock;
    readonly removeLocalFiles: boolean;
    readonly transformerPollInterval: number;
    readonly uploadPollInterval: number;
    timeout: number | object | null;
    running: boolean;
    stopping: boolean;
    constructor(config: YbScanConfig);
    start(): void;
    stop(): void;
}
