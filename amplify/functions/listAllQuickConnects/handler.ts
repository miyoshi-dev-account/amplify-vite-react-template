import { ConnectClient, ListQuickConnectsCommand, DescribeQuickConnectCommand } from "@aws-sdk/client-connect";

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

        const formattedConnects = await Promise.all(
            (response.QuickConnectSummaryList || []).map(async (qc) => {
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
                        const describeCommand = new DescribeQuickConnectCommand({
                            InstanceId: instanceId,
                            QuickConnectId: qc.Id
                        });

                        const describeResponse = await client.send(describeCommand);

                        // クイック接続の設定から電話番号を抽出
                        const phoneNumber = describeResponse.QuickConnect?.QuickConnectConfig?.PhoneConfig?.PhoneNumber;

                        // 電話番号が存在すればオブジェクトに追加
                        if (phoneNumber) {
                            formattedData.phoneNumber = phoneNumber;
                        }
                    } catch (descError) {
                        console.error(`QuickConnect ${qc.Id} の詳細取得に失敗しました:`, descError);
                    }
                }

                return formattedData;
            })
        );

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