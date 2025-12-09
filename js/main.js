// ===== Firebase SDK（Realtime Database）=====
import { initializeApp }
    from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
    getDatabase, ref, push, set, onChildAdded, remove, onChildRemoved
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

// =============================
// Firebaseの情報（入れてません）
// =============================
const firebaseConfig = {

};

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// イベントログ型：イベントが溜まっていく場所
const dbRef = ref(db, "pixel_sync");

// =============================
// 画面仕様
// =============================
const GRID_SIZE = 8;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;

// 左から：黒、白、赤、青、水色、黄色、緑、オレンジ、紫、ピンク
const COLORS = [
    "#000000",
    "#FFFFFF",
    "#FF0000",
    "#0000FF",
    "#6fdcfdff",
    "#FFFF00",
    "#01d21dff",
    "#FFA500",
    // "#800080",
    // "#ff64ffff",
];

// 現在選択中の色（初期：黒）
let currentColor = COLORS[0];

// localStorageキー（保存は1件）
const SAVE_KEY = "PIXEL_SYNC_SAVE_1";

// =============================
// 初期UI生成
// =============================

// カラーピッカーを作る
function renderPalette() {
    $("#palette").empty();

    //forEach は 配列の中身を先頭から順番に取り出して処理するメソッド
    COLORS.forEach((c, i) => { //cが色の要素
        const chip = $(`<div class="color-chip"></div>`); //カラーチップを1個作る
        chip.css("background", c);  //背景色をc色にする
        chip.attr("data-color", c); //chipにに data-color という属性を、値 c で設定する（クリックされたチップが何色かを、要素自体に記録しておくため）

        if (i === 0) chip.addClass("selected");// 初期選択（黒）

        $("#palette").append(chip);
    });

    //for版
    // for (let i = 0; i < COLORS.length; i++) {
    //     const c = COLORS[i];
    //     const chip = $(`<div class="color-chip"></div>`);
    //     chip.css("background", c);
    //     chip.attr("data-color", c);
    //     if (i === 0) chip.addClass("selected");
    //     $("#palette").append(chip);
    // }
}

// 8x8の描画マスを作る
function renderGrid() {
    $("#grid").empty();

    for (let i = 0; i < CELL_COUNT; i++) {
        const cell = $(`<div class="cell"></div>`);
        cell.attr("data-index", i);
        cell.attr("data-color", "#FFFFFF");  // 初期は白
        $("#grid").append(cell);
    }
}

// 保存プレビュー（1件）を表示
function renderSavePreview(pixels) {        //pixels は64マス分の色が入った配列を想定
    $("#savePreview").empty();              //一旦消去

    //安全チェック（pixelsが入っていない場合、配列の数が64個ではない場合）
    if (!pixels || pixels.length !== CELL_COUNT) {
        $("#savePreview").append(`<div class="hint">まだ保存がありません</div>`);
        return;     //チェックが入った場合はここで終了
    }

    const mini = $(`<div class="mini-grid"></div>`); //小さい8*8のグリッド外枠を作る

    pixels.forEach((c) => {
        const mc = $(`<div class="mini-cell"></div>`);//ミニセルを1マス作る
        mc.css("background", c);
        mini.append(mc);
    });

    // 保存データをクリックで復元できるようにするため、
    // コンテナに属性を持たせる
    mini.attr("data-has-save", "1");

    $("#savePreview").append(mini);
}

// =============================
// 盤面の操作ヘルパー
// =============================

// indexのマスを指定色で塗る（ローカルUI反映）
function paintCellLocal(index, color) {
    const cell = $(`.cell[data-index="${index}"]`); //テンプレートリテラル！
    cell.css("background", color);
    cell.attr("data-color", color); //属性に何色か記録。後で getPixelsFromDom()で使う！
}

// 盤面全体を配列で適用（ローカルUI反映）
function applyPixelsLocal(pixels) {     //pixelsは配列を想定
    pixels.forEach((c, i) => paintCellLocal(i, c));
}

// 盤面全体を白にする（ローカルUI反映）
function clearLocal() {
    for (let i = 0; i < CELL_COUNT; i++) {
        paintCellLocal(i, "#FFFFFF");
    }
}

// 現在の盤面を配列で取得（data-colorから）
function getPixelsFromDom() {
    const arr = [];     //からっぽ配列
    $(".cell").each((i, el) => {  //インデックスを使わない時は.each((_, el) という記述もあるらしい。。
        arr.push($(el).attr("data-color") );    //各マスの data-color を読み取って配列に追加
    });
    return arr;
}

// =============================
// Firebaseへイベント送信
// =============================

function pushEvent(ev) {        //クリックやクリア時にDBに追加
    const newRef = push(dbRef); //pixel_sync の下にユニークキーの子を作る
    return set(newRef, ev);     //その子にイベント内容を書き込む
}

function nowJP() {
    return new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

// =============================
// イベント受信（リアルタイム反映）
// ※機能が増えたらここに分岐を足すだけでよいメリットがある！
// =============================

function handleEvent(ev) {
    if (!ev || !ev.type) return;    //安全チェック、type が無いイベントは無視。

    // 1) paint：1マス塗りなら、指定のマスを指定色でローカル反映。
    if (ev.type === "paint") {
        paintCellLocal(ev.index, ev.color);
        return;
    }

    // 2) clear：全消し
    if (ev.type === "clear") {
        clearLocal();
        return;
    }

    // 3) applySave：保存配列の一括反映
    if (ev.type === "applySave") {
        if (Array.isArray(ev.pixels) && ev.pixels.length === CELL_COUNT) {
            applyPixelsLocal(ev.pixels);
        }
        return;
    }
}

// 新しい子要素が追加されるたび反映
// 初回起動時には既存のイベントが順番に流れてくる
onChildAdded(dbRef, (data) => {
    const ev = data.val();
    handleEvent(ev);        //UIに反映する（種類ごとに画面を変える）
});

// =============================
// UIイベント
// =============================

// カラーピッカー選択
$("#palette").on("click", ".color-chip", function () {  //カラーチップがクリックされたら
    $(".color-chip").removeClass("selected");           //いったん全部の selected を外して
    $(this).addClass("selected");                       //今クリックされたチップ（＝$(this)）だけ selected を付ける
    currentColor = $(this).attr("data-color");          //今クリックされたチップが持つ data-color を読み取って代入
});

// 描画マスクリック
$("#grid").on("click", ".cell", function () {
    const index = Number($(this).attr("data-index"));   //イベント委譲！クリックされたマス（this）からdata-index を取り出す。Number(...) で数値に変換。

    // ローカル即反映
    paintCellLocal(index, currentColor);

    // Firebaseへイベント送信
    const ev = {
        type: "paint",
        index,          //index: index と同じ意味
        color: currentColor,
        time: nowJP()
    };
    pushEvent(ev);
});

// ALL CLEAR
$("#allClear").on("click", function () {
    const ok = confirm("全て削除しますか？");
    if (!ok) return;

    // ローカル即反映
    clearLocal();

    // Firebaseへclearイベント
    const ev = { type: "clear", time: nowJP() };
    pushEvent(ev);
});

// SAVE ▶（保存は1件）
$("#saveBtn").on("click", function () {
    const pixels = getPixelsFromDom();

    // localStorageへ保存
    localStorage.setItem(SAVE_KEY, JSON.stringify(pixels));

    // 右の保存領域に反映
    renderSavePreview(pixels);
});

// 保存領域クリックで復元
$("#savePreview").on("click", function () {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;

    const pixels = JSON.parse(raw);
    if (!Array.isArray(pixels) || pixels.length !== CELL_COUNT) return; //Array.isArray() は「それが配列かどうか」という確認

    const ok = confirm("保存した情報で塗り替えますか？");
    if (!ok) return;

    // ローカル反映
    applyPixelsLocal(pixels);

    // Firebaseへ applySave イベント
    const ev = {
        type: "applySave",
        pixels,         //pixels: pixels と同じ意味（64色配列を丸ごと）
        time: nowJP()
    };
    pushEvent(ev);
});

// =============================
// 起動時処理
// =============================
renderPalette();
renderGrid();

// 既存保存があれば右に表示（1件）
const saved = localStorage.getItem(SAVE_KEY);
if (saved) {
    try {
        const pixels = JSON.parse(saved);
        renderSavePreview(pixels);
    } catch {
        renderSavePreview(null);
    }
} else {
    renderSavePreview(null);
}
