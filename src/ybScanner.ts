import { MobilettoMetadata } from "mobiletto-common";
import { SourceAssetType, LibraryScanType, LibraryType, LibraryTypeDef, MediaType } from "yuebing-model";
import { MobilettoOrmObject } from "mobiletto-orm";
import { DEFAULT_CLOCK, MobilettoClock, sleep } from "mobiletto-orm-scan-typedef";
import { MobilettoScanner, MobilettoStorageScan } from "mobiletto-orm-scan";
import { ASSET_SEP } from "yuebing-media";
import { YbScanConfig } from "./config.js";
import { acquireLock } from "./lock.js";
import { ybScanLoop } from "./scan.js";
import { YbAnalyzer } from "./ybAnalyzer.js";
import { YbTransformer } from "./ybTransformer.js";

export const DEFAULT_SCAN_CHECK_INTERVAL = 1000 * 60 * 60 * 24;

// export const LIBRARY_SCAN_TIMEOUT = 1000 * 60 * 60 * 24;
// export const LIBRARY_SCAN_CHECK_INTERVAL = 1000 * 60;

export class YbScanner {
    readonly config: YbScanConfig;
    readonly scanCheckInterval: number;
    readonly clock: MobilettoClock;
    readonly initTime: number;

    timeout: number | object | null = null;
    running: boolean = false;
    stopping: boolean = false;
    readonly scanner: MobilettoScanner;
    readonly processor: YbAnalyzer;
    readonly transformer: YbTransformer;

    constructor(config: YbScanConfig) {
        this.config = config;
        this.scanCheckInterval = config.scanCheckInterval ? config.scanCheckInterval : DEFAULT_SCAN_CHECK_INTERVAL;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.initTime = this.clock.now();
        this.scanner = new MobilettoScanner(this.config.systemName, this.scanCheckInterval, this.clock);
        this.processor = new YbAnalyzer(this.config);
        this.transformer = new YbTransformer(this.config);
        this.start();
    }

    start() {
        if (!this.timeout) {
            if (this.running) {
                this.config.logger.info(`start: already running (but timeout was null?)`);
            } else {
                this.running = true;
                this.timeout = setTimeout(() => ybScanLoop(this), 1);
                this.scanner.start();
            }
        }
        this.processor.start();
        this.transformer.start();
    }

    stop() {
        this.stopping = true;
        this.scanner.stop();
        this.transformer.stop();
    }

    async scanLibrary(lib: LibraryType, interval: number) {
        let lock: LibraryScanType | null = null;
        try {
            lock = await acquireLock(
                this.config.systemName,
                this.clock,
                this.config.logger,
                this.config.libraryScanRepo(),
                lib,
                LibraryTypeDef,
                interval,
            );
            if (!lock) {
                this.config.logger.error(
                    `scanLibrary system=${this.config.systemName} lib=${lib.name} error=acquiring_lock`,
                );
                return;
            }
            // for each source, determine what media types to scan for
            // this might be more than just the current lib
            // because other libs might include the same source
            const sourceScans: Promise<void>[] = [];
            for (const s of lib.sources) {
                const foundMedia: Record<string, MediaType> = {
                    [lib.media]: await this.config.mediaRepo().findById(lib.media),
                };
                const otherLibs = (await this.config.libraryRepo().safeFindBy("source", s, {
                    predicate: (x: MobilettoOrmObject) => x.name !== lib.name,
                })) as LibraryType[];
                for (const otherLib of otherLibs) {
                    if (!foundMedia[otherLib.media]) {
                        foundMedia[otherLib.media] = await this.config.mediaRepo().findById(otherLib.media);
                    }
                }
                const fileExt = [
                    ...new Set(
                        Object.values(foundMedia)
                            .map((m) => m.ext)
                            .flat(),
                    ),
                ];
                sourceScans.push(
                    new Promise<void>((resolve, reject) => {
                        this.scanSource(s, fileExt)
                            .then(() => {
                                console.info("sourceScan resolved");
                                resolve();
                            })
                            .catch((e: Error) => {
                                console.error("sourceScan rejected");
                                reject(e);
                            });
                    }),
                );
            }
            await Promise.all(sourceScans);
        } finally {
            if (lock) {
                lock.owner = this.config.systemName; // should be the same, but whatever
                lock.finished = this.clock.now();
                lock.status = "finished";
                this.config
                    .libraryScanRepo()
                    .update(lock)
                    .then((l) => {
                        this.config.logger.info(`finished: ${JSON.stringify(l)}`);
                    });
            }
        }
    }

    async scanSource(sourceName: string, fileExt: string[]) {
        const source = this.config.sourceConnections[sourceName];
        let success = false;
        let done = false;
        let error = undefined;
        const scan: MobilettoStorageScan = {
            name: sourceName,
            lockRepository: () => this.config.sourceScanRepo(),
            source,
            ext: fileExt,
            recursive: true,
            visit: async (meta: MobilettoMetadata): Promise<unknown> => {
                const fullName = sourceName + ASSET_SEP + meta.name;
                try {
                    const discoveredAssetRepo = this.config.sourceAssetRepo();
                    if (!(await discoveredAssetRepo.safeFindById(fullName))) {
                        const asset: SourceAssetType = {
                            name: fullName,
                            source: sourceName,
                            owner: this.config.systemName,
                            status: "pending",
                        };
                        await discoveredAssetRepo.create(asset);
                    }
                } catch (e) {
                    this.config.logger.warn(`error creating DiscoveredAsset name=${fullName} error=${e}`);
                }
                return meta;
            },
            success: () => (success = true),
            error: (e: Error | unknown) => (error = e),
            done: () => (done = true),
        };
        this.scanner.addScan(scan);
        while (!done) {
            // todo: check progress somehow?
            await sleep(1000);
        }
        if (error) {
            this.config.logger.error(`scanSource error: ${error}`);
            throw error;
        }
        if (!success) {
            this.config.logger.warn("scanSource finished without success");
            throw error;
        }
        return scan;
    }
}
