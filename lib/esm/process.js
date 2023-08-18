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
import { sha } from "mobiletto-orm-typedef";
import { connectVolume } from "yuebing-model";
import { ASSET_SEP } from "./ybScanner.js";
import { sleep } from "mobiletto-orm-scan-typedef";
// todo: this should live elsewhere in some common library
const fileExtWithDot = (path) => {
    if (!path || path.length === 0)
        return "";
    const lastDot = path.lastIndexOf(".");
    return lastDot === -1 || lastDot === path.length - 1 ? "" : path.substring(lastDot);
};
const fileExtWithoutDot = (path) => {
    if (!path || path.length === 0)
        return "";
    const lastDot = path.lastIndexOf(".");
    return lastDot === -1 || lastDot === path.length - 1 ? "" : path.substring(lastDot + 1);
};
const assetPath = (path) => path.substring(path.indexOf(ASSET_SEP));
const DOWNLOAD_TIMEOUT = 1000 * 60;
const downloadAsset = (processor, discoveredAsset) => __awaiter(void 0, void 0, void 0, function* () {
    const assetName = discoveredAsset.name;
    if (!assetName)
        return;
    const ext = fileExtWithDot(assetName);
    const srcPath = assetPath(assetName);
    const outfile = processor.config.downloadDir + "/downloaded_" + sha(assetName) + ext;
    let outfileStat = fs.statSync(outfile, { throwIfNoEntry: false });
    const sourceRepo = processor.config.sourceRepo();
    const source = yield sourceRepo.findById(discoveredAsset.source);
    const conn = yield connectVolume(source);
    const meta = yield conn.metadata(srcPath);
    if (outfileStat) {
        // wait for file to finish downloading, or to timeout
        while (outfileStat &&
            outfileStat.size !== meta.size &&
            processor.clock.now() - outfileStat.mtimeMs < DOWNLOAD_TIMEOUT) {
            yield sleep(1000);
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
    yield conn.read(srcPath, (chunk) => fs.writeSync(fd, chunk));
    fs.closeSync(fd);
    return outfile;
});
const PARSED_PROFILES = {};
const parseProfile = (processor, profile) => __awaiter(void 0, void 0, void 0, function* () {
    if (!PARSED_PROFILES[profile.name]) {
        let fromProfile = null;
        if (profile.from) {
            const fromProfileObj = yield processor.config.mediaProfileRepo().findById(profile.from);
            fromProfile = yield parseProfile(processor, fromProfileObj);
        }
        const parsed = Object.assign({}, fromProfile ? fromProfile : {}, profile);
        if (profile.subProfiles && profile.subProfiles.length > 0) {
            parsed.subProfileObjects = [];
            for (const subProf of profile.subProfiles) {
                const subProfObject = yield processor.config.mediaProfileRepo().findById(subProf);
                parsed.subProfileObjects.push(yield parseProfile(processor, subProfObject));
            }
        }
        PARSED_PROFILES[profile.name] = parsed;
    }
    return PARSED_PROFILES[profile.name];
});
export const processSourceAsset = (processor, sourceAsset) => __awaiter(void 0, void 0, void 0, function* () {
    const destAssetRepo = processor.config.destinationAssetRepo();
    const downloaded = yield downloadAsset(processor, sourceAsset);
    // which media types are interested in this file?
    const mediaRepo = processor.config.mediaRepo();
    const mediaProfileRepo = processor.config.mediaProfileRepo();
    const medias = (yield mediaRepo.safeFindBy("ext", fileExtWithoutDot(downloaded)));
    for (const m of medias) {
        const profiles = [];
        if (m.from) {
            const fromMedia = yield mediaRepo.findById(m.from);
            profiles.push(...(yield mediaProfileRepo.safeFindBy("media", fromMedia.name)));
        }
        profiles.push(...(yield mediaProfileRepo.safeFindBy("media", m.name)));
        for (const profile of profiles) {
            const fullProfile = yield parseProfile(processor, profile);
            const existingAssets = (yield destAssetRepo.safeFindBy("sourceAsset", sourceAsset.name));
            const outputAssets = yield processProfile(processor, fullProfile, existingAssets);
            if (outputAssets && outputAssets.length > 0) {
                for (const outputAsset of outputAssets) {
                    const newDestAsset = {
                        name: outputAsset,
                        profile: profile.name,
                        source: sourceAsset.source,
                        sourceAsset: sourceAsset.name,
                    };
                    yield destAssetRepo.create(newDestAsset);
                }
            }
        }
    }
});
const processProfile = (processor, profile, existingAssets) => __awaiter(void 0, void 0, void 0, function* () {
    if (processor || profile)
        return existingAssets.map((a) => a.name);
    return [];
});
