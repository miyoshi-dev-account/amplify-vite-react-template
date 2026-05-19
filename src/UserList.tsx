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

//import { ConnectClient, ListUsersCommand } from "@aws-sdk/client-connect";

/*
function createData(userName: string, status: string) {
    return { userName, status };
}

const rows = [
    createData('User01', 'offline'),
    createData('User02', 'available'),
];
*/

/*
function getAgentList() {
    const client = new ConnectClient(config);
    const input = { // ListUsersRequest
      InstanceId: "STRING_VALUE"
    };
    const command = new ListUsersCommand(input);
    const response = await client.send(command);

    if(!response || !response.UserSummaryList || response.UserSummaryList.length = 0 ) {
        return;
    }

    response.UserSummaryList.foreach((agent) => 
        // エージェントのステータス取得方法を確認する
        // 無かったらStream&DB&APIの組み合わせ
        rows.appendChild(createData(agent.Username, ));
        addQuickOption(agent.queueARN)
    );
    return;
}
*/

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
        const sub = client.models.UserList.observeQuery().subscribe({
            next: ({ items }) => {
                const sortedItems = [...items].sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );

                const newUpdatedIds = new Set<string>();

                // 初回読み込み時は全てのアイテムをハイライト対象とする
                if (previousUsers.current.length === 0) {
                    sortedItems.forEach((user) => {
                        newUpdatedIds.add(user.id);
                    });
                } else {
                    // 2回目以降は変更があったアイテムのみをハイライト
                    sortedItems.forEach((user) => {
                        if (
                            !previousUsers.current.find(
                                (user) =>
                                    user.id === user.id &&
                                    user.userName === user.userName &&
                                    user.status === user.status
                            )
                        ) {
                            newUpdatedIds.add(user.id);
                        }
                    });
                }

                setUsers(sortedItems);
                setUpdatedIds(newUpdatedIds);
                previousUsers.current = sortedItems;

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
                    {rows.map((row) => (
                        <TableRow key={row.userName}>
                            <TableCell component="th" scope="row">
                                {row.userName}
                            </TableCell>
                            <TableCell align="right">{row.status}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

export default UserList;
