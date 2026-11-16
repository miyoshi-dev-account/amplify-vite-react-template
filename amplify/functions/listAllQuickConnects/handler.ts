import {
    ConnectClient,
    ListQuickConnectsCommand,
    DescribeQuickConnectCommand,
    type QuickConnectSummary,
} from "@aws-sdk/client-connect";

// API の呼び出し回数の上限を超えた場合は、SDK が待ち時間を調整しながら自動で再試行する
const client = new ConnectClient({ maxAttempts: 5, retryMode: "adaptive" });

// アプリは着信のたびに開き直され、そのたびにこの関数が呼ばれるため、
// 取得結果を一定時間使い回して Amazon Connect の API 呼び出し回数を抑える
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分
let cache: { expiresAt: number; quickConnects: string } | null = null;

// クイック接続の一覧を、続きのページも含めてすべて取得する
async function listAllQuickConnectSummaries(instanceId: string): Promise<QuickConnectSummary[]> {
    const summaries: QuickConnectSummary[] = [];
    let nextToken: string | undefined;
    do {
        const response = await client.send(new ListQuickConnectsCommand({
            InstanceId: instanceId,
            MaxResults: 1000,
            NextToken: nextToken,
        }));
        summaries.push(...(response.QuickConnectSummaryList || []));
        nextToken = response.NextToken;
    } while (nextToken);
    return summaries;
}

export const handler = async (event: any) => {
    try {
        // 保存済みの結果が有効期限内であれば、それを返す
        if (cache && cache.expiresAt > Date.now()) {
            return { success: true, quickConnects: cache.quickConnects };
        }

        // 実際の Connect インスタンスID を設定してください
        const instanceId = process.env.CONNECT_INSTANCE_ID || "あなたのインスタンスID";
        const summaries = await listAllQuickConnectSummaries(instanceId);

        const formattedConnects: any[] = [];
        let hasDescribeError = false;

        // 詳細の取得は、上限を超えないよう1件ずつ順番に行う
        for (const qc of summaries) {
            // 大文字を小文字に変更
            let mappedType = qc.QuickConnectType?.toLowerCase();

            // 「USER」の場合は「agent」に変更
            if (qc.QuickConnectType === 'USER') {
                mappedType = 'agent';
            }

            // 返却するベースのオブジェクトを作成
            const formattedData: any = {
                name: qc.Name,
                endpointARN: qc.Arn,
                type: mappedType
                //id: qc.Id
            };

            // phone_number の場合のみ詳細を取得し、phoneNumber を追加
            if (mappedType === 'phone_number') {
                try {
                    const describeResponse = await client.send(new DescribeQuickConnectCommand({
                        InstanceId: instanceId,
                        QuickConnectId: qc.Id
                    }));

                    // クイック接続の設定から電話番号を抽出
                    const phoneNumber = describeResponse.QuickConnect?.QuickConnectConfig?.PhoneConfig?.PhoneNumber;

                    // 電話番号が存在すればオブジェクトに追加
                    if (phoneNumber) {
                        formattedData.phoneNumber = phoneNumber;
                    }
                } catch (descError) {
                    hasDescribeError = true;
                    console.error(`QuickConnect ${qc.Id} の詳細取得に失敗しました:`, descError);
                }
            }

            formattedConnects.push(formattedData);
        }

        const quickConnects = JSON.stringify(formattedConnects);

        // 詳細の取得に失敗したものがある場合は、不完全な結果を使い回さないよう保存しない
        if (!hasDescribeError) {
            cache = { expiresAt: Date.now() + CACHE_TTL_MS, quickConnects };
        }

        return {
            success: true,
            quickConnects,
        };
    } catch (error) {
        console.error(error);
        return {
            success: false,
            quickConnects: "[]",
        };
    }
};
