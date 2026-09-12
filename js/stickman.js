// roundRect ポリフィル（古いブラウザ対応）
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
        return this;
    };
}

// 3D 棒人間モデルおよびアニメーション管理
class Stickman {
    constructor(scene, color = 0x00a8ff, isPlayer = true, isBoss = false) {
        this.scene = scene;
        this.color = color;
        this.isPlayer = isPlayer;
        this.isBoss = isBoss;
        this.scale = isBoss ? 2.5 : 1.0;

        this.mesh = new THREE.Group();
        this.buildModel();
        this.scene.add(this.mesh);

        // 物理・アニメーション変数
        this.runCycle = Math.random() * Math.PI * 2;
        this.targetPos = new THREE.Vector3();
        this.currentPos = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.isDead = false;
        this.isFlying = false; // 吹っ飛び中
        this.flyVelocity = new THREE.Vector3();

        // 慶祝アニメーション用
        this.isCheering = false;
        this.stairIndex = -1;
    }

    buildModel() {
        const mat = new THREE.MeshLambertMaterial({
            color: this.color,
            roughness: 0.4
        });

        // 頭部
        const headGeo = new THREE.SphereGeometry(0.28 * this.scale, 12, 12);
        this.head = new THREE.Mesh(headGeo, mat);
        this.head.position.y = 1.35 * this.scale;
        this.head.castShadow = true;
        this.mesh.add(this.head);

        // ボスなら王冠を載せる
        if (this.isBoss) {
            const crownGeo = new THREE.ConeGeometry(0.25 * this.scale, 0.3 * this.scale, 5);
            const crownMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
            this.crown = new THREE.Mesh(crownGeo, crownMat);
            this.crown.position.y = 0.35 * this.scale;
            this.crown.rotation.x = Math.PI;
            this.head.add(this.crown);
        }

        // 胴体
        const torsoGeo = new THREE.CylinderGeometry(0.12 * this.scale, 0.12 * this.scale, 0.6 * this.scale, 8);
        this.torso = new THREE.Mesh(torsoGeo, mat);
        this.torso.position.y = 0.85 * this.scale;
        this.torso.castShadow = true;
        this.mesh.add(this.torso);

        // 腕（左・右）
        const armGeo = new THREE.CylinderGeometry(0.06 * this.scale, 0.06 * this.scale, 0.5 * this.scale, 6);
        armGeo.translate(0, -0.25 * this.scale, 0); // 回転ピボットを肩に合わせる

        this.leftArm = new THREE.Mesh(armGeo, mat);
        this.leftArm.position.set(-0.2 * this.scale, 1.1 * this.scale, 0);
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, mat);
        this.rightArm.position.set(0.2 * this.scale, 1.1 * this.scale, 0);
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        // 脚（左・右）
        const legGeo = new THREE.CylinderGeometry(0.07 * this.scale, 0.07 * this.scale, 0.55 * this.scale, 6);
        legGeo.translate(0, -0.275 * this.scale, 0); // 回転ピボットを腰に合わせる

        this.leftLeg = new THREE.Mesh(legGeo, mat);
        this.leftLeg.position.set(-0.12 * this.scale, 0.55 * this.scale, 0);
        this.leftLeg.castShadow = true;
        this.mesh.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, mat);
        this.rightLeg.position.set(0.12 * this.scale, 0.55 * this.scale, 0);
        this.rightLeg.castShadow = true;
        this.mesh.add(this.rightLeg);
    }

    setColor(colorHex) {
        this.color = colorHex;
        this.mesh.traverse(child => {
            if (child.isMesh && child !== this.crown) {
                child.material.color.setHex(colorHex);
            }
        });
    }

    update(delta, isMoving = true, animSpeed = 16) {
        if (this.isDead) return;

        if (this.isFlying) {
            // 吹っ飛び物理
            this.mesh.position.addScaledVector(this.flyVelocity, delta);
            this.flyVelocity.y -= 30 * delta; // 重力
            this.mesh.rotation.x += 10 * delta;
            this.mesh.rotation.y += 15 * delta;

            if (this.mesh.position.y < -3) {
                this.destroy();
            }
            return;
        }

        if (this.isCheering) {
            // 勝利時のダンス
            this.runCycle += delta * 10;
            this.leftArm.rotation.x = Math.sin(this.runCycle) * 0.8 + 2.5; // バンザイ
            this.rightArm.rotation.x = -Math.sin(this.runCycle) * 0.8 + 2.5;
            this.mesh.position.y = (this.baseY || 0) + Math.abs(Math.sin(this.runCycle * 2)) * 0.3;
            return;
        }

        if (isMoving) {
            this.runCycle += delta * animSpeed;
            const swing = Math.sin(this.runCycle) * 0.85;

            // 脚のスイング
            this.leftLeg.rotation.x = swing;
            this.rightLeg.rotation.x = -swing;

            // 腕のスイング（足と逆位相）
            this.leftArm.rotation.x = -swing * 0.8;
            this.rightArm.rotation.x = swing * 0.8;

            // 上下の弾み（ランニングボブ）
            const bounce = Math.abs(Math.sin(this.runCycle * 2)) * 0.08 * this.scale;
            this.torso.position.y = (0.85 * this.scale) + bounce;
            this.head.position.y = (1.35 * this.scale) + bounce;
            this.leftArm.position.y = (1.1 * this.scale) + bounce;
            this.rightArm.position.y = (1.1 * this.scale) + bounce;
        } else {
            // アイドル状態
            this.leftLeg.rotation.x *= 0.8;
            this.rightLeg.rotation.x *= 0.8;
            this.leftArm.rotation.x *= 0.8;
            this.rightArm.rotation.x *= 0.8;
        }

        // プレイヤーのスォーム補間追従
        if (this.isPlayer) {
            // スムーズにターゲット位置に追従
            this.mesh.position.lerp(this.targetPos, Math.min(1.0, delta * 12));
        }
    }

    launch(dirX, dirY, dirZ) {
        this.isFlying = true;
        this.flyVelocity.set(
            (Math.random() - 0.5) * 8 + dirX * 5,
            Math.random() * 8 + 6,
            (Math.random() - 0.5) * 8 + dirZ * 5
        );
    }

    destroy() {
        this.isDead = true;
        this.scene.remove(this.mesh);
    }
}

// 群衆フォーメーション計算ヘルパー
class CrowdFormation {
    // フェルマーの螺旋による均等な密集円形配置
    static getOffset(index, spacing = 0.36) {
        if (index === 0) return { x: 0, z: 0 };
        const goldenAngle = 2.39996323; // 約137.5度（ラジアン）
        const r = spacing * Math.sqrt(index);
        const theta = index * goldenAngle;
        return {
            x: r * Math.cos(theta),
            z: r * Math.sin(theta)
        };
    }
}

window.Stickman = Stickman;
window.CrowdFormation = CrowdFormation;
