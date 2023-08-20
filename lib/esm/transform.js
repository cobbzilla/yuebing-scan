var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ProfileJobTypeDef } from "yuebing-model";
import { prepareOutputDir, runExternalCommand } from "./util";
import { applyProfile, loadProfile } from "yuebing-media";
import { acquireLock } from "./lock";
import { downloadSourceAsset } from "./download";
import fs from "fs";
import { basename } from "mobiletto-orm-typedef";
import { sleep } from "mobiletto-orm-scan-typedef";
const JOB_TIMEOUT = 1000 * 60 * 60 * 24;
export const execTransform = (assetDir, downloaded, profile, job, logger) => __awaiter(void 0, void 0, void 0, function* () {
    if (!profile.operationObject) {
        logger.error(`execTransform: no profile.operationObject for profile=${profile.name}`);
        return null;
    }
    if (!profile.media) {
        logger.error(`execTransform: no profile.media for profile=${profile.name}`);
        return null;
    }
    const outDir = prepareOutputDir(assetDir, downloaded, profile);
    const response = yield applyProfile(downloaded, profile.media, profile.name, outDir);
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
            // todo: record progress
            const result = yield runExternalCommand(profile.operationObject.command, response.args);
            if (result.exitCode === 0) {
                job.status = "finished";
                job.analysis = result.stdout;
            }
            else {
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
    const lock = yield acquireLock(xform.config.systemName, xform.clock, xform.config.logger, jobRepo, job, ProfileJobTypeDef, JOB_TIMEOUT);
    if (!lock)
        return false;
    const downloaded = yield downloadSourceAsset(xform.config.downloadDir, job.asset, xform.config.sourceRepo(), xform.clock);
    if (!downloaded)
        return false; // source asset had no name, should never happen
    const profile = loadProfile(job.profile);
    if (!profile.media) {
        xform.config.logger.warn(`ybTransformLoop: skipping profile without media: ${profile.name}`);
        return false;
    }
    if (!profile.enabled) {
        // job should not have been created
        xform.config.logger.warn(`ybTransformLoop: skipping disabled profile: ${profile.name}`);
        return false;
    }
    if (profile.noop) {
        // job should not have been created
        xform.config.logger.warn(`ybTransformLoop: skipping noop profile: ${profile.name}`);
        return false;
    }
    // run the transform
    const outDir = yield execTransform(xform.config.assetDir, downloaded, profile, job, xform.config.logger);
    if (!outDir) {
        xform.config.logger.warn("ybTransformLoop: no outDir returned from execTransform");
        return false;
    }
    // create an upload job for each relevant file in outDir, for each destination
    const files = fs.readdirSync(outDir).map(basename);
    const extFiles = files.filter((f) => f.endsWith("." + profile.ext));
    const toUpload = [];
    if (extFiles && extFiles.length > 0) {
        toUpload.push(...extFiles);
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
            const uploadJob = {
                localPath: `${outDir}/${path}`,
                sourceAsset: job.asset,
                media: profile.media,
                profile: profile.name,
                destination: dest.name,
            };
            yield uploadJobRepo.create(uploadJob);
        }
    }
    // wait for uploads to finish
    for (;;) {
        const jobs = (yield uploadJobRepo.safeFindBy("sourceAsset", job.asset));
        const unfinished = jobs.filter((j) => j.status !== "finished");
        if (unfinished.length === 0)
            break;
        xform.config.logger.info(`waiting for ${unfinished.length} upload jobs to finish`);
        yield sleep(xform.jobPollInterval);
    }
    // update lock, mark finished
    lock.owner = xform.config.systemName; // should be the same, but whatever
    lock.finished = xform.clock.now();
    lock.status = "finished";
    jobRepo.update(lock).then((l) => {
        xform.config.logger.info(`finished: ${JSON.stringify(l)}`);
    });
    return true;
});
