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
import { applyProfile, fileExtWithoutDot, loadProfile } from "yuebing-media";
import { profileJobName, prepareOutputDir, runExternalCommand } from "./util.js";
import { downloadSourceAsset } from "./download.js";
const execAnalyze = (assetDir, downloaded, profile, profileJob, logger, sourceAsset) => __awaiter(void 0, void 0, void 0, function* () {
    if (!profile.operationObject) {
        logger.error(`execAnalyze: no profile.operationObject for profile=${profile.name}`);
        return null;
    }
    if (!profile.media) {
        logger.error(`execAnalyze: no profile.media for profile=${profile.name}`);
        return null;
    }
    const outDir = prepareOutputDir(assetDir, downloaded, profile);
    const response = yield applyProfile(downloaded, profile.media, profile.name, outDir);
    if (profile.operationObject.func) {
        // applyProfile actually ran the job, we should be done
        if (response.analysis) {
            profileJob.status = "finished";
            profileJob.analysis =
                typeof response.analysis === "string" ? response.analysis : JSON.stringify(response.analysis);
        }
        else {
            logger.error(`execAnalyze: analysis=null profile=${profile.name} asset=${sourceAsset.name}`);
            return null;
        }
    }
    else {
        if (response.args && response.args.length > 0) {
            const result = yield runExternalCommand(profile.operationObject.command, response.args);
            if (result.exitCode === 0) {
                profileJob.status = "finished";
                profileJob.analysis = result.stdout;
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
    return profileJob;
});
export const analyzeAsset = (processor, sourceAsset, downloaded, profile) => __awaiter(void 0, void 0, void 0, function* () {
    const assetDir = processor.config.assetDir;
    if (!profile.operationObject || !assetDir)
        return null; // should never happen
    const jobName = profileJobName(sourceAsset, profile);
    const profileJobRepo = processor.config.profileJobRepo();
    const profileJob = {
        name: jobName,
        profile: profile.name,
        asset: sourceAsset.name,
        owner: processor.config.systemName,
        status: "started",
        started: processor.clock.now(),
    };
    yield execAnalyze(assetDir, downloaded, profile, profileJob, processor.config.logger, sourceAsset);
    const existingAnalysis = yield profileJobRepo.safeFindById(jobName);
    if (existingAnalysis) {
        yield profileJobRepo.update(profileJob);
    }
    else {
        yield profileJobRepo.create(profileJob);
    }
});
export const analyzeSourceAsset = (processor, sourceAsset) => __awaiter(void 0, void 0, void 0, function* () {
    const downloaded = yield downloadSourceAsset(processor.config.downloadDir, sourceAsset, processor.config.sourceRepo(), processor.clock);
    if (!downloaded)
        return; // source asset had no name, should never happen
    // which media types are interested in this file?
    const mediaRepo = processor.config.mediaRepo();
    const mediaProfileRepo = processor.config.mediaProfileRepo();
    const medias = (yield mediaRepo.safeFindBy("ext", fileExtWithoutDot(downloaded)));
    const analysisProfiles = [];
    const transformProfiles = [];
    function addProfiles(fromProfiles) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const p of fromProfiles) {
                if (p.noop || !p.enabled)
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
        if (m.from) {
            const fromMedia = yield mediaRepo.findById(m.from);
            const fromProfiles = (yield mediaProfileRepo.safeFindBy("media", fromMedia.name));
            yield addProfiles(fromProfiles);
        }
        const mainProfiles = (yield mediaProfileRepo.safeFindBy("media", m.name));
        yield addProfiles(mainProfiles);
    }
    for (const analyzeProfile of analysisProfiles) {
        yield analyzeAsset(processor, sourceAsset, downloaded, analyzeProfile);
    }
    const jobRepo = processor.config.profileJobRepo();
    for (const transformProfile of transformProfiles) {
        const jobName = profileJobName(sourceAsset, transformProfile);
        const foundJob = jobRepo.safeFindById(jobName);
        if (!foundJob) {
            const profileJob = {
                name: jobName,
                profile: transformProfile.name,
                asset: sourceAsset.name,
            };
            yield jobRepo.create(profileJob);
        }
    }
    // wait for all jobs to finish
    const jobsDone = {};
    transformProfiles.forEach((p) => (jobsDone[p.name] = false));
    while (Object.values(jobsDone).filter((o) => o).length < transformProfiles.length) {
        const jobs = (yield jobRepo.safeFindBy("asset", sourceAsset.name));
        if (jobs && jobs.length > 0) {
            for (const job of jobs) {
                if (job.finished) {
                    jobsDone[job.name] = true;
                }
            }
        }
        yield sleep(1000 * 60);
    }
});
