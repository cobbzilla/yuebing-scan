import { DEFAULT_CLOCK, NapAlarm, ZillaClock, sleep } from "zilla-util";
import { MobilettoMetadata } from "mobiletto-common";
import { SourceAssetType, LibraryScanType, LibraryType, MediaType, LibraryScanTypeDef } from "yuebing-model";
import { MobilettoOrmObject } from "mobiletto-orm";
import { MobilettoScanner, MobilettoStorageScan } from "mobiletto-orm-scan";
import { ASSET_SEP } from "yuebing-media";
import { YbScanConfig } from "./config.js";
import { acquireLock } from "./lock.js";
import { ybScanLoop } from "./scan.js";
import { YbAnalyzer } from "./ybAnalyzer.js";
import { YbTransformer } from "./ybTransformer.js";
import { YbUploader } from "./ybUploader.js";

export const DEFAULT_SCAN_CHECK_INTERVAL = 1000 * 60 * 10;

export class YbScanner {
    readonly config: YbScanConfig;
    readonly scanPollInterval: number;
    readonly clock: ZillaClock;
    readonly napAlarm: NapAlarm;
    readonly initTime: number;

    timeout: number | object | null = null;
    running: boolean = false;
    stopping: boolean = false;

    readonly runScanner: boolean;
    readonly scanner: MobilettoScanner;
    readonly analyzer: YbAnalyzer;
    readonly runAnalyzer: boolean;
    readonly transformer: YbTransformer;
    readonly runTransformer: boolean;
    readonly uploader: YbUploader;
    readonly runUploader: boolean;

    constructor(config: YbScanConfig) {
        this.config = config;
        this.scanPollInterval = config.scanPollInterval ? config.scanPollInterval : DEFAULT_SCAN_CHECK_INTERVAL;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.napAlarm = { wake: false };
        this.initTime = this.clock.now();
        this.scanner = new MobilettoScanner(this.config.systemName, this.scanPollInterval, this.clock);
        this.runScanner = this.config.runScanner !== false;
        this.analyzer = new YbAnalyzer(this.config);
        this.runAnalyzer = this.config.runAnalyzer !== false;
        this.transformer = new YbTransformer(this.config);
        this.runTransformer = this.config.runTransformer !== false;
        this.uploader = new YbUploader(this.config);
        this.runUploader = this.config.runUploader !== false;
        this.start();
    }

    start() {
        if (this.runScanner) {
            if (this.running) {
                this.config.logger.info(`start: already running`);
            } else {
                this.running = true;
                this.timeout = setTimeout(() => ybScanLoop(this), 1);
                this.scanner.start();
            }
        }
        if (this.runAnalyzer) this.analyzer.start();
        if (this.runTransformer) this.transformer.start();
        if (this.runUploader) this.uploader.start();
    }

    stop() {
        this.stopping = true;
        this.scanner.stop();
        this.analyzer.stop();
        this.transformer.stop();
        this.uploader.stop();
    }

    awaken() {
        this.napAlarm.wake = true;
    }

    async scanLibrary(libScan: LibraryScanType) {
        let lock: LibraryScanType | null = null;
        const lockTimeout = 1000 * 60;
        let hasError = false;
        try {
            const lib = await this.config.libraryRepo().safeFindById(libScan.library);
            if (!lib) {
                this.config.logger.error(
                    `scanLibrary: system=${this.config.systemName} lib=${libScan.library} error=library_not_found`,
                );
                return;
            }
            lock = await acquireLock(
                this.config.systemName,
                this.clock,
                this.config.logger,
                this.config.libraryScanRepo(),
                libScan.scanId,
                LibraryScanTypeDef,
                lockTimeout,
            );
            if (!lock) {
                this.config.logger.debug(
                    `scanLibrary: system=${this.config.systemName} lib=${libScan.library} error=acquiring_lock`,
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
                const otherLibs = (await this.config.libraryRepo().safeFindBy("sources", s, {
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
                                this.config.logger.info(
                                    `scanLibrary: scanSource finished: source=${JSON.stringify(s)}`,
                                );
                                resolve();
                            })
                            .catch((e: Error) => {
                                this.config.logger.error(
                                    `scanLibrary: scanSource error: source=${JSON.stringify(s)} error=${e}`,
                                );
                                reject(e);
                            });
                    }),
                );
            }
            await Promise.all(sourceScans);
        } catch (e) {
            this.config.logger.error(`scanLibrary: error=${e} for libraryScan: ${JSON.stringify(lock)}`);
            hasError = true;
        } finally {
            if (lock) {
                lock.owner = this.config.systemName; // should be the same, but whatever
                lock.status = "finished";
                lock.finished = this.clock.now();
                lock.errorCount = hasError ? (lock.errorCount ? lock.errorCount + 1 : 1) : 0;
                this.config.logger.info(`scanLibrary: updating finished libraryScan: ${JSON.stringify(lock)}`);
                this.config
                    .libraryScanRepo()
                    .update(lock)
                    .then((l: LibraryScanType) => {
                        this.config.logger.info(`finished: ${JSON.stringify(l)}`);
                    });
            }
        }
    }

    async scanSource(sourceName: string, fileExt: string[]) {
        const source = await this.config.connectSource(sourceName);
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
                    const sourceAssetRepo = this.config.sourceAssetRepo();
                    if (!(await sourceAssetRepo.safeFindById(fullName))) {
                        const asset: SourceAssetType = {
                            name: fullName,
                            source: sourceName,
                            owner: this.config.systemName,
                            status: "pending",
                        };
                        this.config.logger.info(`YbScanner: creating sourceAsset: ${JSON.stringify(asset)}`);
                        await sourceAssetRepo.create(asset);
                    }
                } catch (e) {
                    this.config.logger.warn(`error creating SourceAsset name=${fullName} error=${e}`);
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
