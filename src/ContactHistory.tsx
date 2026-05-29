import React, { useState, useEffect } from 'react';
// 必要に応じて Amplify UI や Cloudscape のコンポーネントをインポートします
// import { Table, Container, Header } from '@cloudscape-design/components';

// 💡 取得する情報の型定義
export interface ContactRecord {
    contactId: string;
    type: string;        // '着信' | '発信' | '不在着信' | '不在発信'
    queueName: string;
    phoneNumber: string; // コンタクト先の電話番号
    startTime: string;   // 開始時間
    duration: string;    // 通話時間 (例: "03:45")
    endTime: string;     // 終了時間
}

interface ContactHistoryProps {
    history: ContactRecord[];
    onRedial: (phoneNumber: string) => void; // 💡 リダイヤル用の関数をPropsとして受け取る
}

export default function ContactHistory({ history, onRedial }: ContactHistoryProps) {
    /*
    // ログイン後の通話履歴を保持するステート
    //const [history, setHistory] = useState<ContactRecord[]>([]);
    // 💡 修正1: 初期化時に localStorage から履歴を読み込む関数を渡す
    const [contactHistory, setContactHistory] = useState<ContactRecord[]>(() => {
        try {
            const savedData = localStorage.getItem('agentContactHistory');
            return savedData ? JSON.parse(savedData) : [];
        } catch (error) {
            console.error("履歴の読み込みに失敗しました:", error);
            return [];
        }
    });
    */

    /*
    useEffect(() => {
        // contactClient が存在しない場合は処理を抜ける
        if (!contactClient) return;

        // イベント発生時のハンドラー関数
        const handleStartingAcw = (contactData: any) => {
            // ⚠️ 注意: Agent Workspace SDK では、渡ってくるデータ（contactData）の構造が
            // Streams API (getContactId() などのメソッド) と異なる可能性があります。
            // 実際のオブジェクト構造に合わせて、プロパティでの取得などに変更してください。
            // （例: contactData.contactId、contactData.contact?.contactId など）

            console.log("---------- Get contactData ----------");
            console.log(contactData);
            console.log("---------- Get contactInfo ----------");
            console.log(contactInfo);
            const currentContactId = contactData.contactId || 'unknown-id';

            const newRecord: ContactRecord = {
                contactId: currentContactId,
                type: contactData.type || '不明',
                queueName: contactData.queue?.name || '不明',
                //queueName: contactInfo.queueName || '不明',
                endTime: new Date().toLocaleTimeString(),
            };

            // 1. ReactのStateではなく、直接ストレージから最新の履歴を取得する
            const savedData = localStorage.getItem('agentContactHistory');
            const currentHistory: ContactRecord[] = savedData ? JSON.parse(savedData) : [];

            // 2. 重複チェック
            if (!currentHistory.some(record => record.contactId === currentContactId)) {
                // 新しい履歴を先頭に追加した配列を作成
                const updatedHistory = [newRecord, ...currentHistory];

                // 💡 3. 【重要】Reactの再描画を待たずに、この瞬間にストレージへ即時保存する
                localStorage.setItem('agentContactHistory', JSON.stringify(updatedHistory));

                // 4. 画面に表示させるために、ReactのStateにも同じものをセットする
                setContactHistory(updatedHistory);
            }
        };

        // 💡 修正1: onEnded() ではなく onCleared() を使用します
        contactClient.onStartingAcw(handleStartingAcw);

        return () => {
            // 💡 修正2: クリーンアップ（解除）も offCleared() を使用します
            if (typeof contactClient.offStartingAcw === 'function') {
                contactClient.offStartingAcw(handleStartingAcw);
            }
        };
    }, [contactClient]);
    */

    return (
        <div style={{ padding: '10px' }}>
            <h3>自分の通話履歴</h3>
            {history.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '10px', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={{ padding: '8px' }}>開始時間</th>
                            <th style={{ padding: '8px' }}>通話時間</th>
                            <th style={{ padding: '8px' }}>終了時間</th>
                            <th style={{ padding: '8px' }}>タイプ</th>
                            <th style={{ padding: '8px' }}>キュー名</th>
                            <th style={{ padding: '8px' }}>電話番号</th>
                            <th style={{ padding: '8px' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((record) => (
                            <tr key={record.contactId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '8px' }}>{record.startTime}</td>
                                <td style={{ padding: '8px' }}>{record.duration}</td>
                                <td style={{ padding: '8px' }}>{record.endTime}</td>
                                <td style={{ padding: '8px' }}>
                                    <span style={{
                                        color: record.type.includes('不在') ? '#dc2626' : '#374151',
                                        fontWeight: record.type.includes('不在') ? 'bold' : 'normal'
                                    }}>
                                        {record.type}
                                    </span>
                                </td>
                                <td style={{ padding: '8px' }}>{record.queueName}</td>
                                <td style={{ padding: '8px' }}>{record.phoneNumber}</td>
                                <td style={{ padding: '8px' }}>
                                    {/* 電話番号が存在する場合のみ、リダイヤルボタンを表示する */}
                                    {record.phoneNumber && record.phoneNumber !== '不明' && (
                                        <button
                                            onClick={() => onRedial(record.phoneNumber)}
                                            style={{
                                                padding: '4px 12px',
                                                backgroundColor: '#4f46e5',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            リダイヤル
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '10px' }}>
                    通話履歴はまだありません。
                </p>
            )}
        </div>
    );
}