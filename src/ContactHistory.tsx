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

        // イベント発生時のハンドラー関数を定義
        const handleContactEnded = (contact: any) => {
            setHistory((prevHistory) => {
                // ※ ここに前回ご案内した履歴追加のロジック（重複排除や新しいレコードの作成など）を記述します
                const currentContactId = contact.getContactId();
                if (prevHistory.some(record => record.contactId === currentContactId)) {
                    return prevHistory;
                }

                const queue = contact.getQueue();
                const newRecord: ContactRecord = {
                    contactId: currentContactId,
                    type: contact.getType() || '不明',
                    queueName: queue ? queue.name : '直接着信/不明',
                    endTime: new Date().toLocaleTimeString(),
                };

                return [newRecord, ...prevHistory];
            });
        };

        // 💡 3. 受け取った contactClient を使ってイベントを設定します
        // ※ contactClient のメソッド名が onEnded などの場合を想定しています
        contactClient.onEnded(handleContactEnded);

        // クリーンアップ関数（コンポーネントが破棄される際にイベントリスナーを解除する）
        return () => {
            // もし offEnded のような解除用メソッドがあれば呼び出します
            // contactClient.offEnded(handleContactEnded);
        };
    }, [contactClient]); // 依存配列に contactClient を指定

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