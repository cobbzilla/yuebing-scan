import { MobilettoLogger } from "mobiletto-common";
import { sleep } from "mobiletto-orm-scan-typedef";
import { MediaProfileType, MediaType, ProfileJobType, SourceAssetType } from "yuebing-model";
import { applyProfile, ApplyProfileResponse, fileExtWithoutDot, loadProfile, ParsedProfile } from "yuebing-media";
import { profileJobName, prepareOutputDir, runExternalCommand } from "./util.js";
import { downloadSourceAsset } from "./download.js";
import { YbAnalyzer } from "./ybAnalyzer.js";

const execAnalyze = async (
    assetDir: string,
    downloaded: string,
    profile: ParsedProfile,
    profileJob: ProfileJobType,
    logger: MobilettoLogger,
    sourceAsset: SourceAssetType,
): Promise<ProfileJobType | null> => {
    if (!profile.operationObject) {
        logger.error(`execAnalyze: no profile.operationObject for profile=${profile.name}`);
        return null;
    }
    if (!profile.media) {
        logger.error(`execAnalyze: no profile.media for profile=${profile.name}`);
        return null;
    }
    const outDir = prepareOutputDir(assetDir, downloaded, profile);
    const response: ApplyProfileResponse = await applyProfile(downloaded, profile.media, profile.name, outDir);
    if (profile.operationObject.func) {
        // applyProfile actually ran the job, we should be done
        if (response.analysis) {
            profileJob.status = "finished";
            profileJob.analysis =
                typeof response.analysis === "string" ? response.analysis : JSON.stringify(response.analysis);
        } else {
            logger.error(`execAnalyze: analysis=null profile=${profile.name} asset=${sourceAsset.name}`);
            return null;
        }
    } else {
        if (response.args && response.args.length > 0) {
            const result = await runExternalCommand(profile.operationObject.command, response.args);
            if (result.exitCode === 0) {
                profileJob.status = "finished";
                profileJob.analysis = result.stdout;
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
    return profileJob;
};

export const analyzeAsset = async (
    processor: YbAnalyzer,
    sourceAsset: SourceAssetType,
    downloaded: string,
    profile: ParsedProfile,
) => {
    const assetDir = processor.config.assetDir;
    if (!profile.operationObject || !assetDir) return null; // should never happen

    const jobName = profileJobName(sourceAsset, profile);

    const profileJobRepo = processor.config.profileJobRepo();
    const profileJob: ProfileJobType = {
        name: jobName,
        profile: profile.name,
        asset: sourceAsset.name,
        owner: processor.config.systemName,
        status: "started",
        started: processor.clock.now(),
    };
    await execAnalyze(assetDir, downloaded, profile, profileJob, processor.config.logger, sourceAsset);
    const existingAnalysis = await profileJobRepo.safeFindById(jobName);
    if (existingAnalysis) {
        console.info(
            `analyze: updating analysis profileJob: ${JSON.stringify(profileJob)} (previous=${JSON.stringify(
                existingAnalysis,
            )})`,
        );
        await profileJobRepo.update(profileJob);
    } else {
        console.info(`analyze: creating analysis profileJob: ${JSON.stringify(profileJob)}`);
        await profileJobRepo.create(profileJob);
    }
};

export const analyzeSourceAsset = async (processor: YbAnalyzer, sourceAsset: SourceAssetType) => {
    const downloaded = await downloadSourceAsset(
        processor.config.downloadDir,
        sourceAsset,
        processor.config.sourceRepo(),
        processor.clock,
    );
    if (!downloaded) return; // source asset had no name, should never happen

    // which media types are interested in this file?
    const mediaRepo = processor.config.mediaRepo();
    const mediaProfileRepo = processor.config.mediaProfileRepo();
    const medias = (await mediaRepo.safeFindBy("ext", fileExtWithoutDot(downloaded))) as MediaType[];
    const analysisProfiles: ParsedProfile[] = [];
    const transformProfiles: ParsedProfile[] = [];

    async function addProfiles(fromProfiles: MediaProfileType[]) {
        for (const p of fromProfiles) {
            if (p.noop || !p.enabled) continue;
            const parsedProfile = loadProfile(p.name);
            if (parsedProfile.operationObject && parsedProfile.operationObject.analysis) {
                analysisProfiles.push(parsedProfile);
            } else {
                transformProfiles.push(parsedProfile);
            }
        }
    }

    for (const m of medias) {
        if (m.from) {
            const fromMedia = await mediaRepo.findById(m.from);
            const fromProfiles = (await mediaProfileRepo.safeFindBy("media", fromMedia.name)) as MediaProfileType[];
            await addProfiles(fromProfiles);
        }
        const mainProfiles = (await mediaProfileRepo.safeFindBy("media", m.name)) as MediaProfileType[];
        await addProfiles(mainProfiles);
    }

    for (const analyzeProfile of analysisProfiles) {
        await analyzeAsset(processor, sourceAsset, downloaded, analyzeProfile);
    }

    const jobRepo = processor.config.profileJobRepo();
    for (const transformProfile of transformProfiles) {
        const jobName = profileJobName(sourceAsset, transformProfile);
        const foundJob = jobRepo.safeFindById(jobName);
        if (!foundJob) {
            const profileJob: ProfileJobType = {
                name: jobName,
                profile: transformProfile.name,
                asset: sourceAsset.name,
            };
            console.info(`analyze: creating transform profileJob: ${JSON.stringify(profileJob)}`);
            await jobRepo.create(profileJob);
        }
    }

    // wait for all jobs to finish
    const jobsDone: Record<string, boolean> = {};
    transformProfiles.forEach((p) => (jobsDone[p.name] = false));
    while (Object.values(jobsDone).filter((o) => o).length < transformProfiles.length) {
        const jobs = (await jobRepo.safeFindBy("asset", sourceAsset.name)) as ProfileJobType[];
        if (jobs && jobs.length > 0) {
            for (const job of jobs) {
                if (job.finished) {
                    jobsDone[job.name] = true;
                }
            }
        }
        await sleep(1000 * 60);
    }
};
