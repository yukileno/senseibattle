// --- Configuration ---
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyno-Otdjr5xQnC2t3ZWZhNJAJPA3WeJLM6K52cKzJ2XuFjzL1aBHydSr29rN2PsVR5mQ/exec";
const APP_SHEET_NAME = "wariai"; // 割合・比率用 (または社会用)
const LOCAL_STORAGE_KEY = "wariai1_sf6_save_v1"; // セーブ用

let gameState = {
    playerName: "",
    score: 0,
    lives: 3,
    rivalLives: 5,
    rivalMaxLives: 5,
    stage: 1,
    rivalKOs: 0, // ザンギエフを倒した回数
    consecutiveCorrects: 0,
    currentProblem: null,
    isTransitioning: false
};

// --- SF6 Sound Manager (HTML5 Audio Player) ---
class SF6SoundManager {
    constructor() {
        this.soundPaths = {
            correct: 'sound/correct.mp3',
            wrong: 'sound/wrong.mp3',
            fireNormal: 'sound/hadouken_fire.mp3',
            fireEx: 'sound/hadouken_fire_ex.mp3',
            fireShakunetsu: 'sound/hadouken_fire_shakunetsu.mp3',
            hitNormal: 'sound/hit_normal.mp3',
            hitCritical: 'sound/hit_critical.mp3',
            ko: 'sound/ko.mp3',
            victory: 'sound/victory.mp3',
            defeat: 'sound/defeat.mp3',
            combo: 'sound/combo.mp3'
        };
        
        this.sounds = {};
        this.isInitialized = false;
        
        Object.entries(this.soundPaths).forEach(([key, path]) => {
            try {
                this.sounds[key] = new Audio(path);
                this.sounds[key].preload = 'auto';
                this.sounds[key].volume = 0.4;
            } catch (e) {
                console.warn(`Audio initialization failed for ${key}:`, e);
            }
        });
    }

    init() {
        if (this.isInitialized) return;
        
        const unlock = () => {
            Object.values(this.sounds).forEach(s => {
                if (s) {
                    s.play().then(() => {
                        s.pause();
                        s.currentTime = 0;
                    }).catch(() => {});
                }
            });
            this.isInitialized = true;
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);
    }

    play(key, clone = true) {
        const s = this.sounds[key];
        if (!s) return;
        
        try {
            if (clone) {
                const cloned = s.cloneNode();
                cloned.volume = s.volume;
                cloned.play().catch(e => console.warn("Audio playback failed (file might be missing):", e));
            } else {
                s.currentTime = 0;
                s.play().catch(e => console.warn("Audio playback failed (file might be missing):", e));
            }
        } catch (e) {
            console.warn("Failed to play sound:", key, e);
        }
    }

    playCorrect() { this.play('correct'); }
    playWrong() { this.play('wrong'); }
    
    playHadoukenFire(type = 'blue') {
        if (type === 'purple') {
            this.play('fireEx');
        } else if (type === 'red') {
            this.play('fireShakunetsu');
        } else {
            this.play('fireNormal');
        }
    }

    playHit(type = 'blue') {
        if (type === 'purple' || type === 'red') {
            this.play('hitCritical');
        } else {
            this.play('hitNormal');
        }
    }

    playCombo(count) {
        const comboAudio = this.sounds['combo'];
        if (comboAudio) {
            const onError = () => {
                this.play('correct');
                comboAudio.removeEventListener('error', onError);
            };
            comboAudio.addEventListener('error', onError);
            
            comboAudio.play().then(() => {
                comboAudio.pause();
                comboAudio.currentTime = 0;
                this.play('combo');
            }).catch(() => {
                this.play('correct');
            });
        } else {
            this.play('correct');
        }
    }

    playKOExplosion() { this.play('ko'); }
    playVictory() { this.play('victory', false); }
    playDefeat() { this.play('defeat', false); }
}

const sound = new SF6SoundManager();

// --- DOM Elements ---
const screens = {
    start: document.getElementById('screen-start'),
    game: document.getElementById('screen-game'),
    result: document.getElementById('screen-result'),
    ranking: document.getElementById('screen-ranking')
};

const dom = {
    playerNameInput: document.getElementById('player-name'),
    playerNameDisplay: document.getElementById('player-name-display'),
    topicNameDisplay: document.getElementById('topic-name'),
    lifeBar: document.getElementById('player-life-bar'),
    rivalLifeBar: document.getElementById('rival-life-bar'),
    gameStageDisplay: document.getElementById('game-stage'),
    currentScoreDisplay: document.getElementById('current-score'),
    questionText: document.getElementById('question-text'),
    
    // Excel/CSVアップロード関連
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    uploadStatus: document.getElementById('upload-status'),

    // 4択クイズ用
    quizOptionsContainer: document.getElementById('quiz-options'),
    problemBoard: document.getElementById('problem-board'), // 正誤判定フラッシュ用
    
    finalScoreValue: document.getElementById('final-score-value'),
    resultStatus: document.getElementById('result-status'),
    savingStatus: document.getElementById('saving-status'),
    rankingList: document.getElementById('ranking-list'),
    btnResume: document.getElementById('btn-resume'),
    comboContainer: document.getElementById('combo-container'),
    comboCount: document.getElementById('combo-count'),
    
    // バトル演出用
    ryuChar: document.getElementById('ryu-char'),
    zangiefChar: document.getElementById('zangief-char'),
    hadoukenBall: document.getElementById('hadouken-ball'),
    hitSpark: document.getElementById('hit-spark'),
    hadoukenText: document.getElementById('hadouken-text'),
    battleStage: document.getElementById('battle-stage')
};

// URLパラメータ取得用ヘルパー
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// --- Initialization ---
function init() {
    console.log("Game initializing...");
    
    try {
        window.ProblemGenerator.topicName = "歴史・社会ドリル";
        if (dom.topicNameDisplay) dom.topicNameDisplay.textContent = window.ProblemGenerator.topicName;
        document.title = window.ProblemGenerator.topicName;
    } catch (e) { console.error("Error setting title:", e); }
    
    try {
        const savedName = localStorage.getItem('math_player_name');
        if(savedName && dom.playerNameInput) dom.playerNameInput.value = savedName;
    } catch (e) { console.error("Error loading name:", e); }
    
    try {
        const btnStart = document.getElementById('btn-start');
        if (btnStart) btnStart.addEventListener('click', startGame);
    } catch (e) { console.error("Error binding start button:", e); }
    
    try {
        if (dom.btnResume) {
            dom.btnResume.addEventListener('click', resumeGame);
        }
    } catch (e) { console.error("Error binding resume button:", e); }
    
    try {
        const btnShowRanking = document.getElementById('btn-show-ranking');
        if (btnShowRanking) btnShowRanking.addEventListener('click', showRanking);
    } catch (e) { console.error("Error binding ranking button:", e); }
    
    try {
        const btnRetry = document.getElementById('btn-retry');
        if (btnRetry) {
            btnRetry.addEventListener('click', () => {
                checkResumeData();
                switchScreen('start');
            });
        }
    } catch (e) { console.error("Error binding retry button:", e); }
    
    try {
        const btnResultRanking = document.getElementById('btn-result-ranking');
        if (btnResultRanking) btnResultRanking.addEventListener('click', showRanking);
    } catch (e) { console.error("Error binding result ranking button:", e); }
    
    try {
        const btnBackHome = document.getElementById('btn-back-home');
        if (btnBackHome) {
            btnBackHome.addEventListener('click', () => {
                checkResumeData();
                switchScreen('start');
            });
        }
    } catch (e) { console.error("Error binding back home button:", e); }

    try {
        const isDebug = getQueryParam('debug') === '1';
        const uploadContainer = document.querySelector('.upload-container-sf6');
        if (uploadContainer) {
            uploadContainer.style.display = isDebug ? 'block' : 'none';
        }
    } catch (e) { console.error("Error setting debug container:", e); }

    try { initUploadEvents(); } catch (e) { console.error("Error in initUploadEvents:", e); }
    try { initQuizOptionEvents(); } catch (e) { console.error("Error in initQuizOptionEvents:", e); }

    try {
        window.addEventListener('keydown', (e) => {
            if(screens.game && screens.game.classList.contains('active')) {
                if (/[1-4]/.test(e.key)) {
                    const optIndex = parseInt(e.key, 10) - 1;
                    const buttons = dom.quizOptionsContainer.querySelectorAll('.option-btn');
                    if (buttons[optIndex]) {
                        buttons[optIndex].click();
                    }
                }
            } else if (screens.start && screens.start.classList.contains('active') && e.key === 'Enter') {
                const btnStart = document.getElementById('btn-start');
                if (btnStart && !btnStart.disabled) {
                    startGame();
                }
            }
        });
    } catch (e) { console.error("Error binding keydown:", e); }

    try { checkResumeData(); } catch (e) { console.error("Error checking resume data:", e); }

    try {
        loadProblemsChain();
    } catch (e) {
        console.error("Error loading problems chain:", e);
        // ロードチェーン失敗時は強制的にデフォルト問題で初期化
        try {
            window.ProblemGenerator.init();
            const btnStart = document.getElementById('btn-start');
            if (btnStart) {
                btnStart.disabled = false;
                btnStart.textContent = "BATTLE START";
            }
        } catch (innerEx) {
            console.error("Critical: failed to fallback default problems:", innerEx);
        }
    }
}

// --- Excel/CSV upload logic ---
function initUploadEvents() {
    const dropZone = dom.dropZone;
    const fileInput = dom.fileInput;

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });
}

function handleUploadedFile(file) {
    if (!dom.uploadStatus) return;

    dom.uploadStatus.style.display = 'block';
    dom.uploadStatus.textContent = "ファイルを読み込み中...";
    dom.uploadStatus.style.borderLeftColor = "#ff0077";
    dom.uploadStatus.style.background = "rgba(255, 0, 119, 0.1)";

    window.ProblemGenerator.loadFromFile(file, (res) => {
        if (res.success) {
            dom.uploadStatus.textContent = `成功：${res.count} 問の問題データをロードしました！`;
            dom.uploadStatus.style.borderLeftColor = "#00ff88";
            dom.uploadStatus.style.background = "rgba(0, 255, 136, 0.1)";
            
            const textEl = dom.dropZone.querySelector('.upload-text');
            if (textEl) textEl.textContent = `適用中: ${file.name}`;
        } else {
            dom.uploadStatus.textContent = `エラー: ${res.error}`;
            dom.uploadStatus.style.borderLeftColor = "#ff005f";
            dom.uploadStatus.style.background = "rgba(255, 0, 95, 0.1)";
        }
    });
}

// --- フォールバックチェーン付問題自動ロード ---
function loadProblemsChain() {
    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = "LOADING PROBLEMS...";
    }

    if (dom.uploadStatus) {
        dom.uploadStatus.style.display = 'block';
        dom.uploadStatus.textContent = "問題データを読み込んでいます...";
        dom.uploadStatus.style.borderLeftColor = "#00f3ff";
        dom.uploadStatus.style.background = "rgba(0, 243, 255, 0.1)";
    }

    // 0. window.CSV_DATA_INPUT が定義されていれば最優先で読み込む (CORS制限を回避したローカル自動読み込み)
    if (window.CSV_DATA_INPUT && window.CSV_DATA_INPUT.trim()) {
        try {
            const jsonData = window.ProblemGenerator.parseCSVLocally(window.CSV_DATA_INPUT);
            const count = window.ProblemGenerator.setProblems(jsonData);
            if (count > 0) {
                onProblemsLoaded(`自動適用：problems.js から ${count} 問ロードしました。`);
                return;
            }
        } catch (e) {
            console.warn("Failed to parse window.CSV_DATA_INPUT:", e);
        }
    }

    // 1. problems.xlsx の読み込み試行
    window.ProblemGenerator.loadLocalExcelFile('problems.xlsx', (resXlsx) => {
        if (resXlsx.success) {
            onProblemsLoaded(`自動適用：problems.xlsx から ${resXlsx.count} 問ロードしました。`);
        } else {
            // 2. 失敗したら problems.csv の読み込み試行
            window.ProblemGenerator.loadLocalExcelFile('problems.csv', (resCsv) => {
                if (resCsv.success) {
                    onProblemsLoaded(`自動適用：problems.csv から ${resCsv.count} 問ロードしました。`);
                } else {
                    // 3. 失敗したら GAS から読み込み試行
                    if (GAS_API_URL !== "YOUR_GAS_ENDPOINT_URL_HERE") {
                        window.ProblemGenerator.loadFromGAS(GAS_API_URL, (resGas) => {
                            if (resGas.success) {
                                onProblemsLoaded(`スプレッドシートから ${resGas.count} 問ロードしました。`);
                            } else {
                                useDefaultProblems("既定の問題（10問）を適用しました。");
                            }
                        });
                    } else {
                        useDefaultProblems("既定の問題（10問）を適用しました。");
                    }
                }
            });
        }
    });

    function onProblemsLoaded(msg) {
        console.log("Problems loaded:", msg);
        if (btnStart) {
            btnStart.disabled = false;
            btnStart.textContent = "BATTLE START";
        }
        if (dom.uploadStatus) {
            dom.uploadStatus.textContent = msg;
            dom.uploadStatus.style.borderLeftColor = "#00ff88";
            dom.uploadStatus.style.background = "rgba(0, 255, 136, 0.1)";
            if (getQueryParam('debug') !== '1') {
                setTimeout(() => {
                    dom.uploadStatus.style.display = 'none';
                }, 4000);
            }
        }
    }

    function useDefaultProblems(msg) {
        console.log("Fallback to default problems");
        window.ProblemGenerator.init(); // デフォルト問題で初期化
        if (btnStart) {
            btnStart.disabled = false;
            btnStart.textContent = "BATTLE START";
        }
        if (dom.uploadStatus) {
            dom.uploadStatus.textContent = msg;
            dom.uploadStatus.style.borderLeftColor = "#ff8c00";
            dom.uploadStatus.style.background = "rgba(255, 140, 0, 0.1)";
            if (getQueryParam('debug') !== '1') {
                setTimeout(() => {
                    dom.uploadStatus.style.display = 'none';
                }, 4000);
            }
        }
    }
}

// ボタンをクリックした際の軽快なエフェクト（クラスの付け外し）
function triggerButtonEffect(btn) {
    if (!btn) return;
    btn.classList.remove('active');
    void btn.offsetWidth; // リフロー発生によるアニメーション再トリガー
    btn.classList.add('active');
    
    setTimeout(() => {
        btn.classList.remove('active');
    }, 150);
}

// --- 4択ボタン初期化 ---
function initQuizOptionEvents() {
    if (!dom.quizOptionsContainer) return;
    
    const buttons = dom.quizOptionsContainer.querySelectorAll('.option-btn');
    console.log(`Binding events to ${buttons.length} quiz buttons.`);
    buttons.forEach((btn, idx) => {
        btn.addEventListener('click', () => {
            console.log(`Option ${idx + 1} clicked`);
            triggerButtonEffect(btn);
            submitAnswer(idx);
        });
    });
}

// --- Screen Management ---
function switchScreen(screenName) {
    Object.values(screens).forEach(s => {
        if (s) s.classList.remove('active');
    });
    if (screens[screenName]) screens[screenName].classList.add('active');
}

// --- Game Logic ---
function startGame() {
    sound.init();
    const name = (dom.playerNameInput ? dom.playerNameInput.value.trim() : 'CHALLENGER') || 'CHALLENGER';
    localStorage.setItem('math_player_name', name);
    
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    
    gameState = {
        playerName: name,
        score: 0,
        lives: 3,
        rivalLives: 5,
        rivalMaxLives: 5,
        stage: 1,
        rivalKOs: 0,
        consecutiveCorrects: 0,
        currentProblem: null,
        isTransitioning: false
    };
    
    if (dom.playerNameDisplay) dom.playerNameDisplay.textContent = name;
    if (dom.currentScoreDisplay) dom.currentScoreDisplay.textContent = gameState.rivalKOs;
    if (dom.gameStageDisplay) dom.gameStageDisplay.textContent = gameState.stage;
    updateLivesDisplay();
    updateRivalLivesDisplay();
    
    if (dom.comboContainer) dom.comboContainer.style.display = 'none';
    
    if (dom.ryuChar) dom.ryuChar.className = 'battle-character ryu-idle';
    if (dom.zangiefChar) dom.zangiefChar.className = 'battle-character zangief-idle';
    if (dom.hadoukenBall) dom.hadoukenBall.className = 'hadouken-fireball';
    if (dom.hitSpark) dom.hitSpark.className = 'hit-spark';
    if (dom.hadoukenText) dom.hadoukenText.className = 'hadouken-text';
    if (dom.battleStage) dom.battleStage.classList.remove('screen-shake');
    
    nextProblem();
    switchScreen('game');
}

function updateLivesDisplay() {
    if (dom.lifeBar) {
        const lifePercent = (gameState.lives / 3) * 100;
        dom.lifeBar.style.width = lifePercent + '%';
        
        if (gameState.lives === 1) {
            dom.lifeBar.style.background = 'linear-gradient(90deg, #ff0000, #ff5d00)';
            dom.lifeBar.style.boxShadow = '0 0 10px #ff0044';
        } else {
            dom.lifeBar.style.background = 'linear-gradient(90deg, #ff8c00, var(--neon-yellow))';
            dom.lifeBar.style.boxShadow = '0 0 8px var(--neon-yellow)';
        }
    }
}

function updateRivalLivesDisplay() {
    if (dom.rivalLifeBar) {
        const rivalPercent = (gameState.rivalLives / gameState.rivalMaxLives) * 100;
        dom.rivalLifeBar.style.width = rivalPercent + '%';
    }
}

function nextProblem() {
    saveGameProgress();
    
    try {
        gameState.currentProblem = window.ProblemGenerator.generate();
        console.log("Current problem loaded:", gameState.currentProblem);
        
        if (dom.questionText && gameState.currentProblem && gameState.currentProblem.questionText) {
            dom.questionText.textContent = gameState.currentProblem.questionText;
        } else if (dom.questionText) {
            dom.questionText.textContent = "問題データを読み込めませんでした。";
        }
        
        updateQuizOptionsUI();
    } catch (e) {
        console.error("Failed to generate next problem:", e);
    }
}

function updateQuizOptionsUI() {
    if (!dom.quizOptionsContainer || !gameState.currentProblem) return;
    
    const buttons = dom.quizOptionsContainer.querySelectorAll('.option-btn');
    const options = gameState.currentProblem.options;
    
    buttons.forEach((btn, idx) => {
        const textEl = btn.querySelector('.option-text');
        if (options && options[idx] !== undefined) {
            btn.style.display = 'flex';
            if (textEl) textEl.textContent = options[idx];
        } else {
            btn.style.display = 'none';
        }
    });
}

// 4択ボタン選択時の正誤判定
function submitAnswer(selectedIndex) {
    if (gameState.isTransitioning) {
        console.log("submitAnswer: system is transitioning, ignore click");
        return;
    }
    
    // 連打防止ガードをかける
    gameState.isTransitioning = true;
    
    try {
        console.log(`submitAnswer: selected index ${selectedIndex}`);
        if (!gameState.currentProblem) {
            console.warn("submitAnswer: currentProblem is null! Attempting to force next problem.");
            gameState.isTransitioning = false;
            nextProblem();
            return;
        }

        let isCorrect = false;
        const activeBox = dom.problemBoard; // 社会用大画面ボード全体をフラッシュ対象にする
        
        isCorrect = (gameState.currentProblem.answerIndex === selectedIndex);
        console.log(`isCorrect: ${isCorrect} (Expected index: ${gameState.currentProblem.answerIndex}, Got: ${selectedIndex})`);
        
        if (activeBox) activeBox.classList.remove('correct', 'wrong');
        if (activeBox) void activeBox.offsetWidth; // リフロー

        const buttons = dom.quizOptionsContainer.querySelectorAll('.option-btn');
        const selectedBtn = buttons[selectedIndex];
        
        if(isCorrect) {
            if (selectedBtn) {
                selectedBtn.style.boxShadow = "0 0 20px #00ff88, inset 0 0 10px #00ff88";
            }
            if (activeBox) activeBox.classList.add('correct');
            
            // スコア加算
            gameState.score += 10;
            
            gameState.consecutiveCorrects += 1;
            updateComboDisplay();
            
            if (gameState.consecutiveCorrects % 5 === 0) {
                if (gameState.lives < 3) {
                    gameState.lives = 3;
                    updateLivesDisplay();
                }
            }
            
            let dmg = 1;
            let pwrType = 'blue';
            let textVal = 'HADOUKEN!';
            
            const rand = Math.random();
            if (rand < 0.12) {
                dmg = 3;
                pwrType = 'red';
                textVal = 'SHAKUNETSU!';
            } else if (rand < 0.32) {
                dmg = 2;
                pwrType = 'purple';
                textVal = 'EX HADOUKEN!';
            }

            sound.playCorrect();
            sound.playHadoukenFire(pwrType);

            if (dom.battleStage && pwrType !== 'blue') {
                dom.battleStage.classList.add('stage-darken-' + pwrType);
            }
            if (dom.ryuChar) {
                dom.ryuChar.className = 'battle-character ryu-hadouken';
            }
            if (dom.hadoukenText) {
                dom.hadoukenText.textContent = textVal;
                dom.hadoukenText.className = 'hadouken-text text-' + pwrType + ' hadouken-text-active';
            }
            if (dom.hadoukenBall) {
                dom.hadoukenBall.className = 'hadouken-fireball hadouken-' + pwrType + ' hadouken-active';
            }

            const triggerHit = (damageAmount) => {
                if (dom.zangiefChar) {
                    dom.zangiefChar.classList.remove('zangief-idle', 'zangief-damage');
                    void dom.zangiefChar.offsetWidth;
                    dom.zangiefChar.classList.add('zangief-damage');
                }
                if (dom.hitSpark) {
                    dom.hitSpark.className = 'hit-spark spark-' + pwrType;
                    void dom.hitSpark.offsetWidth;
                    dom.hitSpark.classList.add('spark-active');
                }
                if (dom.battleStage) {
                    let shakeClass = 'screen-shake';
                    if (pwrType === 'purple') shakeClass = 'screen-shake-medium';
                    else if (pwrType === 'red') shakeClass = 'screen-shake-heavy';
                    
                    dom.battleStage.classList.remove('screen-shake', 'screen-shake-medium', 'screen-shake-heavy');
                    void dom.battleStage.offsetWidth;
                    dom.battleStage.classList.add(shakeClass);
                }
                sound.playHit(pwrType);
                
                gameState.rivalLives = Math.max(0, gameState.rivalLives - damageAmount);
                updateRivalLivesDisplay();
            };

            if (pwrType === 'blue') {
                setTimeout(() => triggerHit(1), 400);
            } else if (pwrType === 'purple') {
                setTimeout(() => triggerHit(1), 380);
                setTimeout(() => triggerHit(1), 520);
            } else if (pwrType === 'red') {
                setTimeout(() => triggerHit(1), 320);
                setTimeout(() => triggerHit(1), 470);
                setTimeout(() => triggerHit(1), 620);
            }

            let cleanupDelay = 1000;
            if (pwrType === 'purple') cleanupDelay = 1100;
            else if (pwrType === 'red') cleanupDelay = 1250;

            setTimeout(() => {
                if (dom.ryuChar) dom.ryuChar.className = 'battle-character ryu-idle';
                if (dom.zangiefChar) dom.zangiefChar.className = 'battle-character zangief-idle';
                if (dom.hadoukenBall) dom.hadoukenBall.className = 'hadouken-fireball';
                if (dom.hitSpark) dom.hitSpark.className = 'hit-spark';
                if (dom.hadoukenText) {
                    dom.hadoukenText.className = 'hadouken-text';
                    dom.hadoukenText.textContent = 'HADOUKEN!';
                }
                if (dom.battleStage) dom.battleStage.className = 'battle-stage-area';
                if (activeBox) activeBox.classList.remove('correct');
                if (selectedBtn) selectedBtn.style.boxShadow = "";

                if (gameState.rivalLives <= 0) {
                    gameState.rivalKOs += 1;
                    if (dom.currentScoreDisplay) dom.currentScoreDisplay.textContent = gameState.rivalKOs;
                    sound.playKOExplosion();

                    gameState.stage += 1;
                    gameState.rivalMaxLives = Math.min(8, 4 + gameState.stage); 
                    gameState.rivalLives = gameState.rivalMaxLives;
                    
                    if (dom.gameStageDisplay) dom.gameStageDisplay.textContent = gameState.stage;
                    updateRivalLivesDisplay();
                }
                
                gameState.isTransitioning = false; // 正解時：アニメーション完了後にガード解除
                nextProblem();
            }, cleanupDelay);

        } else {
            // 不正解時
            sound.playWrong();
            if (selectedBtn) {
                selectedBtn.style.boxShadow = "0 0 20px #ff0055, inset 0 0 10px #ff0055";
            }
            if (activeBox) activeBox.classList.add('wrong');
            
            gameState.lives -= 1;
            gameState.consecutiveCorrects = 0; 
            updateComboDisplay();
            updateLivesDisplay();
            
            if (gameState.lives <= 0) {
                setTimeout(() => {
                    if (activeBox) activeBox.classList.remove('wrong');
                    if (selectedBtn) selectedBtn.style.boxShadow = "";
                    gameState.isTransitioning = false; // 不正解KO時：ガード解除
                    endGame();
                }, 500);
            } else {
                setTimeout(() => {
                    if (activeBox) activeBox.classList.remove('wrong');
                    if (selectedBtn) selectedBtn.style.boxShadow = "";
                    gameState.isTransitioning = false; // 不正解時：600ms後にガード解除
                    nextProblem();
                }, 600);
            }
        }
    } catch (err) {
        console.error("Critical error in submitAnswer:", err);
        gameState.isTransitioning = false; // 例外発生時：強制ガード解除で進行不能を防止
    }
}

function updateComboDisplay() {
    if (!dom.comboContainer || !dom.comboCount) return;
    
    if (gameState.consecutiveCorrects >= 2) {
        dom.comboCount.textContent = gameState.consecutiveCorrects;
        dom.comboContainer.style.display = 'flex';
        
        dom.comboContainer.classList.remove('active');
        void dom.comboContainer.offsetWidth; 
        dom.comboContainer.classList.add('active');
        
        sound.playCombo(gameState.consecutiveCorrects);
    } else {
        dom.comboContainer.style.display = 'none';
    }
}

function endGame() {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    if (dom.btnResume) {
        dom.btnResume.style.display = 'none';
    }
    
    if (dom.finalScoreValue) dom.finalScoreValue.textContent = gameState.rivalKOs + " K.O.";
    
    if (dom.resultStatus) {
        if (gameState.rivalKOs >= 1) {
            dom.resultStatus.textContent = "VICTORY";
            dom.resultStatus.style.color = "var(--neon-yellow)";
            dom.resultStatus.style.textShadow = "0 0 15px rgba(255, 230, 0, 0.6), 3px 3px 0 #000";
            sound.playVictory();
        } else {
            dom.resultStatus.textContent = "DEFEAT";
            dom.resultStatus.style.color = "var(--neon-pink)";
            dom.resultStatus.style.textShadow = "0 0 15px rgba(255, 0, 119, 0.6), 3px 3px 0 #000";
            sound.playDefeat();
        }
    }
    
    switchScreen('result');
    submitScoreToGAS();
}

// --- API Logic ---
async function submitScoreToGAS() {
    if(GAS_API_URL === "YOUR_GAS_ENDPOINT_URL_HERE") {
        if (dom.savingStatus) dom.savingStatus.textContent = "※GASのURL未設定のため保存されません";
        return;
    }

    if (dom.savingStatus) dom.savingStatus.textContent = "UPLOADING DATA...";
    try {
        await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: 'submit',
                sheetName: APP_SHEET_NAME,
                name: gameState.playerName,
                score: gameState.rivalKOs,
                topic: window.ProblemGenerator.topicName
            }),
            headers: {
                'Content-Type': 'text/plain'
            }
        });
        if (dom.savingStatus) dom.savingStatus.textContent = "DATA UPLOADED!";
    } catch(e) {
        console.error(e);
        if (dom.savingStatus) dom.savingStatus.textContent = "UPLOAD FAILED (CORS/OFFLINE)"; 
    }
}

async function showRanking() {
    switchScreen('ranking');
    if (dom.rankingList) dom.rankingList.innerHTML = '<div class="loading-spinner-sf6"></div>';
    
    if(GAS_API_URL === "YOUR_GAS_ENDPOINT_URL_HERE") {
        if (dom.rankingList) dom.rankingList.innerHTML = '<div style="text-align:center; margin-top: 20px;">GASのURLが設定されていません。<br>ローカルでは遊べます！</div>';
        return;
    }

    try {
        const res = await fetch(`${GAS_API_URL}?action=getTop&sheetName=${APP_SHEET_NAME}&topic=${encodeURIComponent(window.ProblemGenerator.topicName)}&limit=100&t=${Date.now()}`);
        const data = await res.json();
        
        if (!dom.rankingList) return;
        dom.rankingList.innerHTML = '';
        if(data.ranking && data.ranking.length > 0) {
            const filteredRanking = data.ranking.filter(r => parseInt(r.score, 10) > 0);
            
            if (filteredRanking.length > 0) {
                const top100 = filteredRanking.slice(0, 100);
                top100.forEach((r, idx) => {
                    const item = document.createElement('div');
                    item.className = 'ranking-item';
                    
                    let rankClass = '';
                    if(idx === 0) rankClass = 'rank-1';
                    else if(idx === 1) rankClass = 'rank-2';
                    else if(idx === 2) rankClass = 'rank-3';

                    item.innerHTML = `
                        <span class="${rankClass}">${idx + 1}位</span>
                        <span>${r.name}</span>
                        <span style="color:var(--neon-cyan); font-weight:bold;">${r.score} K.O.</span>
                    `;
                    dom.rankingList.appendChild(item);
                });
            } else {
                dom.rankingList.innerHTML = '<div style="text-align:center; margin-top: 20px;">まだデータがありません。一番乗りを目指そう！</div>';
            }
        } else {
            dom.rankingList.innerHTML = '<div style="text-align:center; margin-top: 20px;">まだデータがありません。一番乗りを目指そう！</div>';
        }
    } catch(e) {
        console.error(e);
        if (dom.rankingList) dom.rankingList.innerHTML = '<div style="text-align:center; margin-top: 20px;">ランキングの取得に失敗しました。詳細：CORS</div>';
    }
}

// --- Save/Resume Logic ---
function saveGameProgress() {
    try {
        if (gameState && gameState.lives > 0) {
            const saveObj = {
                playerName: gameState.playerName,
                score: gameState.score,
                lives: gameState.lives,
                rivalLives: gameState.rivalLives,
                rivalMaxLives: gameState.rivalMaxLives,
                stage: gameState.stage,
                rivalKOs: gameState.rivalKOs,
                consecutiveCorrects: gameState.consecutiveCorrects
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(saveObj));
        }
    } catch (e) {
        console.warn("Failed to save game progress to localStorage:", e);
    }
}

function checkResumeData() {
    try {
        const saveDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saveDataStr) {
            const saveData = JSON.parse(saveDataStr);
            if (saveData && saveData.score !== undefined && saveData.lives > 0) {
                if (dom.btnResume) {
                    dom.btnResume.textContent = `つづきから (STAGE ${saveData.stage || 1})`;
                    dom.btnResume.style.display = 'block';
                }
                return;
            }
        }
    } catch (e) {
        console.warn("Failed to check resume data from localStorage:", e);
    }
    if (dom.btnResume) {
        dom.btnResume.style.display = 'none';
    }
}

function resumeGame() {
    sound.init();
    const saveDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saveDataStr) return;
    
    try {
        const saveData = JSON.parse(saveDataStr);
        window.ProblemGenerator.topicName = "歴史・社会ドリル";
        if (dom.topicNameDisplay) dom.topicNameDisplay.textContent = window.ProblemGenerator.topicName;
        document.title = window.ProblemGenerator.topicName;
        
        if (dom.playerNameInput) dom.playerNameInput.value = saveData.playerName || 'CHALLENGER';

        gameState = {
            playerName: saveData.playerName || 'CHALLENGER',
            score: saveData.score,
            lives: saveData.lives,
            rivalLives: saveData.rivalLives !== undefined ? saveData.rivalLives : 5,
            rivalMaxLives: saveData.rivalMaxLives !== undefined ? saveData.rivalMaxLives : 5,
            stage: saveData.stage || 1,
            rivalKOs: saveData.rivalKOs !== undefined ? saveData.rivalKOs : 0,
            consecutiveCorrects: saveData.consecutiveCorrects || 0,
            currentProblem: null,
            isTransitioning: false
        };
        
        if (dom.playerNameDisplay) dom.playerNameDisplay.textContent = gameState.playerName;
        if (dom.currentScoreDisplay) dom.currentScoreDisplay.textContent = gameState.rivalKOs;
        if (dom.gameStageDisplay) dom.gameStageDisplay.textContent = gameState.stage;
        updateLivesDisplay();
        updateRivalLivesDisplay();
        updateComboDisplay();
        
        if (dom.ryuChar) dom.ryuChar.className = 'battle-character ryu-idle';
        if (dom.zangiefChar) dom.zangiefChar.className = 'battle-character zangief-idle';
        if (dom.hadoukenBall) dom.hadoukenBall.className = 'hadouken-fireball';
        if (dom.hitSpark) dom.hitSpark.className = 'hit-spark';
        if (dom.hadoukenText) dom.hadoukenText.className = 'hadouken-text';
        if (dom.battleStage) dom.battleStage.classList.remove('screen-shake');
        
        nextProblem();
        switchScreen('game');
        
    } catch(e) {
        console.error("Failed to resume game", e);
        startGame();
    }
}

// Start
window.addEventListener('DOMContentLoaded', init);
