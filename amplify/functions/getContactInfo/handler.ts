import {
    ConnectClient,
    DescribeContactCommand,
    DescribeQueueCommand,
    GetContactAttributesCommand,
} from "@aws-sdk/client-connect";
import type { Schema } from "../../data/resource"; // Amplifyのスキーマに合わせてインポート

const client = new ConnectClient();
export const handler = async (event: Schema["getContactInfo"]["functionHandler"]) => {
    // フロントエンドから渡された引数を取得
    const { contactId } = event.arguments;
    const instanceId = process.env.CONNECT_INSTANCE_ID;

    try {
        // コンタクトの基本情報（キュー名やお客様の電話番号など）を取得
        const describeCommand = new DescribeContactCommand({
            InstanceId: instanceId,
            ContactId: contactId,
        });
        const contactResponse = await client.send(describeCommand);
        const contact = contactResponse.Contact;
        console.log("get contact info");
        console.log(contactResponse);

        // コンタクト属性（転送時の TransferCustomName など）を取得
        const attributesCommand = new GetContactAttributesCommand({
            InstanceId: instanceId,
            InitialContactId: contactId, // コンタクト属性は InitialContactId を指定します
        });
        const attributesResponse = await client.send(attributesCommand);
        const attributes = attributesResponse.Attributes || {};

        // キューの情報を取得
        let queueName = '不明';
        if (contact?.QueueInfo?.Id) {
            const queueCommand = new DescribeQueueCommand({
                InstanceId: instanceId,
                QueueId: contact?.QueueInfo?.Id,
            });
            const queueResponse = await client.send(queueCommand);
            queueName = queueResponse?.Queue?.Name || '不明';
        }

        // フロントエンドで扱いやすい形に整形して返す
        return {
            success: true,
            // 取得した情報から必要な項目を抽出（存在しない場合は '不明' をセット）
            queueName: queueName,
            phoneNumber: contact?.CustomerEndpoint?.Address || "不明",
            // 属性はオブジェクトのまま返すか、Amplifyのスキーマに合わせて文字列化(JSON.stringify)して返します
            transferCustomName: attributes["TransferCustomName"] || null,
            transferQueueName: attributes["TransferQueueName"] || null,
            initiationMethod: contact?.InitiationMethod || "UNKNOWN",
        };

    } catch (error) {
        console.error("Lambdaでのコンタクト情報取得に失敗しました:", error);

        // エラー時でもアプリがクラッシュしないようにフォールバック値を返す
        return {
            success: false,
            queueName: "不明",
            phoneNumber: "不明",
            transferCustomName: null,
            transferQueueName: null,
        };
    }
};