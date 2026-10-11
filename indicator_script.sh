sed -i 's/const indicatorGeo = new THREE.CylinderGeometry(15, 15, 100, 16);/const indicatorGeo = new THREE.CylinderGeometry(20, 20, 150, 16);/' js/main.js
sed -i 's/stickParams.indicatorMesh.position.set(0, 300, 0);/stickParams.indicatorMesh.position.set(-150, 300, 23);/' js/main.js
sed -i 's/stickParams.indicatorMesh.position.set(0, 600, 0);/stickParams.indicatorMesh.position.set(-150, 600, 23);/' js/main.js
sed -i 's/stickParams.indicatorMesh.position.set(0, 450, 0);/stickParams.indicatorMesh.position.set(-150, 450, 23);/' js/main.js
sed -i 's/stickParams.indicatorMesh.material.opacity = pulse \* 0.8;/stickParams.indicatorMesh.material.opacity = pulse \* 0.9 + 0.1;/' js/main.js
