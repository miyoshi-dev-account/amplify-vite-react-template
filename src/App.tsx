import { useTranslation } from 'react-i18next';
import './i18n';
import React, { useState, useEffect, Suspense, useRef } from 'react';
import { AmazonConnectApp, AppContactScope } from "@amazon-connect/app";
import { AgentClient, /*AgentStateChangedEventData,*/ ContactClient } from "@amazon-connect/contact";
import { VoiceClient } from "@amazon-connect/voice";
import { applyConnectTheme } from "@amazon-connect/theme";
//import { loadConfig } from './config';
import loadConfig from './config.ts';

//import { UserList } from './UserList';
import UserList from './UserList.tsx';
import QueueMonitor from './QueueMonitor.tsx';
import type { Schema } from '../amplify/data/resource';
import { generateClient } from 'aws-amplify/data';
import ContactHistory, { ContactRecord } from './ContactHistory';

// Cloudscapeコンポーネントを遅延ロード
const Container = React.lazy(() => import("@cloudscape-design/components/container"));
const Header = React.lazy(() => import("@cloudscape-design/components/header"));
const Tabs = React.lazy(() => import("@cloudscape-design/components/tabs"));
const SpaceBetween = React.lazy(() => import("@cloudscape-design/components/space-between"));
const FormField = React.lazy(() => import("@cloudscape-design/components/form-field"));
const Input = React.lazy(() => import("@cloudscape-design/components/input"));
const Select = React.lazy(() => import("@cloudscape-design/components/select"));
const Button = React.lazy(() => import("@cloudscape-design/components/button"));
const Box = React.lazy(() => import("@cloudscape-design/components/box"));
//const StatusIndicator = React.lazy(() => import("@cloudscape-design/components/status-indicator"));
const Alert = React.lazy(() => import("@cloudscape-design/components/alert"));
const ColumnLayout = React.lazy(() => import("@cloudscape-design/components/column-layout"));

import '@cloudscape-design/global-styles/index.css';
import './App.css';

// グローバル変数としてVoiceClientを保持
let voiceClientInstance: VoiceClient | null = null;

// 追加: initializeAppState用のグローバル変数
let initializeAppState: () => any;

// グローバルで初期化
const connectApp = AmazonConnectApp.init({
  onCreate: async (event) => {
    const { appInstanceId } = event.context;
    console.log('App initialized: ', appInstanceId);
    voiceClientInstance = new VoiceClient();
    applyConnectTheme();

    // 追加: アプリ作成時に初期化処理を行う
    if (initializeAppState) {
      await initializeAppState();
    }
  },
  onDestroy: async (event) => {
    console.log('App being destroyed');
  },
});

// クライアントのインスタンス化
const agentClient = new AgentClient();
const contactClient = new ContactClient();

// クイック接続一覧用
const client = generateClient<Schema>();

/** 型定義の開始 **/
// config.jsonの設定値
interface AppConfig {
  // 文字列のキーに対して文字列の値を返すオブジェクト、かつ省略可能(?)と定義
  version?: string;
  contactSearchUrl?: string;
  maxContactAttributes?: number;
  contactAttributes?: Record<string, string>;
  queueDisplayNames?: Record<string, string>;
  countryCode?: Record<string, string>;
}

// コンタクトのデータ定義
interface ContactData {
  id: string;
  channelType: string;
  phoneNumber: string;
  queueName: string;
  timestamp: string;
}

// エージェントのデータ定義
interface AgentInfoData {
  agentARN: string;
  agentId: string | undefined;
  agentName: string;
  currentState: any; // もし型が明確であれば string などに変更してください
  routingProfile: any; // または AgentRoutingProfile
  timestamp: string;
}

// キューデータ
interface QueueData {
  queueARN: string;
  queueId: string;
  name: string;
  // その他必要なプロパティがあれば追加
}
/** 型定義の終了 **/

function App() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Initializing...');
  const [agentInfo, setAgentInfo] = useState<AgentInfoData | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactData | null>(null);
  const [activeTab, setActiveTab] = useState('outbound');
  const [outboundNumber, setOutboundNumber] = useState('');
  const [outboundStatus, setOutboundStatus] = useState('');
  const [selectedQueueARN, setSelectedQueueARN] = useState('');
  const [availableQueues, setAvailableQueues] = useState<QueueData[]>([]);
  const [countryCode, setCountryCode] = useState('');
  const [phoneNumberWithoutCode, setPhoneNumberWithoutCode] = useState('');
  const [contactAttributes, setContactAttributes] = useState<Record<string, any>>({});
  const [hasActiveContact, setHasActiveContact] = useState(false);

  // クイック接続一覧用
  const [quickConnects, setQuickConnects] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [appSyncUserList, setAppSyncUserList] = useState<Array<Schema['UserList']['type']>>([]);
  const [searchName, setSearchName] = useState<string>('');

  // 通話履歴用
  // 履歴データの初期読み込み
  const [contactHistory, setContactHistory] = useState<ContactRecord[]>(() => {
    try {
      //const savedData = localStorage.getItem('agentContactHistory');
      const savedData = sessionStorage.getItem('agentContactHistory');
      return savedData ? JSON.parse(savedData) : [];
    } catch (error) {
      return [];
    }
  });
  const handledContacts = useRef<Set<string>>(new Set());
  const retainedContactInfo = useRef<ContactData | null>(null);

  // 転送時の通知用
  const [transferNotification, setTransferNotification] = useState<string | null>(null);
  const [transferCustomName, setTransferCustomName] = useState<string>('');
  const notifiedTransferContacts = useRef<Set<string>>(new Set());

  // 発信先通知番号の選択用
  const [fetchedQueues, setFetchedQueues] = useState<any[]>([]);

  const getQueueDisplayName = (queueName: string | undefined) => {
    if (!config?.queueDisplayNames || typeof queueName !== 'string') {
      return null;
    }
    return config.queueDisplayNames[queueName] || queueName;
  };

  const formatPhoneNumber = (countryCode: string, phoneNumber: string) => {
    if (countryCode === '+81' && phoneNumber.startsWith('0')) {
      return `${countryCode}${phoneNumber.substring(1)}`;
    }
    return `${countryCode}${phoneNumber}`;
  };

  // 修正: fetchContactData関数（contactIdをパラメータで受け取る）
  async function fetchContactData(contactId?: string | undefined) {
    try {
      if (!contactId) {
        console.log('[fetchContactData] No contactId provided');
        setContactInfo({
          id: '-',
          channelType: 'No active contact',
          phoneNumber: '-',
          queueName: '-',
          timestamp: new Date().toLocaleString()
        });
        return;
      }

      console.log(`[fetchContactData] Fetching data for contact: ${contactId}`);

      // チャネルタイプを取得
      let type = 'unknown';
      try {
        const channelType = await contactClient.getChannelType(contactId);
        console.log(`[fetchContactData] Raw channel type:`, channelType);

        // チャネルタイプが文字列かオブジェクトかを判定
        if (typeof channelType === 'string') {
          type = channelType;
        } else if (channelType && typeof channelType === 'object') {
          // string型と推論されている状態を解除するため、一度 unknown を経由してアサーションする
          const obj = channelType as unknown as Record<string, any>;
          // オブジェクトの場合、type, name, valueなどのプロパティを確認
          //type = channelType.type || channelType.name || channelType.value || 'unknown';
          type = obj.type || obj.name || obj.value || 'unknown';
        }
        console.log(`[fetchContactData] Parsed contact type: ${type}`);
      } catch (typeError) {
        console.error('[fetchContactData] Error fetching channel type:', typeError);
      }

      let phoneNumber = '-';
      let queueName = '-';

      // キュー情報を取得（VoiceとChat両方で試行）
      try {
        const queueDetails = await contactClient.getQueue(contactId);
        console.log('[fetchContactData] Queue details:', queueDetails);
        queueName = queueDetails?.name || 'N/A';
      } catch (queueError) {
        console.error('[fetchContactData] Error fetching queue:', queueError);
      }

      // 電話番号を取得（複数の方法を試行）
      // 方法1: VoiceClientから取得（AppContactScope.CurrentContactIdを使用）
      if (type === 'voice' && voiceClientInstance) {
        try {
          console.log('[fetchContactData] Attempting to get phone number from VoiceClient with AppContactScope...');
          const voicePhoneNumber = await voiceClientInstance.getPhoneNumber(AppContactScope.CurrentContactId);
          console.log('[fetchContactData] Voice phone number from VoiceClient:', voicePhoneNumber);
          if (voicePhoneNumber) {
            phoneNumber = voicePhoneNumber;
          }
        } catch (voiceError) {
          console.error('[fetchContactData] Error fetching voice phone number:', voiceError);
        }
      } else {
        console.log(`[fetchContactData] Skipping VoiceClient (type: ${type}, voiceClientInstance: ${!!voiceClientInstance})`);
      }

      // 方法2: CustomerEndpoint属性から取得
      if (phoneNumber === 'N/A') {
        try {
          console.log('[fetchContactData] Attempting to get CustomerEndpoint attribute...');
          const phoneAttr = await contactClient.getAttribute(
            contactId,
            'CustomerEndpoint'
          ) as unknown as { value: string } | null;
          console.log('[fetchContactData] CustomerEndpoint attribute:', phoneAttr);
          if (phoneAttr?.value) {
            phoneNumber = phoneAttr.value;
          }
        } catch (attrError) {
          console.error('[fetchContactData] Error fetching CustomerEndpoint attribute:', attrError);
        }
      }

      console.log(`[fetchContactData] Final phone number: ${phoneNumber}`);

      setContactInfo({
        id: contactId,
        channelType: type || 'No active contact',
        phoneNumber: phoneNumber,
        queueName: queueName,
        timestamp: new Date().toLocaleString()
      });
    } catch (error) {
      console.error('[fetchContactData] Error:', error);
      setContactInfo({
        id: '-',
        channelType: 'No active contact',
        phoneNumber: '-',
        queueName: '-',
        timestamp: new Date().toLocaleString()
      });
    }
  }

  // 修正: fetchContactAttributes関数（contactIdをパラメータで受け取る）
  const fetchContactAttributes = async (contactId: string) => {
    try {
      if (!contactId) {
        console.log('[fetchContactAttributes] No contactId provided');
        setContactAttributes({});
        setHasActiveContact(false);
        return;
      }

      console.log(`[fetchContactAttributes] Fetching attributes for contact: ${contactId}`);

      // チャネルタイプを取得
      const type = await contactClient.getChannelType(contactId);
      console.log(`[fetchContactAttributes] Contact type: ${type}`);

      // 属性キーのリストを作成
      const maxAttributes = config?.maxContactAttributes ?? 10;
      const attributeKeys = Array.from(
        //{ length: config.maxContactAttributes },
        { length: maxAttributes },
        (_, i) => `Key${i + 1}`
      );
      console.log('[fetchContactAttributes] Requesting attributes:', attributeKeys);

      // ContactClientのgetAttributesメソッドを使用（contactIdを直接指定）
      const attributes = await contactClient.getAttributes(
        contactId,
        attributeKeys
      );
      console.log(`[${type}] Fetched contact attributes:`, attributes);

      setContactAttributes(attributes || {});
      setHasActiveContact(true);
    } catch (error) {
      console.error('[fetchContactAttributes] Error:', error);
      // error が Error オブジェクトのインスタンスであるかをチェックする
      if (error instanceof Error) {
        // このブロック内では、TypeScriptは error を Error 型として認識します
        console.error('[fetchContactAttributes] Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      } else {
        // Errorオブジェクトではない例外（文字列など）がスローされた場合の処理
        console.error('[fetchContactAttributes] Unknown error details:', String(error));
      }
      setContactAttributes({});
      setHasActiveContact(false);
    }
  };

  async function fetchAgentData() {
    try {
      const arn = await agentClient.getARN();
      const currentState = await agentClient.getState();
      const agentName = await agentClient.getName();
      const routingProfile = await agentClient.getRoutingProfile();

      console.log('Agent data:', {
        currentState,
        agentName,
        routingProfile
      });

      setStatus('Connected');
      setAgentInfo(prevInfo => ({
        agentARN: arn,
        agentId: arn ? arn.split('/').pop() : '-',
        agentName: agentName || '-',
        //currentState: currentState.state?.name || currentState.state?.type || 'Unknown',
        currentState: currentState?.name || currentState?.type || 'Unknown',
        routingProfile: routingProfile,
        timestamp: new Date().toLocaleString()
      }));
    } catch (error) {
      console.error('Error fetching agent data:', error);
      setStatus('Error processing agent info');
    }
  }

  // 追加: initializeAppState関数の定義
  initializeAppState = async () => {
    try {
      // 初期化時はAppContactScopeを使用してcontactIdを取得
      const initialContactId = await contactClient.getInitialContactId(AppContactScope.CurrentContactId);
      const status = await agentClient.getState();

      console.log('[initializeAppState] Initial contact ID:', initialContactId);

      if (initialContactId) {
        const type = await contactClient.getChannelType(initialContactId);
        console.log('[initializeAppState] Current contact type:', type);

        // Voice と Chat 両方に対応
        await fetchContactData(initialContactId);
        await fetchContactAttributes(initialContactId);

        setHasActiveContact(true);

        // ステータスに応じてメッセージを変更するが、コンタクト情報は維持
        if (status.name === 'AfterCallWork') {
          setOutboundStatus('アフターコールワークを終了してください');
        } else {
          // 一律「通話中」に設定
          setOutboundStatus('通話中');
        }
      } else {
        console.log('[initializeAppState] No active contact');
        setContactInfo({
          id: '-',
          channelType: 'No active contact',
          phoneNumber: '-',
          queueName: '-',
          timestamp: new Date().toLocaleString()
        });
        setContactAttributes({});
        setHasActiveContact(false);
        setOutboundStatus('');
      }
    } catch (error) {
      console.error('[initializeAppState] Error:', error);
      // error が Error オブジェクトのインスタンスであるかをチェックする
      if (error instanceof Error) {
        // このブロック内では、TypeScriptは error を Error 型として認識します
        console.error('[fetchContactAttributes] Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      } else {
        // Errorオブジェクトではない例外（文字列など）がスローされた場合の処理
        console.error('[fetchContactAttributes] Unknown error details:', String(error));
      }
      setContactInfo({
        id: '-',
        channelType: 'No active contact',
        phoneNumber: '-',
        queueName: '-',
        timestamp: new Date().toLocaleString()
      });
      setContactAttributes({});
      setHasActiveContact(false);
      setOutboundStatus('');
    }
  };

  const handleOutboundCall = async () => {
    if (!voiceClientInstance) {
      setOutboundStatus('システムの初期化中です。しばらくお待ちください。');
      return;
    }

    if (!phoneNumberWithoutCode) {
      setOutboundStatus('電話番号を入力してください');
      return;
    }

    if (!selectedQueueARN) {
      setOutboundStatus('発信キューを選択してください');
      return;
    }

    const formattedNumber = formatPhoneNumber(countryCode, phoneNumberWithoutCode);
    const phoneNumberPattern = /^\+[1-9]\d{1,14}$/;

    if (!phoneNumberPattern.test(formattedNumber)) {
      setOutboundStatus('電話番号が正しい形式ではありません');
      return;
    }

    try {
      const permission = await voiceClientInstance.getOutboundCallPermission();
      if (permission === false) {
        setOutboundStatus('発信できません: 発信権限がありません');
        return;
      }

      //if (status.name === 'Busy') {
      if (status === 'Busy') {
        setOutboundStatus('通話中');
      } else {
        setOutboundStatus('');
      }

      console.log('Making outbound call to:', formattedNumber);
      const outboundCallResult = await voiceClientInstance.createOutboundCall(formattedNumber, {
        queueARN: selectedQueueARN
      });

      setPhoneNumberWithoutCode('');
    } catch (error) {
      console.error('Outbound call error:', error);

      // error が Error オブジェクトのインスタンスであるかをチェックする
      if (error instanceof Error) {
        if (error.message.includes('requestNotAuthorized')) {
          setOutboundStatus('発信権限エラー: アプリケーション統合で Contact.Details.Edit 権限を有効にしてください。');
        } else {
          setOutboundStatus(`発信エラー: ${error.message}`);
        }
      } else {
        // Errorオブジェクトではない例外（文字列など）がスローされた場合の処理
        console.error('[fetchContactAttributes] Unknown error details:', String(error));
      }
    }
  };

  const stateChangeHandler = async (data: any) => {
    try {
      const currentState = await agentClient.getState();
      setAgentInfo(prevInfo => {
        // prevInfo が null の場合は更新をスキップ（または初期状態を返す）ことで
        // 必須プロパティの欠落エラーを防ぐ
        if (!prevInfo) {
          return null;
        }

        // prevInfo が AgentInfoData であることが確定するため、エラーなくスプレッド展開できる
        return {
          ...prevInfo,
          //currentState: currentState.state?.name || 'Unknown',
          currentState: currentState?.name || 'Unknown',
          timestamp: new Date().toLocaleString()
        };
      });
    } catch (error) {
      console.error('State change error:', error);
    }
  };

  // クイック接続一覧用
  const updateAttributesViaBackend = async (contactId: string, customName: string, queueName: string) => {
    try {
      // ※ instanceId は Connect の ARN や設定から取得してください
      //const connectInstanceId = "5c9f7d3e-d54b-4d4c-aec6-ccd7308dc833";

      const response = await client.queries.updateContactAttributes({
        //instanceId: connectInstanceId,
        contactId: contactId,
        customName: customName,
        queueName: queueName
      });

      if (response.data?.success) {
        console.log(response.data.message);
      }
    } catch (error) {
      console.error("バックエンドAPIの呼び出しに失敗しました:", error);
      throw error;
    }
  };

  // クイック接続一覧用
  const handleTransfer = async (qc: any) => {
    //const handleTransfer = async (qc: any, customName: string) => {  
    try {
      // 転送対象となるアクティブなコンタクトIDが必要です
      if (!contactInfo.id) {
        console.warn("転送対象のコンタクトが見つかりません。");
        return;
      }

      const nameToSet = transferCustomName.trim() !== '' ? transferCustomName.trim() : "担当者";

      // 転送を実行する前に、Lambda経由でコンタクト属性に名前をセットする
      if (
        contactInfo.queueName &&
        contactInfo.queueName !== '' &&
        contactInfo.queueName !== 'N/A' &&
        contactInfo.queueName !== '-'
      ) {
        await updateAttributesViaBackend(contactInfo.id, nameToSet, contactInfo.queueName);
      } else {
        // エージェント指定の転送の場合、コンタクト属性からキュー名を取得して指定
        const transAttributes = await contactClient.getAttributes(contactInfo.id, ["TransferQueueName"]);
        const queueNameAttr = transAttributes?.TransferQueueName as any;
        const queueName = queueNameAttr?.value || queueNameAttr || '不明';
        await updateAttributesViaBackend(contactInfo.id, nameToSet, queueName);
      }

      // 転送通知用のフラグを設定
      notifiedTransferContacts.current.add(contactInfo.id);

      // Agent Workspace SDK の transfer API を呼び出し [2]
      await contactClient.addParticipant( // transferはコールド転送のため、addParticipantを利用する
        contactInfo.id, // 現在のコンタクトID
        qc // listQuickConnects で取得したオブジェクトをそのまま渡す
      );

      console.log(`転送処理に成功しました: ${qc.name}`);

      // 必要に応じて画面上の状態リセットや通知処理を追加
    } catch (error) {
      console.error("転送処理に失敗しました:", error);
    }
  };

  // クイック接続一覧用
  const filteredQuickConnects = quickConnects.filter((qc) => {
    // 検索文字列が入力されている場合、クイック接続名に含まれていなければ除外（大文字小文字を区別しない）
    if (searchName && !qc.name.toLowerCase().includes(searchName.toLowerCase())) {
      return false;
    }

    // 'ALL' の場合はすべて表示
    if (filterType === 'ALL') return true;

    // SDKのレスポンス仕様に合わせて種類を判定
    return qc.type === filterType || qc.quickConnectType === filterType;
  });

  // 通話履歴用
  // リダイヤル発信処理
  const handleRedial = async (phoneNumber: string) => {
    try {
      // 💡 VoiceClient の createOutboundCall API で発信する [1]
      // 引数のフォーマット（オブジェクトか文字列か）は環境に合わせて調整してください
      await voiceClientInstance.createOutboundCall(phoneNumber);
      console.log(`${phoneNumber} へ発信しました`);
    } catch (error) {
      console.error("発信に失敗しました:", error);
    }
  };

  // 電話番号の表示形式を変換する関数
  const formatDisplayPhoneNumber = (phoneNumber: string | null | undefined) => {
    if (!phoneNumber || phoneNumber === '不明') return phoneNumber;

    // '+81' で始まる日本の電話番号の場合
    if (phoneNumber.startsWith('+81')) {
      const localNumber = '0' + phoneNumber.slice(3);

      if (localNumber.length === 11) {
        return localNumber.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
      } else if (localNumber.length === 10) {
        if (localNumber.startsWith('03') || localNumber.startsWith('06')) {
          return localNumber.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
        } else {
          return localNumber.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
        }
      }
      return localNumber;
    }

    // ==========================================
    // 💡 追加: '+1' で始まる米国の電話番号の場合
    // ==========================================
    if (phoneNumber.startsWith('+1')) {
      // '+1' を除いたローカル番号部分を取得 (+18774295743 -> 8774295743)
      const localNumber = phoneNumber.slice(2);

      // 米国の電話番号（10桁）の場合: 3桁-3桁-4桁 に変換
      if (localNumber.length === 10) {
        return `+1 ${localNumber.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')}`;
      }

      // 10桁以外の場合は、ハイフンなしでそのまま返す
      return phoneNumber;
    }

    // +81, +1 以外（海外の番号や内線など）はそのまま返す
    return phoneNumber;
  };

  useEffect(() => {
    loadConfig().then(configData => {
      console.log('Config loaded:', configData);
      setConfig(configData);
      setCountryCode(configData.countryCode[0]?.value || '+81');
      setLoading(false);
    }).catch(error => {
      console.error('Failed to load config:', error);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!config) return;

    const initialize = async () => {
      await initializeAppState();
      await fetchAgentData();
    };

    initialize();

    //const agentSubscription = agentClient.onStateChanged(stateChangeHandler);
    const agentSubscription = agentClient.onStateChanged(stateChangeHandler) as unknown as { unsubscribe: () => void };

    const contactHandler = async () => {
      await fetchContactData();
      await fetchAgentData();
    };

    const onConnectedHandler = async (data: { contactId: any; }) => {
      console.log('[onConnected] Contact connected event fired, data:', data);
      const contactId = data?.contactId;

      if (!contactId) {
        console.error('[onConnected] No contactId in event data');
        return;
      }

      console.log('[onConnected] Contact ID:', contactId);

      // ステータスを一律「通話中」に設定
      setOutboundStatus('通話中');

      // コンタクト情報を取得
      await fetchContactData(contactId);
      await fetchAgentData();

      // コンタクト属性を取得
      await fetchContactAttributes(contactId);
    };

    const onDestroyedHandler = async (data: { contactId: any; }) => {
      console.log('[onDestroyed] Contact destroyed event fired, data:', data);
      const contactId = data?.contactId;

      if (contactId) {
        await fetchContactData(contactId);
        await fetchAgentData();
      }

      setContactAttributes({});
      setHasActiveContact(false);
      setOutboundStatus('');
    };

    const onStartingAcwHandler = async (data: { contactId: any; }) => {
      console.log('[onStartingAcw] Starting ACW event fired, data:', data);
      const contactId = data?.contactId;

      if (contactId) {
        await fetchContactData(contactId);
        await fetchAgentData();
      }

      setOutboundStatus('アフターコールワークを終了してください');
    };

    contactClient.onConnected(onConnectedHandler);
    contactClient.onStartingAcw(onStartingAcwHandler);
    contactClient.onDestroyed(onDestroyedHandler);

    return () => {
      if (agentSubscription?.unsubscribe) {
        agentSubscription.unsubscribe();
      }
    };
  }, [config]);

  useEffect(() => {
    if (agentInfo?.routingProfile?.queues) {
      setAvailableQueues(agentInfo.routingProfile.queues.filter((queue: QueueData) => queue.name));
      if (agentInfo.routingProfile.queues.length > 0) {
        setSelectedQueueARN(agentInfo.routingProfile.queues[0].queueARN);
      }
    }
  }, [agentInfo]);

  // クイック接続一覧用
  useEffect(() => {
    if (!selectedQueueARN) {
      setQuickConnects([]);
      return;
    }

    const fetchQuickConnects = async () => {
      try {
        // Amazon Connect Agent Workspace SDK の API を使用してクイック接続を取得
        const response = await agentClient.listQuickConnects([selectedQueueARN]);

        // 取得成功時、レスポンス内の quickConnects 配列をステートにセット [2]
        setQuickConnects(response.quickConnects || []);

        // ※ もし500件以上あり、次ページがある場合は response.nextToken が返ります [2]

      } catch (error) {
        console.error("クイック接続の取得に失敗しました:", error);
        setQuickConnects([]);
      }
    };

    fetchQuickConnects();
  }, [selectedQueueARN]);

  // クイック接続一覧用
  useEffect(() => {
    const subscription = client.models.UserList.observeQuery().subscribe({
      next: (data) => {
        // UserList テーブルに変更があるたびにステートが最新化されます
        setAppSyncUserList([...data.items]);
      },
      error: (error) => console.error("UserListの監視エラー:", error)
    });
    return () => subscription.unsubscribe();
  }, []);

  // 通話履歴用
  useEffect(() => {
    // ストレージの変更を監視し、即座に画面を再描画する処理を追加
    // 別の画面（iframe）で localStorage が更新されたことを検知する処理
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'agentContactHistory' && e.newValue) {
        setContactHistory(JSON.parse(e.newValue));
      }
    };

    // 同一の画面内でカスタムイベントが発火した際の処理
    const handleLocalUpdate = () => {
      //const savedData = localStorage.getItem('agentContactHistory');
      const savedData = sessionStorage.getItem('agentContactHistory');
      if (savedData) {
        setContactHistory(JSON.parse(savedData));
      }
    };

    // リスナーの登録
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('historyUpdated', handleLocalUpdate);

    // クリーンアップ
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('historyUpdated', handleLocalUpdate);
    };
  }, []);

  // 通話履歴用
  useEffect(() => {
    console.error("------ contactInfoが更新されました（通話履歴用） ------");
    console.error(contactInfo); //着信時点だと空
    if (
      contactInfo &&
      contactInfo.queueName && contactInfo.queueName !== '-' &&
      contactInfo.phoneNumber && contactInfo.phoneNumber !== '-'
    ) {
      retainedContactInfo.current = contactInfo;
      console.log("最新のコンタクト情報を retainedContactInfo に保持しました", contactInfo);
    }
  }, [contactInfo]);

  // 通話履歴用
  useEffect(() => {
    if (!contactClient) return;

    // コンタクトが繋がった「開始時間」をストレージに一時保存する
    const setStartTime = (cId: string) => {
      //const times = JSON.parse(localStorage.getItem('contactStartTimes') || '{}');
      const times = JSON.parse(sessionStorage.getItem('contactStartTimes') || '{}');
      times[cId] = Date.now();
      //localStorage.setItem('contactStartTimes', JSON.stringify(times));
      sessionStorage.setItem('contactStartTimes', JSON.stringify(times));
    };

    // 開始時間から通話時間を計算し、一時保存をクリアする
    const getStartTimeAndDuration = (cId: string) => {
      //const times = JSON.parse(localStorage.getItem('contactStartTimes') || '{}');
      const times = JSON.parse(sessionStorage.getItem('contactStartTimes') || '{}');
      const startMs = times[cId];
      if (!startMs) return { startTime: '不明', duration: '00:00' };

      const startObj = new Date(startMs);
      const durationSeconds = Math.floor((Date.now() - startMs) / 1000);
      const m = String(Math.floor(durationSeconds / 60)).padStart(2, '0');
      const s = String(durationSeconds % 60).padStart(2, '0');

      delete times[cId];
      //localStorage.setItem('contactStartTimes', JSON.stringify(times));
      sessionStorage.setItem('contactStartTimes', JSON.stringify(times));
      return { startTime: startObj.toLocaleTimeString(), duration: `${m}:${s}` };
    };

    // 📌 ヘルパー: 履歴保存の共通処理
    const handleSaveHistory = async (contactData: any, isMissed: boolean) => {
      console.log("---------- Get contactData ----------");
      console.log(contactData);
      console.log("---------- Get contactInfo ----------");
      console.log(contactInfo);
      const contactId = contactData.contactId || 'unknown-id';

      // 各種情報の初期化
      let queueName = contactData.queue?.name || '不明';
      let phoneNumber = contactData.customerEndpoint || contactData.phoneNumber || '不明';
      let typeStr = '';
      let isIncomingContact = true; // デフォルトを着信として扱う
      let startTime = new Date().toLocaleTimeString();
      let duration = '00:00';

      if (
        retainedContactInfo.current &&
        retainedContactInfo.current.queueName && retainedContactInfo.current.queueName !== '-' &&
        retainedContactInfo.current.phoneNumber && retainedContactInfo.current.phoneNumber !== '-'
      ) {
        queueName = retainedContactInfo.current.queueName;
        phoneNumber = retainedContactInfo.current.phoneNumber;
      }

      if (!isMissed) {
        // キュー名の取得
        try {
          const queue = await contactClient.getQueue(contactId);
          queueName = queue?.name || contactData.queue?.name || '不明';
          if (queueName === '不明') {
            // 転送通話の場合、キューを取得できないのでコンタクト属性から取得
            const transAttributes = await contactClient.getAttributes(contactData.contactId, ["TransferQueueName"]);
            const queueNameAttr = transAttributes?.TransferQueueName as any;
            queueName = queueNameAttr?.value || queueNameAttr || '不明';
          }
        } catch (e) {
          console.warn("キュー名の取得に失敗しました", e);
          queueName = contactData.queue?.name || '不明';
        }

        // 電話番号の取得
        try {
          // VoiceClientから初期顧客電話番号を取得するAPIを利用 [1]
          const initialPhone = await voiceClientInstance.getInitialCustomerPhoneNumber(contactId);
          phoneNumber = initialPhone || contactData.customerEndpoint || contactData.phoneNumber || '不明';
        } catch (e) {
          console.warn("顧客電話番号の取得に失敗しました", e);
          phoneNumber = contactData.customerEndpoint || contactData.phoneNumber || '不明';
        }

        // 着信・発信の判定
        try {
          // コンタクトに関連するすべての参加者リストを取得する
          const participants = await contactClient.listParticipants(contactId);

          // 参加者の中に type.value が "inbound" の人がいれば「着信」と判定する
          isIncomingContact = participants.some((participant: any) =>
            participant.type?.value === 'inbound'
          );

        } catch (e) {
          console.warn("参加者情報の取得に失敗しました", e);
          // エラー等で取得できなかった場合は、安全のため不在着信/着信をフォールバックとする
          typeStr = isMissed ? '不在着信' : '着信';
        }

        // 通話時間と開始時間の計算
        try {
          const timeData = getStartTimeAndDuration(contactId);
          startTime = timeData?.startTime || startTime;
          duration = timeData?.duration || duration;
        } catch (e) {
          console.warn("時間情報の取得に失敗しました（すでにコンタクトが切断されている可能性があります）", e);
        }
      }

      if (isMissed) {
        typeStr = isIncomingContact ? '不在着信' : '不在発信';
      } else {
        typeStr = isIncomingContact ? '着信' : '発信';
      }

      const newRecord: ContactRecord = {
        contactId,
        type: typeStr,
        queueName,
        phoneNumber,
        startTime: startTime === '不明' && isMissed ? new Date().toLocaleTimeString() : startTime,
        duration: isMissed ? '00:00' : duration,
        endTime: new Date().toLocaleTimeString(),
      };
      console.log("追加するレコード：", newRecord);

      // ストレージへ即時保存してState更新
      //const savedData = localStorage.getItem('agentContactHistory');
      const savedData = sessionStorage.getItem('agentContactHistory');
      const currentHistory: ContactRecord[] = savedData ? JSON.parse(savedData) : [];

      if (!currentHistory.some(record => record.contactId === contactId)) {
        const updatedHistory = [newRecord, ...currentHistory];
        //localStorage.setItem('agentContactHistory', JSON.stringify(updatedHistory));
        sessionStorage.setItem('agentContactHistory', JSON.stringify(updatedHistory));
        setContactHistory(updatedHistory);
      }
    };

    // ==========================================
    // イベント監視の設定
    // ==========================================
    const onConnectedHandler = async (data: any) => {
      const contactId = data?.contactId;
      if (contactId) {
        // 応答したコンタクトを処理済みとしてマークする
        handledContacts.current.add(contactId);
      }
      await setStartTime(data.contactId);
    };

    const onAcwHandler = (data: any) => handleSaveHistory(data, false);

    const onMissedHandler = async (data: any) => {
      const contactId = data?.contactId;
      const initialContactId = data?.initialContactId;
      if (!contactId || !initialContactId || handledContacts.current.has(contactId)) return;
      handledContacts.current.add(contactId); // 通話履歴の重複保存防止

      try {
        console.log("onMissed から handleSaveHistory を実行します");
        console.log("コンタクトID", contactId);
        console.log("転送元コンタクトID", initialContactId);
        await handleSaveHistory(data, true);

        // await を使わず、.then() で非同期に処理を受け取ります
        if (contactId !== initialContactId) {
          client.queries.getContactInfo({
            contactId: contactId,
          }).then((response: any) => {
            const contactInfo = response.data;

            if (contactInfo?.success) {
              console.log("バックエンドから情報取得成功、履歴を更新します:", contactInfo);

              // 既存の履歴Stateをループし、該当の contactId のレコードの「不明」を上書きする
              setContactHistory((prevHistory) => {
                const updatedHistory = prevHistory.map(record => {
                  if (record.contactId === contactId) {
                    let updatedType = record.type;
                    let updateQueueName = record.queueName;

                    if (contactInfo.initiationMethod === 'OUTBOUND') {
                      // 暫定で「着信」系になっていたものを「発信」系に修正
                      updatedType = record.type === '不在着信' ? '不在発信' : (record.type === '着信' ? '発信' : record.type);
                    } else if (contactInfo.initiationMethod === 'INBOUND') {
                      updatedType = record.type === '不在発信' ? '不在着信' : (record.type === '発信' ? '着信' : record.type);
                    }

                    // 転送した場合か確認
                    if (contactInfo.transferQueueName && contactInfo.transferQueueName !== '不明') {
                      updateQueueName = contactInfo.transferQueueName;
                    } else {
                      updateQueueName = contactInfo.queueName;
                    }

                    return {
                      ...record,
                      // Lambdaから取得できた場合のみ上書き
                      //queueName: contactInfo.transferQueueName !== '不明' ? contactInfo.transferQueueName : record.queueName,
                      queueName: updateQueueName,
                      phoneNumber: contactInfo.phoneNumber !== '不明' ? contactInfo.phoneNumber : record.phoneNumber,
                      type: updatedType,
                    };
                  }
                  return record;
                });

                // localStorage にも最新状態を上書き保存
                localStorage.setItem('agentContactHistory', JSON.stringify(updatedHistory));
                return updatedHistory;
              });
            }
          }).catch((error: any) => {
            // 処理中に画面が破棄されてエラーになっても、既に履歴は作成されているので影響なし
            console.warn("バックエンドからの情報取得が中断されました:", error);
          });
        }

        /*
        if (
          contactId && initialContactId &&
          initialContactId !== '-' && initialContactId !== 'unknown-id' &&
          contactId !== '-' && contactId !== 'unknown-id'
        ) {
          // 転送通話か確認
          if (contactId !== initialContactId) {
            // 転送通話の場合
            // 転送元コンタクトIDの参照
            const responseCurrent = await client.queries.getContactInfo({
              instanceId: connectInstanceId,
              contactId: initialContactId,
            });
            console.log("転送元コンタクト情報:", initialContactId);
            console.log(responseCurrent);
          } else {
            // 転送通話ではない場合
            // 転送先コンタクトIDの参照
            const responseTrans = await client.queries.getContactInfo({
              instanceId: connectInstanceId,
              contactId: contactId,
            });
            console.log("転送先コンタクト情報:", contactId);
            console.log(responseTrans);
          }

        }
        */
        console.log("onMissed からの履歴保存処理が完了しました");
      } catch (e) {
        console.warn("コンタクト情報の参照APIエラー", e);
      }

      /*
      try {
        console.log("onMissed から handleSaveHistory を実行します");
        // 💡 確実に isMissed = true として履歴保存を実行する
        await handleSaveHistory(data, true);
        console.log("onMissed からの履歴保存処理が完了しました");
      } catch (error) {
        // 💡 もし handleSaveHistory の内部でエラーが起きていれば、ここでキャッチして赤文字で表示する
        console.error("履歴保存中に予期せぬエラーが発生しました:", error);
      }
      */
    };

    // ログアウトまたはオフライン検知時のリセット処理 →　動いていないので要修正
    const onStateChangedHandler = async (stateData: any) => {
      // エージェントの状態が「Offline」等（ログアウト時）になったら履歴をクリア
      if (stateData.name === 'Offline' || stateData.type === 'offline') {
        localStorage.removeItem('agentContactHistory');
        sessionStorage.removeItem('agentContactHistory');
        localStorage.removeItem('contactStartTimes');
        sessionStorage.removeItem('contactStartTimes');
        setContactHistory([]);
      }
    };

    contactClient.onConnected(onConnectedHandler);
    contactClient.onStartingAcw(onAcwHandler);
    contactClient.onMissed(onMissedHandler);
    agentClient.onStateChanged(onStateChangedHandler);

    // クリーンアップ
    return () => {
      if (typeof contactClient.offConnected === 'function') contactClient.offConnected(onConnectedHandler);
      if (typeof contactClient.offStartingAcw === 'function') contactClient.offStartingAcw(onAcwHandler);
      if (typeof contactClient.offMissed === 'function') contactClient.offMissed(onMissedHandler);
      if (typeof agentClient.offStateChanged === 'function') agentClient.offStateChanged(onStateChangedHandler);
    };
  }, []);

  // 通話履歴用(転送時の不在着信の対策)
  useEffect(() => {
    // 💡 対策1: 通話履歴タブが選択された時のみ実行するように条件を追加
    if (activeTab !== 'history') return;

    const recoverIncompleteHistory = async () => {
      // 💡 対策2: localStorage ではなく sessionStorage を参照する
      const savedData = sessionStorage.getItem('agentContactHistory');
      if (!savedData) return;

      const currentHistory: ContactRecord[] = JSON.parse(savedData);

      // queueName または phoneNumber が「不明」のままのレコードを抽出
      const incompleteRecords = currentHistory.filter(
        record => record.queueName === '不明' || record.phoneNumber === '不明' ||
          record.queueName === '' || record.phoneNumber === ''
      );

      if (incompleteRecords.length === 0) return;

      console.log(`${incompleteRecords.length}件の不明な履歴のリカバリを開始します...`);

      let isUpdated = false;
      let updatedHistory = [...currentHistory];

      for (const record of incompleteRecords) {
        try {
          // Lambda経由でコンタクト情報を再取得
          const response = await client.queries.getContactInfo({
            contactId: record.contactId,
          });
          const contactInfo = response.data;

          if (contactInfo?.success) {
            updatedHistory = updatedHistory.map(r => {
              if (r.contactId === record.contactId) {
                let updatedType = r.type;
                let updateQueueName = r.queueName;

                if (contactInfo.initiationMethod === 'OUTBOUND') {
                  // 暫定で「着信」系になっていたものを「発信」系に修正
                  updatedType = record.type === '不在着信' ? '不在発信' : (record.type === '着信' ? '発信' : r.type);
                } else if (contactInfo.initiationMethod === 'INBOUND') {
                  updatedType = record.type === '不在発信' ? '不在着信' : (record.type === '発信' ? '着信' : r.type);
                }

                // 転送した場合か確認
                if (contactInfo.transferQueueName && contactInfo.transferQueueName !== '不明') {
                  updateQueueName = contactInfo.transferQueueName;
                } else {
                  updateQueueName = contactInfo.queueName;
                }

                return {
                  ...r,
                  //queueName: contactInfo.queueName !== '不明' ? contactInfo.queueName : r.queueName,
                  queueName: updateQueueName,
                  phoneNumber: contactInfo.phoneNumber !== '不明' ? contactInfo.phoneNumber : r.phoneNumber,
                  type: updatedType,
                };
              }
              return r;
            });
            isUpdated = true;
          }
        } catch (error) {
          console.warn(`コンタクトID ${record.contactId} のリカバリに失敗しました:`, error);
        }
      }

      // 1件でも更新があれば、StateとSessionStorageを上書き保存
      if (isUpdated) {
        console.log("履歴のリカバリが完了し、データを更新しました。");
        setContactHistory(updatedHistory);
        sessionStorage.setItem('agentContactHistory', JSON.stringify(updatedHistory)); // 💡 ここも sessionStorage に変更
      }
    };

    recoverIncompleteHistory();

    // 対策3: 依存配列に activeTab を入れ、タブが切り替わるたびにこの useEffect を評価させる
  }, [activeTab]);

  // 転送時の通知用 ※削除予定
  useEffect(() => {
    if (
      contactInfo &&
      contactInfo.id && contactInfo.id !== '-' &&
      contactInfo.phoneNumber && contactInfo.phoneNumber !== '-'// &&
      //contactInfo.queueName && contactInfo.queueName == '-'
    ) {
      // 通知済みか確認
      if (notifiedTransferContacts.current.has(contactInfo.id)) {
        return;
      }

      const fetchAttributes = async () => {
        if (
          contactInfo &&
          contactInfo.id && contactInfo.id !== '-' &&
          contactInfo.phoneNumber && contactInfo.phoneNumber !== '-'
        ) {
          try {
            // 💡 修正: 過去の仕様に合わせ、引数をオブジェクト形式にし、(contactClient as any) を使用
            const attributes = await contactClient.getAttributes(contactInfo.id, ["TransferCustomName"]);

            console.log(attributes);
            const transferName = (attributes?.TransferCustomName as any)?.value || attributes?.TransferCustomName;

            if (transferName) {
              // 通知メッセージをStateにセットして画面に表示させる
              setTransferNotification(`🔔 ${transferName} さんからの転送通話です`);

              // 切断時に通知されないようにコンタクトIDを登録
              notifiedTransferContacts.current.add(contactInfo.id);

              // 10秒後 (10000ミリ秒後) に自動的に通知を消す
              setTimeout(() => {
                setTransferNotification(null);
              }, 10000);
            } else {
              console.log("転送先に通知する名前が設定されていませんでした");
              return;
            }

          } catch (e) {
            console.error("転送先通知処理にてエラーが発生しました", e);
          }
        }
      };
      fetchAttributes();
    } else {
      console.error("------ contactInfoが更新されました（転送先通知用） ------");
      console.error(contactInfo); //着信時点だと空
      console.error(AppContactScope.CurrentContactId); //着信時点だと空

      const eFetchAttributes = async () => {
        try {
          // 転送元で設定したコンタクト属性を取得
          const initialContactId = await contactClient.getInitialContactId(AppContactScope.CurrentContactId);
          console.error(initialContactId);
          const contacts = await contactClient.listContacts();
          console.log(`Active contacts: ${contacts.length}`);
          contacts.forEach((contact) => {
            console.log(`Contact ${contact.contactId}: ${contact.type}`);
          });

          /*
          // 転送元で設定したコンタクト属性を取得
          const attributes = await contactClient.getAttributes(contactId, ["TransferCustomName"]);

          console.log(attributes);
          const transferName = (attributes?.TransferCustomName as any)?.value || attributes?.TransferCustomName;

          if (transferName) {
            // 通知メッセージをStateにセットして画面に表示させる
            setTransferNotification(`🔔 ${transferName} さんからの転送通話です`);

            // 切断時に通知されないようにコンタクトIDを登録
            notifiedTransferContacts.current.add(contactInfo.id);

            // 10秒後 (10000ミリ秒後) に自動的に通知を消す
            setTimeout(() => {
              setTransferNotification(null);
            }, 10000);
          } else {
            console.log("転送先に通知する名前が設定されていませんでした");
            return;
          }
            */

        } catch (e) {
          console.error("転送先通知処理にてエラーが発生しました", e);
        }
      };
      eFetchAttributes();
    }

  }, [contactInfo]);

  // 発信先通知番号の選択用
  useEffect(() => {
    const loadQueues = async () => {
      try {
        const response = await client.queries.searchQueues();

        if (response.data?.success) {
          const parsedQueues = JSON.parse(response.data.queues || "[]");
          setFetchedQueues(parsedQueues);
          console.log("キュー一覧を取得しました:", parsedQueues);
        }
      } catch (error) {
        console.error("キュー一覧の取得に失敗しました:", error);
      }
    };

    loadQueues();
  }, []);

  if (loading || !config) {
    return <div>{t('common.config.loadingMessage')}</div>;
  }

  const renderHeader = () => (
    <Suspense fallback={<div>{t('common.header.loadingMessage')}</div>}>
      <Header
        variant="h1"
        description={`Status: ${status} | Version: ${config?.version || 'N/A'}`}
      >
      </Header>
    </Suspense>
  );

  const renderContactInfo = () => (
    <Suspense fallback={<div>{t('contact.info.loadingMessage')}</div>}>
      <ColumnLayout columns={2} variant="text-grid">
        <div>
          <Box variant="awsui-key-label">
            <Box fontWeight="bold">コンタクトID</Box>
          </Box>
          <Box variant="p">{contactInfo?.id || '-'}</Box>
        </div>
        <div>
          <Box variant="awsui-key-label">
            <Box fontWeight="bold">キュー名</Box>
          </Box>
          <Box variant="p">{contactInfo?.queueName || '-'}</Box>
        </div>
        <div>
          <Box variant="awsui-key-label">
            <Box fontWeight="bold">電話番号</Box>
          </Box>
          <Box variant="p">{contactInfo?.phoneNumber || '-'}</Box>
        </div>
        <div>
          <Box variant="awsui-key-label">
            <Box fontWeight="bold">更新日時</Box>
          </Box>
          <Box variant="p">{contactInfo?.timestamp || '-'}</Box>
        </div>
      </ColumnLayout>
    </Suspense>
  );

  const renderOutboundTab = () => {
    const countryOptions = config ? Object.entries(config?.countryCode ?? {}).map(([label, value]) => ({
      label,
      value
    })) : [];

    return (
      <Suspense fallback={<div>{t('tab.outbound.loadingMessage')}</div>}>
        <Container>
          <SpaceBetween size="l">
            <FormField label="発信キュー(発信者ID番号)">
              <Select
                selectedOption={
                  availableQueues.find(q => q.queueARN === selectedQueueARN)
                    ? {
                      label: (() => {
                        const queue = availableQueues.find(q => q.queueARN === selectedQueueARN);
                        if (!queue) return '';

                        // fetchedQueues の中から、該当するキューの付加情報（発信者名）を探す
                        const fetchedQueue = fetchedQueues.find(fq => fq.queueARN === queue.queueARN);

                        return fetchedQueue?.outboundCallerName
                          ? `${queue.name} (${formatDisplayPhoneNumber(fetchedQueue.outboundCallerName)})`
                          : queue.name;
                      })(),
                      value: selectedQueueARN
                    }
                    : null
                }
                onChange={({ detail }) => setSelectedQueueARN(detail.selectedOption.value ?? '')}

                // availableQueues をベースにして選択肢を作り、表示名だけ fetchedQueues から補完する
                options={availableQueues.map(queue => {
                  const fetchedQueue = fetchedQueues.find(fq => fq.queueARN === queue.queueARN);
                  return {
                    label: fetchedQueue?.outboundCallerName
                      ? `${queue.name} (${formatDisplayPhoneNumber(fetchedQueue.outboundCallerName)})`
                      : queue.name,
                    value: queue.queueARN
                  };
                })}
              />
            </FormField>

            <FormField label="発信先電話番号">
              <div className="phone-number-container">
                <Select
                  selectedOption={countryOptions.find(option => option.value === countryCode) ?? null}
                  onChange={({ detail }) => setCountryCode(detail.selectedOption.value ?? '')}
                  options={countryOptions}
                  className="country-code-select"
                />
                <Input
                  value={phoneNumberWithoutCode}
                  onChange={({ detail }) => setPhoneNumberWithoutCode(detail.value)}
                  placeholder="電話番号を入力してください"
                  className="phone-number-input"
                />
                <Button
                  variant="primary"
                  onClick={handleOutboundCall}
                  disabled={!phoneNumberWithoutCode || !selectedQueueARN || !voiceClientInstance}
                >
                  発信
                </Button>
              </div>
            </FormField>

            {outboundStatus && (
              <Alert type={outboundStatus.includes('エラー') ? 'error' : 'success'}>
                {outboundStatus}
              </Alert>
            )}
          </SpaceBetween>
        </Container>
      </Suspense>
    );
  };

  const renderContactAttribute = (key: React.Key | null | undefined) => {
    // 対策1: keyが文字列(string)でない場合は早期リターンする（型ガード）
    // これにより、以降の処理ではTypeScriptが key を確実に「string型」として認識します
    if (typeof key !== 'string') {
      return null;
    }

    const allowedKeys = Object.keys(config?.contactAttributes || {});
    if (!allowedKeys.includes(key)) {
      return null;
    }

    return (
      <div key={key}>
        <Box variant="awsui-key-label">
          <Box fontWeight="bold">{config?.contactAttributes?.[key]}</Box>
        </Box>
        <Box variant="p">{contactAttributes[key]?.value || '-'}</Box>
      </div>
    );
  };

  const renderAttributesTab = () => (
    <Suspense fallback={<div>{t('tab.attribute.loadingMessage')}</div>}>
      <Container>
        {hasActiveContact && config ? (
          <SpaceBetween size="l">
            <ColumnLayout columns={2} variant="text-grid">
              {Object.keys(config?.contactAttributes || {}).map(renderContactAttribute)}
            </ColumnLayout>
          </SpaceBetween>
        ) : (
          <Alert type="info">
            通話が確立されると、コンタクト属性が表示されます。
          </Alert>
        )}
      </Container>
    </Suspense>
  );

  const renderUserListTab = () => {
    return (
      <Suspense fallback={<div>{t('tab.userList.loadingMessage')}</div>}>
        <Container>
          <SpaceBetween size="l">
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
              {/* 転送時の通知名 入力欄 */}
              <div style={{ /*marginBottom: '16px', */display: 'flex', alignItems: 'center' }}>
                <label htmlFor="customNameInput" style={{ marginRight: '8px', fontWeight: 'bold' }}>
                  転送時の通知名:
                </label>
                <input
                  id="customNameInput"
                  type="text"
                  value={transferCustomName}
                  onChange={(e) => setTransferCustomName(e.target.value)}
                  placeholder="例: 山田太郎"
                  style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </div>

              {/* クイック接続名の検索入力欄 */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <label htmlFor="searchNameInput" style={{ marginRight: '8px', fontWeight: 'bold' }}>
                  接続名で検索:
                </label>
                <input
                  id="searchNameInput"
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="検索する文字列"
                  style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </div>
            </div>
            <FormField label="所属キュー">
              <Select
                selectedOption={
                  availableQueues.find(q => q.queueARN === selectedQueueARN)
                    ? {
                      label: (() => {
                        const queue = availableQueues.find(q => q.queueARN === selectedQueueARN);
                        if (!queue) return '';

                        // fetchedQueues の中から、該当するキューの付加情報（発信者名）を探す
                        const fetchedQueue = fetchedQueues.find(fq => fq.queueARN === queue.queueARN);

                        return fetchedQueue?.outboundCallerName
                          ? `${queue.name} (${formatDisplayPhoneNumber(fetchedQueue.outboundCallerName)})`
                          : queue.name;
                      })(),
                      value: selectedQueueARN
                    }
                    : null
                }
                onChange={({ detail }) => setSelectedQueueARN(detail.selectedOption.value ?? '')}

                // availableQueues をベースにして選択肢を作り、表示名だけ fetchedQueues から補完する
                options={availableQueues.map(queue => {
                  const fetchedQueue = fetchedQueues.find(fq => fq.queueARN === queue.queueARN);
                  return {
                    label: fetchedQueue?.outboundCallerName
                      ? `${queue.name} (${formatDisplayPhoneNumber(fetchedQueue.outboundCallerName)})`
                      : queue.name,
                    value: queue.queueARN
                  };
                })}
              />
            </FormField>

            {/* 👇 新規追加：絞り込み条件を選択するドロップダウン 👇 */}
            <FormField label="クイック接続の種類">
              <Select
                selectedOption={{
                  value: filterType,
                  label: filterType === 'ALL' ? 'すべて表示' :
                    filterType === 'agent' ? 'エージェントのみ' :
                      filterType === 'queue' ? 'キューのみ' : '電話番号のみ'
                }}
                onChange={({ detail }) => setFilterType(detail.selectedOption.value ?? 'ALL')}
                options={[
                  { label: 'すべて表示', value: 'ALL' },
                  { label: 'エージェントのみ', value: 'agent' }, // 状況に合わせて 'agent' や connect.EndpointType.AGENT 等に変更
                  { label: 'キューのみ', value: 'queue' },
                  { label: '電話番号のみ', value: 'phone_number' }
                ]}
              />
            </FormField>

            {/* 👇 修正：元の quickConnects ではなく、絞り込み後の filteredQuickConnects を展開する 👇 */}
            <FormField label="クイック接続一覧">
              {filteredQuickConnects.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyleType: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredQuickConnects.map((qc, index) => {

                    // 💡 3. クイック接続が「エージェント」かどうかを判定
                    const isAgent = qc.type === 'agent' || qc.quickConnectType === 'agent';

                    // 💡 4. エージェントの場合、AppSyncのデータから該当するユーザー情報を検索
                    // ※検索キー（qc.name と AppSync側の名前のプロパティ）は実際のデータ構造に合わせて変更してください。
                    const agentData = isAgent
                      ? appSyncUserList.find((user) => user.userName === qc.name)
                      : null;

                    return (
                      <li key={index} style={{
                        display: 'flex',
                        alignItems: 'center', // 縦方向の中央揃え
                        gap: '12px',          // 💡 要素（名前とステータス）の間に12pxの隙間を空ける
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        backgroundColor: '#f9fafb'
                      }}>

                        {/* 左側：クイック接続名 */}
                        <span style={{ fontWeight: 'bold' }}>{qc.name}</span>

                        {/* 💡 中央：エージェントステータスの表示（エージェントの場合のみ） */}
                        {isAgent && agentData && (
                          <span style={{
                            fontSize: '12px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            // 状態によって背景色と文字色を変える（例：Availableなら緑、それ以外はグレー）
                            backgroundColor: agentData.status === 'Available' ? '#d1fae5' : '#e5e7eb',
                            color: agentData.status === 'Available' ? '#065f46' : '#374151',
                            fontWeight: 'bold'
                          }}>
                            {agentData.status}
                          </span>
                        )}

                        {/* 右端：転送ボタン */}
                        <button
                          onClick={() => handleTransfer(qc)}
                          style={{
                            marginLeft: 'auto', // 💡 自動マージンを指定してボタンを右端に寄せる
                            padding: '6px 16px',
                            backgroundColor: '#4f46e5',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          転送
                        </button>

                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div style={{ color: '#6b7280', fontSize: '14px' }}>
                  該当するクイック接続はありません。
                </div>
              )}
            </FormField>
            {/* 👆 新規追加部分ここまで 👆 */}

          </SpaceBetween>
        </Container>
        {/*<UserList />*/}
      </Suspense>
    );
  };

  return (
    <Suspense fallback={<div>{t('common.app.loadingMessage')}</div>}>
      <div className="app">
        <SpaceBetween size="l">
          {renderHeader()}
          {/*{renderContactInfo()}*/}
          {transferNotification && (
            <div style={{
              backgroundColor: '#eef2ff',
              color: '#4f46e5',
              padding: '12px',
              borderRadius: '4px',
              marginBottom: '16px',
              border: '1px solid #4f46e5',
              fontWeight: 'bold',
              textAlign: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              {transferNotification}
            </div>
          )}
          <QueueMonitor availableQueues={availableQueues} />
          <Tabs
            tabs={[
              {
                label: "外線発信",
                id: "outbound",
                //content: renderOutboundTab()
                content: renderOutboundTab()
              },
              {
                label: "自分の通話履歴",
                id: "history",
                content: (
                  <Suspense fallback={<div>{t('tab.history.loadingMessage')}</div>}>
                    <Container>
                      <Button
                        onClick={() => window.open(config?.contactSearchUrl || '#', '_blank')}
                      >
                        通話履歴を開く
                      </Button>
                      <ContactHistory history={contactHistory} onRedial={handleRedial} />
                    </Container>
                  </Suspense>
                )
              },
              {
                label: "クイック接続",
                id: "userList",
                content: renderUserListTab()
              }
            ]}
            activeTabId={activeTab}
            onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          />
        </SpaceBetween>
      </div>
    </Suspense>
  );
}

export default App;
