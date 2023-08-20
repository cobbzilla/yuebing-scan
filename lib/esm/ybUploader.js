var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as fs from "fs";
import { DEFAULT_CLOCK, sleep } from "mobiletto-orm-scan-typedef";
import { connectVolume } from "yuebing-model";
import { destinationPath } from "yuebing-media";
const DEFAULT_UPLOAD_POLL_INTERVAL = 1000 * 60;
export class YbUploader {
    constructor(config) {
        this.timeout = null;
        this.running = false;
        this.stopping = false;
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
            }
            else {
                this.running = true;
                this.timeout = setTimeout(() => ybUploadLoop(this), 1);
            }
        }
    }
    stop() {
        this.stopping = true;
    }
}
const ybUploadLoop = (uploader) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        while (!uploader.stopping) {
            let processed = false;
            try {
                const uploadJobRepo = uploader.config.uploadJobRepo();
                const job = yield uploadJobRepo.safeFindFirstBy("status", "pending");
                if (uploader.stopping)
                    break;
                if (job) {
                    processed = yield uploadAsset(uploader, job, uploadJobRepo);
                }
                if (!processed) {
                    const jitter = Math.floor(uploader.uploaderPollInterval * (Math.random() * 0.5 + 0.1));
                    yield sleep(uploader.uploaderPollInterval + jitter);
                }
            }
            catch (e) {
                uploader.config.logger.error(`ybUploadLoop: error=${e}`);
            }
        }
    }
    finally {
        if (!uploader.stopping) {
            uploader.config.logger.warn("ybUploadLoop: loop ending without stopping === true");
            uploader.stopping = true;
        }
        uploader.timeout = null;
        uploader.running = false;
    }
});
const uploadAsset = (uploader, job, uploadJobRepo) => __awaiter(void 0, void 0, void 0, function* () {
    const destRepo = uploader.config.destinationRepo();
    const dest = yield destRepo.findById(job.destination);
    const conn = yield connectVolume(dest);
    const destPath = destinationPath(job.sourceAsset, job.media, job.profile, job.localPath);
    const reader = fs.createReadStream(job.localPath);
    yield conn.write(destPath, reader);
    // update lock, mark finished
    job.owner = uploader.config.systemName; // should be the same, but whatever
    job.finished = uploader.clock.now();
    job.status = "finished";
    console.info(`YbUploader: updating finished uploadJob: ${JSON.stringify(job)}`);
    uploadJobRepo.update(job).then((l) => {
        uploader.config.logger.info(`finished: ${JSON.stringify(l)}`);
    });
    return true;
});
