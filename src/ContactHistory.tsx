import React, { useState, useEffect } from 'react';
// 必要に応じて Amplify UI や Cloudscape のコンポーネントをインポートします
// import { Table, Container, Header } from '@cloudscape-design/components';

interface ContactHistoryProps {
    contactClient: any;
    contactInfo: any
}

export interface ContactRecord {
    contactId: string;
    type: string;        // '着信' | '発信' | '不在着信' | '不在発信'
    queueName: string;
    phoneNumber: string; // コンタクト先の電話番号
    startTime: string;   // 開始時間
    duration: string;    // 通話時間 (例: "03:45")
    endTime: string;     // 終了時間
}

declare global {
    interface Window {
        connect: any;
    }
}

export default function ContactHistory({ contactClient }: ContactHistoryProps, { contactInfo }: ContactHistoryProps) {
    // 💡 2. リダイヤル用の発信処理を追加
    const handleRedial = (phoneNumber: string) => {
        // Streams API (agent.connect) を使用して、指定した電話番号へ発信します [6, 7]
        if (window.connect && window.connect.agent) {
            window.connect.agent((agent: any) => {
                const endpoint = window.connect.Endpoint.byPhoneNumber(phoneNumber);
                agent.connect(endpoint, {
                    success: () => console.log(`${phoneNumber} へ発信しました`),
                    failure: (err: any) => console.error("発信に失敗しました", err)
                });
            });
        } else {
            console.warn("発信用のAPIにアクセスできません");
        }
    };

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

    // 💡 以下、既存の contactClient.onStartingAcw 等の監視処理を置き換えます
    useEffect(() => {
        // window.connect が存在しない場合は実行しない
        if (!window.connect || !window.connect.contact) {
            console.log("----- windows.connect nothing -----");
            return;
        }

        // 📌 ヘルパー: コンタクトが繋がった「開始時間」をストレージに一時保存する
        // (AgentWorkspaceが着信時に画面を再描画しても消えないようにするため)
        const setStartTime = (cId: string) => {
            const times = JSON.parse(localStorage.getItem('contactStartTimes') || '{}');
            times[cId] = Date.now();
            localStorage.setItem('contactStartTimes', JSON.stringify(times));
        };

        // 📌 ヘルパー: 開始時間から通話時間（MM:SS）を計算し、一時保存をクリアする
        const getStartTimeAndDuration = (cId: string) => {
            const times = JSON.parse(localStorage.getItem('contactStartTimes') || '{}');
            const startMs = times[cId];

            if (!startMs) return { startTime: '不明', duration: '00:00' };

            const startObj = new Date(startMs);
            const durationSeconds = Math.floor((Date.now() - startMs) / 1000);
            const m = String(Math.floor(durationSeconds / 60)).padStart(2, '0');
            const s = String(durationSeconds % 60).padStart(2, '0');

            // 取得が終わったらストレージのメモリから削除
            delete times[cId];
            localStorage.setItem('contactStartTimes', JSON.stringify(times));

            return { startTime: startObj.toLocaleTimeString(), duration: `${m}:${s}` };
        };

        // 📌 ヘルパー: 通話終了時や不在時に履歴を保存する共通処理
        const handleSaveHistory = (contact: any, isMissed: boolean) => {
            const contactId = contact.getContactId();

            // Streams APIから各種情報を取得
            const queue = contact.getQueue();
            const endpoint = contact.getCustomerEndpoint(); // [4]
            const isInbound = contact.isInbound();          // [3]
            const phoneNumber = endpoint ? endpoint.phoneNumber : '不明';

            // タイプの判定（着信/発信/不在着信/不在発信）
            let typeStr = '';
            if (isMissed) {
                typeStr = isInbound ? '不在着信' : '不在発信';
            } else {
                typeStr = isInbound ? '着信' : '発信';
            }

            // 計算した通話時間の取得
            const { startTime, duration } = getStartTimeAndDuration(contactId);

            const newRecord: ContactRecord = {
                contactId,
                type: typeStr,
                queueName: queue ? queue.name : '不明',
                phoneNumber: phoneNumber,
                // 不在着信などで開始時間が「不明」の場合は、今の時間を開始時間とする
                startTime: startTime === '不明' && isMissed ? new Date().toLocaleTimeString() : startTime,
                duration: isMissed ? '00:00' : duration,
                endTime: new Date().toLocaleTimeString(),
            };

            const savedData = localStorage.getItem('agentContactHistory');
            const currentHistory: ContactRecord[] = savedData ? JSON.parse(savedData) : [];

            // 重複チェック後に保存
            if (!currentHistory.some(record => record.contactId === contactId)) {
                const updatedHistory = [newRecord, ...currentHistory];
                localStorage.setItem('agentContactHistory', JSON.stringify(updatedHistory));
                setContactHistory(updatedHistory);
            }
        };

        // ==========================================
        // 💡 1. コンタクトのイベント監視（開始・終了・不在）
        // ==========================================
        window.connect.contact((contact: any) => {
            // 通話が繋がった瞬間に開始時間を記録 [8]
            contact.onConnected(() => {
                setStartTime(contact.getContactId());
            });

            // 通話が終了し、アフターコールワーク(ACW)に入った時 [8]
            contact.onACW(() => {
                handleSaveHistory(contact, false);
            });

            // エージェントが応答できず、不在着信(または不在発信)になった時 [2]
            contact.onMissed(() => {
                handleSaveHistory(contact, true);
            });
        });

        // ==========================================
        // 💡 2. ログアウト時のリセット処理
        // ==========================================
        if (window.connect.core) {
            // エージェントが手動でログアウトした際に発行される TERMINATED イベントを検知 [5]
            window.connect.core.getEventBus().subscribe(window.connect.EventType.TERMINATED, () => {
                // 保存している履歴と一時時間をすべて削除し、画面を空にする
                localStorage.removeItem('agentContactHistory');
                localStorage.removeItem('contactStartTimes');
                setContactHistory([]);
            });
        }

    }, []); // 依存配列は空にし、マウント時に1回だけ実行

    return (
        <div style={{ padding: '10px' }}>
            <h3>自分の通話履歴</h3>
            {contactHistory.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '10px', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                            {/* 💡 3. テーブルのヘッダーを要件に合わせて更新 */}
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
                        {contactHistory.map((record) => (
                            <tr key={record.contactId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '8px' }}>{record.startTime}</td>
                                <td style={{ padding: '8px' }}>{record.duration}</td>
                                <td style={{ padding: '8px' }}>{record.endTime}</td>
                                <td style={{ padding: '8px' }}>
                                    {/* 不在の場合は赤字で強調するスタイル */}
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
                                    {/* 💡 電話番号が存在する場合のみ、リダイヤルボタンを表示する */}
                                    {record.phoneNumber && record.phoneNumber !== '不明' && (
                                        <button
                                            onClick={() => handleRedial(record.phoneNumber)}
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