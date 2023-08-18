import { LibraryType } from "yuebing-model";
import { MobilettoClock } from "mobiletto-orm-scan-typedef";
import { MobilettoScanner, MobilettoStorageScan } from "mobiletto-orm-scan";
import { YbScanConfig } from "./config.js";
import { YbProcessor } from "./ybProcessor.js";
export declare const DEFAULT_SCAN_CHECK_INTERVAL: number;
export declare const ASSET_SEP = ">";
export declare class YbScanner {
    readonly config: YbScanConfig;
    readonly scanCheckInterval: number;
    readonly clock: MobilettoClock;
    readonly initTime: number;
    timeout: number | object | null;
    running: boolean;
    stopping: boolean;
    readonly scanner: MobilettoScanner;
    readonly processor: YbProcessor;
    constructor(config: YbScanConfig);
    start(): void;
    stop(): void;
    scanLibrary(lib: LibraryType, interval: number): Promise<void>;
    scanSource(sourceName: string, fileExt: string[]): Promise<MobilettoStorageScan>;
}
