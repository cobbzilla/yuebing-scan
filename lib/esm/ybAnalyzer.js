var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { DEFAULT_CLOCK, sleep } from "zilla-util";
import { SourceAssetTypeDef } from "yuebing-model";
import { acquireLock } from "./lock.js";
import { analyzeSourceAsset } from "./analyze.js";
import { DEFAULT_UPLOAD_POLL_INTERVAL } from "./upload.js";
const DOWNLOAD_LOCK_TIMEOUT = 1000 * 60 * 60; // 1 hour
const DEFAULT_ANALYZER_POLL_INTERVAL = 1000 * 60;
export class YbAnalyzer {
    constructor(config) {
        this.timeout = null;
        this.running = false;
        this.paused = false;
        this.stopping = false;
        this.config = config;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.analyzerPollInterval = config.analyzerPollInterval
            ? config.analyzerPollInterval
            : DEFAULT_ANALYZER_POLL_INTERVAL;
        this.uploadPollInterval = config.uploaderPollInterval
            ? config.uploaderPollInterval
            : DEFAULT_UPLOAD_POLL_INTERVAL;
    }
    start() {
        if (!this.timeout) {
            if (this.running) {
                this.config.logger.info(`YbAnalyzer.start: already running (but timeout was null?)`);
            }
            else {
                this.running = true;
                this.timeout = setTimeout(() => ybAnalyzeLoop(this), 1);
            }
        }
    }
    stop() {
        this.stopping = true;
    }
    downloadAndProcess(asset) {
        return __awaiter(this, void 0, void 0, function* () {
            const lockRepo = this.config.sourceAssetRepo();
            const lock = yield acquireLock(this.config.systemName, this.clock, this.config.logger, lockRepo, SourceAssetTypeDef.id(asset), SourceAssetTypeDef, DOWNLOAD_LOCK_TIMEOUT);
            if (!lock)
                return false;
            if (yield analyzeSourceAsset(this, lock)) {
                // update lock, mark finished
                lock.owner = this.config.systemName; // should be the same, but whatever
                lock.status = "finished";
                lock.finished = this.clock.now();
                this.config.logger.info(`analyze: updating finished sourceAsset: ${JSON.stringify(lock)}`);
                lockRepo.update(lock).then((l) => {
                    this.config.logger.info(`finished: ${JSON.stringify(l)}`);
                });
                return true;
            }
            else {
                this.config.logger.error(`analyze: analyzeSourceAsset error: sourceAsset=${JSON.stringify(lock)}`);
                return false;
            }
        });
    }
}
const ybAnalyzeLoop = (analyzer) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        while (!analyzer.stopping) {
            try {
                const srcAssetRepo = analyzer.config.sourceAssetRepo();
                const pendingAssets = yield srcAssetRepo.safeFindFirstBy("status", "pending");
                if (analyzer.stopping)
                    break;
                let processed = false;
                if (pendingAssets) {
                    processed = yield analyzer.downloadAndProcess(pendingAssets);
                }
                if (!pendingAssets || !processed) {
                    const jitter = Math.floor(analyzer.analyzerPollInterval * (Math.random() * 0.5 + 0.1));
                    yield sleep(analyzer.analyzerPollInterval + jitter);
                }
            }
            catch (e) {
                analyzer.config.logger.error(`ybAnalyzeLoop: error=${e}`);
            }
        }
    }
    finally {
        if (!analyzer.stopping) {
            analyzer.config.logger.warn("ybAnalyzeLoop: loop ending without stopping === true");
            analyzer.stopping = true;
        }
        analyzer.timeout = null;
        analyzer.running = false;
    }
});
//# sourceMappingURL=ybAnalyzer.js.map