import { MobilettoLogger, MobilettoMetadata } from "mobiletto-common";
import {
    AnalyzedAssetType,
    DiscoveredAssetType,
    DownloadedAssetType,
    LibraryScanType,
    LibraryType,
    LibraryTypeDef,
    LocalConfigType,
    MediaType,
    SourceScanType,
    SourceType,
} from "yuebing-model";
import { MobilettoOrmObject, MobilettoOrmRepository } from "mobiletto-orm";
import { DEFAULT_CLOCK, MobilettoClock, sleep } from "mobiletto-orm-scan-typedef";
import { MobilettoScanner, MobilettoStorageScan } from "mobiletto-orm-scan";
import { MobilettoConnection } from "mobiletto-base";
import { acquireLock } from "./lock.js";
import { ybScanLoop } from "./loop.js";

export type YbScanConfig = {
    systemName: string;
    scanCheckInterval?: number;
    logger: MobilettoLogger;
    localConfigRepo: () => MobilettoOrmRepository<LocalConfigType>;
    mediaRepo: () => MobilettoOrmRepository<MediaType>;
    libraryRepo: () => MobilettoOrmRepository<LibraryType>;
    libraryScanRepo: () => MobilettoOrmRepository<LibraryScanType>;
    sourceScanRepo: () => MobilettoOrmRepository<SourceScanType>;
    sourceRepo: () => MobilettoOrmRepository<SourceType>;
    discoveredAssetRepo: () => MobilettoOrmRepository<DiscoveredAssetType>;
    downloadedAssetRepo?: () => MobilettoOrmRepository<DownloadedAssetType>;
    analyzedAssetRepo?: () => MobilettoOrmRepository<AnalyzedAssetType>;
    sourceConnections: Record<string, MobilettoConnection>;
    clock?: MobilettoClock;
};

export const DEFAULT_SCAN_CHECK_INTERVAL = 1000 * 60 * 60 * 24;

export const LIBRARY_SCAN_TIMEOUT = 1000 * 60 * 60 * 24;
export const LIBRARY_SCAN_CHECK_INTERVAL = 1000 * 60;

export const ASSET_SEP = ">";

export class YbScan {
    readonly config: YbScanConfig;
    readonly scanCheckInterval: number;
    readonly clock: MobilettoClock;
    readonly initTime: number;

    timeout: number | object | null = null;
    running: boolean = false;
    stopping: boolean = false;
    readonly scanner: MobilettoScanner;

    constructor(config: YbScanConfig) {
        this.config = config;
        this.scanCheckInterval = config.scanCheckInterval ? config.scanCheckInterval : DEFAULT_SCAN_CHECK_INTERVAL;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.initTime = this.clock.now();
        this.scanner = new MobilettoScanner(this.config.systemName, this.scanCheckInterval, this.clock);
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
    }

    stop() {
        this.stopping = true;
        this.scanner.stop();
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
                    const discoveredAssetRepo = this.config.discoveredAssetRepo();
                    if (!(await discoveredAssetRepo.safeFindById(fullName))) {
                        const asset: DiscoveredAssetType = {
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

    // discovery loop:
    //  does localConfig allow scanning? if not, go back to sleep until next loop
    //  if enabled, sleep for initialDelay (if set)
    //  poll for libraries
    //  for each library: LibraryScan repo, findBy library - when was the most recent started run?
    //    - if not exist? create one, ensure we are owners of the scan, and run it
    //    - if exist but start time is TOO OLD (tbd), update ourselves to be the owners, and run it
    //    - if exist but the start/finish time is recent ENOUGH, skip it, we do not need to scan

    // LibraryDiscovery:
    //  create a SourceDiscovery scan for each source
    //    -- check ALL other libraries that include this source, and merge ALL file extensions for
    //        ALL media types included

    // SourceDiscovery:
    //  does a scanner exist? if not, create one and start it

    // download loop:
    //   claim DiscoveredAsset
}
