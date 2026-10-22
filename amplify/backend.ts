import { defineBackend } from '@aws-amplify/backend';

import { auth } from './auth/resource';
import { data } from './data/resource';
import { fetchConnectUser } from "./functions/fetchConnectUser/resource";
import { queueAlert } from "./functions/queueAlert/resource";
import { updateContactAttributes } from './functions/updateContactAttributes/resource';
import { getContactInfo } from './functions/getContactInfo/resource';
import { searchQueues } from './functions/searchQueues/resource';
import { listAllQuickConnects } from './functions/listAllQuickConnects/resource';
import { originAuthorizer } from './functions/originAuthorizer/resource';

import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cdk from "aws-cdk-lib";
import * as iam from 'aws-cdk-lib/aws-iam';

import { Stream } from "aws-cdk-lib/aws-kinesis";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";
import { KinesisEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

const backend = defineBackend({
  auth,
  data,
  originAuthorizer,
  fetchConnectUser,
  queueAlert,
  updateContactAttributes,
  getContactInfo,
  searchQueues,
  listAllQuickConnects,
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
    resources: ['*'],
  })
);



// --- 通話履歴用にコンタクト情報を取得するLambda関数(getContactInfo)の定義 ---

backend.getContactInfo.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['connect:DescribeContact', 'connect:GetContactAttributes', 'connect:DescribeQueue'],
    resources: ['*'],
  })
);



// --- キューの発信先通知番号を取得するLambda関数(searchQueues)の定義 ---

backend.searchQueues.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['connect:SearchQueues', 'connect:DescribeQueue', 'connect:ListPhoneNumbers'],
    resources: [
      `arn:aws:connect:ap-northeast-1:920071567018:instance/5c9f7d3e-d54b-4d4c-aec6-ccd7308dc833`,
      `arn:aws:connect:ap-northeast-1:920071567018:instance/5c9f7d3e-d54b-4d4c-aec6-ccd7308dc833/queue/*`,
      `arn:aws:connect:ap-northeast-1:920071567018:instance/5c9f7d3e-d54b-4d4c-aec6-ccd7308dc833/phone-number/*`
    ],
  })
);



// --- クイック接続一覧を取得するLambda関数(listAllQuickConnects)の定義 ---

backend.listAllQuickConnects.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['connect:ListQuickConnects'],
    resources: ['*'],
  })
);



// --- WAF検証用: AppSync APIへのWebACL関連付け(AWSマネージドルールグループのみ、Countモード) ---
// Akamai未接続のため、ヘッダー検証ルールは含めず、AWSマネージドルールグループの誤検知有無のみを検証する。

const wafStack = backend.createStack('WafVerificationStack');

const appsyncWebAcl = new wafv2.CfnWebACL(wafStack, 'AppSyncWebAcl', {
  scope: 'REGIONAL',
  defaultAction: { allow: {} },
  visibilityConfig: {
    sampledRequestsEnabled: true,
    cloudWatchMetricsEnabled: true,
    metricName: 'AppSyncWebAclDev',
  },
  rules: [
    {
      name: 'AWSManagedRulesCommonRuleSet',
      priority: 0,
      overrideAction: { count: {} }, // Countモード: マッチしても実際にはブロックしない
      statement: {
        managedRuleGroupStatement: {
          vendorName: 'AWS',
          name: 'AWSManagedRulesCommonRuleSet',
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'CommonRuleSetDev',
      },
    },
  ],
});

new wafv2.CfnWebACLAssociation(wafStack, 'AppSyncWebAclAssociation', {
  resourceArn: backend.data.resources.cfnResources.cfnGraphqlApi.attrArn,
  webAclArn: appsyncWebAcl.attrArn,
});



// --- 検証用: 同一アカウント内のS3 + CloudFrontによるフロントエンド配信 ---
// ※開発環境のため、カスタムSSL証明書・AWS WAFは設定しない（CloudFrontデフォルト証明書を使用）

const hostingStack = backend.createStack('HostingStack');

// 配信用S3バケット（パブリックアクセス不可、CloudFront(OAC)経由でのみ参照）
const hostingBucket = new s3.Bucket(hostingStack, 'HostingBucket', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  // 検証環境のため、スタック削除時にオブジェクトごと削除する
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});

// キャッシュポリシー（CloudFrontでのキャッシュ時間: 10分）
const hostingCachePolicy = new cloudfront.CachePolicy(hostingStack, 'HostingCachePolicy', {
  comment: 'Amplify app frontend cache policy (10 minutes)',
  defaultTtl: cdk.Duration.minutes(10),
  minTtl: cdk.Duration.seconds(0),
  maxTtl: cdk.Duration.minutes(10),
  cookieBehavior: cloudfront.CacheCookieBehavior.none(),
  headerBehavior: cloudfront.CacheHeaderBehavior.none(),
  queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
  // オブジェクトの自動圧縮を有効にするため、gzip/brotli をキャッシュキーに含める
  enableAcceptEncodingGzip: true,
  enableAcceptEncodingBrotli: true,
});

// レスポンスヘッダーポリシー
// ※Amazon Connect Agent Workspace に iframe で埋め込むため、frameOptions(X-Frame-Options) は設定しない
const hostingResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(hostingStack, 'HostingResponseHeadersPolicy', {
  securityHeadersBehavior: {
    strictTransportSecurity: {
      accessControlMaxAge: cdk.Duration.days(365),
      includeSubdomains: true,
      override: true,
    },
    contentTypeOptions: { override: true },
    referrerPolicy: {
      referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
      override: true,
    },
  },
});

// --- 案5検証用: AppSync を CloudFront 経由のアクセスに限定する ---

// 秘密ヘッダーB（CloudFront → AppSync）の値
// ※オーソライザーと同じスタックに作成する（HostingStack に作ると data との間で循環参照になるため）
const originVerifySecret = new secretsmanager.Secret(
  cdk.Stack.of(backend.originAuthorizer.resources.lambda),
  'OriginVerifySecret',
  {
    description: 'CloudFront -> AppSync origin verify header value',
    generateSecretString: { excludePunctuation: true, passwordLength: 40 },
  }
);
originVerifySecret.grantRead(backend.originAuthorizer.resources.lambda);
backend.originAuthorizer.addEnvironment('ORIGIN_VERIFY_SECRET_ARN', originVerifySecret.secretArn);

// CloudFrontに埋め込む値（CloudFormationの動的参照として解決される）
const originVerifyValue = originVerifySecret.secretValue.unsafeUnwrap();

// AppSync のホスト名（https://xxx.appsync-api.../graphql → xxx.appsync-api...）
const appsyncCfn = backend.data.resources.cfnResources.cfnGraphqlApi;
const appsyncApiHost = cdk.Fn.select(2, cdk.Fn.split('/', appsyncCfn.attrGraphQlUrl));
const appsyncRealtimeHost = cdk.Fn.select(2, cdk.Fn.split('/', appsyncCfn.attrRealtimeUrl));

// AppSync をオリジンとして定義（秘密ヘッダーBを付与）
const appsyncApiOrigin = new origins.HttpOrigin(appsyncApiHost, {
  protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
  customHeaders: { 'x-origin-verify': originVerifyValue },
});
const appsyncRealtimeOrigin = new origins.HttpOrigin(appsyncRealtimeHost, {
  protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
  customHeaders: { 'x-origin-verify': originVerifyValue },
});

// リアルタイム接続のハンドシェイクを AppSync 向けに書き換える CloudFront Function
//  - パス: /graphql/realtime → /graphql
//  - Sec-WebSocket-Protocol の header-<base64url> 内の host を AppSync のホスト名に置換し、秘密ヘッダーBを追加
const appsyncRealtimeFunction = new cloudfront.Function(hostingStack, 'AppSyncRealtimeHandshakeFunction', {
  runtime: cloudfront.FunctionRuntime.JS_2_0,
  code: cloudfront.FunctionCode.fromInline(`
var APPSYNC_HOST = '${appsyncApiHost}';
var ORIGIN_VERIFY = '${originVerifyValue}';

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) { s += '='; }
  return Buffer.from(s, 'base64').toString('utf8');
}

function b64urlEncode(s) {
  return Buffer.from(s, 'utf8').toString('base64')
    .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}

async function handler(event) {
  var request = event.request;
  request.uri = '/graphql';

  var protocolHeader = request.headers['sec-websocket-protocol'];
  if (protocolHeader) {
    protocolHeader.value = protocolHeader.value.split(',').map(function (p) {
      p = p.trim();
      if (p.indexOf('header-') !== 0) { return p; }
      var authHeader = JSON.parse(b64urlDecode(p.substring(7)));
      authHeader.host = APPSYNC_HOST;
      authHeader['x-origin-verify'] = ORIGIN_VERIFY;
      return 'header-' + b64urlEncode(JSON.stringify(authHeader));
    }).join(', ');
  }
  return request;
}
`),
});

// CloudFrontディストリビューション
const hostingDistribution = new cloudfront.Distribution(hostingStack, 'HostingDistribution', {
  comment: 'Amplify app frontend (verification)',
  defaultRootObject: 'index.html',
  priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL, // すべてのエッジロケーションを使用
  enableIpv6: true,
  defaultBehavior: {
    // オリジンシールドは指定しない（無効）
    origin: origins.S3BucketOrigin.withOriginAccessControl(hostingBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
    cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
    compress: true,
    cachePolicy: hostingCachePolicy,
    originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
    responseHeadersPolicy: hostingResponseHeadersPolicy,
    // ビューワーのアクセス制限（trustedKeyGroups）は指定しない（無効）
  },
  additionalBehaviors: {
    // リアルタイム通信（WebSocket）。'/graphql' より先に定義する
    '/graphql/realtime': {
      origin: appsyncRealtimeOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      functionAssociations: [{
        function: appsyncRealtimeFunction,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      }],
    },
    // クエリ／ミューテーション（HTTP）
    '/graphql': {
      origin: appsyncApiOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    },
  },
});

// postBuild でのデプロイに使用する値を amplify_outputs.json に出力
backend.addOutput({
  custom: {
    hosting: {
      bucketName: hostingBucket.bucketName,
      distributionId: hostingDistribution.distributionId,
      distributionDomainName: hostingDistribution.distributionDomainName,
    },
  },
});
