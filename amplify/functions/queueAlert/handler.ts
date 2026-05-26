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
type QueueMetricsInput = {
    id: string;
    queueId: string;
    queueName: string;
    contactsInQueue: number;
    oldestContactAge: number;
};

type CreateQueueMetricsVariables = {
    input: QueueMetricsInput;
};

const UPDATE_QUEUE_METRICS = `
  mutation UpdateQueueMetrics($input: UpdateQueueMetricsInput!) {
    updateQueueMetrics(input: $input) {
      id 
      queueId 
      queueName 
      contactsInQueue 
      oldestContactAge
      createdAt
      updatedAt
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
      createdAt
      updatedAt
    }
  }
`;

async function createSignedRequest(query: string, variables: CreateQueueMetricsVariables) {
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

    const signedRequest = await signer.sign(request);
    return await axios.post(
        `${signedRequest.protocol}//${signedRequest.hostname}${signedRequest.path}`,
        body,
        {
            headers: signedRequest.headers,
        }
    );
    //return { signedRequest: await signer.sign(request), body };
}

async function getQueueList() {
    logger.info(`start getQueueList`);
    const allQueues: { id: string, name: string }[] = [];
    try {
        // Amazon Connectのキューリストを取得
        const listCommand = new ListQueuesCommand({
            InstanceId: instanceId,
            QueueTypes: ["STANDARD"], // 標準キューのみを対象とする
        });
        const listResponse = await connectClient.send(listCommand);
        if (listResponse.QueueSummaryList) {
            for (const q of listResponse.QueueSummaryList) {
                if (q.Id && q.Name) {
                    allQueues.push({ id: q.Id, name: q.Name });
                }
            }
        }
        return allQueues;

    } catch (error) {
        console.error("キュー一覧の取得に失敗しました:", error);
        return { statusCode: 500, body: "Failed to list queues" };
    }
};

async function getConnectMetrics(queueId: string) {
    logger.info(`start getConnectMetrics`);
    logger.info(`get queueId: ${queueId}`);
    // 1. Amazon Connectのメトリクスを取得
    const command = new GetCurrentMetricDataCommand({
        InstanceId: instanceId!,
        Filters: {
            Queues: [queueId],
            Channels: ["VOICE", "CHAT", "TASK"], // 音声通話の待ち呼を取得。必要に応じて "CHAT", "TASK" に変更可能
        },
        CurrentMetrics: [
            { Name: "CONTACTS_IN_QUEUE", Unit: "COUNT" },   // 待ち呼数
            { Name: "OLDEST_CONTACT_AGE", Unit: "SECONDS" } // 最長待ち時間
        ],
    });

    const connectResponse = await connectClient.send(command);
    return connectResponse;
};

async function updateAmplifyData(metrics: any, queueId: string, queueName: string) {
    try {
        logger.info(`get metrics: ${JSON.stringify(metrics)}`);

        // AppSyncのエンドポイント設定
        if (!process.env.APPSYNC_ENDPOINT) {
            throw new Error("APPSYNC_ENDPOINT environment variable is not set");
        }

        // 1. MetricResults の1件目のレコードから Collections 配列を安全に取得（存在しない場合は空配列とする）
        const collections = metrics.MetricResults[0].Collections[0] || [];

        // 2. CONTACTS_IN_QUEUE の値を取得する
        const contactsInQueue = collections.find((m: any) => m.Metric?.Name === "CONTACTS_IN_QUEUE")?.Value || 0;

        // 3. OLDEST_CONTACT_AGE の値を取得する
        const oldestContactAge = collections.find((m: any) => m.Metric?.Name === "OLDEST_CONTACT_AGE")?.Value || 0;

        const variablesUpdate = {
            input: {
                id: queueId,
                queueId: queueId,
                queueName: queueName,
                contactsInQueue: contactsInQueue,
                oldestContactAge: oldestContactAge,
            },
        };

        const updateResponse = await createSignedRequest(
            UPDATE_QUEUE_METRICS,
            variablesUpdate
        );

        if (updateResponse.data.errors) {
            const errors = updateResponse.data.errors;
            const isConditionFailed = errors.some((e: any) =>
                e.errorType === "DynamoDB:ConditionalCheckFailedException" ||
                e.message.includes("ConditionCheckFailed") ||
                e.message.includes("Not Found")
            );

            if (isConditionFailed) {
                // レコードが存在しないため Create を実行
                const createResponse = await createSignedRequest(
                    CREATE_QUEUE_METRICS,
                    variablesUpdate
                );
                if (createResponse.data.errors) {
                    console.error("Create実行時のエラー:", createResponse.data.errors);
                }
            }
        }

    } catch (error) {
        console.error(`キュー[${queueName}] のAppSync通信エラー:`, error);
    }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

//export const handler = async (event: any) => {
export const handler = async (event: any) => {
    // Amazon Connectのキューリストを取得
    const allQueues = await getQueueList();
    logger.info(`get allQueues: ${JSON.stringify(allQueues)}`);

    // 1分以内に処理を終えるため、5秒間隔の処理を最大11回(約55秒)実行する
    //for (let i = 0; i < 11; i++) {
    // 全てのキューのメトリクスを更新
    for (const [id, queue] of Object.entries(allQueues)) {
        // 1. Amazon Connect の GetCurrentMetricData を実行
        const metrics = await getConnectMetrics(queue.id);

        // 2. Amplify Data (AppSync) に対して更新(Mutation)を実行
        if (metrics.MetricResults?.length) {
            await updateAmplifyData(metrics, queue.id, queue.name);
        } else {
            logger.info(`MetricResults is empty`);
        }
    }

    // 3. 5秒待機
    await sleep(5000);
    //}
    return "Success";
};
