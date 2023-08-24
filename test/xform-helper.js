import { OP_UPCASE, TEST_OPS } from "./setup.js";

export const TRANSFORM_PROFILE_NAME = "toUpperCase";

export const setupTransformObjects = async (test) => {
    const cfg = test.scanConfig;
    cfg.runAnalyzer = true;
    cfg.runTransformer = true;
    TEST_OPS[OP_UPCASE] = {
        name: OP_UPCASE,
        media: "textMedia",
        command: `${test.testDir}/upcase.sh`,
        minFileSize: 10,
    };
    await test.mediaProfileRepo.create({
        name: TRANSFORM_PROFILE_NAME,
        operation: OP_UPCASE,
        media: "textMedia",
        ext: "txt",
        contentType: "text/plain",
    });
};
