var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { sleep } from "zilla-util";
import { PROFILE_SORT_PRIORITY, } from "yuebing-model";
import { applyProfile, assetPath, fileExtWithoutDot, loadProfile, runExternalCommand, } from "yuebing-media";
import { profileJobName, prepareOutputDir } from "./util.js";
import { downloadSourceAsset } from "./download.js";
import { uploadFiles } from "./upload.js";
const execAnalyze = (assetDir, downloaded, profile, job, logger, sourceAsset, conn, clock, analysisResults) => __awaiter(void 0, void 0, void 0, function* () {
    if (!profile.operationObject) {
        logger.error(`execAnalyze: no profile.operationObject for profile=${profile.name}`);
        return null;
    }
    if (!profile.media) {
        logger.error(`execAnalyze: no profile.media for profile=${profile.name}`);
        return null;
    }
    const outDir = prepareOutputDir(assetDir, downloaded, profile);
    const response = yield applyProfile(downloaded, profile.media, profile.name, outDir, assetPath(sourceAsset.name), conn, analysisResults);
    if (profile.operationObject.func) {
        // applyProfile actually ran the job, we should be done
        if (response.result) {
            job.status = "finished";
            job.finished = clock.now();
            job.result = JSON.stringify(response.result);
        }
        else {
            logger.error(`execAnalyze: analysis=null profile=${profile.name} asset=${sourceAsset.name}`);
            return null;
        }
    }
    else {
        if (response.args && response.args.length > 0) {
            if (!profile.operationObject.command) {
                logger.error(`execAnalyze: no profile.operationObject.command for profile=${profile.name}`);
                return null;
            }
            const result = yield runExternalCommand(profile.operationObject.command, response.args);
            if (result.exitCode === 0) {
                job.status = "finished";
                job.finished = clock.now();
                job.result = result.stdout;
            }
            else {
                logger.error(`execAnalyze: exitCode=${result.exitCode} args=${response.args} profile=${profile.name} asset=${sourceAsset.name} stdout=${result.stdout} stderr=${result.stderr}`);
                return null;
            }
        }
        else {
            logger.error(`execAnalyze: args=${response.args} profile=${profile.name} asset=${sourceAsset.name}`);
            return null;
        }
    }
    return { outDir, response, job };
});
export const analyzeAsset = (analyzer, sourceAsset, downloaded, profile, conn, analysisResults) => __awaiter(void 0, void 0, void 0, function* () {
    const assetDir = analyzer.config.assetDir;
    if (!profile.operationObject || !assetDir)
        return null; // should never happen
    const jobName = profileJobName(sourceAsset, profile);
    const profileJobRepo = analyzer.config.profileJobRepo();
    const job = {
        name: jobName,
        profile: profile.name,
        operation: profile.operation,
        analysis: true,
        asset: sourceAsset.name,
        owner: analyzer.config.systemName,
        status: "started",
        started: analyzer.clock.now(),
    };
    const result = yield execAnalyze(assetDir, downloaded, profile, job, analyzer.config.logger, sourceAsset, conn, analyzer.clock, analysisResults);
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
    const existingAnalysis = yield profileJobRepo.safeFindById(jobName);
    if (existingAnalysis) {
        analyzer.config.logger.info(`analyze: updating analysis profileJob: ${JSON.stringify(job)} (previous=${JSON.stringify(existingAnalysis)})`);
        yield profileJobRepo.update(job);
    }
    else {
        console.info(`analyze: creating analysis profileJob: ${JSON.stringify(job)}`);
        yield profileJobRepo.create(job);
    }
    if (result.response.upload) {
        const destRepo = analyzer.config.destinationRepo();
        const destinations = (yield destRepo.safeFindBy("assets", true));
        if (!destinations || destinations.length === 0) {
            analyzer.config.logger.error("analyze: no destinations!");
        }
        else {
            yield uploadFiles(result, profile, job, destinations, analyzer);
        }
    }
    return result;
});
export const analyzeSourceAsset = (analyzer, sourceAsset) => __awaiter(void 0, void 0, void 0, function* () {
    const downloadResult = yield downloadSourceAsset(analyzer.config.downloadDir, sourceAsset, analyzer.config.sourceRepo(), analyzer.clock);
    if (!downloadResult)
        return false; // should not happen
    const downloaded = downloadResult.outfile;
    // which media types are interested in this file?
    const mediaRepo = analyzer.config.mediaRepo();
    const mediaProfileRepo = analyzer.config.mediaProfileRepo();
    const medias = (yield mediaRepo.safeFindBy("ext", fileExtWithoutDot(downloaded)));
    const analysisProfiles = [];
    const transformProfiles = [];
    function addProfiles(fromProfiles) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const p of fromProfiles) {
                if (p.noop || p.enabled === false)
                    continue;
                const parsedProfile = loadProfile(p.name);
                if (parsedProfile.operationObject && parsedProfile.operationObject.analysis) {
                    analysisProfiles.push(parsedProfile);
                }
                else {
                    transformProfiles.push(parsedProfile);
                }
            }
        });
    }
    for (const m of medias) {
        const mainProfiles = (yield mediaProfileRepo.safeFindBy("media", m.name));
        yield addProfiles(mainProfiles);
    }
    const analysisResults = [];
    for (const analyzeProfile of analysisProfiles.sort(PROFILE_SORT_PRIORITY)) {
        const result = yield analyzeAsset(analyzer, sourceAsset, downloaded, analyzeProfile, downloadResult.conn, analysisResults);
        if (result && result.job) {
            analysisResults.push(result.job);
        }
    }
    const jobRepo = analyzer.config.profileJobRepo();
    for (const transformProfile of transformProfiles.sort(PROFILE_SORT_PRIORITY)) {
        const jobName = profileJobName(sourceAsset, transformProfile);
        const foundJob = yield jobRepo.safeFindById(jobName);
        if (!foundJob) {
            const profileJob = {
                name: jobName,
                analysis: false,
                profile: transformProfile.name,
                operation: transformProfile.operation,
                asset: sourceAsset.name,
            };
            console.info(`analyze: creating transform profileJob: ${JSON.stringify(profileJob)}`);
            yield jobRepo.create(profileJob);
        }
    }
    // wait for all jobs to finish
    const jobsDone = {};
    transformProfiles.forEach((p) => (jobsDone[p.name] = false));
    while (Object.values(jobsDone).filter((o) => o).length < transformProfiles.length) {
        yield sleep(analyzer.analyzerPollInterval);
        const jobs = (yield jobRepo.safeFindBy("asset", sourceAsset.name));
        if (jobs && jobs.length > 0) {
            for (const job of jobs) {
                if (job.finished) {
                    jobsDone[job.name] = true;
                }
            }
        }
    }
    return true;
});
