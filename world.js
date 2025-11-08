(function(){
  const canvas = document.getElementById('game');
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  // ========= 豪華背景（バイオーム生成）準備 =========
  // 乱数シードとハッシュ（タイルごとに安定した値）
  let worldSeed = 1234567;
  function xorshift32(a){ a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return a >>> 0; }
  function hash2d(ix, iy, seed){
    let a = (ix | 0) * 374761393 ^ (iy | 0) * 668265263 ^ (seed | 0);
    a = xorshift32(a);
    return (a & 0x00FFFFFF) / 0x01000000; // 0..1
  }

  const TILE = 10; // 細かいドット感
  let bgCanvas = null, bgCtx = null;

  function generateBackground(){
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    bgCtx = bgCanvas.getContext('2d');
    bgCtx.imageSmoothingEnabled = false;

    const w = canvas.width;
    const h = canvas.height;

    // 空（明るい青空グラデーション）
    const skyGrad = bgCtx.createLinearGradient(0, 0, 0, h * 0.6);
    skyGrad.addColorStop(0, '#87ceeb'); // 空色
    skyGrad.addColorStop(1, '#bdefff'); // 地平線付近は淡い青
    bgCtx.fillStyle = skyGrad;
    bgCtx.fillRect(0, 0, w, h);

    // 遠くの丘
    for (let i = 0; i < 3; i++) {
      const baseY = h * 0.55 + i * 25;
      bgCtx.fillStyle = `hsl(110, 40%, ${40 + i * 10}%)`;
      bgCtx.beginPath();
      bgCtx.moveTo(0, h);
      for (let x = 0; x <= w; x += 40) {
        const y = baseY + Math.sin(x * 0.015 + i) * 20;
        bgCtx.lineTo(x, y);
      }
      bgCtx.lineTo(w, h);
      bgCtx.closePath();
      bgCtx.fill();
    }

    // 草原（手前）
    const fieldGrad = bgCtx.createLinearGradient(0, h * 0.55, 0, h);
    fieldGrad.addColorStop(0, '#3fa34d');
    fieldGrad.addColorStop(1, '#2c7a36');
    bgCtx.fillStyle = fieldGrad;
    bgCtx.fillRect(0, h * 0.55, w, h * 0.45);

    // 草原の明暗パターン
    for (let y = h * 0.55; y < h; y += 4) {
      bgCtx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      bgCtx.beginPath();
      for (let x = 0; x < w; x += 16) {
        const yOffset = Math.sin(x * 0.05 + y * 0.05) * 2;
        bgCtx.lineTo(x, y + yOffset);
      }
      bgCtx.stroke();
    }

    // 小さな花々
    const flowerColors = ['#ffd1dc', '#fff3b0', '#ffb347', '#d4f1f4', '#c3f584'];
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * w;
      const y = h * 0.55 + Math.random() * (h * 0.45);
      const color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
      bgCtx.fillStyle = color;
      bgCtx.beginPath();
      bgCtx.arc(x, y, 1.2, 0, Math.PI * 2);
      bgCtx.fill();
    }

    // 地平線の明るい霞
    const mistGrad = bgCtx.createLinearGradient(0, h * 0.5, 0, h * 0.6);
    mistGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
    mistGrad.addColorStop(1, 'rgba(255,255,255,0)');
    bgCtx.fillStyle = mistGrad;
    bgCtx.fillRect(0, h * 0.45, w, h * 0.2);
  }
  // ========= 豪華背景 ここまで =========

  // BGM（ループ再生） — 自動再生対策付き
  const bgm = new Audio('harukanaru-daichi.mp3');
  bgm.loop = true;
  bgm.preload = 'auto';
  bgm.volume = 1; // 音量調整（0.0〜1.0）

  function startBgm(){
    // すでに再生中なら何もしない
    if (!bgm.paused) return;
    bgm.play().then(()=>{
      // 一度再生できたらリスナーを外す
      document.removeEventListener('pointerdown', startBgm);
      document.removeEventListener('keydown', startBgm);
      document.removeEventListener('visibilitychange', visHandler);
    }).catch(e => console.warn('BGM再生エラー:', e));
  }

  function visHandler(){
    if (document.visibilityState === 'visible') startBgm();
  }

  // ブラウザの自動再生制限に対応：
  // 1) 即時トライ（許可環境ではそのまま鳴る）
  // 2) ユーザー操作やタブがアクティブになったら必ず再試行
  bgm.play().catch(()=>{
    document.addEventListener('pointerdown', startBgm, { once: true });
    document.addEventListener('keydown', startBgm, { once: true });
    document.addEventListener('visibilitychange', visHandler);
  });

  // プレイヤー画像を読み込み
  const playerImg = new Image();
  playerImg.src = "chara.png";
  let playerFlip = false;

  // 画面リサイズ
  function fit(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    generateBackground();
  }
  window.addEventListener('resize', fit); fit();

  // 入力
  const keys = new Set();
  addEventListener('keydown', e=>keys.add(e.key));
  addEventListener('keyup',   e=>keys.delete(e.key));

  // プレイヤー（トップビューの点）
  const player = { x: canvas.width / 2, y: canvas.height / 2 + 100, spd: 140, size: 12 };
  // 歩数カウントでエンカウント（一定距離で発生）
  const ENCOUNTER_DIST = 260; // この距離ぶん歩くと戦闘
  let distAcc = 0;

  // 豪華背景（バイオーム）描画
  function drawGrid(){
    if (!bgCanvas) generateBackground();
    g.drawImage(bgCanvas, 0, 0);
  }

  let last = performance.now();
  let running = true; // バトル移行時に false にしてループ停止

  // バトルから戻るための公開API（BGM再生付き）
  window.returnToWorld = function(){
    if (running) return; // すでに動作中なら何もしない
    distAcc = 0;
    running = true;
    last = performance.now();
    // BGM再生（自動再生制限により失敗したら次のタップ/キーで再試行）
    if (bgm.paused) {
      bgm.play().catch(()=>{
        const one = ()=>{ bgm.play().finally(()=>{
          document.removeEventListener('pointerdown', one);
          document.removeEventListener('keydown', one);
        }); };
        document.addEventListener('pointerdown', one, { once:true });
        document.addEventListener('keydown', one, { once:true });
      });
    }
    requestAnimationFrame(loop);
  };

  function loop(now){
    if (!running) return; // 停止
    const dt = Math.min(0.033, (now - last)/1000); last = now;
    update(dt); render();
    requestAnimationFrame(loop);
  }

  function update(dt){
    let vx=0, vy=0;
    if (keys.has('ArrowLeft')  || keys.has('a')) vx -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) vx += 1;
    if (keys.has('ArrowUp')    || keys.has('w')) vy -= 1;
    if (keys.has('ArrowDown')  || keys.has('s')) vy += 1;
    if (vx||vy){
      const len = Math.hypot(vx,vy); vx/=len; vy/=len;
      const dx = vx * player.spd * dt;
      const dy = vy * player.spd * dt;
      player.x = Math.max(8, Math.min(canvas.width-8,  player.x + dx));
      player.y = Math.max(8, Math.min(canvas.height-8, player.y + dy));
      if (vx > 0) playerFlip = false;
      else if (vx < 0) playerFlip = true;
      distAcc += Math.hypot(dx,dy);
      if (distAcc >= ENCOUNTER_DIST){
        distAcc = 0; // リセット
        running = false; // ループ停止
        // BGM停止（バトル中は無音 or 別BGM想定）
        if (!bgm.paused) bgm.pause();
        // 戦闘に即時移行（オーバーワールドのループ停止を確実にしてから）
        setTimeout(() => {
          if (typeof window.enterBattle === 'function') {
            window.enterBattle({ worldName: '草原' });
          }
        }, 0);
      }
    }
  }

  function render(){
    g.clearRect(0,0,canvas.width,canvas.height);
    drawGrid();
    // プレイヤー画像描画（視認性向上：地面影＋縁取りシャドウ）
    const size = 48;
    const dx = player.x - size/2;
    const dy = player.y - size/2;

    // 地面の影（足元の楕円）
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(player.x, player.y + size*0.35, size*0.40, size*0.18, 0, 0, Math.PI*2);
    g.fill();
    g.restore();

    // スプライトにシャドウ（縁取り風）
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.9)';
    g.shadowBlur = 8;
    g.shadowOffsetX = 0;
    g.shadowOffsetY = 0;
    if (playerFlip) {
      g.translate(dx + size, dy);
      g.scale(-1, 1);
      g.drawImage(playerImg, 0, 0, size, size);
    } else {
      g.drawImage(playerImg, dx, dy, size, size);
    }
    g.restore();

    // 連勝数の表示（main.js の window.winStreak を参照）
    const streak = (window.winStreak ?? 0);
    g.fillStyle = '#ffffff';
    g.font = '16px sans-serif';
    g.fillText(`連勝: ${streak}`, 10, canvas.height - 10);

    // 最高連勝の表示（右下） — main.js の window.bestStreak を参照
    const best = (window.bestStreak ?? 0);
    g.fillStyle = '#ffffff';
    g.font = '16px sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    g.fillText(`最高連勝: ${best}`, canvas.width - 10, canvas.height - 10);
    g.textAlign = 'left'; // 以降の描画に影響しないよう戻す（保険）
  }


  // ループ開始
  requestAnimationFrame(loop);
})();