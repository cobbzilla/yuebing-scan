import * as fs from "fs";
import { before, after, describe, it } from "mocha";
import { expect } from "chai";
import { connectVolume } from "yuebing-server-util";
import { destinationPath } from "yuebing-media";
import { waitForNonemptyQuery, newTest, ANALYSIS_PROFILE_NAME, cleanupTest } from "./setup.js";
import {
    setupTransformObjects,
    setupUploadObjects,
    XFORM_SPLIT_PROFILE_NAME,
    XFORM_UPCASE_PROFILE_NAME,
} from "./test-helper.js";

let test;

before(async () => {
    test = await newTest(async (test) => {
        await setupTransformObjects(test);
        await setupUploadObjects(test);
        test.scanConfig.runUploader = true;
        test.scanConfig.removeLocalFiles = false;
    });
});

async function expectUploads(profileJob) {
    const uploadJobs = await test.uploadJobRepo.safeFindBy("asset", test.assetName, {
        predicate: (j) => j.profile === profileJob.profile,
    });
    for (const uploadJob of uploadJobs) {
        expect(uploadJob.status).eq("finished");
        expect(uploadJob.finished).lt(profileJob.finished); // upload finishes, then xform
    }
    return uploadJobs;
}

describe("upload test", async () => {
    it("should scan a directory, discover an asset, analyze it, transform it, and upload it", async () => {
        // wait for scanner to create sourceAsset with status==pending
        const scanned = await waitForNonemptyQuery(() => test.sourceAssetRepo.findAll());
        expect(scanned[0].name).eq(test.assetName);

        // wait for analyzer to update sourceAsset with status==finished
        const finishedScans = await waitForNonemptyQuery(
            () => test.sourceAssetRepo.findAll(),
            (a) => a.status === "finished",
            1000 * 60,
        );
        expect(finishedScans[0].name).eq(test.assetName);

        // when the source asset is finished, the analysis profile should also be finished
        const analyzed = await test.profileJobRepo.safeFindBy("asset", test.assetName, {
            predicate: (a) => a.profile === ANALYSIS_PROFILE_NAME,
        });
        expect(analyzed[0].status).eq("finished");

        // wait for upcase job to finish
        const finishedUpcaseJobs = await waitForNonemptyQuery(
            () =>
                test.profileJobRepo.safeFindBy("asset", test.assetName, {
                    predicate: (a) => a.profile === XFORM_UPCASE_PROFILE_NAME,
                }),
            (a) => a.status === "finished",
        );
        expect(finishedUpcaseJobs.length).eq(1);

        const upcaseJob = finishedUpcaseJobs[0];
        expect(upcaseJob.asset).eq(test.assetName);

        // UploadJob should already be finished
        const uploadJobs = await expectUploads(upcaseJob);
        expect(uploadJobs.length).eq(1);
        const uploadJob = uploadJobs[0];
        const data = fs.readFileSync(uploadJob.localPath, "utf8").toString();
        const orig = fs.readFileSync(test.testDir + "/source/sample.txt").toString();
        expect(data).eq(orig.toUpperCase());

        // transformed file should now be available at the destination
        const destConnResult = await connectVolume(test.destination);
        const destConn = destConnResult.connection;
        expect(destConn).is.not.null;
        const destPath = destinationPath(uploadJob.asset, uploadJob.media, uploadJob.profile, uploadJob.localPath);
        const uploadedData = await destConn.safeReadFile(destPath);
        expect(uploadedData).is.not.null;
        expect(uploadedData.toString()).eq(data);

        // wait for split job to finish
        const finishedSplitJobs = await waitForNonemptyQuery(
            () =>
                test.profileJobRepo.safeFindBy("asset", test.assetName, {
                    predicate: (a) => a.profile === XFORM_SPLIT_PROFILE_NAME,
                }),
            (a) => a.status === "finished",
        );
        expect(finishedSplitJobs.length).eq(1);

        const splitJob = finishedSplitJobs[0];
        expect(splitJob.asset).eq(test.assetName);

        // UploadJob should already be finished
        const splitUploads = await expectUploads(splitJob);
        expect(splitUploads.length).eq(6); // 5 word files + 1 summary file
        const summary = splitUploads.filter((u) => u.localPath.endsWith("summary.md"));
        expect(summary.length).eq(1);
    });
});

after((done) => cleanupTest(test, done));
