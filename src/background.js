// FormFlow バックグラウンドスクリプト
let currentTabId = null;
let isProcessing = false;
let waitingForContactPage = false;
let currentFormData = null;
let currentRowIndex = null;
// urlList と currentUrlIndex は使用しない

//--------------------------------------------------
// メッセージリスナー
//--------------------------------------------------
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("Background: 受信メッセージ:", message);

  if (message.action === 'processUrl') {
    // 単一 URL 処理
    // 既に処理中の場合は拒否
    if (isProcessing) {
      console.log("Background: 既に処理中のため、このリクエストは無視します");
      sendResponse({ status: "busy" });
      return true;
    }

    currentFormData = message.formData;
    currentRowIndex = message.rowIndex;
    processUrl(message.url, message.rowIndex);
    sendResponse({ status: "processing" });

  } else if (message.action === 'stopProcessing') {
    // 停止リクエスト
    isProcessing = false;
    waitingForContactPage = false;

    // 処理中のタブがあれば閉じる
    if (currentTabId) {
      try {
        chrome.tabs.remove(currentTabId);
      } catch (err) {
        console.error("Background: タブ閉じるエラー:", err);
      }
      currentTabId = null;
    }

    sendResponse({ status: "stopped" });

  } else if (message.action === 'contactPageFound') {
    // フォームページ判定成功
    waitingForContactPage = false;
    sendResponse({ status: "received" });
    fillFormFields(message.rowIndex);

  } else if (message.action === 'contactPageNotFound') {
    // フォームページなし
    waitingForContactPage = false;
    sendResponse({ status: "received" });
    sendError(message.rowIndex, 'お問い合わせページが見つかりませんでした。');

    // タブを閉じる
    if (currentTabId) {
      try {
        chrome.tabs.remove(currentTabId);
      } catch (err) {
        console.error("Background: タブ閉じるエラー:", err);
      }
      currentTabId = null;
    }

    // popup.js に通知して次のURLを処理させる
    chrome.runtime.sendMessage({
      action: 'processingError',
      rowIndex: message.rowIndex,
      error: 'お問い合わせページが見つかりませんでした。'
    });

    // 状態をリセット
    isProcessing = false;
    waitingForContactPage = false;

  } else if (message.action === 'processingComplete') {
    // フォーム入力完了
    console.log("Background: 処理完了通知を受信");

    // タブを閉じる
    if (currentTabId) {
      try {
        chrome.tabs.remove(currentTabId);
      } catch (err) {
        console.error("Background: タブ閉じるエラー:", err);
      }
      currentTabId = null;
    }

    isProcessing = false;
    waitingForContactPage = false;

    sendResponse({ status: "received" });

    // popup.js に通知して次のURLを処理させる
    chrome.runtime.sendMessage({
      action: 'processingComplete',
      rowIndex: message.rowIndex
    });

  } else if (message.action === 'processingError') {
    // 入力エラー
    console.log("Background: エラー通知:", message.error);
    sendError(message.rowIndex, message.error);

    // タブを閉じる
    if (currentTabId) {
      try {
        chrome.tabs.remove(currentTabId);
      } catch (err) {
        console.error("Background: タブ閉じるエラー:", err);
      }
      currentTabId = null;
    }

    isProcessing = false;
    waitingForContactPage = false;

    sendResponse({ status: "received" });

    // popup.js に通知して次のURLを処理させる
    chrome.runtime.sendMessage({
      action: 'processingError',
      rowIndex: message.rowIndex,
      error: message.error
    });
  }

  return true; // 非同期レスポンス
});

//--------------------------------------------------
// タブ状態監視
//--------------------------------------------------
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (!isProcessing || tabId !== currentTabId) return;

  if (changeInfo.status === 'complete' && waitingForContactPage) {
    console.log("Background: 読み込み完了 → お問い合わせページ検索開始");

    // DOM 安定待ち後に問い合わせページ検索を指示
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        action:   'findContactPage',
        rowIndex: currentRowIndex
      }, (response) => {
        if (!response) {
          console.warn("Background: 応答なし → 再送信");
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
              action:   'findContactPage',
              rowIndex: currentRowIndex
            });
          }, 1000);
        }
      });
    }, 1000);
  }
});

//--------------------------------------------------
// 現在インデックスの URL を処理
//--------------------------------------------------
function processCurrentUrl() {
  if (currentUrlIndex >= urlList.length) {
    console.log("Background: 全 URL 処理完了");
    chrome.runtime.sendMessage({ action: 'allProcessingFinished' });
    return;
  }

  const url = urlList[currentUrlIndex];
  currentRowIndex = currentUrlIndex + 1; // 行番号は 1 始まり
  processUrl(url, currentRowIndex);
}

//--------------------------------------------------
// URL を処理
//--------------------------------------------------
async function processUrl(url, rowIndex) {
  console.log("Background: URL 処理開始:", url, "行", rowIndex);
  isProcessing          = true;
  waitingForContactPage = true;

  try {
    // ★バックグラウンドで新規タブを開く (active:false)
    const tab = await chrome.tabs.create({ url, active: false });
    currentTabId = tab.id;

    // 進捗をポップアップへ
    chrome.runtime.sendMessage({
      action:   'updateStatus',
      status:   '処理中',
      url:      url,
      progress: `${rowIndex}/${urlList.length}`
    });

  } catch (err) {
    console.error("Background: タブ作成エラー", err);
    isProcessing          = false;
    waitingForContactPage = false;
    sendError(rowIndex, 'タブ作成に失敗: ' + err.message);
    setTimeout(processNextUrl, 1000);
  }
}

//--------------------------------------------------
// フォーム入力を指示
//--------------------------------------------------
function fillFormFields(rowIndex) {
  if (!isProcessing || !currentTabId) return;

  chrome.tabs.sendMessage(currentTabId, {
    action:   'fillFormFields',
    formData: currentFormData,
    rowIndex
  }, (response) => {
    if (!response) {
      console.warn("Background: fillFormFields 応答なし → 再送信");
      setTimeout(() => fillFormFields(rowIndex), 1000);
    }
  });
}

//--------------------------------------------------
// 次の URL へ
//--------------------------------------------------
function processNextUrl() {
  console.log("Background: 次の URL へ");
  console.log("現在のインデックス:", currentUrlIndex, "URL一覧の長さ:", urlList.length);

  isProcessing          = false;
  waitingForContactPage = false;
  currentUrlIndex++;

  if (currentUrlIndex < urlList.length) {
    console.log("次のURLを処理します:", urlList[currentUrlIndex]);
    processCurrentUrl();
  } else {
    console.log("Background: すべて完了");
    chrome.runtime.sendMessage({ action: 'allProcessingFinished' });
  }
}

//--------------------------------------------------
// エラーをポップアップへ転送
//--------------------------------------------------
function sendError(rowIndex, errorMessage) {
  chrome.runtime.sendMessage({
    action: 'processingError',
    rowIndex,
    error: errorMessage
  });
}

//--------------------------------------------------
// ユーザーがタブを手動で閉じた場合の保険
//--------------------------------------------------
chrome.tabs.onRemoved.addListener(function (tabId) {
  if (tabId === currentTabId) {
    console.log("Background: 処理中タブが閉じられた");
    isProcessing = false;
    waitingForContactPage = false;
    currentTabId = null;

    if (currentRowIndex) {
      sendError(currentRowIndex, 'タブが閉じられたため処理を中断しました。');

      // タブが閉じられた後、次のURLに進む前に少し待機
      setTimeout(() => {
        // 次のURLに進む
        currentUrlIndex++;
        if (currentUrlIndex < urlList.length) {
          processCurrentUrl();
        }
      }, 1000);
    }
  }
});