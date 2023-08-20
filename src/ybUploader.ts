import * as fs from "fs";
import { DEFAULT_CLOCK, MobilettoClock, sleep } from "mobiletto-orm-scan-typedef";
import { connectVolume, UploadJobType } from "yuebing-model";
import { destinationPath } from "yuebing-media";
import { YbScanConfig } from "./config.js";
import { MobilettoOrmRepository } from "mobiletto-orm";

const DEFAULT_UPLOAD_POLL_INTERVAL = 1000 * 60;

export class YbUploader {
    readonly config: YbScanConfig;
    readonly clock: MobilettoClock;
    readonly jobPollInterval: number;

    timeout: number | object | null = null;
    running: boolean = false;
    stopping: boolean = false;

    constructor(config: YbScanConfig) {
        this.config = config;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.jobPollInterval = config.jobPollInterval ? config.jobPollInterval : DEFAULT_UPLOAD_POLL_INTERVAL;
    }
    start() {
        if (!this.timeout) {
            if (this.running) {
                this.config.logger.info(`YbTransformer.start: already running (but timeout was null?)`);
            } else {
                this.running = true;
                this.timeout = setTimeout(() => ybUploadLoop(this), 1);
            }
        }
    }
    stop() {
        this.stopping = true;
    }
}

const ybUploadLoop = async (uploader: YbUploader) => {
    try {
        while (!uploader.stopping) {
            let processed = false;
            try {
                const uploadJobRepo = uploader.config.uploadJobRepo();
                const job = await uploadJobRepo.safeFindFirstBy("status", "pending");
                if (uploader.stopping) break;
                if (job) {
                    processed = await uploadAsset(uploader, job, uploadJobRepo);
                }
                if (!processed) {
                    const jitter = Math.floor(uploader.jobPollInterval * (Math.random() * 0.5 + 0.1));
                    await sleep(uploader.jobPollInterval + jitter);
                }
            } catch (e) {
                uploader.config.logger.error(`ybUploadLoop: error=${e}`);
            }
        }
    } finally {
        if (!uploader.stopping) {
            uploader.config.logger.warn("ybUploadLoop: loop ending without stopping === true");
            uploader.stopping = true;
        }
        uploader.timeout = null;
        uploader.running = false;
    }
};

const uploadAsset = async (
    uploader: YbUploader,
    job: UploadJobType,
    uploadJobRepo: MobilettoOrmRepository<UploadJobType>,
): Promise<boolean> => {
    const destRepo = uploader.config.destinationRepo();
    const dest = await destRepo.findById(job.destination);
    const conn = await connectVolume(dest);
    const destPath = destinationPath(job.sourceAsset, job.media, job.profile, job.localPath);
    const reader = fs.createReadStream(job.localPath);
    await conn.write(destPath, reader);

    // update lock, mark finished
    job.owner = uploader.config.systemName; // should be the same, but whatever
    job.finished = uploader.clock.now();
    job.status = "finished";
    uploadJobRepo.update(job).then((l) => {
        uploader.config.logger.info(`finished: ${JSON.stringify(l)}`);
    });

    return true;
};
