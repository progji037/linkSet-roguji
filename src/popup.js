// FormFlow ポップアップスクリプト
document.addEventListener('DOMContentLoaded', function () {
  // DOM要素の取得
  const csvFileInput = document.getElementById('csvFile');
  const fileInfoDiv = document.getElementById('fileInfo');
  const nameField = document.getElementById('nameField');
  const emailField = document.getElementById('emailField');
  const phoneField = document.getElementById('phoneField');
  const messageField = document.getElementById('messageField');
  const rangeField = document.getElementById('rangeField');
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  const statusSpan = document.getElementById('status');
  const currentUrlSpan = document.getElementById('currentUrl');
  const progressSpan = document.getElementById('progress');
  const errorList = document.getElementById('errorList');

  // CSVデータの保存用変数
  let csvData = [];
  let processedRows = [];
  let currentIndex = 0;
  let isProcessing = false;
  let errors = [];
  const MAX_ROWS_PER_BATCH = 10;   // 1 バッチで処理できる最大行数

  // 保存されたフォーム情報を復元
  chrome.storage.local.get(['formInfo'], function (result) {
    if (result.formInfo) {
      nameField.value = result.formInfo.name || '';
      emailField.value = result.formInfo.email || '';
      phoneField.value = result.formInfo.phone || '';
      messageField.value = result.formInfo.message || '';
    }
  });

  // CSVファイル読み込み処理
  csvFileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      const csvContent = event.target.result;
      processCSV(csvContent);
    };
    reader.readAsText(file);
  });

  // CSV処理関数
  function processCSV(content) {
    // BOMの除去
    const normalizedContent = content.replace(/^\uFEFF/, '');

    // CSVの解析
    const lines = normalizedContent.split(/\r\n|\n/);
    csvData = [];

    console.log("CSV行数（分割後）:", lines.length);
    console.log("CSV内容（最初の数行）:", lines.slice(0, 5));

    // 各行を解析
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) {
        console.log(`行 ${i+1}: 空行のためスキップ`);
        continue; // 空行はスキップ
      }

      // カンマの処理（クオートされた部分のカンマはスキップ）
      let row = [];
      let inQuote = false;
      let currentValue = '';

      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];

        if (char === '"') {
          inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
          row.push(currentValue);
          currentValue = '';
        } else {
          currentValue += char;
        }
      }

      // 行の最後の値を追加
      row.push(currentValue);
      csvData.push(row);

      console.log(`行 ${i+1} 解析結果:`, row);
    }

    console.log("CSV解析後のデータ行数:", csvData.length);
    console.log("CSV解析後のデータ（最初の数行）:", csvData.slice(0, 5));

    // ファイル情報の表示
    fileInfoDiv.textContent = `CSVファイル読み込み完了：合計 ${csvData.length} 行`;
  }

  // 処理範囲のパース関数
  function parseRange(rangeStr) {
    if (!rangeStr.trim()) {
      return [];           // ← 空配列にする
    }

    const result = [];
    const parts  = rangeStr.split(',');

    for (let part of parts) {
      part = part.trim();
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10) - 1);
        if (isNaN(start) || isNaN(end)) continue;
        for (let i = start; i <= end; i++) {
          if (i >= 0 && i < csvData.length && !result.includes(i)) result.push(i);
        }
      } else {
        let idx = parseInt(part, 10) - 1;
        if (!isNaN(idx) && idx >= 0 && idx < csvData.length && !result.includes(idx)) result.push(idx);
      }
    }
    return result.sort((a, b) => a - b);
  }

  // 処理開始ボタンのイベントリスナー
  startButton.addEventListener('click', function () {
    if (csvData.length === 0) {
      alert('CSVファイルを読み込んでください。');
      return;
    }

    // フォーム情報の保存
    const formInfo = {
      name: nameField.value,
      email: emailField.value,
      phone: phoneField.value,
      message: messageField.value
    };
    chrome.storage.local.set({ formInfo });

    // 処理範囲を取得
    processedRows = parseRange(rangeField.value);
    console.log("処理範囲（指定値）:", rangeField.value);
    console.log("処理範囲（解析後）:", processedRows);
    console.log("処理対象URL一覧:", processedRows.map(idx => csvData[idx][0]));

    // ★範囲未指定なら「2 行目から 10 行」を自動セット
    if (processedRows.length === 0) {
      const startIdx = 1; // 0 ベースで 1 = 行番号 2
      const endIdx   = Math.min(startIdx + MAX_ROWS_PER_BATCH - 1, csvData.length - 1);
      processedRows  = Array.from({ length: endIdx - startIdx + 1 }, (_, i) => startIdx + i);
      console.log("処理範囲（自動設定）:", processedRows);
    }

    // ★上限チェック
    if (processedRows.length > MAX_ROWS_PER_BATCH) {
      alert(`処理できる上限は ${MAX_ROWS_PER_BATCH} 行です。範囲を調整してください。`);
      return;
    }

    // 処理開始
    isProcessing = true;
    currentIndex = 0;
    errors = [];
    errorList.innerHTML = '';

    updateUI();
    processNextUrl();
  });

  // 処理停止ボタンのイベントリスナー
  stopButton.addEventListener('click', function () {
    isProcessing = false;
    updateUI();

    chrome.runtime.sendMessage({
      action: 'stopProcessing'
    });
  });

  // 次のURLを処理する関数
  function processNextUrl() {
    console.log("processNextUrl 呼び出し - 現在のインデックス:", currentIndex, "処理行数:", processedRows.length);

    if (!isProcessing) {
      console.log("処理停止中のため終了");
      updateUI();
      return;
    }

    if (currentIndex >= processedRows.length) {
      console.log("すべての行を処理完了");
      isProcessing = false;
      alert('すべての処理が完了しました。');
      updateUI();
      return;
    }

    const rowIndex = processedRows[currentIndex];
    console.log(`Processing row ${currentIndex + 1}/${processedRows.length}, CSV row index: ${rowIndex}`);
    const url = csvData[rowIndex][0]; // URL

    if (!url) {
      // URLが無効な場合はエラーを記録して次へ
      logError(rowIndex, 'URLが空か無効です。');
      currentIndex++;
      processNextUrl();
      return;
    }

    // 現在のURLの表示を更新
    currentUrlSpan.textContent = url;
    progressSpan.textContent = `${currentIndex + 1}/${processedRows.length}`;

    // 背景スクリプトにメッセージ送信
    chrome.runtime.sendMessage({
      action: 'processUrl',
      url: url,
      rowIndex: rowIndex,
      formData: {
        name: nameField.value,
        email: emailField.value,
        phone: phoneField.value,
        message: messageField.value
      }
    });
  }

  // エラーを記録する関数
  function logError(rowIndex, message) {
    const error = {
      row: rowIndex + 1,
      message: message
    };

    errors.push(error);

    // エラーリストにエラーを追加
    const li = document.createElement('li');
    li.textContent = `行 ${error.row}: ${error.message}`;
    errorList.appendChild(li);
  }

  // UI更新関数
  function updateUI() {
    if (isProcessing) {
      startButton.disabled = true;
      stopButton.disabled  = false;
      statusSpan.textContent = '処理中';
      csvFileInput.disabled  = true;
      rangeField.disabled    = true;
    } else {
      startButton.disabled = false;
      stopButton.disabled  = true;
      statusSpan.textContent = '停止中';
      currentUrlSpan.textContent = '-';
      csvFileInput.disabled  = false;
      rangeField.disabled    = false;
    }

    // 進捗テキストを "現在 / 上限" にする
    const total = Math.min(processedRows.length, MAX_ROWS_PER_BATCH);
    progressSpan.textContent = `${currentIndex}/${total}`;
  }

  // バックグラウンドからのメッセージ送信
  chrome.runtime.onMessage.addListener(function (message) {
    if (message.action === 'processingComplete') {
      // 処理が完了した場合
      currentIndex++;
      setTimeout(processNextUrl, 500); // 0.5秒後に次のURLを処理
    } else if (message.action === 'processingError') {
      // エラーが発生した場合
      logError(message.rowIndex, message.error);
      currentIndex++;
      setTimeout(processNextUrl, 500);
    }
  });

  // 初期UI更新
  updateUI();
});