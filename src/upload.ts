import fs from "fs";
import { basename } from "mobiletto-orm-typedef";
import { DestinationType, ProfileJobType, UploadJobType } from "yuebing-model";
import { sleep } from "mobiletto-orm-scan-typedef";
import { TransformerDaemonType, TransformResult } from "./util.js";
import { ParsedProfile } from "yuebing-media";

export const DEFAULT_UPLOAD_POLL_INTERVAL = 1000 * 15;

// use same response type for analyze and transform, pass that here.
// define a common type for xform and analyzer, pass that
export const uploadFiles = async (
    result: TransformResult,
    profile: ParsedProfile,
    job: ProfileJobType,
    destinations: DestinationType[],
    daemon: TransformerDaemonType,
) => {
    // create an upload job for each relevant file in outDir, for each destination
    const outDir = result.outDir;
    const files = fs.readdirSync(outDir).map(basename);
    const extFiles = files.filter((f) => f.endsWith("." + profile.ext));
    const toUpload: string[] = [];
    if (extFiles && extFiles.length > 0) {
        toUpload.push(...extFiles);
    } else {
        daemon.config.logger.warn(`transformAsset: no extFiles matched ext=${profile.ext} for profile ${profile.name}`);
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
            const uploadJob: UploadJobType = {
                localPath,
                asset: job.asset,
                media: profile.media,
                profile: profile.name,
                destination: dest.name,
                size: stat.size,
            };
            console.info(`transform: creating uploadJob: ${JSON.stringify(uploadJob)}`);
            await uploadJobRepo.create(uploadJob);
        }
    }

    // wait for uploads to finish
    while (!daemon.stopping) {
        const jobs = (await uploadJobRepo.safeFindBy("asset", job.asset)) as UploadJobType[];
        if (jobs.length === 0) {
            daemon.config.logger.info(`transform: error finding upload jobs for asset: ${job.asset}`);
            return false;
        }
        const unfinished = jobs.filter((j) => j.status !== "finished");
        if (unfinished.length === 0) break;
        daemon.config.logger.info(`waiting for ${unfinished.length} upload jobs to finish`);
        await sleep(daemon.uploadPollInterval);
    }
    if (daemon.stopping) return false;
};
