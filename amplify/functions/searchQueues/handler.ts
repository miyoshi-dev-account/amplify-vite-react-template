import { ConnectClient, SearchQueuesCommand, ListPhoneNumbersCommand } from "@aws-sdk/client-connect";

const client = new ConnectClient();

export const handler = async () => {
    const instanceId = process.env.CONNECT_INSTANCE_ID;

    if (!instanceId) {
        console.error("環境変数 CONNECT_INSTANCE_ID が設定されていません。");
        return { success: false, queues: "[]" };
    }

    try {
        // インスタンス内のすべての電話番号を取得し、[ID: 電話番号] のマップを作成
        const listPhonesCommand = new ListPhoneNumbersCommand({
            InstanceId: instanceId,
            //MaxResults: 100 // ※電話番号が100件を超える場合はページネーション処理が必要です
        });
        const phoneResponse = await client.send(listPhonesCommand);

        const phoneNumberMap: Record<string, string> = {};
        phoneResponse.PhoneNumberSummaryList?.forEach((phone: any) => {
            if (phone.Id && phone.PhoneNumber) {
                phoneNumberMap[phone.Id] = phone.PhoneNumber; // 例: { "xxxx-xxxx-xxxx": "+18774295743" }
            }
        });

        // キュー一覧を取得
        const searchQueuesCommand = new SearchQueuesCommand({
            InstanceId: instanceId,
            //SearchFilter: { TagFilter: {} },
            //MaxResults: 100
        });
        const response = await client.send(searchQueuesCommand);

        // キューの情報に、実際の電話番号を紐づける
        const queues = response.Queues?.map((q: any) => {
            // キューに設定されている「電話番号ID」を取得
            const callerNumberId = q.OutboundCallerConfig?.OutboundCallerIdNumberId;

            // マップから実際の電話番号文字列を取得する
            const callerPhoneNumber = callerNumberId ? phoneNumberMap[callerNumberId] : null;

            return {
                queueARN: q.QueueArn,
                queueId: q.QueueId,
                name: q.Name,
                // フロントエンドのコードに合わせて outboundCallerName プロパティに電話番号をセット
                // (電話番号がない場合はフォールバックとして名前をセット)
                outboundCallerName: callerPhoneNumber || q.OutboundCallerConfig?.OutboundCallerIdNumberId || null
            };
        }) || [];

        return {
            success: true,
            queues: JSON.stringify(queues),
        };

    } catch (error) {
        console.error("APIの実行に失敗しました:", error);
        return {
            success: false,
            queues: "[]",
        };
    }
};