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
import { DEFAULT_CLOCK, sleep } from "zilla-util";
import { UploadJobTypeDef } from "yuebing-model";
import { destinationPath } from "yuebing-media";
import { connectVolume } from "yuebing-server-util";
import { transferTimeout } from "./util.js";
import { acquireLock } from "./lock.js";
const DEFAULT_UPLOAD_POLL_INTERVAL = 1000 * 60;
export class YbUploader {
    constructor(config) {
        this.timeout = null;
        this.running = false;
        this.stopping = false;
        this.config = config;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.removeLocalFiles = config.removeLocalFiles !== false;
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
                    // set lock timeout based on file size
                    const lock = yield acquireLock(uploader.config.systemName, uploader.clock, uploader.config.logger, uploadJobRepo, UploadJobTypeDef.id(job), UploadJobTypeDef, transferTimeout(job.size));
                    if (lock) {
                        processed = yield uploadAsset(uploader, lock, uploadJobRepo);
                    }
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
    const destPath = destinationPath(job.asset, job.media, job.profile, job.localPath);
    const connResult = yield connectVolume(dest);
    if (connResult.error || !connResult.connection) {
        throw new Error(`uploadAsset(${job.asset}): error creating connection: ${connResult.error}`);
    }
    const conn = connResult.connection;
    // Only upload if the destination file does not exist, or has a different size than the local file
    const localStat = fs.statSync(job.localPath);
    const existingMeta = yield conn.safeMetadata(destPath);
    if (!existingMeta || existingMeta.size !== localStat.size) {
        const reader = fs.createReadStream(job.localPath);
        yield conn.write(destPath, reader);
    }
    // update lock, mark finished
    job.owner = uploader.config.systemName; // should be the same, but whatever
    job.status = "finished";
    job.finished = uploader.clock.now();
    job = yield uploadJobRepo.update(job);
    uploader.config.logger.info(`finished: ${JSON.stringify(job)}`);
    if (uploader.removeLocalFiles) {
        try {
            // remove local file, it's been uploaded
            fs.rmSync(job.localPath, { force: true });
        }
        catch (e) {
            uploader.config.logger.warn(`error removing job.localPath=${job.localPath} error=${e}`);
        }
    }
    return true;
});
//# sourceMappingURL=ybUploader.js.map