import React, { useState, useEffect } from 'react';
// 必要に応じて Amplify UI や Cloudscape のコンポーネントをインポートします
// import { Table, Container, Header } from '@cloudscape-design/components';

interface ContactHistoryProps {
    contactClient: any;
}

interface ContactRecord {
    contactId: string;
    type: string;
    queueName: string;
    endTime: string;
}

/*
declare global {
    interface Window {
        connect: any;
    }
}
*/

export default function ContactHistory({ contactClient }: ContactHistoryProps) {
    // ログイン後の通話履歴を保持するステート
    const [history, setHistory] = useState<ContactRecord[]>([]);

    useEffect(() => {
        // contactClient が存在しない場合は処理を抜ける
        if (!contactClient) return;

        // イベント発生時のハンドラー関数
        const handleContactCleared = (contactData: any) => {
            // ⚠️ 注意: Agent Workspace SDK では、渡ってくるデータ（contactData）の構造が
            // Streams API (getContactId() などのメソッド) と異なる可能性があります。
            // 実際のオブジェクト構造に合わせて、プロパティでの取得などに変更してください。
            // （例: contactData.contactId、contactData.contact?.contactId など）

            console.log(contactData);
            const currentContactId = contactData.contactId || 'unknown-id';

            setHistory((prevHistory) => {
                if (prevHistory.some(record => record.contactId === currentContactId)) {
                    return prevHistory;
                }

                const newRecord: ContactRecord = {
                    contactId: currentContactId,
                    type: contactData.type || '不明',
                    // queueの取得方法も実際のデータ構造に合わせて調整してください
                    queueName: contactData.queue?.name || '不明',
                    endTime: new Date().toLocaleTimeString(),
                };

                return [newRecord, ...prevHistory];
            });
        };

        // 💡 修正1: onEnded() ではなく onCleared() を使用します
        contactClient.onCleared(handleContactCleared);

        return () => {
            // 💡 修正2: クリーンアップ（解除）も offCleared() を使用します
            if (typeof contactClient.offCleared === 'function') {
                contactClient.offCleared(handleContactCleared);
            }
        };
    }, [contactClient]);

    return (
        <div style={{ padding: '10px' }}>
            <h3>自分の通話履歴（ログイン後）</h3>

            {history.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '10px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={{ padding: '8px' }}>終了時刻</th>
                            <th style={{ padding: '8px' }}>タイプ</th>
                            <th style={{ padding: '8px' }}>キュー名</th>
                            <th style={{ padding: '8px' }}>コンタクトID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((record) => (
                            <tr key={record.contactId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '8px' }}>{record.endTime}</td>
                                <td style={{ padding: '8px' }}>{record.type}</td>
                                <td style={{ padding: '8px' }}>{record.queueName}</td>
                                <td style={{ padding: '8px', fontSize: '12px', color: '#6b7280' }}>
                                    {record.contactId}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '10px' }}>
                    ログイン以降の通話履歴はまだありません。
                </p>
            )}
        </div>
    );
}