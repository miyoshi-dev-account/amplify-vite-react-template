import React from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';

import { useState, useEffect, useRef } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";

// UserListテーブル利用のための定義
type UserList = Schema["UserList"]["type"];
const client = generateClient<Schema>();

//export default function UserList() {
//export function UserList() {
function UserList() {
    const [users, setUsers] = useState<UserList[]>([]);
    const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set());
    const previousUsers = useRef<UserList[]>([]);

    useEffect(() => {
        // observeQueryがデータの初期取得とリアルタイム更新(Subscription)を自動で行います
        const sub = client.models.UserList.observeQuery().subscribe({
            next: ({ items }) => {
                const sortedItems = [...items].sort((a, b) =>
                    a.userName.localeCompare(b.userName)
                );

                const newUpdatedIds = new Set<string>();

                if (previousUsers.current.length === 0) {
                    sortedItems.forEach((newItem) => {
                        // 対策: newItemがnullでないことを確認してからidにアクセス
                        if (newItem) {
                            newUpdatedIds.add(newItem.id);
                        }
                    });
                } else {
                    // 対策1: 変数名が重複しないように newItem と prevItem に変更
                    sortedItems.forEach((newItem) => {
                        // 対策: newItemがnullの場合はこの要素の処理をスキップ
                        if (!newItem) return;

                        const isUnchanged = previousUsers.current.find(
                            (prevItem) =>
                                // 対策: prevItemがnullでないことも確認する
                                prevItem &&
                                prevItem.id === newItem.id &&
                                prevItem.userName === newItem.userName &&
                                prevItem.status === newItem.status
                        );
                        // 変更があった（前回と一致するものが見つからなかった）場合
                        if (!isUnchanged) {
                            newUpdatedIds.add(newItem.id);
                        }
                    });
                }

                setUsers(sortedItems);
                setUpdatedIds(newUpdatedIds);
                previousUsers.current = sortedItems;

                // 3秒後にハイライト状態を解除する
                setTimeout(() => {
                    setUpdatedIds(new Set());
                }, 3000);
            },
        });
        return () => sub.unsubscribe();
    }, []);

    const rows = users;

    return (
        <TableContainer component={Paper}>
            <Table sx={{ minWidth: 650 }} size="small" aria-label="a dense table">
                <TableHead>
                    <TableRow>
                        <TableCell>ユーザー名</TableCell>
                        <TableCell align="right">ステータス</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => {
                        // 対策: rowがnullの場合は何も表示せずにスキップ
                        if (!row) return null;
                        return (
                            <TableRow key={row.id}>
                                <TableCell component="th" scope="row">
                                    {row.userName}
                                </TableCell>
                                <TableCell align="right">{row.status}</TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

export default UserList;
