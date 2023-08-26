import { DEFAULT_CLOCK, ZillaClock, sleep } from "zilla-util";
import { DestinationType } from "yuebing-model";
import { YbScanConfig } from "./config.js";
import { transformAsset } from "./transform.js";
import { DEFAULT_UPLOAD_POLL_INTERVAL } from "./upload.js";

const DEFAULT_JOB_POLL_INTERVAL = 1000 * 60;

export class YbTransformer {
    readonly config: YbScanConfig;
    readonly clock: ZillaClock;
    readonly removeLocalFiles: boolean;
    readonly transformerPollInterval: number;
    readonly uploadPollInterval: number;

    timeout: number | object | null = null;
    running: boolean = false;
    stopping: boolean = false;

    constructor(config: YbScanConfig) {
        this.config = config;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.removeLocalFiles = config.removeLocalFiles !== false;
        this.transformerPollInterval = config.transformerPollInterval
            ? config.transformerPollInterval
            : DEFAULT_JOB_POLL_INTERVAL;
        this.uploadPollInterval = config.uploaderPollInterval
            ? config.uploaderPollInterval
            : DEFAULT_UPLOAD_POLL_INTERVAL;
    }
    start() {
        if (!this.timeout) {
            if (this.running) {
                this.config.logger.info(`YbTransformer.start: already running (but timeout was null?)`);
            } else {
                this.running = true;
                this.timeout = setTimeout(() => ybTransformLoop(this), 1);
            }
        }
    }
    stop() {
        this.stopping = true;
    }
}

const ybTransformLoop = async (xform: YbTransformer) => {
    try {
        while (!xform.stopping) {
            try {
                const jobRepo = xform.config.profileJobRepo();
                const destRepo = xform.config.destinationRepo();
                const destinations = (await destRepo.safeFindBy("assets", true)) as DestinationType[];

                let processed = false;
                if (!destinations || destinations.length === 0) {
                    xform.config.logger.error("ybTransformLoop: no destinations!");
                } else {
                    const job = await jobRepo.safeFindFirstBy("status", "pending");
                    if (xform.stopping) break;
                    if (job) {
                        processed = await transformAsset(xform, job, destinations);
                    }
                }
                if (!processed) {
                    const jitter = Math.floor(xform.transformerPollInterval * (Math.random() * 0.5 + 0.1));
                    await sleep(xform.transformerPollInterval + jitter);
                }
            } catch (e) {
                xform.config.logger.error(`ybTransformLoop: error=${e}`);
            }
        }
    } finally {
        if (!xform.stopping) {
            xform.config.logger.warn("ybTransformLoop: loop ending without stopping === true");
            xform.stopping = true;
        }
        xform.timeout = null;
        xform.running = false;
    }
};
