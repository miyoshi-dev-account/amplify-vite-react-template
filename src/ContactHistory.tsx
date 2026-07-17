import React, { useState, useEffect } from 'react';

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

// 電話番号の表示形式を変換する関数
const formatPhoneNumber = (phoneNumber: string) => {
    if (!phoneNumber || phoneNumber === '不明') return phoneNumber;

    // '+81' で始まる日本の電話番号の場合
    if (phoneNumber.startsWith('+81')) {
        // '+81' を '0' に置換する (+815033551111 -> 05033551111)
        const localNumber = '0' + phoneNumber.slice(3);

        // 11桁の場合（携帯電話、IP電話 050/070/080/090 等）: 3桁-4桁-4桁
        if (localNumber.length === 11) {
            return localNumber.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
        }
        // 10桁の場合（固定電話）: 簡易的に 2桁-4桁-4桁(東京03等) または 3桁-3桁-4桁 に変換
        else if (localNumber.length === 10) {
            if (localNumber.startsWith('03') || localNumber.startsWith('06')) {
                return localNumber.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
            } else {
                return localNumber.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
            }
        }

        // 上記以外の桁数の場合は、ハイフンなしで 0 始まりにしたものだけ返す
        return localNumber;
    }

    // '+1' で始まる米国の電話番号の場合
    if (phoneNumber.startsWith('+1')) {
        // '+1' を除いたローカル番号部分を取得 (+18774295743 -> 8774295743)
        const localNumber = phoneNumber.slice(2);

        // 米国の電話番号（10桁）の場合: 3桁-3桁-4桁 に変換
        if (localNumber.length === 10) {
            return `${localNumber.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')}`;
        }

        // 10桁以外の場合は、ハイフンなしでそのまま返す
        return phoneNumber;
    }

    // +81, +1 以外（海外の番号や内線など）はそのまま返す
    return phoneNumber;
};

export default function ContactHistory({ history, onRedial }: ContactHistoryProps) {
    // 簡易表示と詳細表示の切り替えState (初期値は簡易表示=true)
    const [isCompactView, setIsCompactView] = useState(true);

    // フィルター用のState
    const [filterType, setFilterType] = useState('すべて');

    // 通話履歴のフィルタリング処理
    const filteredHistory = history.filter((record) => {
        if (filterType === 'すべて') return true;
        // 選択されたタイプと一致するレコードのみを返す
        return record.type === filterType;
    });

    return (
        <div style={{ padding: '10px' }}>
            {/* ヘッダー部分（タイトル、フィルター、切り替えボタン） */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>自分の通話履歴</h3>

                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    {/* フィルター用のセレクトボックス */}
                    <div>
                        <label htmlFor="typeFilter" style={{ marginRight: '5px', fontWeight: 'bold' }}>タイプ絞り込み:</label>
                        <select
                            id="typeFilter"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            style={{ padding: '4px' }}
                        >
                            <option value="すべて">すべて</option>
                            <option value="着信">着信</option>
                            <option value="発信">発信</option>
                            <option value="不在着信">不在着信</option>
                            <option value="不在発信">不在発信</option>
                        </select>
                    </div>

                    {/* 表示切り替えボタン */}
                    <button
                        onClick={() => setIsCompactView(!isCompactView)}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#fff',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        {isCompactView ? '詳細表示にする' : '簡易表示にする'}
                    </button>
                </div>
            </div>

            {filteredHistory.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '10px', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ccc', backgroundColor: '#f9f9f9' }}>
                            {/* isCompactView が false(詳細表示) の時だけ表示する項目 */}
                            {!isCompactView && <th style={{ padding: '10px' }}>コンタクトID</th>}

                            <th style={{ padding: '10px' }}>開始時間</th>

                            {!isCompactView && <th style={{ padding: '10px' }}>通話時間</th>}
                            {!isCompactView && <th style={{ padding: '10px' }}>終了時間</th>}

                            <th style={{ padding: '10px' }}>タイプ</th>
                            <th style={{ padding: '10px' }}>キュー名</th>
                            <th style={{ padding: '10px' }}>電話番号</th>
                            <th style={{ padding: '10px' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredHistory.map((record, index) => (
                            <tr key={record.contactId || index} style={{ borderBottom: '1px solid #eee' }}>
                                {/* 💡 コンタクトID */}
                                {!isCompactView && <td style={{ padding: '10px' }}>{record.contactId}</td>}

                                {/* 💡 常に表示する項目 */}
                                <td style={{ padding: '10px' }}>{record.startTime}</td>

                                {/* 💡 通話時間と終了時間 */}
                                {!isCompactView && <td style={{ padding: '10px' }}>{record.duration}</td>}
                                {!isCompactView && <td style={{ padding: '10px' }}>{record.endTime}</td>}

                                {/* 💡 常に表示する項目 */}
                                <td style={{
                                    padding: '10px',
                                    color: record.type.includes('不在') ? '#dc2626' : '#374151',
                                    fontWeight: record.type.includes('不在') ? 'bold' : 'normal'
                                }}>
                                    {record.type}
                                </td>
                                <td style={{ padding: '10px' }}>{record.queueName}</td>
                                <td style={{ padding: '10px' }}>{formatPhoneNumber(record.phoneNumber)}</td>
                                <td style={{ padding: '10px' }}>
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