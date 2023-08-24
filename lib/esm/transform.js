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
import { basename } from "mobiletto-orm-typedef";
import { sleep } from "mobiletto-orm-scan-typedef";
import { ProfileJobTypeDef } from "yuebing-model";
import { applyProfile, assetPath, loadProfile } from "yuebing-media";
import { prepareOutputDir, runExternalCommand } from "./util.js";
import { acquireLock } from "./lock.js";
import { downloadSourceAsset } from "./download.js";
const JOB_TIMEOUT = 1000 * 60 * 60 * 24;
export const execTransform = (assetDir, downloaded, profile, job, logger, conn) => __awaiter(void 0, void 0, void 0, function* () {
    if (!profile.operationObject) {
        logger.error(`execTransform: no profile.operationObject for profile=${profile.name}`);
        return null;
    }
    if (!profile.media) {
        logger.error(`execTransform: no profile.media for profile=${profile.name}`);
        return null;
    }
    const outDir = prepareOutputDir(assetDir, downloaded, profile);
    const response = yield applyProfile(downloaded, profile.media, profile.name, outDir, assetPath(job.asset), conn);
    if (profile.operationObject.func) {
        // applyProfile actually ran the job, we should be done
        if (response.analysis) {
            // did not expect analysis response from transform profile
            logger.error(`execTransform: unexpected analysis=${response.analysis} profile=${profile.name} asset=${job.asset}`);
            return null;
        }
    }
    else {
        if (response.args && response.args.length > 0) {
            if (!profile.operationObject.command) {
                logger.error(`execAnalyze: no profile.operationObject.command for profile=${profile.name}`);
                return null;
            }
            // todo: record progress
            const result = yield runExternalCommand(profile.operationObject.command, response.args);
            if (result.exitCode !== 0) {
                logger.error(`execTransform: exitCode=${result.exitCode} args=${response.args} profile=${profile.name} asset=${job.asset} stdout=${result.stdout} stderr=${result.stderr}`);
                return null;
            }
        }
        else {
            logger.error(`execTransform: args=${response.args} profile=${profile.name} asset=${job.asset}`);
            return null;
        }
    }
    return outDir;
});
export const transformAsset = (xform, job, destinations) => __awaiter(void 0, void 0, void 0, function* () {
    const jobRepo = xform.config.profileJobRepo();
    const lock = yield acquireLock(xform.config.systemName, xform.clock, xform.config.logger, jobRepo, ProfileJobTypeDef.id(job), ProfileJobTypeDef, JOB_TIMEOUT);
    if (!lock)
        return false;
    const downloadResult = yield downloadSourceAsset(xform.config.downloadDir, job.asset, xform.config.sourceRepo(), xform.clock);
    if (!downloadResult)
        return false; // should not happen
    const downloaded = downloadResult.outfile;
    const profile = loadProfile(job.profile);
    if (!profile.media) {
        xform.config.logger.warn(`transformAsset: skipping profile without media: ${profile.name}`);
        return false;
    }
    if (!profile.enabled) {
        // job should not have been created
        xform.config.logger.warn(`transformAsset: skipping disabled profile: ${profile.name}`);
        return false;
    }
    if (profile.noop) {
        // job should not have been created
        xform.config.logger.warn(`transformAsset: skipping noop profile: ${profile.name}`);
        return false;
    }
    // run the transform
    const outDir = yield execTransform(xform.config.assetDir, downloaded, profile, job, xform.config.logger, downloadResult.conn);
    if (!outDir) {
        xform.config.logger.warn("transformAsset: no outDir returned from execTransform");
        return false;
    }
    // create an upload job for each relevant file in outDir, for each destination
    const files = fs.readdirSync(outDir).map(basename);
    const extFiles = files.filter((f) => f.endsWith("." + profile.ext));
    const toUpload = [];
    if (extFiles && extFiles.length > 0) {
        toUpload.push(...extFiles);
    }
    else {
        xform.config.logger.warn(`transformAsset: no extFiles matched ext=${profile.ext} for profile ${profile.name}`);
    }
    if (profile.additionalAssetsRegexes && profile.additionalAssetsRegexes.length > 0) {
        for (const re of profile.additionalAssetsRegexes) {
            toUpload.push(...files.filter((f) => f.match(re)));
        }
    }
    // ensure no duplicates
    const uploadSet = [...new Set(toUpload)];
    const uploadJobRepo = xform.config.uploadJobRepo();
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
            console.info(`transform: creating uploadJob: ${JSON.stringify(uploadJob)}`);
            yield uploadJobRepo.create(uploadJob);
        }
    }
    // wait for uploads to finish
    while (!xform.stopping) {
        const jobs = (yield uploadJobRepo.safeFindBy("asset", job.asset));
        if (jobs.length === 0) {
            xform.config.logger.info(`transform: error finding upload jobs for asset: ${job.asset}`);
            return false;
        }
        const unfinished = jobs.filter((j) => j.status !== "finished");
        if (unfinished.length === 0)
            break;
        xform.config.logger.info(`waiting for ${unfinished.length} upload jobs to finish`);
        yield sleep(xform.transformerPollInterval);
    }
    if (xform.stopping)
        return false;
    // update lock, mark finished
    lock.owner = xform.config.systemName; // should be the same, but whatever
    lock.status = "finished";
    lock.finished = xform.clock.now();
    console.info(`transform: updating finished profileJob: ${JSON.stringify(lock)}`);
    jobRepo.update(lock).then((l) => {
        xform.config.logger.info(`finished: ${JSON.stringify(l)}`);
    });
    if (xform.removeLocalFiles) {
        try {
            // remove outDir, it should be mostly/entirely empty because
            // each uploaded asset was removed when the upload completed
            fs.rmSync(outDir, { recursive: true, force: true });
        }
        catch (e) {
            xform.config.logger.warn(`error removing outDir=${outDir} error=${e}`);
        }
    }
    return true;
});
