import { sleep, ZillaClock } from "zilla-util";
import { MobilettoLogger } from "mobiletto-common";
import { MobilettoConnection } from "mobiletto-base";
import {
    DestinationType,
    MediaProfileType,
    MediaType,
    PROFILE_SORT_PRIORITY,
    ProfileJobType,
    SourceAssetType,
} from "yuebing-model";
import {
    applyProfile,
    ApplyProfileResponse,
    assetPath,
    fileExtWithoutDot,
    loadProfile,
    ParsedProfile,
    runExternalCommand,
} from "yuebing-media";
import { profileJobName, prepareOutputDir, TransformResult } from "./util.js";
import { downloadSourceAsset } from "./download.js";
import { YbAnalyzer } from "./ybAnalyzer.js";
import { uploadFiles } from "./upload.js";

const execAnalyze = async (
    assetDir: string,
    downloaded: string,
    profile: ParsedProfile,
    job: ProfileJobType,
    logger: MobilettoLogger,
    sourceAsset: SourceAssetType,
    conn: MobilettoConnection,
    clock: ZillaClock,
    analysisResults: ProfileJobType[],
): Promise<TransformResult | null> => {
    if (!profile.operationObject) {
        logger.error(`execAnalyze: no profile.operationObject for profile=${profile.name}`);
        return null;
    }
    if (!profile.media) {
        logger.error(`execAnalyze: no profile.media for profile=${profile.name}`);
        return null;
    }
    const outDir = prepareOutputDir(assetDir, downloaded, profile);
    const response: ApplyProfileResponse = await applyProfile(
        logger,
        downloaded,
        profile.media,
        profile.name,
        outDir,
        assetPath(sourceAsset.name),
        conn,
        analysisResults,
    );
    if (profile.operationObject.func) {
        // applyProfile actually ran the job, we should be done
        if (response.result) {
            job.status = "finished";
            job.finished = clock.now();
            job.result = JSON.stringify(response.result);
        } else {
            logger.error(`execAnalyze: analysis=null profile=${profile.name} asset=${sourceAsset.name}`);
            return null;
        }
    } else {
        if (response.args && response.args.length > 0) {
            if (!profile.operationObject.command) {
                logger.error(`execAnalyze: no profile.operationObject.command for profile=${profile.name}`);
                return null;
            }
            const result = await runExternalCommand(profile.operationObject.command, response.args, logger);
            if (result.exitCode === 0) {
                job.status = "finished";
                job.finished = clock.now();
                job.result = result.stdout;
            } else {
                logger.error(
                    `execAnalyze: exitCode=${result.exitCode} args=${response.args} profile=${profile.name} asset=${sourceAsset.name} stdout=${result.stdout} stderr=${result.stderr}`,
                );
                return null;
            }
        } else {
            logger.error(`execAnalyze: args=${response.args} profile=${profile.name} asset=${sourceAsset.name}`);
            return null;
        }
    }
    return { outDir, response, job };
};

export const analyzeAsset = async (
    analyzer: YbAnalyzer,
    sourceAsset: SourceAssetType,
    downloaded: string,
    profile: ParsedProfile,
    conn: MobilettoConnection,
    analysisResults: ProfileJobType[],
): Promise<TransformResult | null> => {
    const assetDir = analyzer.config.assetDir;
    if (!profile.operationObject || !assetDir) return null; // should never happen

    const jobName = profileJobName(sourceAsset, profile);

    const profileJobRepo = analyzer.config.profileJobRepo();
    const job: ProfileJobType = {
        name: jobName,
        profile: profile.name,
        operation: profile.operation,
        analysis: true,
        asset: sourceAsset.name,
        owner: analyzer.config.systemName,
        status: "started",
        started: analyzer.clock.now(),
    };
    const result: TransformResult | null = await execAnalyze(
        assetDir,
        downloaded,
        profile,
        job,
        analyzer.config.logger,
        sourceAsset,
        conn,
        analyzer.clock,
        analysisResults,
    );
    if (!result) {
        analyzer.config.logger.warn("transformAsset: no result returned from execTransform");
        return null;
    }
    if (!result.outDir) {
        analyzer.config.logger.warn("transformAsset: no result.outDir returned from execTransform");
        return null;
    }
    if (!result.response) {
        analyzer.config.logger.warn("transformAsset: no result.response returned from execTransform");
        return null;
    }
    const existingAnalysis = await profileJobRepo.safeFindById(jobName);
    if (existingAnalysis) {
        analyzer.config.logger.info(
            `analyze: updating analysis profileJob: ${JSON.stringify(job)} (previous=${JSON.stringify(
                existingAnalysis,
            )})`,
        );
        await profileJobRepo.update(job);
    } else {
        analyzer.config.logger.info(`analyze: creating analysis profileJob: ${JSON.stringify(job)}`);
        await profileJobRepo.create(job);
    }
    if (result.response.upload) {
        const destRepo = analyzer.config.destinationRepo();
        const destinations = (await destRepo.safeFindBy("assets", true)) as DestinationType[];
        if (!destinations || destinations.length === 0) {
            analyzer.config.logger.error("analyze: no destinations!");
        } else {
            await uploadFiles(result, profile, job, destinations, analyzer);
        }
    }
    return result;
};

export const analyzeSourceAsset = async (analyzer: YbAnalyzer, sourceAsset: SourceAssetType) => {
    const downloadResult = await downloadSourceAsset(
        analyzer.config.downloadDir,
        sourceAsset,
        analyzer.config.sourceRepo(),
        analyzer.clock,
    );
    if (!downloadResult) return false; // should not happen
    const downloaded = downloadResult.outfile;

    // which media types are interested in this file?
    const mediaRepo = analyzer.config.mediaRepo();
    const mediaProfileRepo = analyzer.config.mediaProfileRepo();
    const medias = (await mediaRepo.safeFindBy("ext", fileExtWithoutDot(downloaded))) as MediaType[];
    const analysisProfiles: ParsedProfile[] = [];
    const transformProfiles: ParsedProfile[] = [];

    async function addProfiles(fromProfiles: MediaProfileType[]) {
        for (const p of fromProfiles) {
            if (p.noop || p.enabled === false) continue;
            const parsedProfile = loadProfile(p.name);
            if (parsedProfile.operationObject && parsedProfile.operationObject.analysis) {
                analysisProfiles.push(parsedProfile);
            } else {
                transformProfiles.push(parsedProfile);
            }
        }
    }

    for (const m of medias) {
        const mainProfiles = (await mediaProfileRepo.safeFindBy("media", m.name)) as MediaProfileType[];
        await addProfiles(mainProfiles);
    }

    const analysisResults: ProfileJobType[] = [];
    for (const analyzeProfile of analysisProfiles.sort(PROFILE_SORT_PRIORITY)) {
        const result = await analyzeAsset(
            analyzer,
            sourceAsset,
            downloaded,
            analyzeProfile,
            downloadResult.conn,
            analysisResults,
        );
        if (result && result.job) {
            analysisResults.push(result.job);
        }
    }

    const jobRepo = analyzer.config.profileJobRepo();
    for (const transformProfile of transformProfiles.sort(PROFILE_SORT_PRIORITY)) {
        const jobName = profileJobName(sourceAsset, transformProfile);
        const foundJob = await jobRepo.safeFindById(jobName);
        if (!foundJob) {
            const profileJob: ProfileJobType = {
                name: jobName,
                analysis: false,
                profile: transformProfile.name,
                operation: transformProfile.operation,
                asset: sourceAsset.name,
            };
            analyzer.config.logger.info(`analyze: creating transform profileJob: ${JSON.stringify(profileJob)}`);
            await jobRepo.create(profileJob);
        }
    }

    // wait for all jobs to finish
    const jobsDone: Record<string, boolean> = {};
    transformProfiles.forEach((p) => (jobsDone[p.name] = false));
    while (Object.values(jobsDone).filter((o) => o).length < transformProfiles.length) {
        await sleep(analyzer.analyzerPollInterval);
        const jobs = (await jobRepo.safeFindBy("asset", sourceAsset.name)) as ProfileJobType[];
        if (jobs && jobs.length > 0) {
            for (const job of jobs) {
                if (job.finished) {
                    jobsDone[job.name] = true;
                }
            }
        }
    }
    return true;
};
