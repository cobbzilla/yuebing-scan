import fs from "fs";
import { ZillaClock, sleep } from "zilla-util";
import { MobilettoOrmRepository } from "mobiletto-orm";
import { sha } from "mobiletto-orm-typedef";
import { MobilettoConnection } from "mobiletto-base";
import { SourceAssetType, SourceType } from "yuebing-model";
import { connectVolume } from "yuebing-server-util";
import { assetPath, assetSource, fileExtWithDot } from "yuebing-media";
import { transferTimeout } from "./util.js";

export type DownloadAssetResult = {
    outfile: string;
    conn: MobilettoConnection;
};

export const downloadSourceAsset = async (
    downloadDir: string,
    sourceAsset: SourceAssetType | string,
    sourceRepo: MobilettoOrmRepository<SourceType>,
    clock: ZillaClock,
): Promise<DownloadAssetResult | null> => {
    const assetName = typeof sourceAsset === "string" ? assetPath(sourceAsset) : sourceAsset.name;
    if (!assetName) return null; // should never happen

    const sourceName = typeof sourceAsset === "string" ? assetSource(sourceAsset) : sourceAsset.source;

    const ext = fileExtWithDot(assetName);
    const srcPath = assetPath(assetName);
    const outfile = downloadDir + "/downloaded_" + sha(assetName) + ext;
    let outfileStat = fs.statSync(outfile, { throwIfNoEntry: false });
    const source = await sourceRepo.findById(sourceName);
    const connResult = await connectVolume(source);
    if (connResult.error || !connResult.connection) {
        throw new Error(`downloadSourceAsset(${sourceAsset}): error creating connection: ${connResult.error}`);
    }
    const conn = connResult.connection;
    const meta = await conn.metadata(srcPath);
    if (!meta.size) {
        throw new Error(`downloadSourceAsset(${sourceAsset}): meta.size was not defined`);
    }
    if (outfileStat) {
        const timeout = transferTimeout(meta.size);

        // wait for file to finish downloading, or to timeout
        while (outfileStat && outfileStat.size !== meta.size && clock.now() - outfileStat.mtimeMs < timeout) {
            await sleep(1000);
            outfileStat = fs.statSync(outfile, { throwIfNoEntry: false });
        }
        if (outfileStat && outfileStat.size === meta.size) {
            // successfully downloaded by another caller
            return { outfile, conn };
        }
        // must have timed out, overwrite file
    }

    // download file
    const fd = fs.openSync(outfile, "w", 0o600);
    await conn.read(srcPath, (chunk: Buffer) => fs.writeSync(fd, chunk));
    fs.closeSync(fd);

    return { outfile, conn };
};
