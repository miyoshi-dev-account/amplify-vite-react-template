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

import {
    ConnectClient,
    GetCurrentMetricDataCommand,
    ListQueuesCommand
} from "@aws-sdk/client-connect";

const connectClient = new ConnectClient({ region: process.env.AWS_REGION || "ap-northeast-1" });

const instanceId = process.env.CONNECT_INSTANCE_ID!;
const appsyncEndpoint = process.env.APPSYNC_ENDPOINT!;

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

const UPDATE_QUEUE_METRICS = `
  mutation UpdateQueueMetrics($input: UpdateQueueMetricsInput!) {
    updateQueueMetrics(input: $input) {
      id 
      queueId 
      queueName 
      contactsInQueue 
      oldestContactAge
    }
  }
`;

const CREATE_QUEUE_METRICS = `
  mutation CreateQueueMetrics($input: CreateQueueMetricsInput!) {
    createQueueMetrics(input: $input) {
      id 
      queueId 
      queueName 
      contactsInQueue 
      oldestContactAge
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

async function getQueueList() {
    logger.info(`start getQueueList`);
    const allQueues: { id: string, name: string }[] = [];
    try {
        // Amazon Connectのキューリストを取得
        //let nextToken: string | undefined = undefined;
        const listCommand = new ListQueuesCommand({
            InstanceId: instanceId,
            QueueTypes: ["STANDARD"], // 標準キューのみを対象とする
            //NextToken: nextToken,
        });
        const listResponse = await connectClient.send(listCommand);
        if (listResponse.QueueSummaryList) {
            for (const q of listResponse.QueueSummaryList) {
                if (q.Id && q.Name) {
                    allQueues.push({ id: q.Id, name: q.Name });
                }
            }
        }
        //nextToken = listResponse.NextToken;
        return allQueues;

    } catch (error) {
        console.error("キュー一覧の取得に失敗しました:", error);
        return { statusCode: 500, body: "Failed to list queues" };
    }

    /*
    if (allQueues.length === 0) {
        console.log("対象となるキューが存在しませんでした。");
        return { statusCode: 200, body: "No queues found." };
    }
    */
};

async function getConnectMetrics(queueId: string) {
    logger.info(`start getConnectMetrics`);
    // 1. Amazon Connectのメトリクスを取得
    const command = new GetCurrentMetricDataCommand({
        InstanceId: instanceId!,
        Filters: {
            Queues: [queueId],
            Channels: ["VOICE"], // 音声通話の待ち呼を取得。必要に応じて "CHAT", "TASK" に変更可能
        },
        CurrentMetrics: [
            { Name: "CONTACTS_IN_QUEUE", Unit: "COUNT" },   // 待ち呼数
            { Name: "OLDEST_CONTACT_AGE", Unit: "SECONDS" } // 最長待ち時間
        ],
    });

    const connectResponse = await connectClient.send(command);
    return connectResponse;
};

async function updateAmplifyData(metrics: any) {
    try {
        logger.info(`get metrics: ${metrics}`);
        /*

        // AppSyncのエンドポイント設定
        if (!process.env.APPSYNC_ENDPOINT) {
            throw new Error("APPSYNC_ENDPOINT environment variable is not set");
        }

        // 保存済みのmetricsの取得
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
        */
        return;

    } catch (err) {
        logger.error(`An error occurred ${err}`);
        return;
    }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

//export const handler = async (event: any) => {
export const handler = async (event: any) => {
    // Amazon Connectのキューリストを取得
    const allQueues = await getQueueList();

    // 1分以内に処理を終えるため、5秒間隔の処理を最大11回(約55秒)実行する
    //for (let i = 0; i < 11; i++) {
    // 全てのキューのメトリクスを更新
    for (const [id, name] of Object.entries(allQueues)) {
        // 1. Amazon Connect の GetCurrentMetricData を実行
        const metrics = await getConnectMetrics(id);

        // 2. Amplify Data (AppSync) に対して更新(Mutation)を実行
        await updateAmplifyData(metrics);
    }

    // 3. 5秒待機
    await sleep(5000);
    //}
    return "Success";
};
