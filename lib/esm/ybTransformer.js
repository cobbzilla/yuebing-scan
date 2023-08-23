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
import { transformAsset } from "./transform.js";
const DEFAULT_JOB_POLL_INTERVAL = 1000 * 60;
export class YbTransformer {
    constructor(config) {
        this.timeout = null;
        this.running = false;
        this.stopping = false;
        this.config = config;
        this.clock = config.clock ? config.clock : DEFAULT_CLOCK;
        this.removeLocalFiles = config.removeLocalFiles !== false;
        this.transformerPollInterval = config.transformerPollInterval
            ? config.transformerPollInterval
            : DEFAULT_JOB_POLL_INTERVAL;
    }
    start() {
        if (!this.timeout) {
            if (this.running) {
                this.config.logger.info(`YbTransformer.start: already running (but timeout was null?)`);
            }
            else {
                this.running = true;
                this.timeout = setTimeout(() => ybTransformLoop(this), 1);
            }
        }
    }
    stop() {
        this.stopping = true;
    }
}
const ybTransformLoop = (xform) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        while (!xform.stopping) {
            try {
                const jobRepo = xform.config.profileJobRepo();
                const destRepo = xform.config.destinationRepo();
                const destinations = (yield destRepo.safeFindBy("assets", true));
                let processed = false;
                if (!destinations || destinations.length === 0) {
                    xform.config.logger.error("ybTransformLoop: no destinations!");
                }
                else {
                    const job = yield jobRepo.safeFindFirstBy("status", "pending");
                    if (xform.stopping)
                        break;
                    if (job) {
                        processed = yield transformAsset(xform, job, destinations);
                    }
                }
                if (!processed) {
                    const jitter = Math.floor(xform.transformerPollInterval * (Math.random() * 0.5 + 0.1));
                    yield sleep(xform.transformerPollInterval + jitter);
                }
            }
            catch (e) {
                xform.config.logger.error(`ybTransformLoop: error=${e}`);
            }
        }
    }
    finally {
        if (!xform.stopping) {
            xform.config.logger.warn("ybTransformLoop: loop ending without stopping === true");
            xform.stopping = true;
        }
        xform.timeout = null;
        xform.running = false;
    }
});
