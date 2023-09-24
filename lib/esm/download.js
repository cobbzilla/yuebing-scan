var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import fs from "fs";
import { sleep } from "zilla-util";
import { sha } from "mobiletto-orm-typedef";
import { connectVolume } from "yuebing-server-util";
import { assetPath, assetSource, fileExtWithDot } from "yuebing-media";
import { transferTimeout } from "./util.js";
export const downloadSourceAsset = (downloadDir, sourceAsset, sourceRepo, clock) => __awaiter(void 0, void 0, void 0, function* () {
    const assetName = typeof sourceAsset === "string" ? assetPath(sourceAsset) : sourceAsset.name;
    if (!assetName)
        return null; // should never happen
    const sourceName = typeof sourceAsset === "string" ? assetSource(sourceAsset) : sourceAsset.source;
    const ext = fileExtWithDot(assetName);
    const srcPath = assetPath(assetName);
    const outfile = downloadDir + "/downloaded_" + sha(assetName) + ext;
    let outfileStat = fs.statSync(outfile, { throwIfNoEntry: false });
    const source = yield sourceRepo.findById(sourceName);
    const connResult = yield connectVolume(source);
    if (connResult.error || !connResult.connection) {
        throw new Error(`downloadSourceAsset(${sourceAsset}): error creating connection: ${connResult.error}`);
    }
    const conn = connResult.connection;
    const meta = yield conn.metadata(srcPath);
    if (!meta.size) {
        throw new Error(`downloadSourceAsset(${sourceAsset}): meta.size was not defined`);
    }
    if (outfileStat) {
        const timeout = transferTimeout(meta.size);
        // wait for file to finish downloading, or to timeout
        while (outfileStat && outfileStat.size !== meta.size && clock.now() - outfileStat.mtimeMs < timeout) {
            yield sleep(1000);
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
    yield conn.read(srcPath, (chunk) => fs.writeSync(fd, chunk));
    fs.closeSync(fd);
    return { outfile, conn };
});
//# sourceMappingURL=download.js.map