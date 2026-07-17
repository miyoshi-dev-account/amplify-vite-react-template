import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import { Button, SpaceBetween } from '@cloudscape-design/components';

// Amplify Data クライアントの初期化
const client = generateClient<Schema>();

interface QueueData {
    queueARN: string;
    queueId: string;
    name: string;
}

interface QueueMonitorProps {
    availableQueues: QueueData[];
}
// 最大待ち秒数の表示形式を「00:00」に変更
const formatWaitTimeMMSS = (totalSeconds: number) => {
    // 保存されている秒数がミリ秒なので、秒に置換
    const convSeconds = totalSeconds / 1000;
    // 分を計算し、文字列にして2桁でゼロ埋め
    const minutes = String(Math.floor(convSeconds / 60)).padStart(2, '0');
    // 秒数を計算し、文字列にして2桁でゼロ埋め（小数点以下は切り捨て）
    const seconds = String(Math.floor(convSeconds % 60)).padStart(2, '0');

    return `${minutes}:${seconds}`;
};

export default function QueueMonitor({ availableQueues }: QueueMonitorProps) {
    // 待ち呼が発生しているかどうか（通知のON/OFF）を管理するステート
    const [hasWaitingCalls, setHasWaitingCalls] = useState(false);
    // 画面表示用にキューごとの詳細データを保持するステート（オプション）
    const [metricsData, setMetricsData] = useState<Array<Schema['QueueMetrics']['type']>>([]);

    // 縮小表示モード（1行のみ）の ON/OFF を管理するState
    const [isCompactMode, setIsCompactMode] = useState(true); // 初期値をtrue(縮小)に設定

    useEffect(() => {
        // QueueMetrics テーブルの変更をリアルタイムに監視
        const subscription = client.models.QueueMetrics.observeQuery().subscribe({
            next: (data) => {
                // data.items には、テーブル内のすべての最新レコードの配列が入ります
                const items = data.items;
                setMetricsData(items);

                // 配列の中から、1つでも contactsInQueue が 1 以上のキューがあるかを判定
                // ※ some メソッドは条件に合致する要素が1つでもあれば true を返します
                const isAlertNeeded = items.some(
                    (queue) => (queue.contactsInQueue || 0) > 0
                );

                // 判定結果をステートにセット（1以上なら trueで通知ON、すべて0なら falseで通知OFF）
                setHasWaitingCalls(isAlertNeeded);
            },
            error: (error) => {
                console.error('キューメトリクスの監視中にエラーが発生しました:', error);
            }
        });

        // コンポーネントのアンマウント時にサブスクリプションを解除（メモリリーク防止）
        return () => subscription.unsubscribe();
    }, []);

    // データのフィルタリングと表示件数の制御
    // エージェントが対応するキュー（availableQueues）に含まれるものだけに絞り込む
    const filteredMetrics = metricsData.filter((metric) => {
        return availableQueues.some(queue => queue.name === (metric as any).queueName);
    });

    // 縮小モードがONの場合は先頭の1行だけ抽出し、OFFの場合は全件表示する
    const displayMetrics = isCompactMode ? filteredMetrics.slice(0, 1) : filteredMetrics;

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <h2>Amazon Connect キュー監視</h2>

            {/* --- 通知（アラート）の表示領域 --- */}
            {hasWaitingCalls ? (
                <div style={{
                    backgroundColor: '#ffebee',
                    color: '#c62828',
                    padding: '15px',
                    borderRadius: '5px',
                    fontWeight: 'bold',
                    marginBottom: '20px',
                    border: '1px solid #c62828'
                }}>
                    ⚠️ 【通知】待ち呼が発生しています！すぐに対応してください。
                </div>
            ) : (
                <div style={{
                    backgroundColor: '#e8f5e9',
                    color: '#2e7d32',
                    padding: '15px',
                    borderRadius: '5px',
                    marginBottom: '20px',
                    border: '1px solid #2e7d32'
                }}>
                    ✅ 現在、待ち呼はありません。
                </div>
            )}

            {/* --- 縮小・詳細表示を切り替えるボタン --- */}
            <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                <Button onClick={() => setIsCompactMode(!isCompactMode)}>
                    {isCompactMode ? '詳細表示（全件）' : '縮小表示（1行）'}
                </Button>
            </div>

            {/* --- 各キューの詳細データ表示（参考） --- */}
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                        <th style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>キュー名</th>
                        <th style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>待ち呼数</th>
                        <th style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>最長待ち時間</th>
                    </tr>
                </thead>
                <tbody>
                    {displayMetrics.map((metric, index) => (
                        <tr key={index}>
                            <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                                {(metric as any).queueName || (metric as any).queueId}
                            </td>
                            <td style={{
                                padding: '10px',
                                borderBottom: '1px solid #eee',
                                // 待ち呼がある場合は数値を赤字で強調
                                color: ((metric as any).contactsInQueue || 0) > 0 ? 'red' : 'inherit',
                                fontWeight: ((metric as any).contactsInQueue || 0) > 0 ? 'bold' : 'normal'
                            }}>
                                {(metric as any).contactsInQueue || 0} 人
                            </td>
                            <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                                {formatWaitTimeMMSS((metric as any).oldestContactAge || 0)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}