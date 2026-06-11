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