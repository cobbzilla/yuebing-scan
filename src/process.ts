import * as fs from "fs";
import { sha } from "mobiletto-orm-typedef";
import { connectVolume, SourceAssetType, MediaProfileType, MediaType, DestinationAssetType } from "yuebing-model";
import { YbProcessor } from "./ybProcessor.js";
import { ASSET_SEP } from "./ybScanner.js";
import { sleep } from "mobiletto-orm-scan-typedef";

// todo: this should live elsewhere in some common library
const fileExtWithDot = (path?: string) => {
    if (!path || path.length === 0) return "";
    const lastDot = path.lastIndexOf(".");
    return lastDot === -1 || lastDot === path.length - 1 ? "" : path.substring(lastDot);
};

const fileExtWithoutDot = (path?: string) => {
    if (!path || path.length === 0) return "";
    const lastDot = path.lastIndexOf(".");
    return lastDot === -1 || lastDot === path.length - 1 ? "" : path.substring(lastDot + 1);
};

const assetPath = (path: string) => path.substring(path.indexOf(ASSET_SEP));

const DOWNLOAD_TIMEOUT = 1000 * 60;

const downloadAsset = async (processor: YbProcessor, discoveredAsset: SourceAssetType) => {
    const assetName = discoveredAsset.name;
    if (!assetName) return;

    const ext = fileExtWithDot(assetName);
    const srcPath = assetPath(assetName);
    const outfile = processor.config.downloadDir + "/downloaded_" + sha(assetName) + ext;
    let outfileStat = fs.statSync(outfile, { throwIfNoEntry: false });
    const sourceRepo = processor.config.sourceRepo();
    const source = await sourceRepo.findById(discoveredAsset.source);
    const conn = await connectVolume(source);
    const meta = await conn.metadata(srcPath);
    if (outfileStat) {
        // wait for file to finish downloading, or to timeout
        while (
            outfileStat &&
            outfileStat.size !== meta.size &&
            processor.clock.now() - outfileStat.mtimeMs < DOWNLOAD_TIMEOUT
        ) {
            await sleep(1000);
            outfileStat = fs.statSync(outfile, { throwIfNoEntry: false });
        }
        if (outfileStat && outfileStat.size === meta.size) {
            // successfully downloaded by another caller
            return outfile;
        }
        // must have timed out, overwrite file
    }

    // download file
    const fd = fs.openSync(outfile, "w", 0o600);
    await conn.read(srcPath, (chunk: Buffer) => fs.writeSync(fd, chunk));
    fs.closeSync(fd);

    return outfile;
};

type ParsedProfile = MediaProfileType & {
    subProfileObjects?: ParsedProfile[];
};

const PARSED_PROFILES: Record<string, ParsedProfile> = {};

const parseProfile = async (processor: YbProcessor, profile: MediaProfileType): Promise<ParsedProfile> => {
    if (!PARSED_PROFILES[profile.name]) {
        let fromProfile: MediaProfileType | null = null;
        if (profile.from) {
            const fromProfileObj = await processor.config.mediaProfileRepo().findById(profile.from);
            fromProfile = await parseProfile(processor, fromProfileObj);
        }
        const parsed: MediaProfileType = Object.assign({}, fromProfile ? fromProfile : {}, profile);

        if (profile.subProfiles && profile.subProfiles.length > 0) {
            parsed.subProfileObjects = [];
            for (const subProf of profile.subProfiles) {
                const subProfObject = await processor.config.mediaProfileRepo().findById(subProf);
                parsed.subProfileObjects.push(await parseProfile(processor, subProfObject));
            }
        }
        PARSED_PROFILES[profile.name] = parsed;
    }
    return PARSED_PROFILES[profile.name];
};

export const processSourceAsset = async (processor: YbProcessor, sourceAsset: SourceAssetType) => {
    const destAssetRepo = processor.config.destinationAssetRepo();
    const downloaded = await downloadAsset(processor, sourceAsset);

    // which media types are interested in this file?
    const mediaRepo = processor.config.mediaRepo();
    const mediaProfileRepo = processor.config.mediaProfileRepo();
    const medias = (await mediaRepo.safeFindBy("ext", fileExtWithoutDot(downloaded))) as MediaType[];
    for (const m of medias) {
        const profiles = [];
        if (m.from) {
            const fromMedia = await mediaRepo.findById(m.from);
            profiles.push(...((await mediaProfileRepo.safeFindBy("media", fromMedia.name)) as MediaProfileType[]));
        }
        profiles.push(...((await mediaProfileRepo.safeFindBy("media", m.name)) as MediaProfileType[]));
        for (const profile of profiles) {
            const fullProfile = await parseProfile(processor, profile);
            const existingAssets = (await destAssetRepo.safeFindBy(
                "sourceAsset",
                sourceAsset.name,
            )) as DestinationAssetType[];
            const outputAssets: string[] = await processProfile(processor, fullProfile, existingAssets);
            if (outputAssets && outputAssets.length > 0) {
                for (const outputAsset of outputAssets) {
                    const newDestAsset: DestinationAssetType = {
                        name: outputAsset, // todo: fixme
                        profile: profile.name,
                        source: sourceAsset.source,
                        sourceAsset: sourceAsset.name,
                    };
                    await destAssetRepo.create(newDestAsset);
                }
            }
        }
    }
};

const processProfile = async (
    processor: YbProcessor,
    profile: ParsedProfile,
    existingAssets: DestinationAssetType[],
): Promise<string[]> => {
    if (processor || profile) return existingAssets.map((a) => a.name);
    return [];
};
