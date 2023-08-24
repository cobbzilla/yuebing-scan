import { MobilettoLogger } from "mobiletto-common";
import { MobilettoClock, sleep } from "mobiletto-orm-scan-typedef";
import { MediaProfileType, MediaType, ProfileJobType, SourceAssetType } from "yuebing-model";
import {
    applyProfile,
    ApplyProfileResponse,
    assetPath,
    fileExtWithoutDot,
    loadProfile,
    ParsedProfile,
} from "yuebing-media";
import { profileJobName, prepareOutputDir, runExternalCommand } from "./util.js";
import { downloadSourceAsset } from "./download.js";
import { YbAnalyzer } from "./ybAnalyzer.js";
import { MobilettoConnection } from "mobiletto-base";

const execAnalyze = async (
    assetDir: string,
    downloaded: string,
    profile: ParsedProfile,
    profileJob: ProfileJobType,
    logger: MobilettoLogger,
    sourceAsset: SourceAssetType,
    conn: MobilettoConnection,
    clock: MobilettoClock,
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
    const response: ApplyProfileResponse = await applyProfile(
        downloaded,
        profile.media,
        profile.name,
        outDir,
        assetPath(sourceAsset.name),
        conn,
    );
    if (profile.operationObject.func) {
        // applyProfile actually ran the job, we should be done
        if (response.analysis) {
            profileJob.status = "finished";
            profileJob.finished = clock.now();
            profileJob.analysis = JSON.stringify(response.analysis);
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
            const result = await runExternalCommand(profile.operationObject.command, response.args);
            if (result.exitCode === 0) {
                profileJob.status = "finished";
                profileJob.finished = clock.now();
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
    analyzer: YbAnalyzer,
    sourceAsset: SourceAssetType,
    downloaded: string,
    profile: ParsedProfile,
    conn: MobilettoConnection,
) => {
    const assetDir = analyzer.config.assetDir;
    if (!profile.operationObject || !assetDir) return null; // should never happen

    const jobName = profileJobName(sourceAsset, profile);

    const profileJobRepo = analyzer.config.profileJobRepo();
    const profileJob: ProfileJobType = {
        name: jobName,
        profile: profile.name,
        asset: sourceAsset.name,
        owner: analyzer.config.systemName,
        status: "started",
        started: analyzer.clock.now(),
    };
    await execAnalyze(
        assetDir,
        downloaded,
        profile,
        profileJob,
        analyzer.config.logger,
        sourceAsset,
        conn,
        analyzer.clock,
    );
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
        await analyzeAsset(analyzer, sourceAsset, downloaded, analyzeProfile, downloadResult.conn);
    }

    const jobRepo = analyzer.config.profileJobRepo();
    for (const transformProfile of transformProfiles) {
        const jobName = profileJobName(sourceAsset, transformProfile);
        const foundJob = await jobRepo.safeFindById(jobName);
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
