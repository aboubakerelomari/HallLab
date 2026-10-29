// Copie les fichiers de la PWA (dossier parent) dans www/ pour l'APK.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const www = join(root, 'android-app', 'www');
const FILES = ['index.html', 'style.css', 'app.js', 'physics.js', 'storage.js', 'manifest.webmanifest', 'sw.js', 'icons'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of FILES) cpSync(join(root, f), join(www, f), { recursive: true });
console.log(`Fichiers web copiés dans ${www}`);
