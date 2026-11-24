// ヒーローに仕込んだミニゲーム「鳩とばし」
// ヒーローの中央下にいつも鳩とパチンコがいて、引っ張って離すとそのまま飛ぶ。
// 背景と地面は最初は右側にうっすら見えるだけで、飛ばすとカメラが進んで流れ込んでくる。
// 空中のブースターや障害物を越えて、着地後の滑りまで含めた飛距離を競う。
// 低解像度のキャンバスに描いて拡大表示し、ドット絵らしく見せる。
(() => {
  const VH = 216;              // ゲーム世界の高さ（座標の単位）
  const RES = 1.4;             // 描画の細かさ（世界 1 単位 = 1.4 ドット）。スプライトはこの倍率で作ってある
  const GROUND = VH - 18;      // 地面の高さ（y は下向き）
  const PX_PER_M = 10;         // 10px = 1m
  const G = 300;               // 重力
  const VMAX = 560;            // 最大発射速度
  const PULL = 52;             // 最大の引っ張り距離
  const R = 10;                // 鳩の当たり判定の半径
  const SLING_X = 64;
  const ANCHOR = { x: SLING_X, y: GROUND - 46 };
  const BEST_KEY = "hato-tobashi-best";

  const SPRITES = ["pigeon_ready", "pigeon_fly1", "pigeon_fly2", "pigeon_slide", "pigeon_win",
    "slingshot", "obstacle_box", "obstacle_crow", "boost_coffee", "boost_fan", "boost_spring"];
  const img = {};
  for (const n of SPRITES) { const i = new Image(); i.src = `media/game/${n}.png`; img[n] = i; }
  const ready = (n) => img[n] && img[n].complete && img[n].naturalWidth > 0;

  let hero, root, view, vctx, scene, sctx, canvas, ctx, hud, grab, VW = 384;
  // VIEW_H = 画面に映る世界の高さ（縦長の画面ほど引きで写す）
  // CAM_Y0 = 地面を下端に置くカメラ位置、CAM_X0 = パチンコを画面の中央に置くカメラ位置
  let VIEW_H = VH, CAM_Y0 = 0, CAM_X0 = 0;
  let aimPath = [], aimFade = 0, flyT = 0, acc = 0;
  let state, bird, items, patches, genX, cam, particles, popups, raf, last, best, visible = true;

  const rand = (a, b) => a + Math.random() * (b - a);
  const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
  const saveBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch {} };

  // ---------- コース生成（毎回ランダム、進んだぶんだけ先に作る） ----------
  function generateUntil(x) {
    while (genX < x) {
      genX += rand(110, 230);
      const r = Math.random();
      const air = GROUND - rand(34, 175);
      if (r < 0.27) items.push({ type: "box", x: genX, y: air, w: 24, h: 22 });
      else if (r < 0.45) items.push({ type: "crow", x: genX, y: air, y0: air, w: 22, h: 16, t: rand(0, 6) });
      else if (r < 0.66) items.push({ type: "coffee", x: genX, y: air, w: 12, h: 16 });
      else if (r < 0.82) items.push({ type: "fan", x: genX, y: GROUND - rand(30, 110), w: 18, h: 18 });
      else items.push({ type: "spring", x: genX, y: GROUND - 7, w: 26, h: 14 });
      // 地面の質（氷はよく滑る、ぬかるみは止まる）
      if (Math.random() < 0.28) {
        const len = rand(60, 170);
        const ice = Math.random() < 0.6;
        patches.push({ x0: genX - len / 2, x1: genX + len / 2, mu: ice ? 0.08 : 1.1, kind: ice ? "ice" : "mud" });
      }
    }
  }
  const frictionAt = (x) => {
    for (const p of patches) if (x >= p.x0 && x <= p.x1) return p.mu;
    return 0.3;
  };

  function reset() {
    items = []; patches = []; particles = []; popups = [];
    genX = 160;
    generateUntil(1200);
    bird = { x: ANCHOR.x, y: ANCHOR.y, vx: 0, vy: 0, angle: 0, dir: 1, landX: null, bounces: 0, phase: "ready", t: 0 };
    if (!cam) cam = { x: CAM_X0, y: CAM_Y0 }; // もう一回のときはカメラが巻き戻る
    setState("ready");
    root.classList.remove("is-jumped");
    best = readBest();
    hud.result.hidden = true;
    updateHud();
  }

  // 状態に合わせてヒーローの文字を隠したり戻したりする
  function setState(s) {
    state = s;
    const playing = s === "fly" || s === "slide" || s === "done";
    hero.classList.toggle("is-playing", playing);
    root.classList.toggle("is-playing", playing);
    root.classList.toggle("is-ready", s === "ready");
    root.classList.toggle("is-flying", s === "fly" || s === "slide");
  }

  // ---------- 入力（鳩の上に置いた透明なつかみ手で受ける。ページのスクロールは邪魔しない） ----------
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * VW + cam.x, y: (e.clientY - r.top) / r.height * VIEW_H + cam.y };
  }
  function onDown(e) {
    if (state !== "ready") return;
    e.preventDefault();
    grab.setPointerCapture(e.pointerId);
    setState("drag");
    onMove(e);
  }
  function onMove(e) {
    if (state !== "drag") return;
    const p = toWorld(e);
    let dx = p.x - ANCHOR.x, dy = p.y - ANCHOR.y;
    const len = Math.hypot(dx, dy);
    if (len > PULL) { dx *= PULL / len; dy *= PULL / len; }
    // 前方には引っ張れない（後ろ側に引く）
    if (dx > 6) dx = 6;
    // 地面より下には引けない
    if (ANCHOR.y + dy > GROUND - R - 1) dy = GROUND - R - 1 - ANCHOR.y;
    bird.x = ANCHOR.x + dx; bird.y = ANCHOR.y + dy;
  }
  function onUp() {
    if (state !== "drag") return;
    const dx = bird.x - ANCHOR.x, dy = bird.y - ANCHOR.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) { bird.x = ANCHOR.x; bird.y = ANCHOR.y; setState("ready"); return; }
    launch(dx, dy);
  }
  function launch(dx, dy) {
    const len = Math.hypot(dx, dy), k = (len / PULL) * VMAX / len;
    bird.vx = -dx * k; bird.vy = -dy * k;
    bird.phase = "fly";
    setState("fly");
    burst(bird.x, bird.y, "#ffffff", 8);
  }
  // 発射後に 1 回だけ、自分でジャンプできる（飛行中でも滑走中でも）
  function jump() {
    if ((state !== "fly" && state !== "slide") || bird.jumped) return false;
    bird.jumped = true;
    bird.vy = Math.min(bird.vy, 0) - 230;
    bird.vx = Math.max(bird.vx, 0) + 40;
    if (state === "slide") { bird.y = GROUND - R - 1; setState("fly"); bird.phase = "fly"; }
    burst(bird.x, bird.y + 6, "#ffffff", 10);
    popup(bird.x, bird.y - 16, "ジャンプ!", "#ffffff");
    root.classList.add("is-jumped");
    return true;
  }
  function onTap(e) {
    if (e.target === grab || e.target.closest(".game-result")) return; // 発射の指離しや結果パネルは除く
    jump();
  }
  function onGlobalKey(e) {
    if (e.repeat || e.target === grab || !visible) return;
    if (e.target.closest && e.target.closest("input, textarea, select, button, a")) return;
    if ((e.key === " " || e.key === "Enter" || e.key === "ArrowUp") && jump()) e.preventDefault();
  }
  // キーボードでは Enter / Space で、ほどよい角度と強さで飛ばす
  function onKey(e) {
    if ((e.key === "Enter" || e.key === " ") && state === "ready") {
      e.preventDefault();
      const dx = -PULL * 0.68, dy = PULL * 0.68;
      bird.x = ANCHOR.x + dx; bird.y = ANCHOR.y + dy;
      launch(dx, dy);
    }
  }

  // ---------- 演出 ----------
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++)
      particles.push({ x, y, vx: rand(-60, 60), vy: rand(-80, 20), life: rand(0.3, 0.7), color });
  }
  function popup(x, y, text, color) { popups.push({ x, y, text, color, life: 1 }); }

  // ---------- 物理 ----------
  function step(dt) {
    bird.t += dt;
    for (const it of items) if (it.type === "crow" && !it.hit) {
      it.t += dt; it.x -= 18 * dt; it.y = it.y0 + Math.sin(it.t * 3) * 6;
    } else if (it.type === "crow" && it.hit) { it.vy += G * dt; it.y += it.vy * dt; it.x += it.vx * dt; }

    for (const p of particles) { p.vy += G * 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) { p.y -= 18 * dt; p.life -= dt * 0.8; }
    popups = popups.filter((p) => p.life > 0);

    if (state === "fly" || state === "slide") {
      if (state === "fly") {
        bird.vx -= bird.vx * 0.04 * dt; // 空気抵抗（ごく弱く）
        bird.vy += G * dt;
        bird.x += bird.vx * dt; bird.y += bird.vy * dt;
        bird.angle = Math.atan2(bird.vy, Math.abs(bird.vx) + 1);
        collide();
        if (bird.y >= GROUND - R) touchGround();
        // 念のため：空中でほとんど動かない状態が続いたら前へ押し出す
        bird.stuck = Math.hypot(bird.vx, bird.vy) < 30 ? (bird.stuck || 0) + dt : 0;
        if (bird.stuck > 0.5) { bird.stuck = 0; bird.vx = Math.max(bird.vx, 90); bird.vy = -90; }
        if (bird.y < -2000) bird.y = -2000; // 打ち上がりすぎ防止
      } else {
        bird.vx -= Math.sign(bird.vx) * frictionAt(bird.x) * G * dt;
        bird.x += bird.vx * dt;
        bird.angle = 0;
        if (Math.random() < 0.5) particles.push({ x: bird.x - 8, y: GROUND - 1, vx: rand(-30, 0), vy: rand(-40, -10), life: 0.35,
          color: frictionAt(bird.x) < 0.1 ? "#cfeeff" : frictionAt(bird.x) > 0.6 ? "#5b3c2a" : "#8ccf6e" });
        for (const it of items) if (it.type === "spring" && !it.used && Math.abs(bird.x - it.x) < it.w / 2) spring(it);
        if (Math.abs(bird.vx) < 4) finish();
      }
      // 跳ね返されて後ろへ戻りすぎたときだけ止める（引っ張った位置は PULL 以内なのでここには掛からない）
      if (bird.vx < 0 && bird.x < SLING_X - PULL - 20) { bird.x = SLING_X - PULL - 20; bird.vx = -bird.vx * 0.3; }
      generateUntil(bird.x + VW * 2);
    }
    // 待機中はパチンコを画面中央に。飛んだら鳩を左寄りで追い、高く飛んだら上にも追う
    if (state === "fly" || state === "slide") { flyT += dt; aimFade -= dt * 0.5; } else if (state === "ready") { flyT = 0; aimPath = []; }
    const lead = 0.33 + 0.4 * Math.exp(-flyT / 0.9); // 0.73 → 0.33
    const tx = state === "ready" || state === "drag" ? CAM_X0 : Math.max(CAM_X0, bird.x - VW * lead);
    cam.x += (tx - cam.x) * Math.min(1, dt * (state === "ready" ? 4 : 8));
    const ty = Math.min(CAM_Y0, bird.y - VIEW_H * 0.3);
    cam.y += (ty - cam.y) * Math.min(1, dt * 6);
    updateHud();
  }

  function collide() {
    for (const it of items) {
      if (Math.abs(it.x - bird.x) > 40) continue;
      if (it.type === "box") {
        const cx = Math.max(it.x - it.w / 2, Math.min(bird.x, it.x + it.w / 2));
        const cy = Math.max(it.y - it.h / 2, Math.min(bird.y, it.y + it.h / 2));
        let nx = bird.x - cx, ny = bird.y - cy;
        const d = Math.hypot(nx, ny);
        if (d < R) {
          if (d === 0) { nx = -1; ny = 0; } else { nx /= d; ny /= d; }
          bird.x = cx + nx * R; bird.y = cy + ny * R;
          const vn = bird.vx * nx + bird.vy * ny;
          if (vn < 0) {
            bird.vx -= 1.45 * vn * nx; bird.vy -= 1.45 * vn * ny;
            bird.vx *= 0.8; bird.vy *= 0.8;
            it.flash = 0.2;
            burst(bird.x, bird.y, "#f3e6c8", 10);
            popup(it.x, it.y - 16, "ドン!", "#ffd6a0");
          }
          // 書類の上に弱く乗ったときは、小さく跳ねさせて前へ転がり落とす（上に乗ったまま止まるのを防ぐ）
          if (ny < -0.5 && bird.vy > -90) {
            bird.vy = -90;
            bird.vx = Math.max(bird.vx, 80);
          }
        }
      } else if (!it.used && !it.hit && Math.abs(it.x - bird.x) < it.w / 2 + R - 2 && Math.abs(it.y - bird.y) < it.h / 2 + R - 2) {
        if (it.type === "crow") {
          it.hit = true; it.vx = bird.vx * 0.3; it.vy = -80;
          bird.vx *= 0.7; bird.vy = Math.abs(bird.vy) * 0.3 + 60;
          burst(bird.x, bird.y, "#222", 12);
          popup(it.x, it.y - 14, "カァ!", "#ff8f8f");
        } else if (it.type === "coffee") {
          it.used = true;
          bird.vx += 260; bird.vy = Math.min(bird.vy, -60);
          burst(it.x, it.y, "#ffe27a", 14);
          popup(it.x, it.y - 14, "カフェイン!", "#ffe27a");
        } else if (it.type === "fan") {
          it.used = true;
          bird.vy = -Math.max(360, Math.abs(bird.vy)); bird.vx += 40;
          burst(it.x, it.y, "#bde8ff", 14);
          popup(it.x, it.y - 14, "上昇気流!", "#bde8ff");
        } else if (it.type === "spring") spring(it);
      }
    }
  }

  function spring(it) {
    it.used = true;
    bird.y = GROUND - R - 1;
    bird.vy = -Math.max(280, Math.abs(bird.vy) * 1.1);
    bird.vx = Math.max(Math.abs(bird.vx), 120) * 1.1;
    state = "fly"; bird.phase = "fly";
    burst(it.x, it.y, "#d9d9e6", 12);
    popup(it.x, it.y - 16, "ボヨン!", "#ffffff");
  }

  function touchGround() {
    for (const it of items) if (it.type === "spring" && !it.used && Math.abs(bird.x - it.x) < it.w / 2 + 2) return spring(it);
    bird.y = GROUND - R;
    if (bird.landX === null) bird.landX = bird.x;
    if (bird.vy > 110) {
      bird.vy = -bird.vy * 0.32; bird.vx *= 0.82; bird.bounces++;
      burst(bird.x, GROUND, "#8ccf6e", 6);
    } else {
      bird.vy = 0; state = "slide"; bird.phase = "slide";
    }
  }

  function finish() {
    bird.vx = 0; bird.phase = "slide";
    const total = Math.max(0, (bird.x - SLING_X) / PX_PER_M);
    const flight = Math.max(0, ((bird.landX ?? bird.x) - SLING_X) / PX_PER_M);
    const isBest = total > best;
    if (isBest) { best = total; saveBest(best); }
    hud.rTotal.textContent = total.toFixed(1);
    hud.rFlight.textContent = flight.toFixed(1);
    // 箱に跳ね返されて後ろに戻った場合は「戻り」として見せる
    const slide = total - flight;
    hud.rSlideLabel.textContent = slide < 0 ? "戻り" : "滑走";
    hud.rSlide.textContent = Math.abs(slide).toFixed(1);
    hud.rSign.textContent = slide < 0 ? "−" : "＋";
    hud.rBest.textContent = isBest ? "ベスト更新!" : `ベスト ${best.toFixed(1)} m`;
    hud.rBest.classList.toggle("is-best", isBest);
    setState("done");
    setTimeout(() => { if (state === "done") { hud.result.hidden = false; hud.again.focus({ preventScroll: true }); } }, 500);
  }

  function updateHud() {
    const d = Math.max(0, (bird.x - SLING_X) / PX_PER_M);
    hud.dist.textContent = state === "ready" || state === "drag" ? "0.0" : d.toFixed(1);
    hud.best.textContent = best > 0 ? `BEST ${best.toFixed(1)} m` : "";
  }

  // ---------- 描画 ----------
  let g2 = null; // いま描いている先（scene か view）
  function sprite(name, x, y, w, h, angle = 0, flip = false) {
    if (!ready(name)) return false;
    const vctx = g2;
    vctx.save();
    vctx.translate(Math.round(x - cam.x), Math.round(y - cam.y));
    if (angle) vctx.rotate(angle);
    if (flip) vctx.scale(-1, 1);
    // スプライトは RES 倍の大きさで作ってあるので、元の大きさのまま 1 ドット = 1 ドットで描く
    w = img[name].naturalWidth / RES; h = img[name].naturalHeight / RES;
    vctx.drawImage(img[name], Math.round(-w / 2), Math.round(-h / 2), w, h);
    vctx.restore();
    return true;
  }
  const sw = (name, h) => ready(name) ? Math.round(img[name].naturalWidth / img[name].naturalHeight * h) : h;

  function drawBackground() {
    const vctx = g2;
    const lift = cam.y - CAM_Y0; // 0 = 地面が下端。高く飛ぶほどマイナス
    const g = vctx.createLinearGradient(0, -lift * 0.3, 0, VIEW_H - lift * 0.3);
    g.addColorStop(0, "#140f24"); g.addColorStop(0.55, "#3b2152"); g.addColorStop(1, "#ff7f6e");
    vctx.fillStyle = g; vctx.fillRect(0, 0, VW, VIEW_H);
    // 星
    vctx.fillStyle = "#fff";
    for (let i = 0; i < 60; i++) {
      const sx = ((hash(i) * 1600 - cam.x * 0.05) % 1600 + 1600) % 1600;
      if (sx > VW) continue;
      const sy = hash(i + 99) * VIEW_H * 0.6 - lift * 0.05;
      vctx.globalAlpha = 0.3 + 0.7 * hash(i + 7);
      vctx.fillRect(sx | 0, sy | 0, 1, 1);
    }
    vctx.globalAlpha = 1;
    // ビル（遠景・近景）
    const layer = (par, base, hmin, hmax, color, win, seed) => {
      const w = 26, off = cam.x * par;
      const i0 = Math.floor(off / w) - 1;
      for (let i = i0; i < i0 + VW / w + 3; i++) {
        const h = hmin + hash(i * 3.1 + seed) * (hmax - hmin);
        const x = i * w - off, top = base - CAM_Y0 - lift * par - h;
        vctx.fillStyle = color; vctx.fillRect(Math.round(x), Math.round(top), w - 2, VIEW_H * 2);
        if (win) {
          vctx.fillStyle = win;
          for (let wy = top + 5; wy < base - 4; wy += 7)
            for (let wx = 4; wx < w - 6; wx += 6)
              if (hash(i * 13 + wy * 0.7 + wx) > 0.62) vctx.fillRect(Math.round(x + wx), Math.round(wy), 2, 3);
        }
      }
    };
    layer(0.15, GROUND - 6, 40, 110, "#2a1d3d", null, 1);
    layer(0.4, GROUND, 25, 80, "#1d1530", "#ffcf6b", 5);
  }

  function drawGround() {
    const vctx = g2;
    const y = Math.round(GROUND - cam.y);
    vctx.fillStyle = "#4a3326"; vctx.fillRect(0, y, VW, VIEW_H - y + 400);
    vctx.fillStyle = "#3f8f4c"; vctx.fillRect(0, y, VW, 4);
    vctx.fillStyle = "#6cc26a";
    const x0 = Math.floor(cam.x / 4) * 4;
    for (let x = x0; x < cam.x + VW; x += 4) if (hash(x) > 0.5) vctx.fillRect(Math.round(x - cam.x), y, 2, 1);
    for (const p of patches) {
      if (p.x1 < cam.x || p.x0 > cam.x + VW) continue;
      vctx.fillStyle = p.kind === "ice" ? "#a9e2ff" : "#5b3a28";
      vctx.fillRect(Math.round(p.x0 - cam.x), y, Math.round(p.x1 - p.x0), 4);
      vctx.fillStyle = p.kind === "ice" ? "#ffffff" : "#3a2418";
      for (let x = Math.ceil(p.x0 / 6) * 6; x < p.x1; x += 6) if (hash(x + 3) > 0.5) vctx.fillRect(Math.round(x - cam.x), y + 1, 2, 1);
    }
    // 10m ごとの目盛り
    vctx.font = "bold 7px monospace"; vctx.textAlign = "center";
    const m0 = Math.ceil((cam.x - SLING_X) / 100) * 100;
    for (let m = Math.max(100, m0); m < cam.x + VW; m += 100) {
      const x = Math.round(SLING_X + m - cam.x);
      vctx.fillStyle = "#e9d9b8"; vctx.fillRect(x, y + 5, 1, 4);
      vctx.fillText(`${m / PX_PER_M}m`, x, y + 16);
    }
  }

  function drawItems() {
    const vctx = g2;
    for (const it of items) {
      if (it.x < cam.x - 40 || it.x > cam.x + VW + 40) continue;
      if (it.type === "box") {
        if (!sprite("obstacle_box", it.x, it.y, sw("obstacle_box", 26), 26)) rect(it, "#c9a26b");
        if (it.flash > 0) { it.flash -= 1 / 60; vctx.fillStyle = "rgba(255,255,255,.5)"; vctx.fillRect(Math.round(it.x - it.w / 2 - cam.x), Math.round(it.y - it.h / 2 - cam.y), it.w, it.h); }
      } else if (it.type === "crow") {
        if (!sprite("obstacle_crow", it.x, it.y, sw("obstacle_crow", 20), 20, it.hit ? it.t * 8 : 0)) rect(it, "#111");
      } else if (!it.used) {
        const bob = it.type === "spring" ? 0 : Math.sin(bird.t * 4 + it.x) * 2;
        const name = { coffee: "boost_coffee", fan: "boost_fan", spring: "boost_spring" }[it.type];
        const h = { coffee: 20, fan: 22, spring: 14 }[it.type];
        if (!sprite(name, it.x, it.y + bob, sw(name, h), h)) rect(it, "#ffd24a");
        if (it.type === "fan") { // 上昇気流の線
          vctx.fillStyle = "rgba(190,232,255,.55)";
          for (let k = 0; k < 3; k++) {
            const ly = (bird.t * 40 + k * 9) % 26;
            vctx.fillRect(Math.round(it.x - 6 + k * 5 - cam.x), Math.round(it.y - 12 - ly - cam.y), 1, 4);
          }
        }
      }
    }
  }
  const rect = (it, c) => { const vctx = g2; vctx.fillStyle = c; vctx.fillRect(Math.round(it.x - it.w / 2 - cam.x), Math.round(it.y - it.h / 2 - cam.y), it.w, it.h); };

  function drawSling(front) {
    const vctx = g2;
    const h = 52, w = sw("slingshot", h);
    const forkL = { x: SLING_X - 7, y: GROUND - h + 6 }, forkR = { x: SLING_X + 7, y: GROUND - h + 6 };
    const band = (f) => {
      vctx.strokeStyle = "#7a2f22"; vctx.lineWidth = 2;
      vctx.beginPath(); vctx.moveTo(f.x - cam.x, f.y - cam.y);
      vctx.lineTo(bird.x - cam.x, bird.y - cam.y); vctx.stroke();
    };
    const holding = state === "ready" || state === "drag";
    if (!front) {
      if (!sprite("slingshot", SLING_X, GROUND - h / 2 + 2, w, h)) {
        vctx.fillStyle = "#8a5a33"; vctx.fillRect(SLING_X - 2 - cam.x, GROUND - h - cam.y, 4, h);
      }
      if (holding) band(forkR);
    } else if (holding) band(forkL);
  }

  function drawBird() {
    const vctx = g2;
    let name = "pigeon_ready", h = 30;
    if (state === "fly") { name = Math.floor(bird.t * 10) % 2 ? "pigeon_fly1" : "pigeon_fly2"; h = 26; }
    else if (state === "slide" || state === "done") { name = "pigeon_slide"; h = 20; }
    const y = state === "slide" || state === "done" ? GROUND - h / 2 + 1 : bird.y;
    const ang = state === "fly" ? Math.max(-0.9, Math.min(0.9, bird.angle)) : 0;
    // 跳ね返されて後ろへ進んでいるときは左右反転（止まった後も向きを保つ）
    if (bird.vx < -5) bird.dir = -1; else if (bird.vx > 5) bird.dir = 1;
    const back = bird.dir === -1 && state !== "ready" && state !== "drag";
    if (!sprite(name, bird.x, y, sw(name, h), h, back ? -ang : ang, back)) {
      vctx.fillStyle = "#fff"; vctx.beginPath(); vctx.arc(bird.x - cam.x, y - cam.y, R, 0, 7); vctx.fill();
    }
  }

  // 予測線：実際の飛行（step）と同じ式で 1.6 秒先まで計算する
  function predict(dx, dy) {
    const len = Math.hypot(dx, dy), k = (len / PULL) * VMAX / len;
    let vx = -dx * k, vy = -dy * k, x = ANCHOR.x + dx, y = ANCHOR.y + dy;
    const pts = [], h = 1 / 240;
    for (let i = 1; i <= 384; i++) {
      vx -= vx * 0.04 * h; vy += G * h; x += vx * h; y += vy * h;
      if (y >= GROUND - R) break;
      if (i % 16 === 0) pts.push([x, y]);
    }
    return pts;
  }
  function drawAim() {
    const vctx = g2;
    if (state === "drag") {
      const dx = bird.x - ANCHOR.x, dy = bird.y - ANCHOR.y;
      aimPath = Math.hypot(dx, dy) < 8 ? [] : predict(dx, dy);
      aimFade = 1;
    }
    // 発射後も少しのあいだ世界に残し、鳩がその上を飛ぶのが見えるようにする
    if (!aimPath.length || aimFade <= 0) return;
    // 映像の上でも見えるよう、黒い縁取りつきの白い点にする
    vctx.globalAlpha = Math.min(1, aimFade) * 0.9;
    aimPath.forEach(([x, y]) => {
      if (state !== "drag" && x < bird.x + 6) return; // 通り過ぎた点は消す
      const px = Math.round(x - cam.x), py = Math.round(y - cam.y);
      vctx.fillStyle = "#1a1424"; vctx.fillRect(px - 2, py - 2, 4, 4);
      vctx.fillStyle = "#ffffff"; vctx.fillRect(px - 1, py - 1, 2, 2);
    });
    vctx.globalAlpha = 1;
  }

  function draw() {
    // 1) 背景・地面・アイテムを scene に描く
    g2 = sctx;
    sctx.setTransform(RES, 0, 0, RES, 0, 0);
    drawBackground();
    drawGround();
    drawItems();
    // 2) パチンコより左は透明、右へ行くほど濃くなるマスク（世界の位置に固定。飛ぶとカメラが進んで全体が見えてくる）
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    const fx0 = (SLING_X + VW * 0.06 - cam.x) * RES, fx1 = (SLING_X + VW * 1.15 - cam.x) * RES;
    const m = sctx.createLinearGradient(fx0, 0, fx1, 0);
    m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
    sctx.globalCompositeOperation = "destination-in";
    sctx.fillStyle = m; sctx.fillRect(0, 0, scene.width, scene.height);
    sctx.globalCompositeOperation = "source-over";
    // 3) view に scene を重ね、その上にパチンコ・鳩・演出をはっきり描く
    g2 = vctx;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, view.width, view.height);
    vctx.drawImage(scene, 0, 0);
    vctx.setTransform(RES, 0, 0, RES, 0, 0);
    drawSling(false);
    drawAim();
    drawBird();
    drawSling(true);
    for (const p of particles) { vctx.fillStyle = p.color; vctx.globalAlpha = Math.min(1, p.life * 3); vctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), 2, 2); }
    vctx.globalAlpha = 1;
    vctx.font = "bold 9px monospace"; vctx.textAlign = "center";
    for (const p of popups) {
      vctx.globalAlpha = Math.min(1, p.life * 2);
      vctx.fillStyle = "#000"; vctx.fillText(p.text, Math.round(p.x - cam.x) + 1, Math.round(p.y - cam.y) + 1);
      vctx.fillStyle = p.color; vctx.fillText(p.text, Math.round(p.x - cam.x), Math.round(p.y - cam.y));
    }
    vctx.globalAlpha = 1;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(view, 0, 0, canvas.width, canvas.height);
    placeGrab();
  }

  function frame(t) {
    if (!visible) { raf = 0; return; } // ヒーローが画面外なら止める
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, (t - (last || t)) / 1000);
    last = t;
    // 1/240 秒刻みで進める（予測線と同じ刻み。速いときのすり抜けも防ぐ）
    acc += dt;
    while (acc >= 1 / 240) { step(1 / 240); acc -= 1 / 240; }
    draw();
  }

  function resize() {
    const r = root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    const aspect = r.width / r.height;
    // ヒーローの文字とぶつからないよう少し引きで写す。縦長の画面では横に最低 300 見えるまで引く
    const zoom = Math.max(1.25, Math.min(2, 300 / (VH * aspect)));
    VIEW_H = VH * zoom; CAM_Y0 = VH - VIEW_H;
    VW = Math.round(VIEW_H * aspect);
    CAM_X0 = SLING_X - VW / 2;
    // スプライトは RES 倍で作ってあるので、バッファも RES 倍にして 1 ドット = 1 ドットで描く
    view.width = scene.width = Math.round(VW * RES); view.height = scene.height = Math.round(VIEW_H * RES);
    vctx.imageSmoothingEnabled = sctx.imageSmoothingEnabled = false;
    if (cam && (state === "ready" || state === "drag")) { cam.x = CAM_X0; cam.y = CAM_Y0; }
    grabKey = "";
  }

  // 「タップ」のアイコン：指先で押すドット絵の手（# = ふち、w = 白）
  const HAND_SVG = (() => {
    const map = [
      "....##......",
      "...#ww#.....",
      "...#ww#.....",
      "...#ww###...",
      "...#ww#ww##.",
      ".###ww#ww#w#",
      "#ww#wwwwwww#",
      "#wwwwwwwwww#",
      ".#wwwwwwwww#",
      "..#wwwwwww#.",
      "...#wwwwww#.",
      "...#wwwwww#.",
      "...########.",
    ];
    let rects = "";
    map.forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== ".") rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === "#" ? "#1a1420" : "#fff"}"/>`;
    }));
    return `<svg viewBox="0 0 12 13" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  })();

  // つかみ手（と案内の文字）を鳩の位置に合わせる
  let grabKey = "";
  function placeGrab() {
    const show = state === "ready" || state === "drag";
    const r = canvas.getBoundingClientRect(), k = r.width / VW;
    const x = (ANCHOR.x - cam.x) * k, y = (ANCHOR.y - cam.y) * k, size = Math.max(72, 46 * k);
    // ジャンプのアイコンは鳩の右上についていく（画面の外にははみ出さない）
    if (state === "fly" || state === "slide") {
      const jx = Math.min(r.width - hud.jump.offsetWidth - 12, Math.max(8, (bird.x - cam.x) * k + R * k + 4));
      const jy = Math.min(r.height - 52, Math.max(8, (bird.y - cam.y) * k - R * k - 44));
      hud.jump.style.transform = `translate(${jx | 0}px, ${jy | 0}px)`;
    }
    const key = `${show}|${x | 0}|${y | 0}|${size | 0}`;
    if (key === grabKey) return;
    grabKey = key;
    grab.hidden = !show;
    grab.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px`;
    hud.hint.style.cssText = `left:${x + size * 0.45}px;top:${y}px`; // 鳩の右横に出す
  }

  function start() {
    cancelAnimationFrame(raf); last = 0; acc = 0; raf = requestAnimationFrame(frame);
  }

  // ---------- 初期化 ----------
  function init() {
    hero = document.querySelector(".hero");
    if (!hero) return;
    root = document.createElement("div");
    root.className = "game";
    root.innerHTML = `
      <canvas class="game-canvas" aria-hidden="true"></canvas>
      <button type="button" class="game-grab" aria-label="ミニゲーム「鳩とばし」：鳩をうしろへ引っ張って離すと飛びます。Enter キーでも飛ばせます。"></button>
      <p class="game-hint" aria-hidden="true">引っ張って飛ばす<span class="game-best"></span></p>
      <p class="game-dist"><span class="game-dist-n">0.0</span> m</p>
      <span class="game-jump"><span class="game-jump-icon">${HAND_SVG}</span><span class="game-jump-label">タップでジャンプ</span></span>
      <div class="game-result" role="dialog" aria-label="鳩とばしの記録" hidden>
        <img class="game-result-img" src="media/game/pigeon_win.png" alt="">
        <p class="game-result-label">記録</p>
        <p class="game-result-total"><span class="r-total">0.0</span><small> m</small></p>
        <p class="game-result-break">飛行 <span class="r-flight">0</span> m <span class="r-sign">＋</span> <span class="r-slide-label">滑走</span> <span class="r-slide">0</span> m</p>
        <p class="game-result-best"></p>
        <button type="button" class="btn btn-solid game-again">もう一回</button>
      </div>`;
    hero.querySelector(".hero-bg").after(root);
    canvas = root.querySelector("canvas"); ctx = canvas.getContext("2d");
    view = document.createElement("canvas"); vctx = view.getContext("2d");
    scene = document.createElement("canvas"); sctx = scene.getContext("2d");
    grab = root.querySelector(".game-grab");
    const q = (s) => root.querySelector(s);
    hud = { dist: q(".game-dist-n"), best: q(".game-best"), hint: q(".game-hint"), jump: q(".game-jump"), result: q(".game-result"),
      rTotal: q(".r-total"), rFlight: q(".r-flight"), rSlide: q(".r-slide"), rSlideLabel: q(".r-slide-label"),
      rSign: q(".r-sign"), rBest: q(".game-result-best"), again: q(".game-again") };
    grab.addEventListener("pointerdown", onDown);
    grab.addEventListener("pointermove", onMove);
    grab.addEventListener("pointerup", onUp);
    grab.addEventListener("pointercancel", onUp);
    grab.addEventListener("keydown", onKey);
    root.addEventListener("click", onTap);
    window.addEventListener("keydown", onGlobalKey);
    // つかみ手は次の描画で表示されるので、先に表示してからフォーカスを戻す
    hud.again.addEventListener("click", () => { reset(); grab.hidden = false; grab.focus({ preventScroll: true }); });
    new ResizeObserver(resize).observe(root);
    // ヒーローが見えていないときは描画を止める
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) start();
    }).observe(root);
    resize();
    reset();
    start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
