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

        // 💡 フロントエンドの SDK が返す形 (endpointARN, name等) にフォーマットを合わせる
        const formattedConnects = response.QuickConnectSummaryList?.map(qc => ({
            name: qc.Name,
            endpointARN: qc.Arn,
            type: qc.QuickConnectType,
            id: qc.Id
        })) || [];

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