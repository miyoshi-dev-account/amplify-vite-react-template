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
    inQueueAlert: string;
    status: string;
    statusStartTimestamp: string;
    correspondingQueue: string;
    outboundQueueListId: string;
    queueList: string;
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

const LIST_USER_LIST = `
  query listUserLists {
    listUserLists {
      items {
        id
        userName
        agentId
        status
        queueList
      }
      nextToken
    }
  }
`;

const UPDATE_USER_LIST = `
  mutation UpdateUserList($input: UpdateUserListInput!) {
    updateUserList(input: $input) {
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

async function listSignedRequest(query: string) {
    const url = new URL(process.env.APPSYNC_ENDPOINT!);
    const body = { query };

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
): Promise<KinesisStreamBatchResponse> => {
    for (const record of event.Records) {
        try {
            logger.info(`Processed Kinesis Event - EventID: ${record.eventID}`);
            const recordData = await getRecordDataAsync(record.kinesis);
            logger.info(`Record Data: ${recordData}`);

            // ステータス変更時のイベントか判定
            const recordJson = JSON.parse(recordData);
            if (recordJson.EventType !== "STATE_CHANGE") {
                logger.info(`Not status change event.`);
                return { batchItemFailures: [] };
            }

            // AppSyncのエンドポイント設定
            if (!process.env.APPSYNC_ENDPOINT) {
                throw new Error("APPSYNC_ENDPOINT environment variable is not set");
            }

            // 保存済みのエージェントリストの取得
            const { signedRequest, body } = await listSignedRequest(
                LIST_USER_LIST
            );

            const response = await axios.post(
                `${signedRequest.protocol}//${signedRequest.hostname}${signedRequest.path}`,
                body,
                {
                    headers: signedRequest.headers,
                }
            );
            logger.info(`Get UserList: ${JSON.stringify(response.data)}`);

            const items = response.data?.data?.listUserLists?.items ?? [];

            // 新規作成or更新の判定
            // エージェントIDで取得したリストを検索
            const targetAgentId = String(recordJson.AgentARN.split("/").at(-1));
            const targetAgent = items.find((item: any) => item.agentId === targetAgentId);

            if (targetAgent) {
                logger.info(`エージェントID: ${targetAgentId} はリストに含まれています。`);
                // 存在する時の処理
                // 更新
                const variablesUpdate = {
                    input: {
                        id: String(targetAgent.id),
                        instanceAlias: String(recordJson.InstanceARN),
                        userName: String(recordJson.CurrentAgentSnapshot.Configuration.Username),
                        agentId: targetAgentId,
                        directoryUserId: "-",
                        firstName: String(recordJson.CurrentAgentSnapshot.Configuration.FirstName),
                        lastName: String(recordJson.CurrentAgentSnapshot.Configuration.LastName),
                        emailAddress: "-",
                        securityProfileIds: "-",
                        routingProfileId: String(recordJson.CurrentAgentSnapshot.Configuration.RoutingProfile.ARN),
                        hierarchyGroupId: "-",
                        acwTimeLimit: "-",
                        autoAccept: String(recordJson.CurrentAgentSnapshot.Configuration.AutoAccept),
                        phoneType: "-",
                        deviceId: "-",
                        inQueueAlert: JSON.stringify(recordJson.CurrentAgentSnapshot.Configuration.RoutingProfile.InboundQueues),
                        status: String(recordJson.CurrentAgentSnapshot.AgentStatus.Name),
                        statusStartTimestamp: String(recordJson.CurrentAgentSnapshot.AgentStatus.StartTimestamp),
                        correspondingQueue: "-",
                        outboundQueueListId: "-",
                        queueList: JSON.stringify(recordJson.CurrentAgentSnapshot.Configuration.RoutingProfile.InboundQueues)
                    },
                };

                const { signedRequest, body } = await createSignedRequest(
                    UPDATE_USER_LIST,
                    variablesUpdate
                );

                const responseUpdate = await axios.post(
                    `${signedRequest.protocol}//${signedRequest.hostname}${signedRequest.path}`,
                    body,
                    {
                        headers: signedRequest.headers,
                    }
                );
                logger.info(`Update User: ${JSON.stringify(responseUpdate.data)}`);

            } else {
                logger.info(`エージェントID: ${targetAgentId} はリストに含まれていません。`);
                // 存在しない時の処理
                // 新規作成
                const variablesCreate = {
                    input: {
                        instanceAlias: String(recordJson.InstanceARN),
                        userName: String(recordJson.CurrentAgentSnapshot.Configuration.Username),
                        agentId: targetAgentId,
                        directoryUserId: "-",
                        firstName: String(recordJson.CurrentAgentSnapshot.Configuration.FirstName),
                        lastName: String(recordJson.CurrentAgentSnapshot.Configuration.LastName),
                        emailAddress: "-",
                        securityProfileIds: "-",
                        routingProfileId: String(recordJson.CurrentAgentSnapshot.Configuration.RoutingProfile.ARN),
                        hierarchyGroupId: "-",
                        acwTimeLimit: "-",
                        autoAccept: String(recordJson.CurrentAgentSnapshot.Configuration.AutoAccept),
                        phoneType: "-",
                        deviceId: "-",
                        inQueueAlert: JSON.stringify(recordJson.CurrentAgentSnapshot.Configuration.RoutingProfile.InboundQueues),
                        status: String(recordJson.CurrentAgentSnapshot.AgentStatus.Name),
                        statusStartTimestamp: String(recordJson.CurrentAgentSnapshot.AgentStatus.StartTimestamp),
                        correspondingQueue: "-",
                        outboundQueueListId: "-",
                        queueList: JSON.stringify(recordJson.CurrentAgentSnapshot.Configuration.RoutingProfile.InboundQueues)
                    },
                };

                const { signedRequest, body } = await createSignedRequest(
                    CREATE_USER_LIST,
                    variablesCreate
                );

                const responseCreate = await axios.post(
                    `${signedRequest.protocol}//${signedRequest.hostname}${signedRequest.path}`,
                    body,
                    {
                        headers: signedRequest.headers,
                    }
                );
                logger.info(`Add User: ${JSON.stringify(responseCreate.data)}`);
            }

        } catch (err) {
            logger.error(`An error occurred ${err}`);
            return {
                batchItemFailures: [{ itemIdentifier: record.kinesis.sequenceNumber }],
            };
        }
    }

    logger.info(`Successfully processed ${event.Records.length} records.`);
    return { batchItemFailures: [] };
    /*
    try {

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
