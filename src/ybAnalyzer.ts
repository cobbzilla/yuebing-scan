import { DEFAULT_CLOCK, MobilettoClock, sleep } from "mobiletto-orm-scan-typedef";
import { SourceAssetType, SourceAssetTypeDef } from "yuebing-model";
import { YbScanConfig } from "./config.js";
import { acquireLock } from "./lock.js";
import { analyzeSourceAsset } from "./analyze.js";

const DOWNLOAD_LOCK_TIMEOUT = 1000 * 60 * 60; // 1 hour
const DEFAULT_ANALYZER_POLL_INTERVAL = 1000 * 60;

export class YbAnalyzer {
    readonly config: YbScanConfig;
    readonly clock: MobilettoClock;
    readonly analyzerPollInterval: number;

    timeout: number | object | null = null;
    running: boolean = false;
    paused: boolean = false;
    stopping: boolean = false;

    constructor(config: YbScanConfig) {
        this.config = config;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.analyzerPollInterval = config.analyzerPollInterval
            ? config.analyzerPollInterval
            : DEFAULT_ANALYZER_POLL_INTERVAL;
    }
    start() {
        if (!this.timeout) {
            if (this.running) {
                this.config.logger.info(`YbAnalyzer.start: already running (but timeout was null?)`);
            } else {
                this.running = true;
                this.timeout = setTimeout(() => ybAnalyzeLoop(this), 1);
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
            SourceAssetTypeDef.id(asset),
            SourceAssetTypeDef,
            DOWNLOAD_LOCK_TIMEOUT,
        );
        if (!lock) return false;

        if (await analyzeSourceAsset(this, lock)) {
            // update lock, mark finished
            lock.owner = this.config.systemName; // should be the same, but whatever
            lock.status = "finished";
            lock.finished = this.clock.now();
            console.info(`transform: updating finished sourceAsset: ${JSON.stringify(lock)}`);
            lockRepo.update(lock).then((l) => {
                this.config.logger.info(`finished: ${JSON.stringify(l)}`);
            });
        }
        return true;
    }
}

const ybAnalyzeLoop = async (analyzer: YbAnalyzer) => {
    try {
        while (!analyzer.stopping) {
            try {
                const srcAssetRepo = analyzer.config.sourceAssetRepo();
                const pendingAssets = await srcAssetRepo.safeFindFirstBy("status", "pending");
                if (analyzer.stopping) break;
                let processed = false;
                if (pendingAssets) {
                    processed = await analyzer.downloadAndProcess(pendingAssets);
                }
                if (!pendingAssets || !processed) {
                    const jitter = Math.floor(analyzer.analyzerPollInterval * (Math.random() * 0.5 + 0.1));
                    await sleep(analyzer.analyzerPollInterval + jitter);
                }
            } catch (e) {
                analyzer.config.logger.error(`ybProcessLoop: error=${e}`);
            }
        }
    } finally {
        if (!analyzer.stopping) {
            analyzer.config.logger.warn("ybAnalyzeLoop: loop ending without stopping === true");
            analyzer.stopping = true;
        }
        analyzer.timeout = null;
        analyzer.running = false;
    }
};
