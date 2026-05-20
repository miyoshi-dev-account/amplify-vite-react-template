import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { fetchConnectUser } from "./functions/fetchConnectUser/resource";
import * as cdk from "aws-cdk-lib";
import { Stream } from "aws-cdk-lib/aws-kinesis";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";
import { KinesisEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

const backend = defineBackend({
  auth,
  data,
  fetchConnectUser,
});

// AppSyncのエンドポイントを環境変数として追加
backend.fetchConnectUser.addEnvironment(
  "APPSYNC_ENDPOINT",
  backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl
);

// Lambda関数にAppSyncへの権限を追加
backend.data.resources.graphqlApi.grant(
  backend.fetchConnectUser.resources.lambda,
  cdk.aws_appsync.IamResource.all(),
  "appsync:GraphQL"
);

// Kinesisの定義とLambdaへの紐付け
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
