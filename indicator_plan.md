Plan for pulsating kickpoint indicator:
1. Create a `kickpointIndicatorMesh` in `js/main.js` which is a torus or cylinder positioned around the shaft.
2. In `installStickModel`, add this mesh to `stickParams.stickGroup`. Position it correctly along the shaft (Y axis).
   - Low kick: Y = 200 (approx)
   - Mid kick: Y = 500 (approx)
   - Hybrid kick: Y = 350 (approx)
3. In `applyStickColor`, if tutorial phase < 4, make it visible and set its color.
4. In `animate()` (or similar game loop), make the material emissive intensity pulsate using `Math.sin(performance.now() / 200)`.
5. Remove it or make it invisible if phase >= 4 or not tutorial.
6. The pulse effect should happen when switching kickpoints for 1.5s? Wait, the user said: "Kickpoint area on the shaft should pulsate/flash for 1.5s when starting/switching." So maybe the mesh isn't permanent, just shows for 1.5s.
