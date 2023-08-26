import { ZillaClock } from "zilla-util";
import { LibraryType } from "yuebing-model";
import { MobilettoScanner, MobilettoStorageScan } from "mobiletto-orm-scan";
import { YbScanConfig } from "./config.js";
import { YbAnalyzer } from "./ybAnalyzer.js";
import { YbTransformer } from "./ybTransformer.js";
import { YbUploader } from "./ybUploader.js";
export declare const DEFAULT_SCAN_CHECK_INTERVAL: number;
export declare class YbScanner {
    readonly config: YbScanConfig;
    readonly scanPollInterval: number;
    readonly clock: ZillaClock;
    readonly initTime: number;
    timeout: number | object | null;
    running: boolean;
    stopping: boolean;
    readonly scanner: MobilettoScanner;
    readonly analyzer: YbAnalyzer;
    readonly runAnalyzer: boolean;
    readonly transformer: YbTransformer;
    readonly runTransformer: boolean;
    readonly uploader: YbUploader;
    readonly runUploader: boolean;
    constructor(config: YbScanConfig);
    start(): void;
    stop(): void;
    scanLibrary(lib: LibraryType, interval: number): Promise<void>;
    scanSource(sourceName: string, fileExt: string[]): Promise<MobilettoStorageScan>;
}
