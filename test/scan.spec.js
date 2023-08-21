import { before, after, describe, it } from "mocha";
import { expect } from "chai";
import { cleanupTest, newTest, waitForNonemptyQuery } from "./setup.js";

let test;

before(async () => {
    test = await newTest();
});

describe("scan test", async () => {
    it("should scan a directory and discover an asset", async () => {
        // wait for scanner to create sourceAsset with status==pending
        const scanned = await waitForNonemptyQuery(
            () => test.sourceAssetRepo.findAll(),
            (a) => a.status === "pending",
        );
        expect(scanned).is.not.null;
        expect(scanned.length).eq(1);
        expect(scanned[0].name).eq(test.assetName);
    });
});

after((done) => cleanupTest(test, done));
