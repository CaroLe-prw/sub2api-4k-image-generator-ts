import { argv } from "node:process";
import { parseArgs, printHelp } from "./args.js";
import { UsageError } from "./errors.js";
import { loadDotEnv, maskApiKey } from "./env.js";
import { buildImagesPayload, buildResponsesPayload } from "./payload.js";
import { requestJson, requestStream } from "./request.js";
import { responseSummary, saveImages, savePartialImages } from "./save.js";
export function buildRequest(options) {
    const baseUrl = options.baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
    const endpoint = options.endpoint === "images" && options.inputImage ? "edits" : options.endpoint;
    if (endpoint === "edits" && !options.inputImage) {
        throw new UsageError("--input-image is required with --endpoint edits");
    }
    return {
        url: endpoint === "responses"
            ? `${baseUrl}/v1/responses`
            : `${baseUrl}/v1/images/${endpoint === "edits" ? "edits" : "generations"}`,
        payload: endpoint === "responses" ? buildResponsesPayload(options) : buildImagesPayload(options),
    };
}
export async function run(rawArgs = argv.slice(2)) {
    loadDotEnv();
    const options = parseArgs(rawArgs);
    if (options.help) {
        printHelp();
        return 0;
    }
    console.log(`sub2api URL: ${options.baseUrl.trim()}`);
    console.log(`API key: ${maskApiKey(options.apiKey)}`);
    if (!options.prompt) {
        throw new UsageError("prompt is required");
    }
    if (options.n <= 0) {
        throw new UsageError("--n must be greater than 0");
    }
    const { url, payload } = buildRequest(options);
    if (options.dryRun) {
        console.log(url);
        console.log(JSON.stringify(payload, null, 2));
        return 0;
    }
    if (!options.apiKey) {
        throw new UsageError("Missing API key. Set SUB2API_API_KEY or pass --api-key.");
    }
    const response = options.stream
        ? await requestStream(url, options.apiKey, payload, options.timeout, options.userAgent.trim())
        : await requestJson(url, options.apiKey, payload, options.timeout, options.userAgent.trim());
    const prefix = options.prefix || `image-4k-${Math.floor(Date.now() / 1000)}`;
    const finalCount = saveImages(response, options.outputDir, prefix);
    if (finalCount > 0) {
        return 0;
    }
    const imageResponse = response;
    const partialCount = savePartialImages(imageResponse, options.outputDir, prefix);
    if (imageResponse._stream_incomplete) {
        console.error("Stream ended before the final image completion event. " +
            "Saved partial images only; they are not the final 4K result.");
    }
    console.error(JSON.stringify(responseSummary(imageResponse), null, 2));
    if (partialCount === 0) {
        console.error("No base64 image found in response.");
    }
    return 1;
}
