import { sleep } from "mobiletto-orm-scan-typedef";
import { LibraryType } from "yuebing-model";
import { YbScan } from "./ybScan";

export const ybScanLoop = async (ybScan: YbScan) => {
    let first = true;
    try {
        while (!ybScan.stopping) {
            if (!first) await sleep(ybScan.scanCheckInterval);
            else first = false;

            try {
                // is scanning enabled in the config?
                const cfg = await ybScan.config.localConfigRepo().findSingleton();
                if (!cfg.autoscanEnabled) continue;
                // are we beyond our initial delay?
                if (cfg.autoscan?.initialDelay && ybScan.clock.now() - ybScan.initTime < cfg.autoscan?.initialDelay) {
                    continue;
                }
            } catch (e) {
                ybScan.config.logger.error(`scanLibrary autoscanEnabled_check error=${e}`);
                continue;
            }

            // find libraries with scanning enabled
            if (ybScan.stopping) break;
            const libraries = (await ybScan.config.libraryRepo().safeFindBy("autoscanEnabled", true)) as LibraryType[];
            for (const lib of libraries) {
                if (ybScan.stopping) break;
                if (!lib.autoscan || !lib.autoscan.interval) {
                    ybScan.config.logger.error(`scanLibrary lib=${lib.name} error=no_interval`);
                    continue;
                }
                const interval = lib.autoscan.interval;
                try {
                    await ybScan.scanLibrary(lib, interval);
                } catch (e) {
                    ybScan.config.logger.error(`scanLibrary lib=${lib.name} error=${e}`);
                }
            }
        }
    } finally {
        if (!ybScan.stopping) {
            ybScan.config.logger.warn("loop ending without stopping === true");
            ybScan.stopping = true;
        }
        ybScan.timeout = null;
        ybScan.running = false;
    }
};
