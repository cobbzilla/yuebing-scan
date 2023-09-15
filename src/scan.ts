import { sleep, timestamp_as_yyyyMMdd_HHmmSS } from "zilla-util";
import { LibraryScanType, LibraryType } from "yuebing-model";
import { YbScanner } from "./ybScanner";
import { MobilettoOrmPredicate } from "mobiletto-orm-typedef";

export const ybScanLoop = async (ybScan: YbScanner) => {
    let first = true;
    let scanPollInterval = ybScan.scanPollInterval;
    try {
        while (!ybScan.stopping) {
            if (!first) await sleep(scanPollInterval);
            else first = false;

            if (ybScan.stopping) break;

            // find pending scans
            const libraryScanRepo = ybScan.config.libraryScanRepo();
            const predicate: MobilettoOrmPredicate = (s) => s.scheduled && s.scheduled < ybScan.clock.now();
            const pendingScans = (
                (await libraryScanRepo.safeFindBy("status", "pending", {
                    predicate,
                })) as LibraryScanType[]
            ).sort((s1, s2) => s1.scheduled - s2.scheduled);

            // run pending scans
            for (const pendingScan of pendingScans) {
                if (ybScan.stopping) break;
                ybScan.config.logger.info(
                    `scanLoop: scanLibrary scan=${pendingScan.scanId} lib=${pendingScan.library}`,
                );
                await ybScan.scanLibrary(pendingScan);
            }

            // is auto-scanning enabled in the local config?
            try {
                const cfg = await ybScan.config.localConfigRepo().findSingleton();
                if (cfg.scanPollInterval) {
                    // local config can change, update poll interval when we reload local config
                    scanPollInterval = cfg.scanPollInterval;
                }
                if (!cfg.autoscanEnabled) continue;
                // are we beyond our initial delay?
                if (cfg.autoscan?.initialDelay && ybScan.clock.now() - ybScan.initTime < cfg.autoscan?.initialDelay) {
                    continue;
                }
            } catch (e) {
                ybScan.config.logger.error(`scanLoop: scanLibrary autoscanEnabled_check error=${e}`);
                continue;
            }

            // find libraries with scanning enabled, schedule pending scans
            const libraries = (await ybScan.config.libraryRepo().safeFindBy("autoscanEnabled", true)) as LibraryType[];
            for (const lib of libraries) {
                if (ybScan.stopping) break;

                if (!lib.autoscan || !lib.autoscan.interval) {
                    ybScan.config.logger.error(`scanLoop: scanLibrary lib=${lib.name} error=no_interval`);
                    continue;
                }

                // is a scan already scheduled for this library?
                try {
                    const predicate: MobilettoOrmPredicate = (s) =>
                        s.status &&
                        s.status === "pending" &&
                        typeof s.scheduled === "number" &&
                        s.scheduled > ybScan.clock.now();
                    const pendingIntervalScans = (await libraryScanRepo.safeFindBy("library", lib.name, {
                        predicate,
                    })) as LibraryScanType[];
                    if (ybScan.stopping) break;

                    if (pendingIntervalScans.length === 0) {
                        // schedule a new scan
                        const interval = lib.autoscan.interval;
                        const now = ybScan.clock.now();
                        const scheduleTime = now + interval;
                        const newScan: LibraryScanType = {
                            scanId: `${timestamp_as_yyyyMMdd_HHmmSS(scheduleTime)}-${lib.name}`,
                            library: lib.name,
                            status: "pending",
                            scheduled: scheduleTime,
                        };
                        await libraryScanRepo.create(newScan);
                    }
                } catch (e) {
                    ybScan.config.logger.error(`scanLoop: scanLibrary lib=${lib.name} error=${e}`);
                }
            }
        }
    } finally {
        if (!ybScan.stopping) {
            ybScan.config.logger.warn("scanLoop: loop ending without stopping === true");
            ybScan.stopping = true;
        }
        ybScan.timeout = null;
        ybScan.running = false;
    }
};
