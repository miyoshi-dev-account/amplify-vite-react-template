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
                // 更新後のユーザーリストのソート
                const sortedItems = [...items].sort((a, b) =>
                    a.userName.localeCompare(b.userName)
                );

                // ユーザーリストの更新
                setUsers(sortedItems);
                previousUsers.current = sortedItems;
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
                        if (!row || !row.id) return null;
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
