// ステージ・障害物・ゲート・敵の管理クラス
class LevelManager {
    constructor(scene) {
        this.scene = scene;
        this.trackGroup = new THREE.Group();
        this.scene.add(this.trackGroup);

        this.gates = [];
        this.obstacles = [];
        this.enemySquads = [];
        this.stairs = [];
        this.finishLineZ = 0;
        this.boss = null;
        this.bossHp = 0;
        this.maxBossHp = 0;

        this.trackWidth = 8.8;
    }

    clear() {
        while (this.trackGroup.children.length > 0) {
            const obj = this.trackGroup.children[0];
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
            this.trackGroup.remove(obj);
        }

        this.gates = [];
        this.obstacles = [];
        this.enemySquads.forEach(squad => squad.destroy());
        this.enemySquads = [];
        this.stairs = [];
        if (this.boss) {
            this.boss.destroy();
            this.boss = null;
        }
    }

    generateLevel(levelNumber) {
        this.clear();

        const trackLength = 160 + levelNumber * 20;
        this.finishLineZ = trackLength; // 正の値として保持（奥へ -trackLength まで進む）

        // 1. トラック（床）の生成
        this.buildTrack(trackLength);

        // 2. ゲートの生成
        this.buildGates(levelNumber, trackLength);

        // 3. 障害物の生成
        this.buildObstacles(levelNumber, trackLength);

        // 4. 敵集団の生成
        this.buildEnemySquads(levelNumber, trackLength);

        // 5. ゴール＆マルチプライヤー階段の生成
        this.buildFinishArea(levelNumber, trackLength);
    }

    buildTrack(trackLength) {
        // 床メイン（奥 -Z 方向に伸ばす）
        const totalZ = trackLength + 60;
        const trackGeo = new THREE.PlaneGeometry(this.trackWidth, totalZ);
        const trackMat = new THREE.MeshLambertMaterial({
            color: 0xf1f5f9
        });
        const track = new THREE.Mesh(trackGeo, trackMat);
        track.rotation.x = -Math.PI / 2;
        track.position.set(0, 0, -totalZ / 2 + 10);
        track.receiveShadow = true;
        this.trackGroup.add(track);

        // ガードレール（左: -X, 右: +X）
        const railGeo = new THREE.BoxGeometry(0.3, 0.5, totalZ);
        const railMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });

        const railL = new THREE.Mesh(railGeo, railMat);
        railL.position.set(-this.trackWidth / 2 - 0.15, 0.25, track.position.z);
        railL.castShadow = true;
        this.trackGroup.add(railL);

        const railR = new THREE.Mesh(railGeo, railMat);
        railR.position.set(this.trackWidth / 2 + 0.15, 0.25, track.position.z);
        railR.castShadow = true;
        this.trackGroup.add(railR);

        // トラック上の装飾ライン（中央のストライプ点線）
        const lineCount = Math.floor(trackLength / 6);
        const stripeGeo = new THREE.PlaneGeometry(0.25, 2.5);
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xcfd8dc });
        for (let i = 0; i < lineCount; i++) {
            const stripe = new THREE.Mesh(stripeGeo, stripeMat);
            stripe.rotation.x = -Math.PI / 2;
            stripe.position.set(0, 0.02, -(i * 6 + 5));
            this.trackGroup.add(stripe);
        }
    }

    createGateCanvasTexture(text, isPositive) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // 背景
        ctx.fillStyle = isPositive ? 'rgba(0, 168, 255, 0.88)' : 'rgba(255, 71, 87, 0.88)';
        if (ctx.roundRect) ctx.roundRect(10, 10, 236, 236, 24);
        else ctx.rect(10, 10, 236, 236);
        ctx.fill();

        // 境界線
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 10;
        ctx.stroke();

        // テキスト
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 76px "Fredoka", "Arial Rounded MT Bold", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 128);

        const texture = new THREE.CanvasTexture(canvas);
        // 鏡文字・裏返しを100%確実に解消するための左右反転設定
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = -1;
        texture.offset.x = 1;
        return texture;
    }

    buildGates(levelNumber, trackLength) {
        // Z座標ごとに左右ペアでゲートを配置（奥 -Z 方向）
        const gateZPositions = [-25, -55, -85, -115];
        if (trackLength > 160) gateZPositions.push(-145);

        gateZPositions.forEach((z, idx) => {
            let leftType, leftVal, rightType, rightVal;

            if (idx === 0) {
                // 第1ゲートは爽快に増える選択肢
                leftType = 'ADD'; leftVal = 15 + levelNumber * 5;
                rightType = 'MUL'; rightVal = 3;
            } else if (idx === 1) {
                leftType = 'ADD'; leftVal = 20;
                rightType = 'MUL'; rightVal = 2;
            } else if (idx === 2) {
                leftType = 'SUB'; leftVal = 5;
                rightType = 'MUL'; rightVal = 2;
            } else {
                leftType = 'ADD'; leftVal = 25;
                rightType = 'DIV'; rightVal = 2;
            }

            if (Math.random() > 0.5) {
                [leftType, rightType] = [rightType, leftType];
                [leftVal, rightVal] = [rightVal, leftVal];
            }

            const gatePair = {
                id: idx,
                z: z,
                passed: false,
                gates: [
                    this.createSingleGate(-2.2, z, leftType, leftVal), // 画面左
                    this.createSingleGate(2.2, z, rightType, rightVal)  // 画面右
                ]
            };
            this.gates.push(gatePair);
        });
    }

    createSingleGate(x, z, type, value) {
        const isPositive = (type === 'ADD' || type === 'MUL');
        const text = (type === 'ADD' ? `+${value}` :
                      type === 'SUB' ? `-${value}` :
                      type === 'MUL' ? `x${value}` : `÷${value}`);

        const gateWidth = 3.8;
        const gateHeight = 3.0;

        const group = new THREE.Group();
        group.position.set(x, gateHeight / 2, z);

        const panelGeo = new THREE.PlaneGeometry(gateWidth, gateHeight);
        const texture = this.createGateCanvasTexture(text, isPositive);
        const panelMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide
        });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        group.add(panel);

        // ゲートフレーム（柱）
        const frameGeo = new THREE.CylinderGeometry(0.1, 0.1, gateHeight, 8);
        const frameMat = new THREE.MeshLambertMaterial({ color: isPositive ? 0x0077b6 : 0xba181b });

        const postL = new THREE.Mesh(frameGeo, frameMat);
        postL.position.set(-gateWidth / 2, 0, 0);
        group.add(postL);

        const postR = new THREE.Mesh(frameGeo, frameMat);
        postR.position.set(gateWidth / 2, 0, 0);
        group.add(postR);

        this.trackGroup.add(group);

        return {
            x: x,
            z: z,
            width: gateWidth,
            type: type,
            value: value,
            group: group,
            isPositive: isPositive
        };
    }

    buildObstacles(levelNumber, trackLength) {
        // ゲート直後を避け、避ける猶予を持たせた配置
        const obstacleConfigs = [
            { type: 'spinner', z: -42, x: 0 },
            { type: 'moving', z: -72, x: -1.5 },
            { type: 'spinner', z: -102, x: 0 },
            { type: 'moving', z: -132, x: 1.5 }
        ];

        obstacleConfigs.forEach(cfg => {
            if (Math.abs(cfg.z) >= trackLength - 20) return;

            if (cfg.type === 'spinner') {
                const spinnerGroup = new THREE.Group();
                spinnerGroup.position.set(cfg.x, 0.5, cfg.z);

                const baseGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.0, 8);
                const baseMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
                const base = new THREE.Mesh(baseGeo, baseMat);
                spinnerGroup.add(base);

                // バーの長さを2.6にして左右に安全な回避通路を確保
                const barLength = 2.6;
                const barGeo = new THREE.BoxGeometry(barLength, 0.3, 0.3);
                const barMat = new THREE.MeshLambertMaterial({ color: 0xff3838 });
                const bar = new THREE.Mesh(barGeo, barMat);
                bar.position.y = 0.2;
                bar.castShadow = true;
                spinnerGroup.add(bar);

                for (let i = -0.9; i <= 0.9; i += 0.6) {
                    if (Math.abs(i) < 0.2) continue;
                    const spikeGeo = new THREE.ConeGeometry(0.18, 0.4, 6);
                    const spikeMat = new THREE.MeshLambertMaterial({ color: 0xffdd59 });
                    const spike = new THREE.Mesh(spikeGeo, spikeMat);
                    spike.position.set(i, 0.4, 0);
                    spinnerGroup.add(spike);
                }

                this.trackGroup.add(spinnerGroup);
                this.obstacles.push({
                    type: 'spinner',
                    group: spinnerGroup,
                    bar: bar,
                    x: cfg.x,
                    z: cfg.z,
                    length: barLength,
                    rotSpeed: 2.5
                });
            } else if (cfg.type === 'moving') {
                const blockGeo = new THREE.BoxGeometry(2.0, 1.2, 0.8);
                const blockMat = new THREE.MeshLambertMaterial({ color: 0xe02424 });
                const block = new THREE.Mesh(blockGeo, blockMat);
                block.position.set(cfg.x, 0.6, cfg.z);
                block.castShadow = true;
                this.trackGroup.add(block);

                this.obstacles.push({
                    type: 'moving',
                    group: block,
                    z: cfg.z,
                    baseX: cfg.x,
                    width: 2.0,
                    height: 1.2,
                    speed: 2.0,
                    time: Math.random() * Math.PI
                });
            }
        });
    }

    buildEnemySquads(levelNumber, trackLength) {
        const squadZPositions = [-50, -95];
        if (trackLength > 160) squadZPositions.push(-135);

        squadZPositions.forEach((z, idx) => {
            // 第1部隊は4〜5人、第2部隊は8〜10人（ゲートで増やした軍団で爽快に突破可能！）
            const count = idx === 0 ? (4 + levelNumber) : (8 + levelNumber * 2);
            const squad = new EnemySquad(this.scene, 0, z, count);
            this.enemySquads.push(squad);
        });
    }

    buildFinishArea(levelNumber, trackLength) {
        const finishZ = -trackLength;

        // ゴールアーチ
        const archGeo = new THREE.BoxGeometry(this.trackWidth + 0.5, 0.6, 0.6);
        const archMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
        const arch = new THREE.Mesh(archGeo, archMat);
        arch.position.set(0, 4.0, finishZ);
        this.trackGroup.add(arch);

        // 柱
        const pillarGeo = new THREE.BoxGeometry(0.5, 4.0, 0.5);
        const pillarL = new THREE.Mesh(pillarGeo, archMat);
        pillarL.position.set(-this.trackWidth / 2 - 0.2, 2.0, finishZ);
        this.trackGroup.add(pillarL);

        const pillarR = new THREE.Mesh(pillarGeo, archMat);
        pillarR.position.set(this.trackWidth / 2 + 0.2, 2.0, finishZ);
        this.trackGroup.add(pillarR);

        // ゴールバナー
        const bannerCanvas = document.createElement('canvas');
        bannerCanvas.width = 512;
        bannerCanvas.height = 128;
        const bCtx = bannerCanvas.getContext('2d');
        bCtx.fillStyle = '#ff3838';
        bCtx.fillRect(0, 0, 512, 128);
        bCtx.fillStyle = '#ffffff';
        bCtx.font = 'bold 64px "Fredoka", Arial';
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        bCtx.fillText('★ FINISH ★', 256, 64);

        const bannerTex = new THREE.CanvasTexture(bannerCanvas);
        const bannerGeo = new THREE.PlaneGeometry(this.trackWidth, 1.4);
        const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(0, 3.2, finishZ);
        this.trackGroup.add(banner);

        // ボス敵（砦を守る大ボス）
        this.bossHp = 20 + levelNumber * 10;
        this.maxBossHp = this.bossHp;
        this.boss = new Stickman(this.scene, 0xd90429, false, true);
        this.boss.mesh.position.set(0, 0, finishZ - 14);
        this.boss.mesh.rotation.y = Math.PI; // 手前（+Z）を向く

        // ボスHPバー
        this.createBossHpBar(finishZ - 14);

        // マルチプライヤー階段（奥へ進む）
        const steps = [
            { mult: 1.2, color: 0x48dbfb },
            { mult: 1.5, color: 0x1dd1a1 },
            { mult: 2.0, color: 0xfeca57 },
            { mult: 3.0, color: 0xff6b6b },
            { mult: 5.0, color: 0xff9ff3 },
            { mult: 10.0, color: 0xffd700 }
        ];

        let startStairZ = finishZ - 20;
        steps.forEach((step, idx) => {
            const stairY = idx * 0.8 + 0.4;
            const stairZ = startStairZ - idx * 4.0;

            const stepGeo = new THREE.BoxGeometry(6.0, 0.8 * (idx + 1), 3.8);
            const stepMat = new THREE.MeshLambertMaterial({ color: step.color });
            const stepMesh = new THREE.Mesh(stepGeo, stepMat);
            stepMesh.position.set(0, (idx + 1) * 0.4, stairZ);
            stepMesh.receiveShadow = true;
            this.trackGroup.add(stepMesh);

            // 倍率テキスト（上面に正方向で配置）
            const sCanvas = document.createElement('canvas');
            sCanvas.width = 256;
            sCanvas.height = 128;
            const sCtx = sCanvas.getContext('2d');
            sCtx.fillStyle = '#ffffff';
            sCtx.font = 'bold 58px "Fredoka", Arial';
            sCtx.textAlign = 'center';
            sCtx.textBaseline = 'middle';
            sCtx.fillText(`x${step.mult}`, 128, 64);

            const sTex = new THREE.CanvasTexture(sCanvas);
            const sTextGeo = new THREE.PlaneGeometry(3.0, 1.5);
            const sTextMat = new THREE.MeshBasicMaterial({ map: sTex, transparent: true });
            const sText = new THREE.Mesh(sTextGeo, sTextMat);
            sText.position.set(0, stairY + 0.41, stairZ);
            sText.rotation.x = -Math.PI / 2;
            this.trackGroup.add(sText);

            this.stairs.push({
                index: idx,
                mult: step.mult,
                y: stairY + 0.8,
                z: stairZ,
                color: step.color
            });
        });

        // 頂上のトロフィー
        this.buildTrophy(startStairZ - steps.length * 4.0 - 1.0, steps.length * 0.8 + 1.0);
    }

    createBossHpBar(zPos) {
        const hpCanvas = document.createElement('canvas');
        hpCanvas.width = 256;
        hpCanvas.height = 64;
        this.bossHpCanvas = hpCanvas;
        this.bossHpCtx = hpCanvas.getContext('2d');
        this.bossHpTex = new THREE.CanvasTexture(hpCanvas);

        const hpGeo = new THREE.PlaneGeometry(3.2, 0.8);
        const hpMat = new THREE.MeshBasicMaterial({ map: this.bossHpTex, transparent: true });
        this.bossHpMesh = new THREE.Mesh(hpGeo, hpMat);
        this.bossHpMesh.position.set(0, 4.8, zPos);
        this.trackGroup.add(this.bossHpMesh);

        this.updateBossHp(this.bossHp);
    }

    updateBossHp(currentHp) {
        if (!this.bossHpCtx) return;
        this.bossHp = Math.max(0, currentHp);
        const pct = this.bossHp / this.maxBossHp;

        this.bossHpCtx.clearRect(0, 0, 256, 64);
        this.bossHpCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        if (this.bossHpCtx.roundRect) this.bossHpCtx.roundRect(8, 8, 240, 48, 12);
        else this.bossHpCtx.rect(8, 8, 240, 48);
        this.bossHpCtx.fill();

        if (pct > 0) {
            this.bossHpCtx.fillStyle = '#ef233c';
            if (this.bossHpCtx.roundRect) this.bossHpCtx.roundRect(12, 12, 232 * pct, 40, 8);
            else this.bossHpCtx.rect(12, 12, 232 * pct, 40);
            this.bossHpCtx.fill();
        }

        this.bossHpCtx.fillStyle = '#ffffff';
        this.bossHpCtx.font = 'bold 24px "Fredoka", Arial';
        this.bossHpCtx.textAlign = 'center';
        this.bossHpCtx.textBaseline = 'middle';
        this.bossHpCtx.fillText(`BOSS: ${this.bossHp}`, 128, 32);

        this.bossHpTex.needsUpdate = true;

        if (this.bossHp <= 0 && this.boss && !this.boss.isDead) {
            this.boss.launch(0, 2, -2);
            if (this.bossHpMesh) this.bossHpMesh.visible = false;
        }
    }

    buildTrophy(z, y) {
        const trophyGroup = new THREE.Group();
        trophyGroup.position.set(0, y, z);

        const goldMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });

        const baseGeo = new THREE.CylinderGeometry(1.0, 1.2, 0.5, 12);
        const base = new THREE.Mesh(baseGeo, goldMat);
        trophyGroup.add(base);

        const cupGeo = new THREE.CylinderGeometry(1.2, 0.4, 1.5, 12);
        const cup = new THREE.Mesh(cupGeo, goldMat);
        cup.position.y = 1.0;
        trophyGroup.add(cup);

        this.trackGroup.add(trophyGroup);
        this.trophy = trophyGroup;
    }

    update(delta, playerZ) {
        this.obstacles.forEach(obs => {
            if (obs.type === 'spinner') {
                obs.group.rotation.y += delta * obs.rotSpeed;
            } else if (obs.type === 'moving') {
                obs.time += delta * obs.speed;
                obs.group.position.x = obs.baseX + Math.sin(obs.time) * (this.trackWidth / 2 - 1.5);
            }
        });

        this.enemySquads.forEach(squad => {
            squad.update(delta, playerZ);
        });

        if (this.boss && !this.boss.isDead) {
            this.boss.update(delta, true, 8);
        }

        if (this.trophy) {
            this.trophy.rotation.y += delta * 1.5;
        }
    }
}

// 敵部隊（赤の棒人間集団）
class EnemySquad {
    constructor(scene, x, z, count) {
        this.scene = scene;
        this.x = x;
        this.z = z;
        this.initialCount = count;
        this.count = count;
        this.members = [];
        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.isActive = true;
        this.isCharging = false;

        this.initMembers();
        this.createCountBadge();
    }

    initMembers() {
        for (let i = 0; i < this.count; i++) {
            const sm = new Stickman(this.scene, 0xef233c, false);
            const offset = CrowdFormation.getOffset(i, 0.35);
            sm.mesh.position.set(this.x + offset.x, 0, this.z + offset.z);
            sm.mesh.rotation.y = Math.PI; // 手前（+Z）を向く
            this.members.push(sm);
        }
    }

    createCountBadge() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        this.badgeCtx = canvas.getContext('2d');
        this.badgeTex = new THREE.CanvasTexture(canvas);

        const geo = new THREE.PlaneGeometry(1.4, 1.4);
        const mat = new THREE.MeshBasicMaterial({ map: this.badgeTex, transparent: true });
        this.badgeMesh = new THREE.Mesh(geo, mat);
        this.badgeMesh.position.set(this.x, 3.2, this.z);
        this.scene.add(this.badgeMesh);

        this.updateBadge();
    }

    updateBadge() {
        if (!this.badgeCtx) return;
        this.badgeCtx.clearRect(0, 0, 128, 128);

        if (this.count <= 0) {
            this.badgeTex.needsUpdate = true;
            if (this.badgeMesh) this.badgeMesh.visible = false;
            return;
        }

        this.badgeCtx.fillStyle = '#ef233c';
        this.badgeCtx.beginPath();
        this.badgeCtx.arc(64, 64, 56, 0, Math.PI * 2);
        this.badgeCtx.fill();

        this.badgeCtx.strokeStyle = '#ffffff';
        this.badgeCtx.lineWidth = 6;
        this.badgeCtx.stroke();

        this.badgeCtx.fillStyle = '#ffffff';
        this.badgeCtx.font = 'bold 50px "Fredoka", Arial';
        this.badgeCtx.textAlign = 'center';
        this.badgeCtx.textBaseline = 'middle';
        this.badgeCtx.fillText(this.count, 64, 64);

        this.badgeTex.needsUpdate = true;
    }

    update(delta, playerZ) {
        if (!this.isActive) return;

        // プレイヤーが接近（playerZ は負の数なので、手前から奥へ迫る：playerZ - this.z < 25 && playerZ > this.z）
        const dist = playerZ - this.z;
        if (dist < 25 && dist > 0) {
            this.isCharging = true;
        }

        if (this.isCharging && this.count > 0) {
            const chargeSpeed = 4.0;
            this.z += delta * chargeSpeed; // 手前（+Z）に向かって突撃！
            if (this.badgeMesh) this.badgeMesh.position.z = this.z;
        }

        for (let i = 0; i < this.members.length; i++) {
            const sm = this.members[i];
            if (!sm.isDead) {
                if (this.isCharging) {
                    const offset = CrowdFormation.getOffset(i, 0.35);
                    sm.mesh.position.z = this.z + offset.z;
                }
                sm.update(delta, this.isCharging, 14);
            }
        }
    }

    killOne() {
        const alive = this.members.filter(m => !m.isDead && !m.isFlying);
        if (alive.length > 0) {
            const victim = alive[alive.length - 1];
            victim.launch((Math.random() - 0.5) * 2, 1, -1);
            this.count--;
            this.updateBadge();
            if (this.count <= 0) {
                this.isActive = false;
            }
            return true;
        }
        return false;
    }

    destroy() {
        this.members.forEach(m => m.destroy());
        this.members = [];
        if (this.badgeMesh) {
            this.scene.remove(this.badgeMesh);
        }
    }
}

window.LevelManager = LevelManager;
window.EnemySquad = EnemySquad;
