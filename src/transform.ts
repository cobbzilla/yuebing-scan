import * as fs from "fs";
import { MobilettoLogger } from "mobiletto-common";
import { DestinationType, ProfileJobType, ProfileJobTypeDef } from "yuebing-model";
import {
    applyProfile,
    ApplyProfileResponse,
    assetPath,
    loadProfile,
    ParsedProfile,
    runExternalCommand,
} from "yuebing-media";
import { prepareOutputDir, TransformResult } from "./util.js";
import { acquireLock } from "./lock.js";
import { downloadSourceAsset } from "./download.js";
import { YbTransformer } from "./ybTransformer.js";
import { MobilettoConnection } from "mobiletto-base";
import { uploadFiles } from "./upload.js";

const JOB_TIMEOUT = 1000 * 60 * 60 * 24;

export const execTransform = async (
    assetDir: string,
    downloaded: string,
    profile: ParsedProfile,
    job: ProfileJobType,
    logger: MobilettoLogger,
    conn: MobilettoConnection,
    analysisResults: ProfileJobType[],
): Promise<TransformResult | null> => {
    if (!profile.operationObject) {
        logger.error(`execTransform: no profile.operationObject for profile=${profile.name}`);
        return null;
    }
    if (!profile.media) {
        logger.error(`execTransform: no profile.media for profile=${profile.name}`);
        return null;
    }
    const outDir = prepareOutputDir(assetDir, downloaded, profile);
    const response: ApplyProfileResponse = await applyProfile(
        logger,
        downloaded,
        profile.media,
        profile.name,
        outDir,
        assetPath(job.asset),
        conn,
        analysisResults,
    );
    if (profile.operationObject.func) {
        // applyProfile actually ran the job, we should be done
        if (!response.result) {
            // expected result response from transform profile
            logger.error(`execTransform: no result for profile=${profile.name} asset=${job.asset}`);
            return null;
        }
        return { outDir, response, job };
    } else {
        if (response.args && response.args.length > 0) {
            if (!profile.operationObject.command) {
                logger.error(`execTransform: no profile.operationObject.command for profile=${profile.name}`);
                return null;
            }
            // todo: record progress
            const result = await runExternalCommand(logger, profile.operationObject.command, response.args);
            if (result.exitCode !== 0) {
                logger.error(
                    `execTransform: exitCode=${result.exitCode} args=${response.args} profile=${profile.name} asset=${job.asset} stdout=${result.stdout} stderr=${result.stderr}`,
                );
                return null;
            }
        } else {
            logger.error(`execTransform: args=${response.args} profile=${profile.name} asset=${job.asset}`);
            return null;
        }
    }
    return { outDir, response, job };
};

export const transformAsset = async (
    xform: YbTransformer,
    job: ProfileJobType,
    destinations: DestinationType[],
): Promise<boolean> => {
    const jobRepo = xform.config.profileJobRepo();
    const lock = await acquireLock(
        xform.config.systemName,
        xform.clock,
        xform.config.logger,
        jobRepo,
        ProfileJobTypeDef.id(job),
        ProfileJobTypeDef,
        JOB_TIMEOUT,
    );
    if (!lock) return false;

    const downloadResult = await downloadSourceAsset(
        xform.config.downloadDir,
        job.asset,
        xform.config.sourceRepo(),
        xform.clock,
    );
    if (!downloadResult) return false; // should not happen
    const downloaded = downloadResult.outfile;

    const profile = loadProfile(job.profile);
    if (!profile.media) {
        xform.config.logger.warn(`transformAsset: skipping profile without media: ${profile.name}`);
        return false;
    }
    if (profile.enabled === false) {
        // job should not have been created
        xform.config.logger.warn(`transformAsset: skipping disabled profile: ${profile.name}`);
        return false;
    }
    if (profile.noop) {
        // job should not have been created
        xform.config.logger.warn(`transformAsset: skipping noop profile: ${profile.name}`);
        return false;
    }

    // find analysis results
    const analysisResults = (await jobRepo.findBy("asset", job.asset, {
        predicate: (j) => j.analysis === true,
    })) as ProfileJobType[];

    // run the transform
    const result = await execTransform(
        xform.config.assetDir,
        downloaded,
        profile,
        job,
        xform.config.logger,
        downloadResult.conn,
        analysisResults,
    );
    if (!result) {
        xform.config.logger.warn("transformAsset: no result returned from execTransform");
        return false;
    }
    if (!result.outDir) {
        xform.config.logger.warn("transformAsset: no result.outDir returned from execTransform");
        return false;
    }
    if (!result.response) {
        xform.config.logger.warn("transformAsset: no result.response returned from execTransform");
        return false;
    }

    await uploadFiles(result, profile, job, destinations, xform);

    // update lock, mark finished
    lock.owner = xform.config.systemName; // should be the same, but whatever
    lock.status = "finished";
    lock.finished = xform.clock.now();
    xform.config.logger.info(`transform: updating finished profileJob: ${JSON.stringify(lock)}`);
    jobRepo.update(lock).then((l) => {
        xform.config.logger.info(`finished: ${JSON.stringify(l)}`);
    });

    if (xform.removeLocalFiles) {
        try {
            // remove outDir, it should be mostly/entirely empty because
            // each uploaded asset was removed when the upload completed
            fs.rmSync(result.outDir, { recursive: true, force: true });
        } catch (e) {
            xform.config.logger.warn(`error removing outDir=${result.outDir} error=${e}`);
        }
    }
    return true;
};
