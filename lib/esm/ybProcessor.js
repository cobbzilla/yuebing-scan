var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { DEFAULT_CLOCK, sleep } from "mobiletto-orm-scan-typedef";
import { SourceAssetTypeDef } from "yuebing-model";
import { acquireLock } from "./lock.js";
import { processSourceAsset } from "./process.js";
const DOWNLOAD_LOCK_TIMEOUT = 1000 * 60 * 60;
const DEFAULT_DOWNLOAD_POLL_INTERVAL = 1000 * 60;
export class YbProcessor {
    constructor(config) {
        this.timeout = null;
        this.running = false;
        this.paused = false;
        this.stopping = false;
        this.config = config;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.downloadPollInterval = config.downloadPollInterval
            ? config.downloadPollInterval
            : DEFAULT_DOWNLOAD_POLL_INTERVAL;
    }
    start() {
        if (!this.timeout) {
            if (this.running) {
                this.config.logger.info(`start: already running (but timeout was null?)`);
            }
            else {
                this.running = true;
                this.timeout = setTimeout(() => ybProcessLoop(this), 1);
            }
        }
    }
    stop() {
        this.stopping = true;
    }
    downloadAndProcess(asset) {
        return __awaiter(this, void 0, void 0, function* () {
            const lockRepo = this.config.sourceAssetRepo();
            const lock = yield acquireLock(this.config.systemName, this.clock, this.config.logger, lockRepo, asset, SourceAssetTypeDef, DOWNLOAD_LOCK_TIMEOUT);
            if (!lock)
                return false;
            yield processSourceAsset(this, lock);
            // update lock, mark finished
            lock.owner = this.config.systemName; // should be the same, but whatever
            lock.finished = this.clock.now();
            lock.status = "finished";
            lockRepo.update(lock).then((l) => {
                this.config.logger.info(`finished: ${JSON.stringify(l)}`);
            });
            return true;
        });
    }
}
const ybProcessLoop = (processor) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        while (!processor.stopping) {
            try {
                const assetRepo = processor.config.sourceAssetRepo();
                const discovered = yield assetRepo.safeFindFirstBy("status", "pending");
                if (processor.stopping)
                    break;
                let processed = false;
                if (discovered) {
                    processed = yield processor.downloadAndProcess(discovered);
                }
                if (!discovered || !processed) {
                    const jitter = Math.floor(processor.downloadPollInterval * (Math.random() * 0.5 + 0.1));
                    yield sleep(processor.downloadPollInterval + jitter);
                }
            }
            catch (e) {
                processor.config.logger.error(`ybProcessLoop: error=${e}`);
            }
        }
    }
    finally {
        if (!processor.stopping) {
            processor.config.logger.warn("ybProcessLoop: loop ending without stopping === true");
            processor.stopping = true;
        }
        processor.timeout = null;
        processor.running = false;
    }
});
