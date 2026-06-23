/**
 * 🌟 AIスワップ用ファイル 🌟
 * このファイルは、問題生成およびデータソース管理専用ファイルです。
 * 常に `window.ProblemGenerator` として機能を提供します。
 */
window.ProblemGenerator = {
    // 表示する「今日のドリル」のタイトル
    topicName: "歴史・社会ドリル",

    // 現在出題された問題のモード（スコア計算の互換性用）
    mode: "social",

    // 読み込まれた問題リスト
    problems: [],

    // 現在の問題のインデックス
    currentIndex: 0,

    // デフォルトの問題データ (社会科・歴史・地理・公民)
    defaultProblems: [
        {
            question: "1603年に江戸幕府を開き、初代将軍となった人物はだれですか。",
            answer: "徳川家康",
            option1: "織田信長",
            option2: "豊臣秀吉",
            option3: "足利尊氏"
        },
        {
            question: "日本で一番高い山は富士山ですが、日本で一番長い川はどこの川ですか。",
            answer: "信濃川",
            option1: "利根川",
            option2: "石狩川",
            option3: "淀川"
        },
        {
            question: "世界で一番大きい（面積が広い）国はどこですか。",
            answer: "ロシア",
            option1: "カナダ",
            option2: "アメリカ",
            option3: "中国"
        },
        {
            question: "日本の国会は二院制をとっています。衆議院ともう一つは何ですか。",
            answer: "参議院",
            option1: "貴族院",
            option2: "民議院",
            option3: "元老院"
        },
        {
            question: "聖徳太子が定めた、役人の心得や道徳を示したきまりを何といいますか。",
            answer: "十七条の憲法",
            option1: "冠位十二階",
            option2: "大宝律令",
            option3: "武家諸法度"
        },
        {
            question: "日本の都道府県のうち、最も面積が広いのはどこですか。",
            answer: "北海道",
            option1: "岩手県",
            option2: "東京都",
            option3: "福島県"
        },
        {
            question: "縄文時代の次に訪れた、米作り（稲作）が本格的に始まった時代を何といいますか。",
            answer: "弥生時代",
            option1: "古墳時代",
            option2: "奈良時代",
            option3: "鎌倉時代"
        },
        {
            question: "1945年、世界で最初に原子爆弾が投下された日本の都市はどこですか。",
            answer: "広島",
            option1: "長崎",
            option2: "東京",
            option3: "沖縄"
        },
        {
            question: "世界遺産にも登録されている、兵庫県にある「白鷺城（しらさぎじょう）」とも呼ばれる城は何ですか。",
            answer: "姫路城",
            option1: "大阪城",
            option2: "熊本城",
            option3: "名古屋城"
        },
        {
            question: "日本周辺に吹く、夏と冬で風向きが反対になる風を何といいますか。",
            answer: "季節風（モンスーン）",
            option1: "偏西風",
            option2: "貿易風",
            option3: "エルニーニョ"
        }
    ],

    // 初期化（デフォルト問題をロード）
    init: function() {
        this.problems = JSON.parse(JSON.stringify(this.defaultProblems));
        this.shuffleProblems();
        this.currentIndex = 0;
    },

    // 問題のシャッフル
    shuffleProblems: function() {
        if (!this.problems || this.problems.length === 0) return;
        for (let i = this.problems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.problems[i], this.problems[j]] = [this.problems[j], this.problems[i]];
        }
    },

    // 読み込んだ配列データを正規化して登録
    setProblems: function(newProblems) {
        if (Array.isArray(newProblems) && newProblems.length > 0) {
            const parsed = newProblems.map((p, idx) => {
                const opt1 = p.option1 || p.Option1 || p["選択肢1"] || p["選択肢１"] || "";
                const opt2 = p.option2 || p.Option2 || p["選択肢2"] || p["選択肢２"] || "";
                const opt3 = p.option3 || p.Option3 || p["選択肢3"] || p["選択肢３"] || "";
                const q = p.question || p.Question || p["問題"] || p["問題文"] || "";
                
                const rawAns = p.answer !== undefined ? p.answer : (p.Answer !== undefined ? p.Answer : p["正解"]);
                const ansText = String(rawAns !== undefined ? rawAns : "").trim();

                const target = p.target || p.Target || p["タイプ"];
                const valueA = p.valueA || p.valuea || p["もとにする量"];
                const valueB = p.valueB || p.valueb || p["比べる量"];
                const ratio = p.ratio || p.Ratio || p["割合"];

                return {
                    question: q,
                    answer: ansText, // 正解文字列
                    option1: String(opt1), // 誤答1
                    option2: String(opt2), // 誤答2
                    option3: String(opt3), // 誤答3
                    target: target || null,
                    valueA: valueA !== undefined ? String(valueA) : null,
                    valueB: valueB !== undefined ? String(valueB) : null,
                    ratio: ratio !== undefined ? String(ratio) : null,
                    colorA: p.colorA || p["色A"] || "白",
                    colorB: p.colorB || p["色B"] || "赤",
                    unit: p.unit || p["単位"] || "m"
                };
            }).filter(p => p.question && p.answer && p.option1);

            if (parsed.length > 0) {
                this.problems = parsed;
                this.shuffleProblems();
                this.currentIndex = 0;
                return this.problems.length;
            }
        }
        return 0;
    },

    // CSVテキストを自前でパースする簡易ロジック（SheetJSがCORS制限やブロック等でロードされなかった場合の救済策）
    parseCSVLocally: function(text) {
        if (!text) return [];
        const lines = text.split(/\r?\n/);
        if (lines.length <= 1) return [];
        
        // ヘッダー行（BOM文字 \uFEFF を安全に削除）
        const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
        const results = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            // ダブルクォーテーション（""）内のカンマを考慮した簡易パース
            const row = [];
            let insideQuote = false;
            let currentField = "";
            
            for (let j = 0; j < lines[i].length; j++) {
                const char = lines[i][j];
                if (char === '"') {
                    insideQuote = !insideQuote;
                } else if (char === ',' && !insideQuote) {
                    row.push(currentField.trim());
                    currentField = "";
                } else {
                    currentField += char;
                }
            }
            row.push(currentField.trim());
            
            const problem = {};
            for (let k = 0; k < headers.length; k++) {
                // クォーテーション囲みを剥ぎ取る
                let val = row[k] || "";
                if (val.startsWith('"') && val.endsWith('"')) {
                    val = val.substring(1, val.length - 1);
                }
                problem[headers[k]] = val;
            }
            results.push(problem);
        }
        console.log("Locally parsed CSV rows:", results.length);
        return results;
    },

    // Excel/CSVファイルをブラウザ側で読み込んで登録する
    loadFromFile: function(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const isCsv = file.name.toLowerCase().endsWith('.csv');
                
                // SheetJSが読み込めない場合、またはCSVファイルの場合は自前でパース
                if (typeof XLSX === 'undefined' || isCsv) {
                    const text = new TextDecoder('utf-8').decode(e.target.result);
                    const jsonData = this.parseCSVLocally(text);
                    const count = this.setProblems(jsonData);
                    if (count > 0) {
                        callback({ success: true, count: count });
                        return;
                    }
                }

                // Excelファイルの場合はXLSXライブラリでパース
                if (typeof XLSX !== 'undefined') {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    
                    const count = this.setProblems(jsonData);
                    if (count > 0) {
                        callback({ success: true, count: count });
                        return;
                    }
                }
                
                callback({ success: false, error: "有効な問題データが見つかりませんでした。" });
            } catch (err) {
                console.error("File parse error:", err);
                callback({ success: false, error: "ファイルの解析に失敗しました。" });
            }
        };
        reader.onerror = () => {
            callback({ success: false, error: "ファイルの読み込み中にエラーが発生しました。" });
        };
        // CSVパースも想定し、ArrayBufferで読み込み
        reader.readAsArrayBuffer(file);
    },

    // フォルダ内の特定のExcel/CSVファイルを自動フェッチして読み込む
    loadLocalExcelFile: async function(filePath, callback) {
        try {
            const res = await fetch(filePath + `?t=${Date.now()}`);
            if (!res.ok) throw new Error(`ファイルが見つかりません: ${filePath}`);
            
            const isCsv = filePath.toLowerCase().endsWith('.csv');
            
            // SheetJSが無い場合、またはCSVファイルの場合は自前の簡易パースを使用
            if (typeof XLSX === 'undefined' || isCsv) {
                const text = await res.text();
                const jsonData = this.parseCSVLocally(text);
                const count = this.setProblems(jsonData);
                if (count > 0) {
                    callback({ success: true, count: count });
                    return;
                }
            } else if (typeof XLSX !== 'undefined') {
                // ExcelファイルかつSheetJSが読み込まれている場合
                const arrayBuffer = await res.arrayBuffer();
                const data = new Uint8Array(arrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                
                const count = this.setProblems(jsonData);
                if (count > 0) {
                    callback({ success: true, count: count });
                    return;
                }
            }
            
            throw new Error("有効な問題データが見つかりませんでした。");
        } catch (err) {
            console.warn(`Local file load failed for ${filePath}:`, err);
            callback({ success: false, error: err.message });
        }
    },

    // GAS経由でスプレッドシートから読み込む
    loadFromGAS: async function(apiUrl, callback) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒タイムアウト

        try {
            const res = await fetch(`${apiUrl}?action=getProblems&t=${Date.now()}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error("サーバーとの通信に失敗しました。");
            const data = await res.json();
            if (data && data.problems) {
                const count = this.setProblems(data.problems);
                callback({ success: true, count: count });
            } else {
                throw new Error("データフォーマットが正しくありません。");
            }
        } catch (err) {
            clearTimeout(timeoutId);
            console.error("GAS load error:", err);
            callback({ success: false, error: err.name === 'AbortError' ? "通信タイムアウト（3秒）" : err.message });
        }
    },

    // 出題関数 (sf6_battle.js から呼ばれる)
    generate: function() {
        if (!this.problems || this.problems.length === 0) {
            this.init();
        }

        if (this.currentIndex >= this.problems.length) {
            this.shuffleProblems();
            this.currentIndex = 0;
        }

        const p = this.problems[this.currentIndex];
        this.currentIndex++;

        // 正解1つ ＋ 誤答3つ ＝ 合計4択
        const rawOptions = [p.answer, p.option1, p.option2, p.option3].filter(opt => opt !== "");
        
        // 最初の要素（正解）を追跡しながらシャッフル
        const optionsWithMeta = rawOptions.map((opt, idx) => ({ 
            text: opt, 
            isCorrect: idx === 0 
        }));
        
        for (let i = optionsWithMeta.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [optionsWithMeta[i], optionsWithMeta[j]] = [optionsWithMeta[j], optionsWithMeta[i]];
        }
        
        const shuffledOptions = optionsWithMeta.map(o => o.text);
        const correctIndex = optionsWithMeta.findIndex(o => o.isCorrect);

        this.mode = p.target || "social";

        let paramsObj = null;
        if (p.target && p.valueA && p.valueB && p.ratio) {
            paramsObj = {
                target: p.target,
                colorA: p.colorA,
                colorB: p.colorB,
                valueA: p.valueA,
                valueB: p.valueB,
                ratio: p.ratio,
                unit: p.unit || "m"
            };
        }

        return {
            questionText: p.question,
            options: shuffledOptions,
            answerIndex: correctIndex, // 0〜3
            answerText: p.answer,
            params: paramsObj
        };
    }
};
