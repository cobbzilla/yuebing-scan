var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import fs from "fs";
import { sleep } from "zilla-util";
import { basename } from "mobiletto-orm-typedef";
export const DEFAULT_UPLOAD_POLL_INTERVAL = 1000 * 15;
// use same response type for analyze and transform, pass that here.
// define a common type for xform and analyzer, pass that
export const uploadFiles = (result, profile, job, destinations, daemon) => __awaiter(void 0, void 0, void 0, function* () {
    // create an upload job for each relevant file in outDir, for each destination
    const outDir = result.outDir;
    const files = fs.readdirSync(outDir).map(basename);
    const extFiles = files.filter((f) => f.endsWith("." + profile.ext));
    const toUpload = [];
    if (extFiles && extFiles.length > 0) {
        toUpload.push(...extFiles);
    }
    else {
        daemon.config.logger.warn(`uploadFiles: no extFiles matched ext=${profile.ext} for profile ${profile.name}`);
    }
    if (profile.additionalAssetsRegexes && profile.additionalAssetsRegexes.length > 0) {
        for (const re of profile.additionalAssetsRegexes) {
            toUpload.push(...files.filter((f) => f.match(re)));
        }
    }
    // ensure no duplicates
    const uploadSet = [...new Set(toUpload)];
    const uploadJobRepo = daemon.config.uploadJobRepo();
    for (const dest of destinations) {
        for (const path of uploadSet) {
            const localPath = `${outDir}/${path}`;
            const stat = fs.statSync(localPath);
            const uploadJob = {
                localPath,
                asset: job.asset,
                media: profile.media,
                profile: profile.name,
                destination: dest.name,
                size: stat.size,
            };
            console.info(`uploadFiles: creating uploadJob: ${JSON.stringify(uploadJob)}`);
            yield uploadJobRepo.create(uploadJob);
        }
    }
    // wait for uploads to finish
    while (!daemon.stopping) {
        const jobs = (yield uploadJobRepo.safeFindBy("asset", job.asset));
        if (jobs.length === 0) {
            daemon.config.logger.info(`uploadFiles: error finding upload jobs for asset: ${job.asset}`);
            return false;
        }
        const unfinished = jobs.filter((j) => j.status !== "finished");
        if (unfinished.length === 0)
            break;
        daemon.config.logger.info(`uploadFiles: waiting for ${unfinished.length} upload jobs to finish`);
        yield sleep(daemon.uploadPollInterval);
    }
    return !daemon.stopping;
});
