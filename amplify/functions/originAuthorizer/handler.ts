import type { AppSyncAuthorizerHandler } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// CloudFront が AppSync へのリクエストに付与する秘密ヘッダー（秘密ヘッダーB）
const ORIGIN_VERIFY_HEADER = 'x-origin-verify';

const secretsClient = new SecretsManagerClient({});
let cachedSecret: string | undefined;

async function getOriginVerifySecret(): Promise<string> {
    if (cachedSecret === undefined) {
        const response = await secretsClient.send(
            new GetSecretValueCommand({ SecretId: process.env.ORIGIN_VERIFY_SECRET_ARN })
        );
        cachedSecret = response.SecretString ?? '';
    }
    return cachedSecret;
}

export const handler: AppSyncAuthorizerHandler = async (event) => {
    // ヘッダー名の大文字/小文字の違いを吸収する
    const headers = Object.fromEntries(
        Object.entries(event.requestHeaders ?? {}).map(([key, value]) => [key.toLowerCase(), value])
    );

    const secret = await getOriginVerifySecret();
    const isAuthorized = secret !== '' && headers[ORIGIN_VERIFY_HEADER] === secret;

    // PoC用ログ: どの経路（HTTP/WebSocket接続/サブスクリプション開始）でヘッダーが届くかを確認する
    // ※秘密の値そのものは出力しない
    console.log(JSON.stringify({
        isAuthorized,
        hasOriginVerifyHeader: ORIGIN_VERIFY_HEADER in headers,
        headerNames: Object.keys(headers),
        host: headers['host'],
        operationName: event.requestContext.operationName,
        queryString: event.requestContext.queryString?.slice(0, 100),
    }));

    // ttlOverride: 0 で判定結果をキャッシュさせない（固定トークンでの直接アクセスを防ぐため）
    return { isAuthorized, ttlOverride: 0 };
};
