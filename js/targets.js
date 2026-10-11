import * as THREE from 'three';
import { game } from './state.js';
import { GOAL, targetGroup, particleGroup, createTargetTexture } from './scene.js';
import { targetRadius } from './config.js';

let targetMaterial = null;

export function spawnTargets() {
    targetGroup.clear();
    particleGroup.clear();
    game.activeTargets = [];
    game.particles = [];

    if (!targetMaterial) {
        targetMaterial = new THREE.MeshBasicMaterial({
            map: createTargetTexture(),
            transparent: true,
            side: THREE.DoubleSide
        });
    }

    // Target practice places targets within the goal opening.
    const netX = game.net.position.x;
    const netZ = game.net.position.z;
    const netWidth = GOAL.width;
    const netHeight = GOAL.height;

    const offsets = [
        { x: -netWidth/2 + targetRadius - 30, y: netHeight - targetRadius + 30 }, // Top Left
        { x: netWidth/2 - targetRadius + 30, y: netHeight - targetRadius + 30 },  // Top Right
        { x: -netWidth/2 + targetRadius - 30, y: targetRadius - 30 },            // Bottom Left
        { x: netWidth/2 - targetRadius + 30, y: targetRadius - 30 }              // Bottom Right
    ];

    for (const offset of offsets) {
        const geometry = new THREE.PlaneGeometry(targetRadius * 2, targetRadius * 2);
        const mesh = new THREE.Mesh(geometry, targetMaterial);
        // Position them slightly inside the goal mouth so they are hittable
        mesh.position.set(netX + offset.x, offset.y, netZ + 100);
        targetGroup.add(mesh);
        game.activeTargets.push({
            mesh: mesh,
            x: netX + offset.x,
            y: offset.y,
            z: netZ + 100,
            radius: targetRadius
        });
    }
}

export function shatterTarget(target) {
    targetGroup.remove(target.mesh);
    game.activeTargets = game.activeTargets.filter(t => t !== target);

    if (target.mesh.geometry) target.mesh.geometry.dispose();

    // Spawn particles
    const particleGeo = new THREE.PlaneGeometry(30, 30);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const particleRedMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });

    for (let i = 0; i < 15; i++) {
        const mat = Math.random() > 0.5 ? particleMat : particleRedMat;
        const pMesh = new THREE.Mesh(particleGeo, mat);
        pMesh.position.copy(target.mesh.position);
        particleGroup.add(pMesh);

        const angle = Math.random() * Math.PI * 2;
        const speed = 500 + Math.random() * 1500;

        game.particles.push({
            mesh: pMesh,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            vz: 500 + Math.random() * 1000, // burst out towards camera
            rx: Math.random() * 10,
            ry: Math.random() * 10,
            life: 1.0
        });
    }

    const countElem = document.getElementById('target-count');
    if (countElem) {
        countElem.textContent = game.activeTargets.length;
    }
}
