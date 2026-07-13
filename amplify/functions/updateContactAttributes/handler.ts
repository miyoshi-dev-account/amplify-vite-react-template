import { ConnectClient, UpdateContactAttributesCommand } from "@aws-sdk/client-connect";
import type { Schema } from "../../data/resource";

// ConnectClientの初期化
const client = new ConnectClient({});

export const handler = async (event: Schema["updateContactAttributes"]["functionHandler"]) => {
    // フロントエンドから渡された引数を取得
    const { contactId, customName, queueName } = event.arguments;
    const instanceId = process.env.CONNECT_INSTANCE_ID;

    try {
        const command = new UpdateContactAttributesCommand({
            InstanceId: instanceId,
            InitialContactId: contactId,
            Attributes: {
                "TransferCustomName": customName, // ここでコンタクト属性を設定
                "TransferQueueName": queueName,
            },
        });

        await client.send(command);

        return {
            success: true,
            message: "コンタクト属性の更新に成功しました。",
        };
    } catch (error) {
        console.error("コンタクト属性の更新に失敗しました:", error);
        throw new Error("Failed to update contact attributes");
    }
};