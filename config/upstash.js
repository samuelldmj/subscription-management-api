import { Client } from "@upstash/workflow";
import { QSTASH_TOKEN, QSTASH_URL } from "./env.js";

const workFlowClient = new Client({
    baseUrl: QSTASH_URL,
    token: QSTASH_TOKEN
});

export {
    workFlowClient
};