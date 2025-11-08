// Canvasの準備
const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
g.imageSmoothingEnabled = false;

// 1枚目（プレイヤー）
const img = new Image();
img.src = "chara.png";

// 2枚目（敵キャラ）
const enemyImg = new Image();
enemyImg.src = "enemy.gif";

let loaded1 = false;
let loaded2 = false;
let message = 'バトル開始！';
const ally = { name: 'your bird', hp: 100, maxHp: 100, atk: 22 };
const foe  = { name: 'bananaman', hp: 140, maxHp: 140, atk: 22 };
let busy = false; // 行動中はボタン無効
let healUsed = false; // 一度だけ回復可能
let winStreak = 0; // 連勝数
window.winStreak = winStreak; // ワールド側から参照できるよう公開
let bestStreak = 0; // 最高連勝
window.bestStreak = bestStreak; // 最高連勝も公開
let allyFlash = 0;  // プレイヤーの点滅カウンタ（フレーム数）
let foeFlash  = 0;  // 敵の点滅カウンタ（フレーム数）

function startFlash(target){
  const frames = 10; // 点滅させるフレーム数（約10*60ms ≒ 0.6s）
  if (target === 'ally') allyFlash = frames;
  if (target === 'foe')  foeFlash  = frames;
  flashTick();
}

function flashTick(){
  // 点滅中は短い間隔で再描画
  render();
  let active = false;
  if (allyFlash > 0) { allyFlash--; active = true; }
  if (foeFlash  > 0) { foeFlash--;  active = true; }
  if (active) setTimeout(flashTick, 60); // 約16〜60msで好みに調整可
}
function drawHPBar(ctx, x, y, w, h, hp, maxHp){
  const pct = Math.max(0, Math.min(1, hp / maxHp));
  ctx.save();
  ctx.fillStyle = '#243043';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = pct > 0.5 ? '#39d98a' : (pct > 0.25 ? '#ffd166' : '#ff6b6b');
  ctx.fillRect(x, y, Math.floor(w * pct), h);
  ctx.strokeStyle = '#0a0f17';
  ctx.lineWidth = 2;
  ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
  ctx.restore();
}

function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }

function dealDamage(attacker, defender){
  // 簡易ダメージ: 攻撃力を基準にゆらぎ
  const base = attacker.atk;
  const dmg = Math.max(1, Math.floor(base*0.6 + Math.random()*base*0.8));
  defender.hp = Math.max(0, defender.hp - dmg);
  return dmg;
}

function setButtonsEnabled(enabled){
  const atkBtn = document.getElementById('btn-attack');
  const runBtn = document.getElementById('btn-run');
  const healBtn = document.getElementById('btn-heal');
  const magicBtn = document.getElementById('btn-magic');
  if (atkBtn) atkBtn.disabled = !enabled;
  if (runBtn) runBtn.disabled = !enabled;
  if (healBtn) healBtn.disabled = !enabled || healUsed;
  if (magicBtn) magicBtn.disabled = !enabled;
}

// 回復SE（kauhuku.mp3 を再生）
let healSfx;
function playHealSfx(){
  try {
    if (!healSfx) {
      healSfx = new Audio('kauhuku.mp3');
      healSfx.preload = 'auto';
      healSfx.volume = 0.8; // 音量調整
    }
    healSfx.currentTime = 0;
    healSfx.play().catch((e)=>console.warn('回復SEの再生に失敗:', e));
  } catch (e) {
    console.warn('Heal SFX error:', e);
  }
}

function playerHeal(){
  if (busy || healUsed) return;
  busy = true; setButtonsEnabled(false);
  playHealSfx();
  const amount = randInt(0, 70); // 1〜100 の乱数
  const before = ally.hp;
  ally.hp = Math.min(ally.maxHp, ally.hp + amount);
  const actual = ally.hp - before;
  message = `かいふく！\n${ally.name} の HPが ${actual} かいふくした！ 回復は一回のみだ`;
  render();
  healUsed = true; // 一回限り
  // 回復したらターン終了 → 少し待って敵の行動
  setTimeout(enemyAttack, 2000);
}

function playerAttack(){
  busy = true; setButtonsEnabled(false);
  playAttackSfx();
  const dmg = dealDamage(ally, foe);
  message = `${ally.name} の こうげき！\n${foe.name} に ${dmg} ダメージ！`;
  startFlash('foe');
  render();
  if (foe.hp <= 0){
    winStreak += 1;
    window.winStreak = winStreak; // 公開値を同期
    if (winStreak > bestStreak) bestStreak = winStreak;
    window.bestStreak = bestStreak;
    message += `\n${foe.name} は たおれた！\n連勝: ${winStreak}`;
    render();
    // 少し表示してからワールドへ戻る
    setTimeout(()=>{
      const ui = document.getElementById('ui');
      if (ui) ui.style.display = 'none';
      stopBattleBgm();
      if (typeof window.returnToWorld === 'function') {
        window.returnToWorld();
      } else {
        // フォールバック：ボタンを再有効化して続行可能に
        busy = false; setButtonsEnabled(true);
      }
    }, 1200);
    return;
  }
  // 敵の反撃を少し待ってから
  setTimeout(enemyAttack, 2000);
}

// 魔法SE（bob.mp3 を再生）
let magicSfx;
function playMagicSfx(){
  try {
    if (!magicSfx) {
      magicSfx = new Audio('bob.mp3');
      magicSfx.preload = 'auto';
      magicSfx.volume = 0.85;
    }
    magicSfx.currentTime = 0;
    magicSfx.play().catch((e)=>console.warn('魔法SEの再生に失敗:', e));
  } catch (e) {
    console.warn('Magic SFX error:', e);
  }
}

function playerMagic(){
  if (busy) return;
  busy = true; setButtonsEnabled(false);
  playMagicSfx();
  // 魔法エフェクト表示（baku.pngを1秒表示）
  (function(){
    const effect = document.createElement('img');
    effect.src = 'baku.png';
    Object.assign(effect.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: '50%',
      zIndex: 9999,
      pointerEvents: 'none'
    });
    document.body.appendChild(effect);
    setTimeout(() => {
      if (effect && effect.parentNode) effect.parentNode.removeChild(effect);
    }, 1000);
  })();
  // 魔法ダメージ：やや高め＆ブレ少なめ
  const base = Math.floor(ally.atk * 1.2);
  const dmg = Math.max(1, Math.floor(base*0.8 + Math.random()*base*0.4));
  foe.hp = Math.max(0, foe.hp - dmg);
  message = `${ally.name} は まほうを となえた！\n${foe.name} に ${dmg} ダメージ！`;
  startFlash('foe');
  render();

  if (foe.hp <= 0){
    winStreak += 1;
    window.winStreak = winStreak;
    if (winStreak > bestStreak) bestStreak = winStreak;
    window.bestStreak = bestStreak;
    message += `\n${foe.name} は たおれた！\n連勝: ${winStreak}`;
    render();
    setTimeout(()=>{
      const ui = document.getElementById('ui');
      if (ui) ui.style.display = 'none';
      stopBattleBgm();
      if (typeof window.returnToWorld === 'function') {
        window.returnToWorld();
      } else {
        busy = false; setButtonsEnabled(true);
      }
    }, 1200);
    return;
  }
  // 敵の行動へ
  setTimeout(enemyAttack, 2000);
}

// 敵の攻撃SE（enemypanch.mp3 を再生）
let enemySfx;
function playEnemySfx(){
  try {
    if (!enemySfx) {
      enemySfx = new Audio('enemypanch.mp3');
      enemySfx.preload = 'auto';
      enemySfx.volume = 0.8; // 必要に応じて調整
    }
    enemySfx.currentTime = 0;
    enemySfx.play().catch((e)=>console.warn('敵SEの再生に失敗:', e));
  } catch (e) {
    console.warn('Enemy SFX error:', e);
  }
}

function enemyAttack(){
  playEnemySfx();
  const dmg = dealDamage(foe, ally);
  message = `${foe.name} の こうげき！\n${ally.name} は ${dmg} ダメージ！`;
  startFlash('ally');
  render();
  if (ally.hp <= 0){
    winStreak = 0;
    window.winStreak = winStreak; // 公開値を同期
    message += `\n${ally.name} は たおれた…\n連勝リセット: ${winStreak}`;
    render();
    setTimeout(()=>{
      const ui = document.getElementById('ui');
      if (ui) ui.style.display = 'none';
      stopBattleBgm();
      if (typeof window.returnToWorld === 'function') {
        window.returnToWorld();
      } else {
        // フォールバック：UIを再有効化
        busy = false; setButtonsEnabled(true);
      }
    }, 1200);
    return; // 敗北
  }
  busy = false; setButtonsEnabled(true);
}

function tryRun(){
  if (busy) return;
  busy = true; setButtonsEnabled(false);
  message = 'にげだした！ うまく にげきれた！';
  render();
  // 少し表示してからワールドへ戻る
  setTimeout(()=>{
    // 戦闘UIを非表示
    const ui = document.getElementById('ui');
    if (ui) ui.style.display = 'none';
    // ワールド側ループを再開
    if (typeof window.returnToWorld === 'function') {
      stopBattleBgm();
      window.returnToWorld();
    } else {
      console.warn('returnToWorld() が未定義です。world.js を先に読み込んでください。');
    }
  }, 700);
}

// 戦闘BGM（sentou.mp3）
let battleBgm;
function playBattleBgm(){
  try {
    if (!battleBgm) {
      battleBgm = new Audio('sentou.mp3');
      battleBgm.loop = true;
      battleBgm.preload = 'auto';
      battleBgm.volume = 0.8; // 音量調整
    }
    // 先頭から再生（毎回確実に鳴らす）
    battleBgm.currentTime = 0;
    battleBgm.play().catch((e)=>{
      console.warn('戦闘BGM再生に失敗:', e);
      // 自動再生制限に備えて次のユーザー操作で再試行
      const resume = ()=>{
        battleBgm.play().finally(()=>{
          document.removeEventListener('pointerdown', resume);
          document.removeEventListener('keydown', resume);
        });
      };
      document.addEventListener('pointerdown', resume, { once: true });
      document.addEventListener('keydown', resume, { once: true });
    });
  } catch (e) {
    console.warn('Battle BGM error:', e);
  }
}
function stopBattleBgm(){
  try {
    if (battleBgm && !battleBgm.paused) battleBgm.pause();
  } catch (e) {
    // no-op
  }
}
// ワールドから呼ぶ: 戦闘開始
window.enterBattle = function(opts = {}){
  // ワールド名が渡されたらメッセージに反映
  const wname = opts.worldName ? `${opts.worldName}で ` : '';
  message = `${wname}てきが あらわれた！ あなたのターンです。`;
  busy = false;           // 2回目以降でボタンが反応しないのを防ぐ
  allyFlash = 0;          // フラッシュ状態リセット
  foeFlash = 0;
  healUsed = false; // バトルごとに回復の使用回数をリセット
  ally.hp = ally.maxHp; // バトル開始時にHPを全回復
  window.winStreak = winStreak; // 現在の連勝を公開
  window.bestStreak = bestStreak; // 現在の最高連勝も公開

  // 現在のワールド設定で敵を読み込み（初回/次回も含め統一）
  if (typeof loadWorld === 'function') {
    loadWorld(worldIndex);
  }
  foe.hp = foe.maxHp; // バトル開始時に敵HPも全回復

  // 戦闘UIを有効化して描画
  createUI();
  setButtonsEnabled(true);
  playBattleBgm();
  render();
};

function addPressAnim(btn){
  // 初期スタイル（アニメーションしやすい設定）
  btn.style.transition = 'transform 80ms ease, filter 120ms ease, background 120ms ease, box-shadow 120ms ease';
  btn.style.willChange = 'transform, filter';
  btn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)';
  btn.style.cursor = 'pointer';

  const down = () => {
    if (btn.disabled) return;
    btn.style.transform = 'translateY(1px) scale(0.98)';
    btn.style.filter = 'brightness(0.95)';
    btn.style.boxShadow = 'inset 0 2px 6px rgba(0,0,0,0.35)';
  };
  const up = () => {
    btn.style.transform = 'none';
    btn.style.filter = 'none';
    btn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)';
  };

  // ポインター（マウス/タッチ）
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointerleave', up);
  btn.addEventListener('pointercancel', up);

  // キーボード操作（Enter/Space）
  btn.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') down();
  });
  btn.addEventListener('keyup', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') up();
  });
}

// 攻撃SE（panch.mp3 を再生）
let attackSfx;
function playAttackSfx(){
  try {
    // 1回だけ生成して再利用（レイテンシ低減）
    if (!attackSfx) {
      attackSfx = new Audio('panch.mp3');
      attackSfx.preload = 'auto';
      attackSfx.volume = 0.8; // 音量は0.0〜1.0
    }
    // 連続で押しても頭から鳴るように巻き戻し
    attackSfx.currentTime = 0;
    attackSfx.play().catch((e)=>console.warn('音声の再生に失敗:', e));
  } catch (e) {
    console.warn('SFX error:', e);
  }
}

function createUI(){
  // 既存があれば再利用
  let ui = document.getElementById('ui');
  if (!ui){
    ui = document.createElement('div');
    ui.id = 'ui';
    ui.style.position = 'fixed';
    ui.style.right = '12px';
    ui.style.bottom = '12px';
    ui.style.display = 'grid';
    ui.style.gridTemplateColumns = 'repeat(3, 1fr)';
    ui.style.gap = '8px';
    ui.style.zIndex = '10';
    document.body.appendChild(ui);
  }
  // ここで必ず再表示
  ui.style.display = 'grid';
  ui.innerHTML = '';
  const atkBtn = document.createElement('button');
  atkBtn.id = 'btn-attack';
  atkBtn.textContent = '攻撃';
  atkBtn.style.padding = '12px';
  atkBtn.style.borderRadius = '10px';
  atkBtn.style.border = '1px solid #2a3548';
  atkBtn.style.background = '#1a2331';
  atkBtn.style.color = '#eaf1f7';
  atkBtn.onclick = () => { if (!busy) playerAttack(); };
  addPressAnim(atkBtn);

  const healBtn = document.createElement('button');
  healBtn.id = 'btn-heal';
  healBtn.textContent = '気合い（回復）';
  healBtn.style.padding = '12px';
  healBtn.style.borderRadius = '10px';
  healBtn.style.border = '1px solid #2a3548';
  healBtn.style.background = '#1a2331';
  healBtn.style.color = '#eaf1f7';
  healBtn.onclick = () => { if (!busy && !healUsed) playerHeal(); };
  addPressAnim(healBtn);

  const magicBtn = document.createElement('button');
  magicBtn.id = 'btn-magic';
  magicBtn.textContent = 'ビッグバン';
  magicBtn.style.padding = '12px';
  magicBtn.style.borderRadius = '10px';
  magicBtn.style.border = '1px solid #2a3548';
  magicBtn.style.background = '#1a2331';
  magicBtn.style.color = '#eaf1f7';
  magicBtn.onclick = () => { if (!busy) playerMagic(); };
  addPressAnim(magicBtn);

  ui.appendChild(atkBtn);
  ui.appendChild(magicBtn);
  ui.appendChild(healBtn);
  setButtonsEnabled(true);
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight){
  let line = '';
  for (const ch of text){
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line !== ''){
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function render() {
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!loaded1 || !loaded2) return;

  // 1枚目：左下
  const scale1 = 0.3;
  const dw1 = img.width * scale1;
  const dh1 = img.height * scale1;
  const dx1 = 50;
  const dy1 = canvas.height - dh1 - 200;
  const allyVisible = !(allyFlash > 0 && (allyFlash % 2 === 0));
  if (allyVisible) {
    g.drawImage(img, dx1, dy1, dw1, dh1);
  }

  // プレイヤー名（左下上側）
  g.save();
  g.font = '20px system-ui, -apple-system, sans-serif';
  g.fillStyle = '#eaf1f7';
  g.textAlign = 'left';
  g.textBaseline = 'bottom';
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 4;
  g.fillText('your bird', dx1, dy1 - 8);
  g.restore();
  // プレイヤーHPバー
  drawHPBar(g, dx1, dy1 - 8 - 10 - 8 - 20, 140, 10, ally.hp, ally.maxHp);

  // 2枚目：右上
  const scale2 = 0.2;
  const dw2 = enemyImg.width * scale2;
  const dh2 = enemyImg.height * scale2;
  const dx2 = canvas.width - dw2 - 50;
  const dy2 = 50;
  const foeVisible = !(foeFlash > 0 && (foeFlash % 2 === 0));
  if (foeVisible) {
    g.drawImage(enemyImg, dx2, dy2, dw2, dh2);
  }

  // 敵名（右上側）
  g.save();
  g.font = '20px system-ui, -apple-system, sans-serif';
  g.fillStyle = '#eaf1f7';
  g.textAlign = 'right';
  g.textBaseline = 'top';
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 4;
  g.fillText('bananaman', dx2 + dw2, dy2 - 6);
  g.restore();

  // 連勝数HUD（左上）
  g.save();
  g.font = '16px system-ui, -apple-system, sans-serif';
  g.fillStyle = '#eaf1f7';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 2;
  g.fillText(`連勝: ${winStreak}`, 12, 12);
  g.restore();

  // メッセージボックス（下部）  
  const boxMargin = 12;
  const boxH = 130;
  const boxX = boxMargin;
  const boxY = canvas.height - boxH - boxMargin;
  const boxW = canvas.width - boxMargin * 2;
  g.save();
  g.fillStyle = 'rgba(15,20,28,0.85)';
  g.fillRect(boxX, boxY, boxW, boxH);
  g.font = '16px system-ui, -apple-system, sans-serif';
  g.fillStyle = '#eaf1f7';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 2;
  const textX = boxX + 12;
  const textY = boxY + 10;
  const textW = boxW - 24;
  drawWrappedText(g, message, textX, textY, textW, 20);
  g.restore();
}

img.onload = () => { loaded1 = true; render(); };
enemyImg.onload = () => { loaded2 = true; render(); };

img.onerror = function(e) {
  console.error("画像を読み込めません:", img.src, e);
};

enemyImg.onerror = function(e) {
  console.error("画像を読み込めません:", enemyImg.src, e);
};

function fitCanvas(){
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

fitCanvas();
window.addEventListener('resize', () => {
  fitCanvas();
  render();
});