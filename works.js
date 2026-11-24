// 掲載作品のデータ。ここを書き換えればサイトの中身が変わります。
// YouTube の動画 ID は URL の v= 以降（ショートは /shorts/ 以降）。

window.PROFILE = {
  name: "おおひろ",
  roleJa: "AI映像作家",
  roleEn: "AI Animation Director",
  message: "AIが自分の好きを最大化する。",
  lead: "笑いとしんみりとした作風が特徴の制作スタイル。\n映像制作のプロとしても活躍中。",
  links: [
    { label: "YouTube", url: "https://www.youtube.com/@oohirochan" },
    { label: "X", url: "https://x.com/oohiro35" },
  ],
  // 問い合わせフォームの送信先（Formspree などのフォーム受付サービスの URL）。
  // 空のあいだはフォームは仮表示で、送信ボタンは押せません。
  contactAction: "",
};

window.WORKS = [
  {
    id: "ohiro",
    title: "限界社畜OLおおひろちゃん",
    kind: "AIアニメ シリーズ",
    year: "2026",
    accent: "#ff5a7a",
    synopsis:
      "昼は新卒OL、夜は魔法界の首席執行官。仕送り0円、出動手当なし。限界社畜のおおひろは、悪夢に閉じ込められても締め切りを守れるのか――。社畜OLの職場ネタで押し切る、オリジナルのギャグアニメ。",
    tools: ["Seedance 2.5", "GPT Image", "Suno"],
    main: { id: "gx1kVhcRlk0", title: "第一話「残業は悪夢の中で」", duration: "3:20" },
    shorts: [
      { id: "xRt4gtOY0Ic", title: "夢魔「永遠にお前ひとりだ」社畜OL「……チャットも？」" },
      { id: "X8MJs-43LMs", title: "夢魔「手伝うな！」社畜OL「そこのコンセント、お願いします」" },
      { id: "MRBedNs8EI8", title: "最後のお願いが「次、空きが出たら連絡ください」" },
      { id: "z6p7pnM2QIs", title: "悪夢が効かない社畜OL" },
    ],
  },
  {
    id: "megami",
    title: "転生特典に女神は含まれますか？",
    kind: "異世界転生ラブコメ",
    year: "2026",
    accent: "#f2c14e",
    synopsis:
      "深夜残業明けに死んだ神崎ユウトが選んだのは、最強スキルでも美少女ハーレムでもなく、担当女神リシアだった。規約第一のエリート女神と、異世界より彼女を選んだ転生者による天界オフィスラブコメ。",
    tools: ["Seedance 2.5", "MiniMax H3"],
    main: { id: "4UBidnXbjh0", title: "第1話", duration: "2:13" },
    shorts: [
      { id: "iKYezdjCTqI", title: "転生特典に女神は含まれますか？" },
      { id: "x-r4TRnkmf0", title: "てか、顔がドストライクすぎる。" },
      { id: "YItcS0Iw7Wk", title: "じゃあ、ここに住みます。" },
      { id: "w1SwWVWMQQg", title: "よし、次の人の受付と書類整理手伝うね。" },
      { id: "z0FnrCMg4KM", title: "最強スキル付き転生を断った男【解説】" },
    ],
  },
  {
    id: "goodsisters",
    title: "Goodsisters",
    kind: "姉妹の日常ショートアニメ",
    year: "2026",
    accent: "#6cc4a1",
    synopsis:
      "夕焼けの交番前。暇そうなおまわりさんのお姉ちゃんと、遠慮ゼロの妹。事件はないけど、ここに帰ってくる理由がひとつ増える、おしゃべりだけの日常ショート。ホラー特別編では静かな心理ホラーにも挑戦。",
    tools: ["Seedance", "PixVerse"],
    links: [{ label: "Instagram で見る →", url: "https://www.instagram.com/goodsisters_aianime/" }],
    main: { id: "J6ywGzD4p4s", title: "ホラー特別編「お姉ちゃんの練習」", duration: "1:42" },
    shorts: [
      { id: "Cmq6R9D5ayo", title: "第1話「お姉ちゃんは暇」" },
      { id: "nX63h7D0zZY", title: "第2話「迷子じゃない」" },
      { id: "aQbHkZb-DE0", title: "第3話「パトロールの理由」" },
      { id: "aZMUs-9lvz8", title: "第4話「交番は休憩所？」" },
      { id: "bGH7sLQ6WbE", title: "第5話「お姉ちゃんを落としました」" },
    ],
  },
  {
    // 動画ではなく自作アプリ。main の代わりに app を書くと、画像と機能一覧で表示します
    id: "asset-reviewer",
    title: "AI Asset Reviewer",
    kind: "制作支援アプリ（自作）",
    year: "2026",
    accent: "#f2642e",
    synopsis:
      "AIで生成した画像・動画を目で見てレビューし、気づいたことを Codex / OpenCode への修正指示に整えて渡すデスクトップアプリ。素材の保管・版の管理・コンテ台帳までをワークスペース単位でまとめています。自分のアニメ制作のために作り、日々の制作で使っています。",
    tools: ["Electron", "TypeScript", "React", "SQLite"],
    app: {
      image: "media/ai-asset-reviewer.png",
      caption: "Windows デスクトップアプリ（個人用）",
      features: [
        { title: "4状態で素早く判定", text: "未レビュー／レビュー済み／採用／非採用。キーボードだけで次々さばけます。" },
        { title: "画面に直接指摘", text: "画像にはペンや矢印で書き込み、動画には時刻マーカーを複数打って、その場所ごとにコメント。" },
        { title: "AIへの修正指示に変換", text: "ファイルのパスとレビュー本文を、そのままエージェントに渡せる指示文としてコピー。" },
        { title: "素材保管庫と版の管理", text: "生成物をコピーして保管し、同じ素材の版を1枚のカードに束ねて並べて比較。" },
        { title: "コンテ台帳", text: "絵コンテの台帳と素材を紐付け。エージェントは CLI から台帳と素材を読み書きできます。" },
        { title: "スマホからも確認", text: "本人だけがつながるブラウザ画面で、外出先からレビューとコンテを確認。" },
      ],
    },
  },
];

// X の動画ピックアップ。ポストの URL を足すと「X Picks」欄が表示されます。
// 例: { url: "https://x.com/<アカウント>/status/1234567890", title: "ひとこと" }
window.X_PICKS = [];
