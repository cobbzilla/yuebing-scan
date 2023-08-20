import { LibraryType } from "yuebing-model";
import { MobilettoClock } from "mobiletto-orm-scan-typedef";
import { MobilettoScanner, MobilettoStorageScan } from "mobiletto-orm-scan";
import { YbScanConfig } from "./config.js";
import { YbAnalyzer } from "./ybAnalyzer.js";
import { YbTransformer } from "./ybTransformer.js";
export declare const DEFAULT_SCAN_CHECK_INTERVAL: number;
export declare class YbScanner {
    readonly config: YbScanConfig;
    readonly scanCheckInterval: number;
    readonly clock: MobilettoClock;
    readonly initTime: number;
    timeout: number | object | null;
    running: boolean;
    stopping: boolean;
    readonly scanner: MobilettoScanner;
    readonly processor: YbAnalyzer;
    readonly transformer: YbTransformer;
    constructor(config: YbScanConfig);
    start(): void;
    stop(): void;
    scanLibrary(lib: LibraryType, interval: number): Promise<void>;
    scanSource(sourceName: string, fileExt: string[]): Promise<MobilettoStorageScan>;
}
