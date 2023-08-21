import * as fs from "fs";
import { MobilettoOrmRepository } from "mobiletto-orm";
import { DEFAULT_CLOCK, MobilettoClock, sleep } from "mobiletto-orm-scan-typedef";
import { connectVolume, UploadJobType, UploadJobTypeDef } from "yuebing-model";
import { destinationPath } from "yuebing-media";
import { YbScanConfig } from "./config.js";
import { acquireLock } from "./lock.js";

const DEFAULT_UPLOAD_POLL_INTERVAL = 1000 * 60;

export class YbUploader {
    readonly config: YbScanConfig;
    readonly clock: MobilettoClock;
    readonly uploaderPollInterval: number;

    timeout: number | object | null = null;
    running: boolean = false;
    stopping: boolean = false;

    constructor(config: YbScanConfig) {
        this.config = config;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.uploaderPollInterval = config.uploaderPollInterval
            ? config.uploaderPollInterval
            : DEFAULT_UPLOAD_POLL_INTERVAL;
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

const MIN_UPLOAD_TIMEOUT = 1000 * 60 * 2; // 2 minutes
const MAX_UPLOAD_TIMEOUT = 1000 * 60 * 60 * 2; // 2 hours

const MIN_BANDWIDTH = 500 * 1000; // ~500Kbps

const uploadTimeout = (size: number): number => {
    const millis = 1000 * Math.floor(size / MIN_BANDWIDTH);
    return Math.min(Math.max(millis, MIN_UPLOAD_TIMEOUT), MAX_UPLOAD_TIMEOUT);
};

const ybUploadLoop = async (uploader: YbUploader) => {
    try {
        while (!uploader.stopping) {
            let processed = false;
            try {
                const uploadJobRepo = uploader.config.uploadJobRepo();
                const job = await uploadJobRepo.safeFindFirstBy("status", "pending");
                if (uploader.stopping) break;
                if (job) {
                    // set lock timeout based on file size
                    const lock = await acquireLock(
                        uploader.config.systemName,
                        uploader.clock,
                        uploader.config.logger,
                        uploadJobRepo,
                        UploadJobTypeDef.id(job),
                        UploadJobTypeDef,
                        uploadTimeout(job.size),
                    );
                    if (lock) {
                        processed = await uploadAsset(uploader, lock, uploadJobRepo);
                    }
                }
                if (!processed) {
                    const jitter = Math.floor(uploader.uploaderPollInterval * (Math.random() * 0.5 + 0.1));
                    await sleep(uploader.uploaderPollInterval + jitter);
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
    const destPath = destinationPath(job.asset, job.media, job.profile, job.localPath);
    const reader = fs.createReadStream(job.localPath);
    await conn.write(destPath, reader);

    // update lock, mark finished
    job.owner = uploader.config.systemName; // should be the same, but whatever
    job.status = "finished";
    job.finished = uploader.clock.now();
    console.info(`YbUploader: updating finished uploadJob: ${JSON.stringify(job)}`);
    job = await uploadJobRepo.update(job);
    uploader.config.logger.info(`finished: ${JSON.stringify(job)}`);
    return true;
};
