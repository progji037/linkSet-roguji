// FormFlow コンテンツスクリプト

// メッセージリスナー
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("Content: メッセージを受信:", message);

  if (message.action === 'findContactPage') {
    // お問い合わせページを検索
    console.log("Content: お問い合わせページ検索を開始します");
    findContactPage(message.rowIndex);
    sendResponse({ status: "searching" });
  } else if (message.action === 'fillFormFields') {
    // フォームフィールドに入力
    console.log("Content: フォームフィールド入力を開始します");
    fillFormFields(message.formData, message.rowIndex);
    sendResponse({ status: "filling" });
  }

  // 非同期レスポンスのためにtrueを返す
  return true;
});

// お問い合わせページを検索する関数
function findContactPage(rowIndex) {
  console.log("Content: お問い合わせページ検索を開始しました");

  // 現在のページがお問い合わせページかどうかを確認
  if (isContactPage()) {
    // お問い合わせページが見つかった場合
    console.log("Content: お問い合わせページが見つかりました");
    chrome.runtime.sendMessage({
      action: 'contactPageFound',
      rowIndex: rowIndex
    }, function (response) {
      console.log("Content: contactPageFound通知のレスポンス:", response);
    });
    return;
  }

  // お問い合わせページへのリンクを検索
  const contactLink = findContactLink();

  if (contactLink) {
    // リンクが見つかった場合はクリック
    console.log("Content: お問い合わせリンクが見つかりました:", contactLink.href);
    try {
      // リンクをクリックする前にログを出力
      console.log("Content: リンクをクリックします");
      contactLink.click();
      console.log("Content: リンクをクリックしました");
    } catch (err) {
      console.error("Content: リンククリックエラー:", err);
      chrome.runtime.sendMessage({
        action: 'processingError',
        rowIndex: rowIndex,
        error: 'お問い合わせリンクのクリックに失敗しました: ' + err.message
      });
    }
    // リンクをクリックした後、ページが遷移するため何もしない
    return;
  }

  // お問い合わせページが見つからなかった場合
  console.log("Content: お問い合わせページが見つかりませんでした");
  chrome.runtime.sendMessage({
    action: 'contactPageNotFound',
    rowIndex: rowIndex
  }, function (response) {
    console.log("Content: contactPageNotFound通知のレスポンス:", response);
  });
}

// 現在のページがお問い合わせページかどうかを確認する関数
function isContactPage() {
  console.log("Content: 検出処理を開始しました");

  // タイトルチェック
  const pageTitle = document.title.toLowerCase();
  const titleKeywords = [
    'お問い合わせ', '問い合わせ', 'お問合せ', '問合せ', 'ご相談', '相談', '連絡', 'メッセージ',
    'contact', 'inquiry', 'inquiries', 'get in touch', 'message', 'feedback', 'support', 'help'
  ];

  for (const keyword of titleKeywords) {
    if (pageTitle.includes(keyword)) {
      console.log("Content: 検出結果:", true, "タイトルキーワード一致:", keyword);
      return true;
    }
  }

  // URLチェック
  const currentUrl = window.location.href.toLowerCase();
  const urlKeywords = [
    'contact', 'inquiry', 'toiawase', 'form',
    'otoiawase', 'support', 'help', 'feedback',
    'お問い合わせ', '問い合わせ', 'お問合せ', '問合せ'
  ];

  for (const keyword of urlKeywords) {
    if (currentUrl.includes(keyword)) {
      console.log("Content: 検出結果:", true, "URL一致:", keyword);
      return true;
    }
  }

  // フォームチェック
  const forms = document.querySelectorAll('form');
  if (forms.length > 0) {
    for (const form of forms) {
      // フォーム内の入力要素を取得
      const inputs = form.querySelectorAll('input, textarea, select');

      if (inputs.length >= 3) {
        // 名前、メール、メッセージなどのフィールドがあるか確認
        let emailFound = false;
        let nameFound = false;
        let messageFound = false;

        for (const input of inputs) {
          const attributes = [
            input.name, input.id, input.placeholder,
            input.getAttribute('aria-label'), input.className
          ].filter(attr => attr).join(' ').toLowerCase();

          if (attributes.match(/email|mail|メール/)) {
            emailFound = true;
          } else if (attributes.match(/name|氏名|名前|姓名/)) {
            nameFound = true;
          } else if (attributes.match(/message|content|body|メッセージ|本文|内容|問い合わせ内容/)) {
            messageFound = true;
          }
        }

        if ((emailFound && nameFound) || (emailFound && messageFound) || (nameFound && messageFound)) {
          console.log("Content: 検出結果:", true, "フォーム要素一致 - メール:", emailFound, "名前:", nameFound, "メッセージ:", messageFound);
          return true;
        }
      }
    }
  }

  console.log("Content: 検出結果:", false, "お問い合わせページではありません");
  return false;
}

// お問い合わせページへのリンクを検索する関数
function findContactLink() {
  // 日本語キーワード
  const jaKeywords = [
    'お問い合わせ', '問い合わせ', 'お問合せ', '問合せ',
    'ご相談', '相談', '連絡', 'メッセージ',
    'フォーム', 'コンタクト'
  ];

  // 英語キーワード
  const enKeywords = [
    'contact', 'inquiry', 'inquiries', 'get in touch',
    'message', 'feedback', 'support', 'help',
    'form', 'reach us', 'write to us'
  ];

  // URLスラッグ
  const urlSlugs = [
    '/contact', '/inquiry', '/toiawase', '/form',
    '/contact-us', '/inquiries', '/otoiawase', '/support'
  ];

  // すべてのaタグを取得
  const links = document.querySelectorAll('a');
  console.log("Content: リンク検索 - 検出されたリンク数:", links.length);

  // キーワードに一致するリンクを検索
  for (const link of links) {
    if (!link.href || link.href.startsWith('javascript:') || link.href.startsWith('mailto:') || link.href.startsWith('tel:')) {
      continue;
    }

    const linkText = (link.textContent || '').toLowerCase();
    const linkHref = link.href.toLowerCase();

    // 現在のURLと同じリンクは無視（自己参照を避ける）
    if (linkHref === window.location.href.toLowerCase()) {
      continue;
    }

    // テキストチェック
    for (const keyword of [...jaKeywords, ...enKeywords]) {
      if (linkText.includes(keyword.toLowerCase())) {
        console.log("Content: リンク発見 - テキスト一致:", keyword, linkHref);
        return link;
      }
    }

    // URLチェック
    for (const slug of urlSlugs) {
      if (linkHref.includes(slug.toLowerCase())) {
        console.log("Content: リンク発見 - URL一致:", slug, linkHref);
        return link;
      }
    }
  }

  console.log("Content: お問い合わせリンクが見つかりませんでした");
  return null;
}

// フォームフィールドに入力する関数
function fillFormFields(formData, rowIndex) {
  console.log("Content: フォームフィールド入力を開始します");

  // 処理完了フラグ（重複送信防止用）
  let processingCompleted = false;

  // 処理完了通知関数
  function sendCompletionNotice() {
    if (!processingCompleted) {
      processingCompleted = true;
      console.log("Content: 処理完了通知を送信します");
      chrome.runtime.sendMessage({
        action: 'processingComplete',
        rowIndex: rowIndex
      });
    }
  }

  // formDataが正しく渡されているか確認
  if (!formData) {
    console.error("Content: formDataがundefinedです");
    chrome.runtime.sendMessage({
      action: 'processingError',
      rowIndex: rowIndex,
      error: 'フォームデータが正しく渡されていません'
    });

    // エラーがあっても処理を続行
    setTimeout(sendCompletionNotice, 1000);
    return;
  }

  // 各プロパティの存在確認
  const name = formData.name || '';
  const email = formData.email || '';
  const phone = formData.phone || '';
  const message = formData.message || '';

  console.log("Content: フォームデータ", { name, email, phone, message });

  // フォームフィールドを特定して入力
  const fieldsToFill = [
    {
      type: 'name',
      value: name,
      identifiers: [
        'name', 'fullname', 'full-name', 'full_name',
        'your-name', 'yourname', 'your_name',
        '氏名', '名前', 'おなまえ', 'お名前', '姓名'
      ]
    },
    {
      type: 'email',
      value: email,
      identifiers: [
        'email', 'mail', 'e-mail', 'email-address',
        'your-email', 'youremail',
        'メール', 'メールアドレス', 'email-confirm'
      ]
    },
    {
      type: 'phone',
      value: phone,
      identifiers: [
        'phone', 'tel', 'telephone', 'mobile',
        'your-phone', 'yourphone', 'phone-number',
        '電話', '電話番号', 'tel-number', 'mobile-number'
      ]
    },
    {
      type: 'message',
      value: message,
      identifiers: [
        'message', 'content', 'body', 'inquiry',
        'description', 'comment', 'comments',
        'メッセージ', '本文', '内容', '問い合わせ内容', 'お問い合わせ内容',
        'inquiry-content', 'details'
      ]
    }
  ];

  const filledFields = {
    name: false,
    email: false,
    phone: false,
    message: false
  };

  // 第1段階: 属性値からの特定
  for (const field of fieldsToFill) {
    // input, textarea要素を検索
    const inputSelectors = field.type === 'message' ?
      'textarea' :
      `input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type])`;

    const inputs = document.querySelectorAll(inputSelectors);
    console.log(`Content: ${field.type}フィールド検索 - 候補要素数:`, inputs.length);

    for (const input of inputs) {
      if (filledFields[field.type]) continue;

      // 属性値をチェック
      const attributes = [
        input.name, input.id, input.placeholder,
        input.getAttribute('aria-label'), input.className
      ].filter(attr => attr).join(' ').toLowerCase();

      for (const identifier of field.identifiers) {
        if (attributes.includes(identifier.toLowerCase())) {
          console.log(`Content: ${field.type}フィールドが見つかりました - 識別子:`, identifier);
          try {
            input.value = field.value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            filledFields[field.type] = true;
          } catch (e) {
            console.error(`Content: ${field.type}フィールド入力エラー:`, e);
          }
          break;
        }
      }
    }
  }

  // 第2段階: ラベルテキストからの特定
  for (const field of fieldsToFill) {
    if (filledFields[field.type]) continue;

    // ラベル要素を検索
    const labels = document.querySelectorAll('label');
    console.log(`Content: ${field.type}フィールド検索(ラベル) - 候補要素数:`, labels.length);

    for (const label of labels) {
      const labelText = (label.textContent || '').toLowerCase();

      for (const identifier of field.identifiers) {
        if (labelText.includes(identifier.toLowerCase())) {
          console.log(`Content: ${field.type}フィールドのラベルが見つかりました - 識別子:`, identifier);

          // ラベルに関連する入力要素を探す
          let inputElement = null;

          // for属性を使用した関連付け
          if (label.htmlFor) {
            inputElement = document.getElementById(label.htmlFor);
          }

          // 子要素を検索
          if (!inputElement) {
            inputElement = label.querySelector('input, textarea, select');
          }

          // 近接要素を検索
          if (!inputElement) {
            const parentElement = label.parentElement;
            if (parentElement) {
              inputElement = parentElement.querySelector('input, textarea, select');
            }
          }

          if (inputElement && !filledFields[field.type]) {
            console.log(`Content: ${field.type}フィールドを入力します`);
            try {
              inputElement.value = field.value;
              inputElement.dispatchEvent(new Event('input', { bubbles: true }));
              inputElement.dispatchEvent(new Event('change', { bubbles: true }));
              filledFields[field.type] = true;
            } catch (e) {
              console.error(`Content: ${field.type}フィールド入力エラー:`, e);
            }
            break;
          }
        }
      }
    }
  }

  // 入力できなかったフィールドのエラーを記録
  const missingFields = [];

  if (!filledFields.name) missingFields.push('氏名');
  if (!filledFields.email) missingFields.push('メールアドレス');
  if (!filledFields.phone) missingFields.push('電話番号');
  if (!filledFields.message) missingFields.push('メッセージ');

  if (missingFields.length > 0) {
    const errorMessage = `以下のフィールドが特定できませんでした: ${missingFields.join(', ')}`;
    console.warn("Content: 入力できなかったフィールド:", errorMessage);

    // エラーを記録するが処理は続行する
    chrome.runtime.sendMessage({
      action: 'processingError',
      rowIndex: rowIndex,
      error: errorMessage
    });

    // エラーがあっても処理完了を通知
    console.log("Content: エラーがありますが、処理を続行します");
    setTimeout(sendCompletionNotice, 2000);
    return;
  }

  // 処理完了を通知（フィールドが特定できた場合）
  console.log("Content: 5秒後に処理完了通知を送信します");
  setTimeout(sendCompletionNotice, 5000);
}