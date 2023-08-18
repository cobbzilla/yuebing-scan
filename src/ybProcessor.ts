import { DEFAULT_CLOCK, MobilettoClock, sleep } from "mobiletto-orm-scan-typedef";
import { SourceAssetType, SourceAssetTypeDef } from "yuebing-model";
import { YbScanConfig } from "./config.js";
import { acquireLock } from "./lock.js";
import { processSourceAsset } from "./process.js";

const DOWNLOAD_LOCK_TIMEOUT = 1000 * 60 * 60;
const DEFAULT_DOWNLOAD_POLL_INTERVAL = 1000 * 60;

export class YbProcessor {
    readonly config: YbScanConfig;
    readonly clock: MobilettoClock;
    readonly downloadPollInterval: number;

    timeout: number | object | null = null;
    running: boolean = false;
    paused: boolean = false;
    stopping: boolean = false;

    constructor(config: YbScanConfig) {
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
            } else {
                this.running = true;
                this.timeout = setTimeout(() => ybProcessLoop(this), 1);
            }
        }
    }
    stop() {
        this.stopping = true;
    }
    async downloadAndProcess(asset: SourceAssetType) {
        const lockRepo = this.config.sourceAssetRepo();
        const lock: SourceAssetType | null = await acquireLock(
            this.config.systemName,
            this.clock,
            this.config.logger,
            lockRepo,
            asset,
            SourceAssetTypeDef,
            DOWNLOAD_LOCK_TIMEOUT,
        );
        if (!lock) return false;

        await processSourceAsset(this, lock);

        // update lock, mark finished
        lock.owner = this.config.systemName; // should be the same, but whatever
        lock.finished = this.clock.now();
        lock.status = "finished";
        lockRepo.update(lock).then((l) => {
            this.config.logger.info(`finished: ${JSON.stringify(l)}`);
        });
        return true;
    }
}

const ybProcessLoop = async (processor: YbProcessor) => {
    try {
        while (!processor.stopping) {
            try {
                const assetRepo = processor.config.sourceAssetRepo();
                const discovered = await assetRepo.safeFindFirstBy("status", "pending");
                if (processor.stopping) break;
                let processed = false;
                if (discovered) {
                    processed = await processor.downloadAndProcess(discovered);
                }
                if (!discovered || !processed) {
                    const jitter = Math.floor(processor.downloadPollInterval * (Math.random() * 0.5 + 0.1));
                    await sleep(processor.downloadPollInterval + jitter);
                }
            } catch (e) {
                processor.config.logger.error(`ybProcessLoop: error=${e}`);
            }
        }
    } finally {
        if (!processor.stopping) {
            processor.config.logger.warn("ybProcessLoop: loop ending without stopping === true");
            processor.stopping = true;
        }
        processor.timeout = null;
        processor.running = false;
    }
};
