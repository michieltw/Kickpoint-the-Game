sed -i 's/stickParams.indicatorMesh.position.set(-100, 250, 23);/stickParams.indicatorMesh.position.set(-110, 350, 23);/' js/main.js
sed -i 's/stickParams.indicatorMesh.position.set(-100, 650, 23);/stickParams.indicatorMesh.position.set(-110, 750, 23);/' js/main.js
sed -i 's/stickParams.indicatorMesh.position.set(-100, 450, 23);/stickParams.indicatorMesh.position.set(-110, 550, 23);/' js/main.js

sed -i 's/stickParams.indicatorMesh.material.opacity = pulse \* 0.9 + 0.1;/stickParams.indicatorMesh.material.opacity = 1.0;/' js/main.js
