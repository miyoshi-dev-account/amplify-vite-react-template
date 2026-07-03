import { defineBackend } from '@aws-amplify/backend';

import { auth } from './auth/resource';
import { data } from './data/resource';
import { fetchConnectUser } from "./functions/fetchConnectUser/resource";
import { queueAlert } from "./functions/queueAlert/resource";
import { updateContactAttributes } from './functions/updateContactAttributes/resource';
import { getContactInfo } from './functions/getContactInfo/resource';
import { searchQueues } from './functions/searchQueues/resource';

import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cdk from "aws-cdk-lib";
import * as iam from 'aws-cdk-lib/aws-iam';

import { Stream } from "aws-cdk-lib/aws-kinesis";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";
import { KinesisEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

const backend = defineBackend({
  auth,
  data,
  fetchConnectUser,
  queueAlert,
  updateContactAttributes,
  getContactInfo,
  searchQueues,
});

// --- ユーザーリスト取得用のLambda関数(fetchConnectUser)の定義 ---

// AppSyncのエンドポイントをユーザーリスト取得用関数の環境変数として追加
backend.fetchConnectUser.addEnvironment(
  "APPSYNC_ENDPOINT",
  backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl
);

// ユーザーリスト取得用Lambda関数にAppSyncへの権限を追加
backend.data.resources.graphqlApi.grant(
  backend.fetchConnectUser.resources.lambda,
  cdk.aws_appsync.IamResource.all(),
  "appsync:GraphQL"
);

// Kinesisの定義とユーザーリスト取得用Lambdaへの紐付け
const kinesisStack = backend.createStack("kinesis-stack");

const kinesisStream = new Stream(kinesisStack, "KinesisStream", {
  streamName: "myKinesisStream",
  shardCount: 1,
});

const eventSource = new KinesisEventSource(kinesisStream, {
  startingPosition: StartingPosition.LATEST,
  reportBatchItemFailures: true,
});

backend.fetchConnectUser.resources.lambda.addEventSource(eventSource);



// --- GetCurrentMetricData実行用のLambda関数(queueAlert)の定義 ---

// AppSyncのエンドポイントをGetCurrentMetricData実行用関数の環境変数として追加
backend.queueAlert.addEnvironment(
  "APPSYNC_ENDPOINT",
  backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl
);

// Amazon ConnectインスタンスIDをGetCurrentMetricData実行用関数の環境変数として追加
backend.queueAlert.addEnvironment(
  "CONNECT_INSTANCE_ID",
  "5c9f7d3e-d54b-4d4c-aec6-ccd7308dc833"
);

// GetCurrentMetricData実行用Lambda関数にAppSyncへの権限を追加
backend.data.resources.graphqlApi.grant(
  backend.queueAlert.resources.lambda,
  cdk.aws_appsync.IamResource.all(),
  "appsync:GraphQL"
);

// Lambda関数が Amazon Connect のメトリクスを取得できるようにIAMポリシーを追加
backend.queueAlert.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      "connect:GetCurrentMetricData",
      "connect:ListQueues"
    ],
    resources: ["*"] // ※セキュリティを厳密にする場合は対象の Connect インスタンスARN に絞ってください
  })
);

// カスタムCDKスタックの作成
const eventStack = backend.createStack('ConnectMetricsPollingStack');

// 1分間隔で実行するEventBridgeルールの定義
new events.Rule(eventStack, 'MetricsPollingRule', {
  description: '1分間隔でAmazon Connectの待ち呼メトリクスを取得するLambdaを起動',
  // Schedule.rateを使用して1分（Duration.minutes(1)）間隔の定期実行を設定
  schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
  // ターゲットとしてLambda関数を指定
  targets: [new targets.LambdaFunction(backend.queueAlert.resources.lambda)]
});



// --- 転送時、転送先に通知するコンタクト属性を設定するLambda関数(updateContactAttributes)の定義 ---

backend.updateContactAttributes.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['connect:UpdateContactAttributes'],
    // ※セキュリティを強固にする場合は、リソースを特定のインスタンスやコンタクトに絞ります
    // 例: 'arn:aws:connect:ap-northeast-1:123456789012:instance/INSTANCE_ID/contact/*'
    resources: ['*'],
  })
);



// --- 通話履歴用にコンタクト情報を取得するLambda関数(getContactInfo)の定義 ---

backend.getContactInfo.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['connect:DescribeContact', 'connect:GetContactAttributes'],
    // ※セキュリティを強固にする場合は、リソースを特定のインスタンスやコンタクトに絞ります
    // 例: 'arn:aws:connect:ap-northeast-1:123456789012:instance/INSTANCE_ID/contact/*'
    resources: ['*'],
  })
);



// --- キューの発信先通知番号を取得するLambda関数(searchQueues)の定義 ---

backend.searchQueues.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['connect:SearchQueues'],
    // ※セキュリティを強固にする場合は、リソースを特定のインスタンスやコンタクトに絞ります
    // 例: 'arn:aws:connect:ap-northeast-1:123456789012:instance/INSTANCE_ID/contact/*'
    resources: [
      `arn:aws:connect:ap-northeast-1:920071567018:instance/5c9f7d3e-d54b-4d4c-aec6-ccd7308dc833`,
      `arn:aws:connect:ap-northeast-1:920071567018:instance/5c9f7d3e-d54b-4d4c-aec6-ccd7308dc833/queue/*`
    ],
  })
);
