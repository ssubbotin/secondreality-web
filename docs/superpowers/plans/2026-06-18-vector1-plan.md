# Vector Part I — "Space battle" (vector1) — build plan

Build order (each step TDD'd against the original U2A data before the next):

1. **Vendor assets.** Copy the compiled U2A scene files into `__fixtures__/` (tests) and
   `apps/lab/public/models/vector1/` (runtime fetch): the three ship objects (`U2A.001/002/003`), the
   material/scene file (`U2A.00M`), and the baked animation stream (`U2A.0AB`).
2. **Fixed-point math** (`fixed.ts`): port ACALC's `calc_applyrmatrix` / `calc_rotate` / `calc_singlez` /
   `calc_project` with exact 16.14 fixed point (BigInt for the 64-bit intermediates, `cdiv` truncation for
   the perspective divide). Oracle the apply/rotate/project against the camera matrix.
3. **Object parser** (`model.ts`): the VISU.C `vis_loadobject` chunk format (16-bit ints!). Oracle the
   vertex/normal/face counts + sample coords/colours of all three ships against the binaries.
4. **Animation decoder** (`anim.ts`): the U2A.C byte stream grammar -> per-frame slot snapshots. Oracle the
   frame count (521), the camera staticness, the ship on/off timeline and final poses.
5. **Materials + light** (`assets.ts`, `light.ts`): parse the `.00M` palette + object index list; port
   ADRAW `calclight`/`normallight` flat shading + the draw_polylist flag merge. Oracle palette entries, the
   object index map, and shade offsets against the original normals.
6. **Scene pipeline** (`scene.ts`): the per-frame VISU draw loop — camera apply, object Z-sort, vertex/
   normal rotate, project, back-face cull, flat shade -> a painter-ordered screen-polygon list.
7. **CPU raster** (`raster.ts`): flat-polygon scanline fill into the 320x200 index buffer, viewport-clipped.
8. **GPU surface + modern scene** (`nodes.ts`): the `RasterSurface` blit (authentic) and the three.js
   `VectorScene` (modern: per-mesh flat-shaded geometry in engine view space, perspective camera from the
   mode-X projection, model matrices from the per-frame world matrices with the engine->three flip).
9. **Effect** (`vector1.ts`): load/init/update/render/resize/dispose, the 70 Hz accumulator, the frame-521
   loop, and `setMode('authentic'|'modern')`.

Out of scope (deferred): the U2A background picture + copper palette animation (picture pipeline); the
`pl[1..8]` precomputed direction sort lists; obj3 "moottori" (parsed/shipped but never enabled by the
track, as in the original).
