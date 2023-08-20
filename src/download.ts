import { MobilettoOrmRepository } from "mobiletto-orm";
import { MobilettoClock, sleep } from "mobiletto-orm-scan-typedef";
import { connectVolume, SourceAssetType, SourceType } from "yuebing-model";
import { assetPath, assetSource, fileExtWithDot } from "yuebing-media";
import { sha } from "mobiletto-orm-typedef";
import fs from "fs";

const DOWNLOAD_TIMEOUT = 1000 * 60;

export const downloadSourceAsset = async (
    downloadDir: string,
    sourceAsset: SourceAssetType | string,
    sourceRepo: MobilettoOrmRepository<SourceType>,
    clock: MobilettoClock,
): Promise<string | null> => {
    const assetName = typeof sourceAsset === "string" ? assetPath(sourceAsset) : sourceAsset.name;
    if (!assetName) return null; // should never happen

    const sourceName = typeof sourceAsset === "string" ? assetSource(sourceAsset) : sourceAsset.source;

    const ext = fileExtWithDot(assetName);
    const srcPath = assetPath(assetName);
    const outfile = downloadDir + "/downloaded_" + sha(assetName) + ext;
    let outfileStat = fs.statSync(outfile, { throwIfNoEntry: false });
    const source = await sourceRepo.findById(sourceName);
    const conn = await connectVolume(source);
    const meta = await conn.metadata(srcPath);
    if (outfileStat) {
        // wait for file to finish downloading, or to timeout
        while (outfileStat && outfileStat.size !== meta.size && clock.now() - outfileStat.mtimeMs < DOWNLOAD_TIMEOUT) {
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
