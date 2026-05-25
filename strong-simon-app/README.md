# React + TypeScript + Vite

## Strong Simon - Google Auth + Google Drive Sync

L'application supporte une connexion Google depuis l'ecran Settings pour:
- recuperer le prenom/nom de l'utilisateur
- synchroniser templates et seances vers Google Drive (`appDataFolder`)
- importer templates et seances depuis Google Drive

### Configuration requise

1. Creer un projet Google Cloud et activer l'API Google Drive.
2. Creer un OAuth Client ID de type Web.
3. Ajouter les origines autorisees (ex: `http://localhost:5173`).
4. Creer un fichier `.env.local` a la racine de l'app:

```env
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
```

### Scopes utilises

- `openid`
- `profile`
- `email`
- `https://www.googleapis.com/auth/drive.appdata`

### Utilisation

1. Ouvrir Settings.
2. Cliquer sur "Se connecter avec Google".
3. Verifier le profil affiche (prenom/nom).
4. Cliquer sur "Synchroniser vers Google Drive".
5. Cliquer sur "Previsualiser import" pour voir l'impact du merge avant application.
6. Depuis la previsualisation, choisir:
  - "Appliquer fusion previsualisee"
  - "Appliquer remplacement complet"
 
 ## Validation UI rapide
 
 - Utiliser la checklist visuelle avant release: `REGRESSION_CHECKLIST.md`

### Strategie de conflit (v1)

- l'app compare `updatedAt` distant avec un horodatage local derive des templates/sessions
- si Drive n'est pas plus recent, l'import est bloque pour eviter un ecrasement local
- un message d'information est affiche dans Settings

### Strategie de fusion (v2)

- templates: merge par `id`, la version la plus recente (`updatedAt`) gagne
- sessions: merge par cle `startedAt + templateName`, la version la plus recente gagne
- seance active: la version la plus recente est conservee
- mode force: aucune fusion, remplacement complet du local par le distant
- previsualisation: l'app affiche les compteurs ajoutes/remplaces/conserves avant import

Les donnees sont stockees dans deux fichiers JSON dans `appDataFolder`:
- `strong-simon-templates.json`
- `strong-simon-sessions.json`

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
