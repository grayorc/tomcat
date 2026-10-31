# F-14 TOMCAT — tomcat.sbs

An interactive 3D field study of the Grumman F-14 Tomcat. Built as a pure static site:
no backend, no build step, no runtime CDN, no trackers.

## Run locally

```bash
cd tomcat-sbs
python -m http.server 8080
# open http://localhost:8080
```

Any static file server works. Opening `index.html` directly with `file://` will not work
because ES modules and the GLB fetch require HTTP.

## Deploy

The folder is the site. Upload `tomcat-sbs/` to Netlify, Vercel, Cloudflare Pages,
GitHub Pages, S3, or any static host.

- `CNAME` is set to `tomcat.sbs` for GitHub Pages / Netlify custom domains.
- No redirects, functions, or environment variables are required.

## What's inside

```
index.html                  all content and the SVG plan-view diagram
                            (silhouette traced from the GLB geometry)
assets/css/styles.css       art direction, layout, motion
assets/js/app.js            scroll choreography, HUD, wing console, reveals
assets/js/scene.js          Three.js stage, camera path, wing extraction
assets/models/f14.glb       3.4 MB airframe (textures resized to 1k JPEG)
assets/vendor/              Three.js r160 + GLTFLoader + postprocessing (self-hosted)
assets/fonts/               Barlow Condensed, JetBrains Mono, Inter (latin subsets)
```

### The wing sweep

The source model has the wings baked into a single airframe mesh. At load time
`splitWings()` classifies triangles against the outer panel's planform polygon,
rebuilds the mesh into three draw groups (fixed airframe, left panel, right panel),
and re-parents each panel onto a pivot at the wing box. The SVG blueprint is
generated from the same geometry: triangles are rasterised in plan view, contours
are extracted and simplified, so the drawing matches the aircraft exactly. Scroll progress drives the
pivot rotation from 20° to 68°; the geometry console can override it and then hands
control back to scroll.

Glove-mounted stores are excluded from the moving panels so they always point forward.
Two replacement Sidewinders are mounted on the fixed glove stations.

## Controls

- Scroll — flies the camera and sweeps the wings
- Wing console — drag the sweep handle, or use the 20° / 44° / 68° presets
- `?debug=1` — expose `window.__tomcat` for inspection
- `?wings=1&sweep=68` — top-down wing diagnostic
- `?noboot=1` — skip the loading sequence

## Credits

- Aircraft model: **bohmerang** — “F-14 Tomcat - Fighter Jet - Free”
  <https://sketchfab.com/3d-models/f-14-tomcat-fighter-jet-free-497f77c311b5411d9b567d8707a81c33>
  Licensed **CC BY-NC-SA 4.0**. Modified: textures resized/re-encoded, wings split
  and animated, landing gear retracted.
- Three.js r160 — MIT.
- Typefaces: Barlow Condensed, JetBrains Mono, Inter — SIL Open Font License.

This is an independent fan project. It is not affiliated with Northrop Grumman,
the U.S. Navy, or any squadron. The model licence is non-commercial; keep that in
mind if you reuse this project.
