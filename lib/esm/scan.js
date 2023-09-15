var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { sleep, timestampAsYYYYMMDDHHmmSS } from "zilla-util";
export const ybScanLoop = (ybScan) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let first = true;
    let scanPollInterval = ybScan.scanPollInterval;
    try {
        while (!ybScan.stopping) {
            if (!first)
                yield sleep(scanPollInterval);
            else
                first = false;
            if (ybScan.stopping)
                break;
            // find pending scans
            const libraryScanRepo = ybScan.config.libraryScanRepo();
            const predicate = (s) => s.scheduled && s.scheduled < ybScan.clock.now();
            const pendingScans = (yield libraryScanRepo.safeFindBy("status", "pending", {
                predicate,
            })).sort((s1, s2) => s1.scheduled - s2.scheduled);
            // run pending scans
            for (const pendingScan of pendingScans) {
                if (ybScan.stopping)
                    break;
                ybScan.config.logger.info(`scanLoop: scanLibrary scan=${pendingScan.scanId} lib=${pendingScan.library}`);
                yield ybScan.scanLibrary(pendingScan);
            }
            // is auto-scanning enabled in the local config?
            try {
                const cfg = yield ybScan.config.localConfigRepo().findSingleton();
                if (cfg.scanPollInterval) {
                    // local config can change, update poll interval when we reload local config
                    scanPollInterval = cfg.scanPollInterval;
                }
                if (!cfg.autoscanEnabled)
                    continue;
                // are we beyond our initial delay?
                if (((_a = cfg.autoscan) === null || _a === void 0 ? void 0 : _a.initialDelay) && ybScan.clock.now() - ybScan.initTime < ((_b = cfg.autoscan) === null || _b === void 0 ? void 0 : _b.initialDelay)) {
                    continue;
                }
            }
            catch (e) {
                ybScan.config.logger.error(`scanLoop: scanLibrary autoscanEnabled_check error=${e}`);
                continue;
            }
            // find libraries with scanning enabled, schedule pending scans
            const libraries = (yield ybScan.config.libraryRepo().safeFindBy("autoscanEnabled", true));
            for (const lib of libraries) {
                if (ybScan.stopping)
                    break;
                if (!lib.autoscan || !lib.autoscan.interval) {
                    ybScan.config.logger.error(`scanLoop: scanLibrary lib=${lib.name} error=no_interval`);
                    continue;
                }
                // is a scan already scheduled for this library?
                try {
                    const predicate = (s) => s.status &&
                        s.status === "pending" &&
                        typeof s.scheduled === "number" &&
                        s.scheduled > ybScan.clock.now();
                    const pendingIntervalScans = (yield libraryScanRepo.safeFindBy("library", lib.name, {
                        predicate,
                    }));
                    if (ybScan.stopping)
                        break;
                    if (pendingIntervalScans.length === 0) {
                        // schedule a new scan
                        const interval = lib.autoscan.interval;
                        const now = ybScan.clock.now();
                        const scheduleTime = now + interval;
                        const newScan = {
                            scanId: `${timestampAsYYYYMMDDHHmmSS(scheduleTime)}-${lib.name}`,
                            library: lib.name,
                            status: "pending",
                            scheduled: scheduleTime,
                        };
                        yield libraryScanRepo.create(newScan);
                    }
                }
                catch (e) {
                    ybScan.config.logger.error(`scanLoop: scanLibrary lib=${lib.name} error=${e}`);
                }
            }
        }
    }
    finally {
        if (!ybScan.stopping) {
            ybScan.config.logger.warn("scanLoop: loop ending without stopping === true");
            ybScan.stopping = true;
        }
        ybScan.timeout = null;
        ybScan.running = false;
    }
});
