const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak
} = require('docx');
const fs = require('fs');

const FONT = 'Yu Gothic';
const ACCENT = '2563EB';
const DARK = '1A1D23';
const GRAY = '6B7280';
const HEADFILL = 'EFF6FF';

/* ---------- ヘルパー ---------- */
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 140 },
    border: { bottom: { color: ACCENT, size: 12, style: BorderStyle.SINGLE, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 30, color: ACCENT, font: FONT })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 90 },
    children: [new TextRun({ text, bold: true, size: 24, color: DARK, font: FONT })],
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 90, line: 276 },
    children: [new TextRun({ text, size: opts.size ?? 21, color: opts.color ?? DARK, font: FONT, bold: !!opts.bold })],
  });
}
function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60, line: 264 },
    children: parseInline(text),
  });
}
// 「**bold**：rest」対応の簡易インラインパーサ
function parseInline(text) {
  const runs = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), size: 21, color: DARK, font: FONT }));
    runs.push(new TextRun({ text: m[1], bold: true, size: 21, color: DARK, font: FONT }));
    last = re.lastIndex;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), size: 21, color: DARK, font: FONT }));
  return runs.length ? runs : [new TextRun({ text, size: 21, color: DARK, font: FONT })];
}
function cell(text, { bold = false, fill = null, width, color = DARK } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 19, color, font: FONT })] })],
  });
}
// rows: 二次元配列。widthsの合計 = テーブル幅
function table(widths, rows, { headerFill = HEADFILL } = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    columnWidths: widths,
    width: { size: total, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
    },
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      children: r.map((c, ci) => cell(c, {
        bold: ri === 0,
        fill: ri === 0 ? headerFill : null,
        width: widths[ci],
        color: ri === 0 ? ACCENT : DARK,
      })),
    })),
  });
}
function spacer(h = 120) { return new Paragraph({ spacing: { after: h }, children: [] }); }

/* ---------- 本文 ---------- */
const children = [];

/* 表紙 */
children.push(
  new Paragraph({ spacing: { before: 2400, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '就活キロク', bold: true, size: 72, color: ACCENT, font: FONT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: 'syukatsukiroku', size: 28, color: GRAY, font: FONT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 0 },
    children: [new TextRun({ text: '企 画 書', size: 36, color: DARK, font: FONT, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1600 },
    children: [new TextRun({ text: '就活の選考記録・日程管理 Web アプリ', size: 22, color: GRAY, font: FONT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 },
    children: [new TextRun({ text: 'https://syukatsukiroku.vercel.app', size: 20, color: ACCENT, font: FONT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2000 },
    children: [new TextRun({ text: '2026年7月　作成：CCちゃん', size: 20, color: GRAY, font: FONT })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

/* 1. プロジェクト概要 */
children.push(h1('1. プロジェクト概要'));
children.push(p('就活（就職活動）中の学生が、選考の進捗・日程・メモ・結果を一元的に記録するための個人向け Web アプリケーション。'));
children.push(spacer(60));
children.push(table([1800, 6600], [
  ['項目', '内容'],
  ['名称', '就活キロク（syukatsukiroku）'],
  ['言語', '日本語 UI'],
  ['公開URL', 'https://syukatsukiroku.vercel.app'],
  ['リポジトリ', 'github.com/YuukiKeio/syuukatsukiroku'],
  ['参考', 'NEXTROUND2（白基調＋アクセントカラーのカードデザイン）'],
]));
children.push(spacer(80));
children.push(p('設計方針：機能優先・すっきりした画面・プライバシー安全（データは端末内のみ）・スマホで片手操作。', { color: GRAY }));

/* 2. ターゲット */
children.push(h1('2. ターゲットユーザーと利用シーン'));
children.push(bullet('**ユーザー**：就活中の学生（特に選考が多く複雑な業界：金融・商社・コンサルなど）'));
children.push(h2('主な課題'));
children.push(bullet('複数企業・複数選考が同時進行し、混乱・日程の抜け漏れが起きやすい'));
children.push(bullet('ES設問、面接の問答、GD・説明会のメモが散らばる'));
children.push(bullet('「何社出して、何社通過し、どの段階が未完か」を振り返りたい'));
children.push(h2('典型シーン'));
children.push(bullet('説明会の現場でメモを取る'));
children.push(bullet('面接前に ES と自分の回答を復習する'));
children.push(bullet('毎朝その日の予定を確認する'));

/* 3. 技術 */
children.push(h1('3. 技術方針'));
children.push(table([1400, 2600, 4400], [
  ['レイヤー', '選定', '理由'],
  ['フロント', '素の HTML/CSS/JS（フレームワークなし）', '依存ゼロ・軽量・高速'],
  ['データ保存', 'ブラウザ localStorage', 'バックエンド不要・アカウント不要・プライバシー良好'],
  ['ホスティング', 'Vercel（GitHub 連携で自動デプロイ）', 'push で自動更新・無料'],
  ['バックアップ', 'JSON エクスポート／インポート', 'localStorage の端末非共有を補う'],
]));
children.push(spacer(80));
children.push(h2('ファイル構成（リファクタリング後）'));
children.push(bullet('**index.html** — ページ構造（約170行）'));
children.push(bullet('**style.css** — テーマ変数とスタイル（約440行）'));
children.push(bullet('**app.js** — 全ロジック（約1,100行、モジュール分割）'));

/* 4. 機能一覧 */
children.push(h1('4. 機能一覧'));

children.push(h2('4.1 ホーム'));
children.push(bullet('**今日・明日バナー**：今日と明日の予定を最上部に表示、タップで詳細へ'));
children.push(bullet('**検索**：会社名／種類／活動名でリアルタイム絞り込み'));
children.push(bullet('**3つのセクション**：進行中／これからの予定／振り返り、直近順に自動ソート'));
children.push(bullet('**同名企業のまとめ**：同じ会社の複数案件を1枚のカードに統合、企業ページへ'));
children.push(bullet('**カード情報**：種類の色分けタグ・日程・場所・ステップ進捗・締切バッジ・結果マーク'));

children.push(h2('4.2 新規追加'));
children.push(bullet('会社名（2文字目から既存名をサジェスト）／活動名／種類＋カスタム'));
children.push(bullet('日程（Appleカレンダー風：開始→終了、既定は今日、単日／複数日・時間帯対応）'));
children.push(bullet('場所（オンライン=URL貼付／対面=住所貼付／なし）／ステータス'));

children.push(h2('4.3 種類（色分け）'));
children.push(table([1200, 7200], [
  ['色', '種類'],
  ['青', 'インターン・夏/冬インターン・ワークショップ・イベント'],
  ['緑', '説明会・セミナー・オープンカンパニー'],
  ['赤', 'OB・OG訪問'],
  ['紫', '本選考'],
  ['グレー', 'カスタム種類'],
]));

children.push(h2('4.4 詳細ページ（選考記録の中核）'));
children.push(bullet('ステータス切替 / ✏️編集（名前・活動名・種類、改名時はマイページ情報も追随）'));
children.push(bullet('日程・場所（地図・リンクのショートカット付き）'));
children.push(bullet('結果マーク：ES通過 / 参加決定'));
children.push(bullet('**選考ステップ**（下表の構造で追加、各ステップに✅完了チェック）'));
children.push(spacer(40));
children.push(table([3000, 5400], [
  ['ステップ', '内容'],
  ['ES', '設問＋回答（複数、回答は文字数カウント）'],
  ['動画視聴 / 説明会 / GD / インターン', 'ノート'],
  ['動画選考', '質問＋ノート'],
  ['面接', 'ノート＋質問（各質問に 予測/本番 タグ）'],
]));
children.push(spacer(60));
children.push(bullet('**📝振り返り**：全体の感想メモ'));
children.push(bullet('**💬フィードバック**：任意、企業・面接官からの評価を記録'));
children.push(bullet('**🔐マイページ情報**：URL / ログインID / パスワード（表示切替、企業単位で共有）'));
children.push(bullet('**📅iOSカレンダー登録**：.ics 書き出し'));

children.push(h2('4.5 統計（折りたたみ可・状態記憶）'));
children.push(bullet('数値カード：全エントリー / ES通過 / 参加決定 / ステップ完了率'));
children.push(bullet('種類別の内訳（棒グラフ）／ステップ別の件数（青=総数、緑=完了）'));

children.push(h2('4.6 カレンダー'));
children.push(bullet('月表示、イベントは種類ごとに色分け、複数日は連続表示'));
children.push(bullet('日付タップでその日の一覧、イベントから詳細へ'));

children.push(h2('4.7 システム機能'));
children.push(bullet('**自動保存**：入力ごとに即時保存、バックグラウンド/終了時にも保険保存'));
children.push(bullet('**⚙バックアップ**：JSON エクスポート／インポート'));
children.push(bullet('**iOSカレンダー書き出し**：新規作成時に確認、または詳細から手動 .ics'));
children.push(bullet('**🌙ダークモード**：ワンタップ切替、システム追従、選択を記憶'));

/* 5. データ構造 */
children.push(h1('5. データ構造（localStorage）'));
const code = [
  '{',
  '  entries: [{',
  '    id, name, type, subtitle, status,           // 基本情報',
  '    startDate, endDate, time, endTime,           // 日程',
  '    locType, locValue,                           // 場所',
  '    marks: [],                                   // ES通過/参加決定',
  '    review, hasFeedback, feedback,               // 振り返り・FB',
  '    steps: [{',
  '      id, kind, date, time, note, done,',
  '      questions: [{ id, q, a, tag }]             // ES設問/面接問答',
  '    }]',
  '  }],',
  '  customTypes: [],                               // カスタム種類',
  '  companies: { "会社名": { mypageUrl, loginId, password } }',
  '}',
];
children.push(new Paragraph({
  shading: { type: ShadingType.CLEAR, fill: 'F6F8FA', color: 'auto' },
  spacing: { before: 60, after: 120 },
  border: {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
  },
  children: code.map(l => new TextRun({ text: l, font: 'Consolas', size: 17, color: DARK, break: code.indexOf(l) === 0 ? 0 : 1 })),
}));
children.push(bullet('保存キー：syuukatsu-kiroku-v1（現在まで不変、後方互換）'));
children.push(bullet('テーマ：syuukatsu-theme／統計折りたたみ：syuukatsu-stats-collapsed'));

/* 6. プライバシー */
children.push(h1('6. プライバシーと安全'));
children.push(bullet('全データは当該ブラウザの端末内のみに保存。サーバー送信・個人特定なし'));
children.push(bullet('端末/ブラウザ間は非共有 → JSON バックアップで移行'));
children.push(bullet('マイページのパスワードは平文ローカル保存。「共用PCでは入力しないでください」と注意表示'));

/* 7. 開発の歩み */
children.push(h1('7. 開発の歩み（主なマイルストーン）'));
[
  '初版：3セクション記録＋カレンダー＋自動保存',
  '日程の単日/複数日対応、カレンダー連動',
  'Apple風日程・場所・結果マーク・ステップ完了・インターン細分',
  '自動保存の強化＋JSONバックアップ',
  '締切バッジ・検索・文字数カウント・ダークモード',
  'OB・OG訪問、統計パネル',
  '振り返り・フィードバック、日付の既定を今日に',
  'Vercelへ移行（yuukikeioを外す）',
  'iOSカレンダー書き出し、企業マイページ情報',
  'イベント種類、同名企業のまとめページ',
  '会社名サジェスト、名前/種類の後編集、活動名',
  'コードのリファクタリング（HTML/CSS/JS分割、日付UTCズレ修正）',
  '今日・明日バナー、統計の折りたたみ',
].forEach((t, i) => children.push(bullet(`${i + 1}. ${t}`)));

/* 8. 今後 */
children.push(h1('8. 今後の計画（候補）'));
children.push(h2('優先'));
children.push(bullet('PWA化＋アイコン（ホーム追加・オフライン利用）'));
children.push(bullet('削除の取り消し（誤削除によるデータ喪失の防止）'));
children.push(bullet('ES提出締切の概念（ステップに締切日、赤いリマインド）'));
children.push(h2('機能強化'));
children.push(bullet('ES回答ライブラリ（自己PR・ガクチカのテンプレを再利用）'));
children.push(bullet('内定・お祈りマーク＋ファネル図/通過率'));
children.push(bullet('面接の逆質問管理'));
children.push(h2('体験'));
children.push(bullet('振り返り一覧ページ、カレンダーの種類フィルタ、全文検索'));

children.push(spacer(200));
children.push(new Paragraph({ alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '— 以上 —', size: 20, color: GRAY, font: FONT })] }));

/* ---------- 出力 ---------- */
const doc = new Document({
  creator: 'CCちゃん',
  title: '就活キロク 企画書',
  styles: { default: { document: { run: { font: FONT } } } },
  sections: [{
    properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('/Users/yuuki/CC/syuukatsukiroku/就活キロク_企画書.docx', buf);
  console.log('written', buf.length, 'bytes');
});
