import { defaultProvider } from "@aws-sdk/credential-provider-node";
import axios from "axios";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-universal";

import type {
    KinesisStreamBatchResponse,
    KinesisStreamHandler,
    KinesisStreamRecordPayload,
} from "aws-lambda";
import { Buffer } from "node:buffer";
import { Logger } from "@aws-lambda-powertools/logger";

const logger = new Logger({
    logLevel: "INFO",
    serviceName: "kinesis-stream-handler",
});

// AppSync Mutationの入力型定義
type UserListInput = {
    instanceAlias: string;
    userName: string;
    agentId: string;
    directoryUserId: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    securityProfileIds: string;
    routingProfileId: string;
    hierarchyGroupId: string;
    acwTimeLimit: string;
    autoAccept: string;
    phoneType: string;
    deviceId: string;
    inQueueAlert: JSON;
    status: string;
    statusStartTimestamp: string;
    correspondingQueue: string;
    outboundQueueListId: string;
    queueList: JSON;
};

type CreateUserListVariables = {
    input: UserListInput;
};

const CREATE_USER_LIST = `
  mutation CreateUserList($input: CreateUserListInput!) {
    createUserList(input: $input) {
      id
      instanceAlias
      userName
      agentId
      directoryUserId
      firstName
      lastName
      emailAddress
      securityProfileIds
      routingProfileId
      hierarchyGroupId
      acwTimeLimit
      autoAccept
      phoneType
      deviceId
      inQueueAlert
      status
      statusStartTimestamp
      correspondingQueue
      outboundQueueListId
      queueList
      createdAt
      updatedAt
    }
  }
`;

async function createSignedRequest(query: string, variables: CreateUserListVariables) {
    const url = new URL(process.env.APPSYNC_ENDPOINT!);
    const body = { query, variables };

    const request = {
        headers: {
            "Content-Type": "application/json",
            host: url.hostname,
        },
        hostname: url.hostname,
        method: "POST",
        path: url.pathname,
        protocol: url.protocol,
        body: JSON.stringify(body),
    };

    const signer = new SignatureV4({
        credentials: defaultProvider(),
        region: process.env.REGION || "ap-northeast-1",
        service: "appsync",
        sha256: Sha256,
    });

    return { signedRequest: await signer.sign(request), body };
}

function getRandomNumber(
    min: number,
    max: number,
    decimals: number = 1
): number {
    return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function getRandomDeviceId(): string {
    return `device_${String(Math.floor(Math.random() * 100)).padStart(3, "0")}`;
}

async function getRecordDataAsync(
    payload: KinesisStreamRecordPayload
): Promise<string> {
    const data = Buffer.from(payload.data, "base64").toString("utf-8");
    await Promise.resolve(1); // Placeholder for an async process
    return data;
}

//export const handler = async (event: any) => {
export const handler: KinesisStreamHandler = async (
    event,
    context
): Promise<KinesisStreamBatchResponse> => {    // 挙動確認用
    for (const record of event.Records) {
        try {
            logger.info(`Processed Kinesis Event - EventID: ${record.eventID}`);
            const recordData = await getRecordDataAsync(record.kinesis);
            logger.info(`Record Data: ${recordData}`);
        } catch (err) {
            logger.error(`An error occurred ${err}`);
            /*
            When processing stream data, if any item fails, returning the failed item's position immediately
            prompts Lambda to retry from this item forward, ensuring continuous processing without skipping data.
            */
            return {
                batchItemFailures: [{ itemIdentifier: record.kinesis.sequenceNumber }],
            };
        }
    }

    logger.info(`Successfully processed ${event.Records.length} records.`);
    return { batchItemFailures: [] };
    /*
    try {
        if (!process.env.APPSYNC_ENDPOINT) {
            throw new Error("APPSYNC_ENDPOINT environment variable is not set");
        }

        const variables = {
            input: {
                instanceAlias: string,
                userName: string,
                agentId: string,
                directoryUserId: string,
                firstName: string,
                lastName: string,
                emailAddress: string,
                securityProfileIds: string,
                routingProfileId: string,
                hierarchyGroupId: string,
                acwTimeLimit: string,
                autoAccept: string,
                phoneType: string,
                deviceId: string,
                inQueueAlert: JSON,
                status: string,
                statusStartTimestamp: string,
                correspondingQueue: string,
                outboundQueueListId: string,
                queueList: JSON
            },
        };

        const { signedRequest, body } = await createSignedRequest(
            CREATE_USER_LIST,
            variables
        );

        const response = await axios.post(
            `${signedRequest.protocol}//${signedRequest.hostname}${signedRequest.path}`,
            body,
            {
                headers: signedRequest.headers,
            }
        );

        return {
            statusCode: 200,
            body: JSON.stringify(response.data),
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
    */
};
