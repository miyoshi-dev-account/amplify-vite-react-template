import { ConnectClient, ListQuickConnectsCommand } from "@aws-sdk/client-connect";

const client = new ConnectClient({});

export const handler = async (event: any) => {
    try {
        // 実際の Connect インスタンスID を設定してください
        const instanceId = process.env.CONNECT_INSTANCE_ID || "あなたのインスタンスID";

        const command = new ListQuickConnectsCommand({
            InstanceId: instanceId,
            MaxResults: 1000,
        });

        const response = await client.send(command);

        // フロントエンドの SDK が返す形 (endpointARN, name等) にフォーマットを合わせる
        const formattedConnects = response.QuickConnectSummaryList?.map(qc => {
            // 大文字を小文字に変更
            let mappedType = qc.QuickConnectType?.toLowerCase();

            // 「USER」の場合は「agent」に変更
            if (qc.QuickConnectType === 'USER') {
                mappedType = 'agent';
            }

            // （※補足: 必要に応じて 'PHONE_NUMBER' を 'external' に置換する処理をここに足すことも可能です）
            // if (qc.QuickConnectType === 'PHONE_NUMBER') mappedType = 'external';

            return {
                name: qc.Name,
                endpointARN: qc.Arn,
                type: mappedType
                //id: qc.Id
            };
        }) || [];

        return {
            success: true,
            quickConnects: JSON.stringify(formattedConnects),
        };
    } catch (error) {
        console.error(error);
        return {
            success: false,
            quickConnects: "[]",
        };
    }
};