(function(){
  const canvas = document.getElementById('game');
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  // === タイルマップ設定（tile.png を使用） ===
  const TILE = 32; // ドット4倍（16px → 64px）
  const TILE_SRC_SIZE = 16; // タイルセット内の1タイルは常に16px
  const tileset = new Image();
  tileset.src = 'tile.png'; // 同フォルダに保存したタイルセット
  const TILESET_COLS = 30; // 480/16
  const TILESET_ROWS = 16; // 256/16

  // タイルアトラス（必要に応じて (c,r) を調整）
  const ATLAS = {
    GRASS:    { c: 6,  r: 8 },   // 草
    FOREST:   { c: 7,  r: 8 },   // 森
    MOUNTAIN: { c: 8,  r: 8 },   // 山
    SAND:     { c: 10, r: 6 },   // 砂
    ROAD:     { c: 12, r: 6 },   // 道（任意）
    TOWN:     { c: 14, r: 6 },   // 町（任意）
    CASTLE:   { c: 15, r: 6 }    // 城（任意）
  };
  const TID = { GRASS:0, FOREST:1, MOUNTAIN:2, WATER:3, SAND:4, ROAD:5, TOWN:6, CASTLE:7 };
  const TILE_SRC = {
    [TID.GRASS]:    ATLAS.GRASS,
    [TID.FOREST]:   ATLAS.FOREST,
    [TID.MOUNTAIN]: ATLAS.MOUNTAIN,
    [TID.WATER]:    ATLAS.WATER,
    [TID.SAND]:     ATLAS.SAND,
    [TID.ROAD]:     ATLAS.ROAD,
    [TID.TOWN]:     ATLAS.TOWN,
    [TID.CASTLE]:   ATLAS.CASTLE
  };

  let MAP_COLS = 0, MAP_ROWS = 0;
  let map = []; // 2次元配列 map[行y][列x] = タイルID

  function buildRandomMap(){
    MAP_COLS = Math.ceil(canvas.width / TILE);
    MAP_ROWS = Math.ceil(canvas.height / TILE);
    map = new Array(MAP_ROWS);

    // ===== 乱数（シード固定で再現性） =====
    let seed = 13579;
    function rand(){
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296;
    }
    function noise(nx, ny){
      // 簡易ノイズ：数本のsin/cosを合成して大陸っぽい連続値を得る
      return (
        Math.sin(nx*0.18) + Math.cos(ny*0.17) +
        Math.sin((nx+ny)*0.12) + Math.cos((nx*0.7 - ny*0.6)*0.08)
      ) * 0.25 + (rand()-0.5)*0.25;
    }

    // ===== 大陸マスクを先に作る（外周は海） =====
    const land = new Array(MAP_ROWS);
    for (let y=0; y<MAP_ROWS; y++){
      land[y] = new Array(MAP_COLS);
      for (let x=0; x<MAP_COLS; x++){
        // 0..1 に正規化した座標
        const nx = (x/MAP_COLS)*2 - 1; // -1..1
        const ny = (y/MAP_ROWS)*2 - 1; // -1..1
        // 中央ほど陸になりやすいように距離減衰
        const r = Math.hypot(nx, ny); // 0..~
        const ridge = 0.65 - r*0.55;  // 中央=正、端=負
        const h = ridge + noise(x, y); // 地形高さ
        const isLand = (h > 0.0);      // しきい値
        land[y][x] = isLand;
      }
    }

    // ===== 基本タイル敷き（海 or 草原） =====
    for (let y=0; y<MAP_ROWS; y++){
      map[y] = new Array(MAP_COLS);
      for (let x=0; x<MAP_COLS; x++){
        map[y][x] = land[y][x] ? TID.GRASS : TID.WATER;
      }
    }

    // ===== 海とつながらない水域（内陸の湖）を草地に変換 =====
    function inBounds(x,y){ return x>=0 && y>=0 && x<MAP_COLS && y<MAP_ROWS; }
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    // エッジに接する水からフラッドフィルで「海」をマーキング
    const sea = Array.from({length: MAP_ROWS}, ()=>Array(MAP_COLS).fill(false));
    const q = [];
    // 上下の辺
    for (let x=0; x<MAP_COLS; x++){
      if (map[0][x] === TID.WATER){ sea[0][x] = true; q.push([x,0]); }
      if (map[MAP_ROWS-1][x] === TID.WATER){ sea[MAP_ROWS-1][x] = true; q.push([x,MAP_ROWS-1]); }
    }
    // 左右の辺
    for (let y=0; y<MAP_ROWS; y++){
      if (map[y][0] === TID.WATER){ sea[y][0] = true; q.push([0,y]); }
      if (map[y][MAP_COLS-1] === TID.WATER){ sea[y][MAP_COLS-1] = true; q.push([MAP_COLS-1,y]); }
    }
    while (q.length){
      const [cx,cy] = q.shift();
      for (const [dx,dy] of dirs){
        const nx = cx+dx, ny = cy+dy;
        if (!inBounds(nx,ny)) continue;
        if (!sea[ny][nx] && map[ny][nx] === TID.WATER){
          sea[ny][nx] = true; q.push([nx,ny]);
        }
      }
    }
    // 海と連結していない WATER は内陸湖 → 草原に変換
    for (let y=0; y<MAP_ROWS; y++){
      for (let x=0; x<MAP_COLS; x++){
        if (map[y][x] === TID.WATER && !sea[y][x]){
          map[y][x] = TID.GRASS;
        }
      }
    }

    // ===== 砂浜（海と陸の境界） =====
    for (let y=0; y<MAP_ROWS; y++){
      for (let x=0; x<MAP_COLS; x++){
        if (map[y][x] !== TID.GRASS) continue;
        let nearWater = false;
        for (const [dx,dy] of dirs){
          const nx = x+dx, ny = y+dy;
          if (inBounds(nx,ny) && map[ny][nx] === TID.WATER){ nearWater = true; break; }
        }
        if (nearWater) map[y][x] = TID.SAND;
      }
    }

    // ===== 森のクラスター =====
    function growPatch(startX, startY, tid, steps, pBranch){
      let frontier = [[startX, startY]];
      for (let i=0; i<steps && frontier.length; i++){
        const [cx,cy] = frontier.shift();
        if (!inBounds(cx,cy)) continue;
        if (map[cy][cx] !== TID.GRASS) continue;
        map[cy][cx] = tid;
        for (const [dx,dy] of dirs){
          if (rand() < pBranch) frontier.push([cx+dx, cy+dy]);
        }
      }
    }
    // 森をいくつか
    const forestCount = Math.max(3, (MAP_COLS*MAP_ROWS/2000)|0);
    for (let i=0;i<forestCount;i++){
      const sx = (rand()*MAP_COLS)|0, sy = (rand()*MAP_ROWS)|0;
      if (map[sy][sx] === TID.GRASS) growPatch(sx, sy, TID.FOREST, 120, 0.55);
    }

    // ===== 山のクラスター（控えめ＆海岸線を避ける） =====
    function isNearWater(x, y){
      for (const [dx,dy] of dirs){
        const nx = x+dx, ny = y+dy;
        if (inBounds(nx,ny) && (map[ny][nx] === TID.WATER || map[ny][nx] === TID.SAND)) return true;
      }
      return false;
    }

    const mountainCount = Math.max(1, (MAP_COLS*MAP_ROWS/6000)|0); // 以前より半減
    for (let i=0;i<mountainCount;i++){
      // 海や砂浜の近くを避けつつ開始点を探す
      let tries = 200;
      let sx=-1, sy=-1;
      while (tries-- > 0){
        const tx = (rand()*MAP_COLS)|0, ty = (rand()*MAP_ROWS)|0;
        if (map[ty][tx] === TID.GRASS && !isNearWater(tx, ty)) { sx = tx; sy = ty; break; }
      }
      if (sx >= 0) growPatch(sx, sy, TID.MOUNTAIN, 60, 0.38); // 面積と分岐確率を抑える
    }

    // ===== 町と城の配置（陸地=草原にのみ） =====
    function placeOnGrass(tid){
      for (let k=0;k<500;k++){
        const x = (rand()*MAP_COLS)|0, y = (rand()*MAP_ROWS)|0;
        if (map[y][x] === TID.GRASS){ map[y][x] = tid; return {x,y}; }
      }
      return null;
    }
    const castle = placeOnGrass(TID.CASTLE);
    const towns = [];
    for (let i=0;i<3;i++){ const t = placeOnGrass(TID.TOWN); if (t) towns.push(t); }

    // ===== 道で接続（城→各町） =====
    function carveRoad(ax, ay, bx, by){
      let x=ax, y=ay;
      while (x!==bx || y!==by){
        if (x<bx) x++; else if (x>bx) x--;
        if (map[y][x] === TID.GRASS || map[y][x] === TID.SAND) map[y][x] = TID.ROAD;
        if (y<by) y++; else if (y>by) y--;
        if (map[y][x] === TID.GRASS || map[y][x] === TID.SAND) map[y][x] = TID.ROAD;
      }
    }
    if (castle){ for (const t of towns){ carveRoad(castle.x, castle.y, t.x, t.y); } }
  }

  // 画像読み込み後に初回マップ生成
  tileset.onload = ()=>{ buildRandomMap(); };

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
    buildRandomMap();
  }
  window.addEventListener('resize', fit); fit();
  buildRandomMap();

  // 入力
  const keys = new Set();
  addEventListener('keydown', e=>keys.add(e.key));
  addEventListener('keyup',   e=>keys.delete(e.key));

  // プレイヤー（トップビューの点）
  const player = { x: canvas.width / 2, y: canvas.height / 2 + 100, spd: 140, size: 12 };
  // 歩数カウントでエンカウント（一定距離で発生）
  const ENCOUNTER_DIST = 260; // この距離ぶん歩くと戦闘
  let distAcc = 0;

  function isWater(px, py){
    if (!map.length) return false;
    const tx = Math.max(0, Math.min(MAP_COLS-1, Math.floor(px / TILE)));
    const ty = Math.max(0, Math.min(MAP_ROWS-1, Math.floor(py / TILE)));
    return (map[ty] && map[ty][tx] === TID.WATER);
  }

  function tryMove(nx, ny){
    // 足元3点（中央/左右）で水上かチェック
    const size = 48; // プレイヤースプライト基準
    const footY = ny + size * 0.40;
    const leftX  = nx - size * 0.18;
    const midX   = nx;
    const rightX = nx + size * 0.18;
    return !(isWater(leftX, footY) || isWater(midX, footY) || isWater(rightX, footY));
  }

  // 豪華背景（バイオーム）描画
  function drawGrid(){
    if (!map.length) return;
    for (let y = 0; y < MAP_ROWS; y++){
      for (let x = 0; x < MAP_COLS; x++){
        const tid = map[y][x];
        const src = TILE_SRC[tid] || ATLAS.GRASS;
        const sx = src.c * TILE_SRC_SIZE, sy = src.r * TILE_SRC_SIZE;
        g.drawImage(tileset, sx, sy, TILE_SRC_SIZE, TILE_SRC_SIZE, x*TILE, y*TILE, TILE, TILE);
      }
    }
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
      const nx = Math.max(8, Math.min(canvas.width-8,  player.x + dx));
      const ny = Math.max(8, Math.min(canvas.height-8, player.y + dy));
      if (tryMove(nx, ny)) { player.x = nx; player.y = ny; }
      if (vx > 0) playerFlip = false;
      else if (vx < 0) playerFlip = true;
      distAcc += Math.hypot(dx,dy);
      if (distAcc >= ENCOUNTER_DIST){
        distAcc = 0; // リセット
        running = false; // ループ停止
        // BGM停止（バトル中は無音 or 別BGM想定）
        if (!bgm.paused) bgm.pause();

        // 戦闘へ移行（未定義やエラーならワールドへ自動復帰）
        setTimeout(() => {
          try {
            if (typeof window.enterBattle === 'function') {
              window.enterBattle({ worldName: '草原' });
            } else {
              console.warn('enterBattle が未定義のため、ワールドを継続します');
              running = true;
              startBgm();
              requestAnimationFrame(loop);
            }
          } catch (e) {
            console.error('enterBattle 実行エラー:', e);
            running = true;
            startBgm();
            requestAnimationFrame(loop);
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
    g.font = '16px sans-serif';
    const text = `連勝: ${streak}`;
    const metrics = g.measureText(text);
    const padding = 4;
    const bgWidth = metrics.width + padding * 2;
    const bgHeight = 20;
    const x = 10;
    const y = canvas.height - 26;

    // 背景の白い長方形
    g.fillStyle = 'rgba(255, 255, 255, 0.8)';
    g.fillRect(x - padding, y, bgWidth, bgHeight);

    // 黒文字でテキスト
    g.fillStyle = '#000';
    g.fillText(text, x, canvas.height - 10);

    // 最高連勝の表示（右下） — 背景を白くして見やすく
    const best = (window.bestStreak ?? 0);
    g.font = '16px sans-serif';
    const bestText = `最高連勝: ${best}`;
    const bestMetrics = g.measureText(bestText);
    const bestPadding = 4;
    const bestBgWidth = bestMetrics.width + bestPadding * 2;
    const bestBgHeight = 20;
    const bx = canvas.width - bestBgWidth - 10;
    const by = canvas.height - 26;

    // 白背景
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(bx - bestPadding, by, bestBgWidth, bestBgHeight);

    // 黒文字
    g.fillStyle = '#000';
    g.textAlign = 'left';
    g.fillText(bestText, bx, canvas.height - 10);
  }


  // ループ開始
  requestAnimationFrame(loop);
})();
