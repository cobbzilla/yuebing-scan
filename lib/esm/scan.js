var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { sleep } from "mobiletto-orm-scan-typedef";
export const ybScanLoop = (ybScan) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let first = true;
    try {
        while (!ybScan.stopping) {
            if (!first)
                yield sleep(ybScan.scanPollInterval);
            else
                first = false;
            try {
                // is scanning enabled in the config?
                const cfg = yield ybScan.config.localConfigRepo().findSingleton();
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
            // find libraries with scanning enabled
            if (ybScan.stopping)
                break;
            const libraries = (yield ybScan.config.libraryRepo().safeFindBy("autoscanEnabled", true));
            for (const lib of libraries) {
                if (ybScan.stopping)
                    break;
                if (!lib.autoscan || !lib.autoscan.interval) {
                    ybScan.config.logger.error(`scanLoop: scanLibrary lib=${lib.name} error=no_interval`);
                    continue;
                }
                const interval = lib.autoscan.interval;
                try {
                    yield ybScan.scanLibrary(lib, interval);
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
