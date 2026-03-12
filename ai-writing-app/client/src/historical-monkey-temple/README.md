# Historical: Monkey Temple (Specialist Monkeys) page

This folder archives the **Monkey Temple** / **Specialist Monkeys** experience that used to live at `/specialist-monkey`. It was removed so that something new could be built in that spot from scratch.

## Contents

- **SpecialistMonkeyPage.tsx** – Page wrapper (header + scene).
- **SpecialistMonkeyScene.tsx** – Three.js scene: ancient Greek kiosk, altar, six glass overlay panels (Architect, Sculptor, Brainstorm, Ethos, Logos, Pathos).
- **specialist-monkey-styles.css** – All styles for this page (imported by the page component).

## Assets (when run)

The scene expects these under `client/public/`:

- **Models:** `/models/ancient_greek_kiosk.glb`, `/models/altar_lowpoly_concept.glb`
- **Images:** overlay monkey images under `/images/` (see `OVERLAY_IMAGE_PATHS` in `SpecialistMonkeyScene.tsx`)

## Restoring

To bring this back into the app:

1. Copy `SpecialistMonkeyPage.tsx` and `SpecialistMonkeyScene.tsx` to your pages and components (or add a route that imports from this folder).
2. In `App.tsx`, add:  
   `import SpecialistMonkeyPage from "./historical-monkey-temple/SpecialistMonkeyPage";`  
   and a route:  
   `<Route path="/specialist-monkey" element={<SpecialistMonkeyPage />} />`
3. The page already imports `specialist-monkey-styles.css`, so no need to add those styles to `index.css`.
4. Re‑wire any navigation (e.g. in `Scene3D.tsx`) to point to `/specialist-monkey` again.
