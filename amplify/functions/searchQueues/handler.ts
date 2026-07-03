import { ConnectClient, SearchQueuesCommand } from "@aws-sdk/client-connect";

const client = new ConnectClient();

export const handler = async (event: any) => {
    const instanceId = process.env.CONNECT_INSTANCE_ID;

    try {
        // SearchQueuesCommand を実行してキューの一覧を取得 [1]
        const command = new SearchQueuesCommand({
            InstanceId: instanceId,
            // 標準キュー（STANDARD）のみを取得する場合などのフィルタリング設定
            //SearchFilter: {
            //    TagFilter: {} // 必要に応じてタグで絞り込み
            //},
            //MaxResults: 100 // 取得する最大件数
        });
        const response = await client.send(command);

        // 取得したキュー情報から必要な項目を抽出
        const queues = response.Queues?.map((q: any) => ({
            queueARN: q.QueueArn,
            queueId: q.QueueId,
            name: q.Name,
            // 発信者番号に紐づけられた名前（OutboundCallerIdName）などが設定されていれば取得します
            outboundCallerName: q.OutboundCallerConfig?.OutboundCallerIdName || null
        })) || [];

        return {
            success: true,
            queues: JSON.stringify(queues), // Amplifyの型に合わせて文字列化して返す
        };

    } catch (error) {
        console.error("SearchQueuesCommandの実行に失敗しました:", error);
        return {
            success: false,
            queues: "[]",
        };
    }
};