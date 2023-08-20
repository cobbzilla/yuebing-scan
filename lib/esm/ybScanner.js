var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { LibraryScanTypeDef } from "yuebing-model";
import { DEFAULT_CLOCK, sleep } from "mobiletto-orm-scan-typedef";
import { MobilettoScanner } from "mobiletto-orm-scan";
import { ASSET_SEP } from "yuebing-media";
import { acquireLock } from "./lock.js";
import { ybScanLoop } from "./scan.js";
import { YbAnalyzer } from "./ybAnalyzer.js";
import { YbTransformer } from "./ybTransformer.js";
import { YbUploader } from "./ybUploader.js";
export const DEFAULT_SCAN_CHECK_INTERVAL = 1000 * 60 * 60 * 24;
export class YbScanner {
    constructor(config) {
        this.timeout = null;
        this.running = false;
        this.stopping = false;
        this.config = config;
        this.scanCheckInterval = config.scanCheckInterval ? config.scanCheckInterval : DEFAULT_SCAN_CHECK_INTERVAL;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.initTime = this.clock.now();
        this.scanner = new MobilettoScanner(this.config.systemName, this.scanCheckInterval, this.clock);
        this.analyzer = new YbAnalyzer(this.config);
        this.runAnalyzer = this.config.runAnalyzer !== false;
        this.transformer = new YbTransformer(this.config);
        this.runTransformer = this.config.runTransformer !== false;
        this.uploader = new YbUploader(this.config);
        this.runUploader = this.config.runUploader !== false;
        this.start();
    }
    start() {
        if (!this.timeout) {
            if (this.running) {
                this.config.logger.info(`start: already running (but timeout was null?)`);
            }
            else {
                this.running = true;
                this.timeout = setTimeout(() => ybScanLoop(this), 1);
                this.scanner.start();
            }
        }
        if (this.runAnalyzer)
            this.analyzer.start();
        if (this.runTransformer)
            this.transformer.start();
        if (this.runUploader)
            this.uploader.start();
    }
    stop() {
        this.stopping = true;
        this.scanner.stop();
        this.transformer.stop();
        this.uploader.stop();
    }
    scanLibrary(lib, interval) {
        return __awaiter(this, void 0, void 0, function* () {
            let lock = null;
            try {
                lock = yield acquireLock(this.config.systemName, this.clock, this.config.logger, this.config.libraryScanRepo(), lib.name, LibraryScanTypeDef, interval);
                if (!lock) {
                    this.config.logger.error(`scanLibrary system=${this.config.systemName} lib=${lib.name} error=acquiring_lock`);
                    return;
                }
                // for each source, determine what media types to scan for
                // this might be more than just the current lib
                // because other libs might include the same source
                const sourceScans = [];
                for (const s of lib.sources) {
                    const foundMedia = {
                        [lib.media]: yield this.config.mediaRepo().findById(lib.media),
                    };
                    const otherLibs = (yield this.config.libraryRepo().safeFindBy("sources", s, {
                        predicate: (x) => x.name !== lib.name,
                    }));
                    for (const otherLib of otherLibs) {
                        if (!foundMedia[otherLib.media]) {
                            foundMedia[otherLib.media] = yield this.config.mediaRepo().findById(otherLib.media);
                        }
                    }
                    const fileExt = [
                        ...new Set(Object.values(foundMedia)
                            .map((m) => m.ext)
                            .flat()),
                    ];
                    sourceScans.push(new Promise((resolve, reject) => {
                        this.scanSource(s, fileExt)
                            .then(() => {
                            console.info(`YbScanner: scanSource finished: source=${JSON.stringify(s)}`);
                            resolve();
                        })
                            .catch((e) => {
                            console.error(`YbScanner: scanSource error: source=${JSON.stringify(s)} error=${e}`);
                            reject(e);
                        });
                    }));
                }
                yield Promise.all(sourceScans);
            }
            finally {
                if (lock) {
                    lock.owner = this.config.systemName; // should be the same, but whatever
                    lock.finished = this.clock.now();
                    lock.status = "finished";
                    console.info(`transform: updating finished libraryScan: ${JSON.stringify(lock)}`);
                    this.config
                        .libraryScanRepo()
                        .update(lock)
                        .then((l) => {
                        this.config.logger.info(`finished: ${JSON.stringify(l)}`);
                    });
                }
            }
        });
    }
    scanSource(sourceName, fileExt) {
        return __awaiter(this, void 0, void 0, function* () {
            const source = this.config.sourceConnections[sourceName];
            let success = false;
            let done = false;
            let error = undefined;
            const scan = {
                name: sourceName,
                lockRepository: () => this.config.sourceScanRepo(),
                source,
                ext: fileExt,
                recursive: true,
                visit: (meta) => __awaiter(this, void 0, void 0, function* () {
                    const fullName = sourceName + ASSET_SEP + meta.name;
                    try {
                        const sourceAssetRepo = this.config.sourceAssetRepo();
                        if (!(yield sourceAssetRepo.safeFindById(fullName))) {
                            const asset = {
                                name: fullName,
                                source: sourceName,
                                owner: this.config.systemName,
                                status: "pending",
                            };
                            console.info(`YbScanner: creating sourceAsset: ${JSON.stringify(asset)}`);
                            yield sourceAssetRepo.create(asset);
                        }
                    }
                    catch (e) {
                        this.config.logger.warn(`error creating DiscoveredAsset name=${fullName} error=${e}`);
                    }
                    return meta;
                }),
                success: () => (success = true),
                error: (e) => (error = e),
                done: () => (done = true),
            };
            this.scanner.addScan(scan);
            while (!done) {
                // todo: check progress somehow?
                yield sleep(1000);
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
        });
    }
}