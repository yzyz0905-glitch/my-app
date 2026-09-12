// メインゲーム制御クラス
class Game {
    constructor() {
        this.container = document.getElementById('game-container');
        this.level = 1;
        this.score = 0;
        this.state = 'START'; // 'START' | 'RUNNING' | 'BOSS_FIGHT' | 'STAIRS' | 'VICTORY' | 'GAMEOVER'
        this.playerColor = 0x00a8ff; // デフォルトブルー

        // プレイヤー変数
        this.playerX = 0;
        this.playerZ = 0;
        this.targetPlayerX = 0;
        this.forwardSpeed = 15.0;
        this.crowd = [];
        this.crowdCount = 1;

        // 入力制御
        this.isDragging = false;
        this.lastPointerX = 0;
        this.inputSensitivity = 0.022;
        this.keys = { left: false, right: false };

        // カメラ設定
        this.cameraOffset = new THREE.Vector3(0, 11, -12);

        // パーティクル
        this.particles = [];

        this.initThree();
        this.initInput();
        this.levelManager = new LevelManager(this.scene);
        this.loadLevel(this.level);

        // ループ
        this.clock = new THREE.Clock();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initThree() {
        // シーン
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xa0e7e5); // パステルブルー空
        this.scene.fog = new THREE.Fog(0xa0e7e5, 60, 140);

        // カメラ
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 300);
        this.camera.position.set(0, 11, -12);
        this.camera.lookAt(0, 0, 8);

        // レンダラー
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // ライティング
        const ambient = new THREE.AmbientLight(0xffffff, 0.75);
        this.scene.add(ambient);

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        hemiLight.position.set(0, 50, 0);
        this.scene.add(hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.dirLight.position.set(20, 40, -20);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 100;
        const d = 25;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.scene.add(this.dirLight);
        this.scene.add(this.dirLight.target);

        // リサイズ
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // プレイヤー頭上バッジ
        this.initPlayerBadge();
    }

    initPlayerBadge() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        this.playerBadgeCtx = canvas.getContext('2d');
        this.playerBadgeTex = new THREE.CanvasTexture(canvas);

        const geo = new THREE.PlaneGeometry(1.6, 1.6);
        const mat = new THREE.MeshBasicMaterial({ map: this.playerBadgeTex, transparent: true });
        this.playerBadgeMesh = new THREE.Mesh(geo, mat);
        this.scene.add(this.playerBadgeMesh);
        this.updatePlayerBadge();
    }

    updatePlayerBadge() {
        if (!this.playerBadgeCtx) return;
        this.playerBadgeCtx.clearRect(0, 0, 128, 128);

        if (this.crowdCount <= 0 || this.state === 'GAMEOVER') {
            this.playerBadgeTex.needsUpdate = true;
            this.playerBadgeMesh.visible = false;
            return;
        }

        this.playerBadgeMesh.visible = true;
        // 青丸
        this.playerBadgeCtx.fillStyle = '#00a8ff';
        this.playerBadgeCtx.beginPath();
        this.playerBadgeCtx.arc(64, 64, 56, 0, Math.PI * 2);
        this.playerBadgeCtx.fill();

        this.playerBadgeCtx.strokeStyle = '#ffffff';
        this.playerBadgeCtx.lineWidth = 6;
        this.playerBadgeCtx.stroke();

        this.playerBadgeCtx.fillStyle = '#ffffff';
        this.playerBadgeCtx.font = 'bold 50px "Fredoka", Arial';
        this.playerBadgeCtx.textAlign = 'center';
        this.playerBadgeCtx.textBaseline = 'middle';
        this.playerBadgeCtx.fillText(this.crowdCount, 64, 64);

        this.playerBadgeTex.needsUpdate = true;
    }

    initInput() {
        // ポインタ操作（マウス & タッチ）
        const onPointerDown = (e) => {
            window.sounds.init();
            this.isDragging = true;
            this.lastPointerX = e.clientX || (e.touches && e.touches[0].clientX) || 0;

            if (this.state === 'START') {
                this.startGame();
            }
        };

        const onPointerMove = (e) => {
            if (!this.isDragging) return;
            const currentX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            const deltaX = currentX - this.lastPointerX;
            this.lastPointerX = currentX;

            this.targetPlayerX += deltaX * this.inputSensitivity;
            const maxX = 3.6;
            this.targetPlayerX = Math.max(-maxX, Math.min(maxX, this.targetPlayerX));
        };

        const onPointerUp = () => {
            this.isDragging = false;
        };

        window.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        window.addEventListener('touchstart', onPointerDown, { passive: false });
        window.addEventListener('touchmove', (e) => {
            onPointerMove(e);
            if (this.state === 'RUNNING') e.preventDefault();
        }, { passive: false });
        window.addEventListener('touchend', onPointerUp);

        // キーボード操作
        window.addEventListener('keydown', (e) => {
            window.sounds.init();
            if (this.state === 'START') {
                this.startGame();
            }
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.keys.left = true;
            }
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                this.keys.right = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.keys.left = false;
            }
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                this.keys.right = false;
            }
        });
    }

    loadLevel(lvl) {
        this.level = lvl;
        this.playerX = 0;
        this.playerZ = 0;
        this.targetPlayerX = 0;
        this.state = 'START';

        // 群衆の初期化（1人からスタート）
        this.clearCrowd();
        this.crowdCount = 1;
        this.addStickman(0, 0);

        this.levelManager.generateLevel(this.level);

        // UI更新
        document.getElementById('level-indicator').innerText = `LEVEL ${this.level}`;
        document.getElementById('start-screen').style.display = 'flex';
        document.getElementById('victory-screen').style.display = 'none';
        document.getElementById('gameover-screen').style.display = 'none';
        this.updateProgress(0);
        this.updatePlayerBadge();
    }

    startGame() {
        this.state = 'RUNNING';
        document.getElementById('start-screen').style.display = 'none';
    }

    clearCrowd() {
        this.crowd.forEach(sm => sm.destroy());
        this.crowd = [];
    }

    addStickman(offsetX = 0, offsetZ = 0) {
        const sm = new Stickman(this.scene, this.playerColor, true);
        sm.mesh.position.set(this.playerX + offsetX, 0, this.playerZ + offsetZ);
        this.crowd.push(sm);
        return sm;
    }

    setCrowdCount(newCount) {
        const count = Math.max(0, Math.min(300, Math.round(newCount)));
        const diff = count - this.crowd.length;

        if (diff > 0) {
            // 追加
            for (let i = 0; i < diff; i++) {
                const idx = this.crowd.length;
                const offset = CrowdFormation.getOffset(idx, 0.36);
                this.addStickman(offset.x, offset.z);
            }
            window.sounds.playSpawnPop();
            this.spawnCrowdPopParticles();
        } else if (diff < 0) {
            // 削減
            for (let i = 0; i < Math.abs(diff); i++) {
                if (this.crowd.length > 0) {
                    const victim = this.crowd.pop();
                    victim.launch((Math.random() - 0.5) * 2, 1, -1);
                }
            }
        }

        this.crowdCount = this.crowd.length;
        this.updatePlayerBadge();

        if (this.crowdCount <= 0 && this.state === 'RUNNING') {
            this.triggerGameOver();
        }
    }

    changePlayerColor(hex) {
        this.playerColor = hex;
        this.crowd.forEach(sm => sm.setColor(hex));
    }

    spawnCrowdPopParticles() {
        for (let i = 0; i < 8; i++) {
            this.createParticle(
                this.playerX + (Math.random() - 0.5) * 2,
                1.5,
                this.playerZ + (Math.random() - 0.5) * 2,
                0x00d2d3,
                0.25
            );
        }
    }

    createParticle(x, y, z, color = 0xffffff, size = 0.2) {
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const p = new THREE.Mesh(geo, mat);
        p.position.set(x, y, z);
        p.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            Math.random() * 6 + 2,
            (Math.random() - 0.5) * 6
        );
        p.life = 1.0;
        this.scene.add(p);
        this.particles.push(p);
    }

    updateParticles(delta) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.position.addScaledVector(p.velocity, delta);
            p.velocity.y -= 15 * delta;
            p.rotation.x += 8 * delta;
            p.rotation.y += 8 * delta;
            p.life -= delta * 1.8;
            p.scale.setScalar(Math.max(0.01, p.life));

            if (p.life <= 0) {
                this.scene.remove(p);
                this.particles.splice(i, 1);
            }
        }
    }

    animate() {
        requestAnimationFrame(this.animate);
        const delta = Math.min(this.clock.getDelta(), 0.05);

        this.update(delta);
        this.render();
    }

    update(delta) {
        // キーボード操作の反映
        if (this.keys.left) this.targetPlayerX -= 12 * delta;
        if (this.keys.right) this.targetPlayerX += 12 * delta;
        const maxX = 3.6;
        this.targetPlayerX = Math.max(-maxX, Math.min(maxX, this.targetPlayerX));

        // 状態ごとの更新
        if (this.state === 'RUNNING') {
            this.updateRunning(delta);
        } else if (this.state === 'BOSS_FIGHT') {
            this.updateBossFight(delta);
        } else if (this.state === 'STAIRS') {
            this.updateStairs(delta);
        }

        // 棒人間のスォーム更新
        this.updateCrowd(delta);

        // ステージ要素の更新
        this.levelManager.update(delta, this.playerZ);

        // パーティクルの更新
        this.updateParticles(delta);

        // カメラ追従
        this.updateCamera(delta);
    }

    updateRunning(delta) {
        // 前進
        this.lastPlayerZ = this.playerZ;
        this.playerZ += this.forwardSpeed * delta;
        this.playerX += (this.targetPlayerX - this.playerX) * Math.min(1.0, delta * 14);

        // プログレスバー更新
        const progress = Math.min(1.0, this.playerZ / this.levelManager.finishLineZ);
        this.updateProgress(progress);

        // 1. ゲート通過判定
        this.checkGateCollisions();

        // 2. 障害物接触判定
        this.checkObstacleCollisions();

        // 3. 敵部隊激突判定
        this.checkEnemyCollisions(delta);

        // 4. ゴール到達判定
        if (this.playerZ >= this.levelManager.finishLineZ) {
            this.startBossFight();
        }
    }

    checkGateCollisions() {
        this.levelManager.gates.forEach(pair => {
            if (pair.passed) return;

            // プレイヤー群衆がゲートのZ面をまたいだか判定
            if ((this.lastPlayerZ <= pair.z && this.playerZ >= pair.z) || 
                (this.playerZ >= pair.z - 0.6 && this.playerZ <= pair.z + 1.2)) {
                pair.passed = true;

                // 左右どちらのゲートを通過したか判定
                // プレイヤーのX座標が0以上なら右、0未満なら左
                const chosenGate = (this.playerX >= 0) ? pair.gates[1] : pair.gates[0];
                this.applyGateEffect(chosenGate);

                // アニメーション（ゲートが少し縮んで消える演出）
                pair.gates.forEach(g => {
                    g.group.scale.set(0.9, 0.9, 0.9);
                });
            }
        });
    }

    applyGateEffect(gate) {
        let newCount = this.crowdCount;
        window.sounds.playGatePass(gate.isPositive);

        if (gate.type === 'ADD') {
            newCount += gate.value;
        } else if (gate.type === 'SUB') {
            newCount -= gate.value;
        } else if (gate.type === 'MUL') {
            newCount *= gate.value;
        } else if (gate.type === 'DIV') {
            newCount = Math.floor(newCount / gate.value);
        }

        this.setCrowdCount(newCount);
    }

    checkObstacleCollisions() {
        this.levelManager.obstacles.forEach(obs => {
            // プレイヤー群衆との距離チェック
            const distZ = Math.abs(this.playerZ - obs.z);
            if (distZ > 3.0) return;

            // 各棒人間と障害物の接触
            for (let i = this.crowd.length - 1; i >= 0; i--) {
                const sm = this.crowd[i];
                if (sm.isDead || sm.isFlying) continue;

                let hit = false;
                if (obs.type === 'spinner') {
                    const dx = sm.mesh.position.x - obs.x;
                    const dz = sm.mesh.position.z - obs.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < obs.radius) {
                        hit = true;
                    }
                } else if (obs.type === 'moving') {
                    const blockX = obs.group.position.x;
                    const dx = Math.abs(sm.mesh.position.x - blockX);
                    const dz = Math.abs(sm.mesh.position.z - obs.z);
                    if (dx < obs.width / 2 + 0.2 && dz < 0.6) {
                        hit = true;
                    }
                }

                if (hit) {
                    sm.launch((sm.mesh.position.x - obs.x) * 2, 1.5, -2);
                    this.crowd.splice(i, 1);
                    this.crowdCount = this.crowd.length;
                    this.updatePlayerBadge();
                    window.sounds.playHitObstacle();

                    if (this.crowdCount <= 0) {
                        this.triggerGameOver();
                        break;
                    }
                }
            }
        });
    }

    checkEnemyCollisions(delta) {
        const crowdRadius = 0.36 * Math.sqrt(this.crowdCount);

        this.levelManager.enemySquads.forEach(squad => {
            if (!squad.isActive || squad.count <= 0) return;

            const distZ = Math.abs(this.playerZ - squad.z);
            if (distZ < 2.0 + crowdRadius) {
                // 激突相殺！ 1フレームあたり数体が相殺
                const clashRate = 2;
                for (let k = 0; k < clashRate; k++) {
                    if (squad.count <= 0 || this.crowd.length <= 0) break;

                    // 敵1体消滅
                    squad.killOne();

                    // 味方1体消滅
                    const playerSm = this.crowd.pop();
                    playerSm.launch((Math.random() - 0.5) * 3, 1.5, -2);
                    this.crowdCount = this.crowd.length;
                    this.updatePlayerBadge();

                    // エフェクト & サウンド
                    this.createParticle(playerSm.mesh.position.x, 1.0, playerSm.mesh.position.z, 0xff4757, 0.25);
                    window.sounds.playClash();
                }

                if (this.crowdCount <= 0) {
                    this.triggerGameOver();
                }
            }
        });
    }

    startBossFight() {
        this.state = 'BOSS_FIGHT';
        this.targetPlayerX = 0;
        this.bossAttackTimer = 0;
    }

    updateBossFight(delta) {
        const boss = this.levelManager.boss;
        const bossZ = this.levelManager.finishLineZ + 14;

        // 群衆をボスの手前まで前進
        if (this.playerZ < bossZ - 5) {
            this.playerZ += 10 * delta;
            this.playerX += (0 - this.playerX) * delta * 5;
            return;
        }

        // 味方がボスへ次々と突撃！
        this.bossAttackTimer = (this.bossAttackTimer || 0) + delta;
        if (this.bossAttackTimer >= 0.08) {
            this.bossAttackTimer = 0;

            if (this.crowd.length > 0 && this.levelManager.bossHp > 0) {
                // 味方1体がボスに向かってダイブ
                const attacker = this.crowd.pop();
                attacker.launch(0, 2, 4);
                this.crowdCount = this.crowd.length;
                this.updatePlayerBadge();

                // ボスHP減少
                this.levelManager.updateBossHp(this.levelManager.bossHp - 1);
                window.sounds.playClash();
                this.createParticle(0, 2.5, bossZ, 0xffd700, 0.3);

                // ボス撃破！
                if (this.levelManager.bossHp <= 0) {
                    setTimeout(() => {
                        this.startStairsClimb();
                    }, 600);
                }
            } else if (this.crowd.length <= 0 && this.levelManager.bossHp > 0) {
                // 味方全滅で敗北
                this.triggerGameOver();
            }
        }
    }

    startStairsClimb() {
        this.state = 'STAIRS';
        this.currentStairStep = 0;
        this.stairTimer = 0;
    }

    updateStairs(delta) {
        const stairs = this.levelManager.stairs;
        if (stairs.length === 0) return;

        this.stairTimer += delta;
        if (this.stairTimer >= 0.45) {
            this.stairTimer = 0;

            if (this.currentStairStep < stairs.length && this.crowd.length > 0) {
                const step = stairs[this.currentStairStep];
                window.sounds.playStairStep(this.currentStairStep);

                // 一部の棒人間をこの段に配置して歓声
                const stickmenForStep = Math.min(3, this.crowd.length);
                for (let i = 0; i < stickmenForStep; i++) {
                    const sm = this.crowd.pop();
                    sm.isCheering = true;
                    sm.baseY = step.y;
                    sm.mesh.position.set((i - 1) * 1.2, step.y, step.z);
                }
                this.crowdCount = this.crowd.length;
                this.updatePlayerBadge();

                this.currentStairStep++;

                // 頂上到達または味方使い切りで勝利
                if (this.currentStairStep >= stairs.length || this.crowd.length === 0) {
                    const finalMult = (this.currentStairStep > 0) ? stairs[this.currentStairStep - 1].mult : 1.0;
                    this.triggerVictory(finalMult);
                }
            } else {
                const finalMult = (this.currentStairStep > 0) ? stairs[this.currentStairStep - 1].mult : 1.0;
                this.triggerVictory(finalMult);
            }
        }
    }

    updateCrowd(delta) {
        // 群衆の基準位置とバッジ
        this.playerBadgeMesh.position.set(this.playerX, 3.2, this.playerZ);

        // 各棒人間の目標位置計算と更新
        for (let i = 0; i < this.crowd.length; i++) {
            const sm = this.crowd[i];
            if (!sm.isDead) {
                if (!sm.isCheering && !sm.isFlying) {
                    const offset = CrowdFormation.getOffset(i, 0.38);
                    sm.targetPos.set(
                        this.playerX + offset.x,
                        0,
                        this.playerZ + offset.z
                    );
                }
                sm.update(delta, (this.state === 'RUNNING' || this.state === 'BOSS_FIGHT'), 16);
            }
        }
    }

    updateCamera(delta) {
        // 群衆の後ろ上方からスムーズ追従
        const targetCamZ = this.playerZ + this.cameraOffset.z;
        const targetCamX = this.playerX * 0.5;
        const targetCamY = this.cameraOffset.y + Math.min(6, this.crowdCount * 0.03);

        this.camera.position.x += (targetCamX - this.camera.position.x) * delta * 5;
        this.camera.position.y += (targetCamY - this.camera.position.y) * delta * 5;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * delta * 8;

        this.camera.lookAt(this.playerX * 0.3, 1.2, this.playerZ + 6);

        // ライト追従
        this.dirLight.position.set(this.playerX + 20, 40, this.playerZ - 20);
        this.dirLight.target.position.set(this.playerX, 0, this.playerZ);
    }

    updateProgress(progress) {
        const pct = Math.min(100, Math.round(progress * 100));
        const fill = document.getElementById('progress-fill');
        if (fill) fill.style.width = `${pct}%`;
    }

    triggerVictory(multiplier) {
        this.state = 'VICTORY';
        window.sounds.playVictory();

        // 紙吹雪エフェクト
        for (let i = 0; i < 60; i++) {
            const colors = [0xffd700, 0xff4757, 0x2ed573, 0x1e90ff, 0xffa502];
            this.createParticle(
                (Math.random() - 0.5) * 8,
                4 + Math.random() * 4,
                this.playerZ + 15 + Math.random() * 10,
                colors[Math.floor(Math.random() * colors.length)],
                0.35
            );
        }

        const baseScore = 500 + this.level * 200;
        const totalEarned = Math.round(baseScore * multiplier);
        this.score += totalEarned;

        document.getElementById('victory-score').innerText = `SCORE: +${totalEarned} (x${multiplier})`;
        document.getElementById('total-score').innerText = `TOTAL: ${this.score}`;
        document.getElementById('victory-screen').style.display = 'flex';
    }

    triggerGameOver() {
        this.state = 'GAMEOVER';
        window.sounds.playGameOver();
        this.playerBadgeMesh.visible = false;
        document.getElementById('gameover-screen').style.display = 'flex';
    }

    nextLevel() {
        this.loadLevel(this.level + 1);
    }

    retryLevel() {
        this.loadLevel(this.level);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}

// ゲーム起動
window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();

    // UIボタンイベントバインド
    document.getElementById('btn-next-level').addEventListener('click', () => {
        window.game.nextLevel();
    });

    document.getElementById('btn-retry').addEventListener('click', () => {
        window.game.retryLevel();
    });

    document.getElementById('btn-sound').addEventListener('click', (e) => {
        const isMuted = window.sounds.toggleMute();
        e.target.innerText = isMuted ? '🔇' : '🔊';
    });

    // スキン切り替えボタン
    const skinButtons = document.querySelectorAll('.skin-btn');
    skinButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            skinButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const color = parseInt(e.currentTarget.dataset.color, 16);
            window.game.changePlayerColor(color);
        });
    });
});
