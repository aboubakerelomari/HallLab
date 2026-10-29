# HallLab

Outil de labo quotidien pour caractériser des couches semi-conductrices (Si, GaAs, Ge) :
mesures **Van der Pauw**, **effet Hall** et conversion **résistivité ↔ dopage**.
Application web progressive (PWA) installable sur téléphone et ordinateur, en français, qui fonctionne **100 % hors ligne** une fois installée.

Aucune étape de build : HTML + CSS + JavaScript (modules ES), sans framework.

| Fichier | Rôle |
|---|---|
| `index.html` | structure des 4 onglets |
| `style.css` | mise en page mobile d'abord, thème clair / sombre automatique |
| `app.js` | interface : saisie, affichage, historique, export |
| `physics.js` | **toute la physique**, fonctions pures sans DOM |
| `storage.js` | IndexedDB (mesures) et localStorage (réglages) |
| `manifest.webmanifest` | description de l'app pour l'installation |
| `sw.js` | service worker : met tous les fichiers en cache pour le hors-ligne |
| `icons/` | icônes PNG 192 et 512 px (+ version « maskable » pour Android) |
| `tests/physics.test.js` | tests de la physique |
| `tools/make_icons.py` | régénère les icônes (Python pur, sans dépendance) |

## Tester

```bash
node --test tests/physics.test.js
```

Lancer l'app sur l'ordinateur (depuis le dossier `HallLab`), puis ouvrir http://localhost:8000 :

```bash
python3 -m http.server 8000
```

> Ouvrir `index.html` en double-cliquant (adresse `file://`) ne marche pas : les modules ES et le service worker exigent un serveur.

## Saisie et unités

- Nombres acceptés : `1e18`, `2,5e-3`, `2.5E-3`, `−3,9`, `1,2×10^18`. Virgule ou point.
- Sur téléphone, une petite barre **± / ×10ⁿ / −** apparaît sous le champ actif : le clavier numérique n'a souvent ni « e » ni « − ».
- Chaque champ a son sélecteur d'unité (V/mV/µV, A/mA/µA/nA, T/mT/G, nm/µm/cm, Ω/kΩ/MΩ). Tout est converti en SI pour le calcul, puis affiché en unités usuelles : cm⁻³, cm⁻², Ω·cm, Ω/□, cm²/V·s.
- Les résultats se mettent à jour en direct, sans bouton « calculer ».

## Formules

### 1. Van der Pauw

Notation : R<sub>ij,kl</sub> = V<sub>kl</sub> / I<sub>ij</sub> (courant entrant en i, sortant en j ; tension entre k et l). Contacts 1-2-3-4 numérotés dans l'ordre autour de l'échantillon.

| Mode | Calcul de R<sub>A</sub>, R<sub>B</sub> |
|---|---|
| 1 valeur | échantillon symétrique : R<sub>s</sub> = π·R / ln 2 |
| 2 valeurs | R<sub>A</sub> (bord horizontal), R<sub>B</sub> (bord vertical) |
| 4 valeurs | R<sub>A</sub> = (R<sub>12,34</sub> + R<sub>34,12</sub>)/2 ; R<sub>B</sub> = (R<sub>23,41</sub> + R<sub>41,23</sub>)/2 |
| 8 valeurs | chaque paire (+I, −I) est d'abord moyennée (en valeur absolue), puis comme en mode 4 |

Option « tensions » : on saisit les V et un courant I commun, et R = |V| / |I|.

R<sub>s</sub> est la solution de l'équation de van der Pauw :

  exp(−π·R<sub>A</sub>/R<sub>s</sub>) + exp(−π·R<sub>B</sub>/R<sub>s</sub>) = 1

résolue par Newton-Raphson, départ R<sub>s</sub> = π(R<sub>A</sub>+R<sub>B</sub>)/(2 ln 2), arrêt quand la correction relative < 1e-12.

- Facteur de van der Pauw : f = R<sub>s</sub> · ln 2 / (π · (R<sub>A</sub>+R<sub>B</sub>)/2) (f = 1 si R<sub>A</sub> = R<sub>B</sub>).
- Résistivité : ρ = R<sub>s</sub> · t.
- Avertissements : R<sub>A</sub>/R<sub>B</sub> hors de [0,5 ; 2] (géométrie ou contacts douteux) ; écart > 5 % entre résistances réciproques (R<sub>12,34</sub> vs R<sub>34,12</sub>, R<sub>23,41</sub> vs R<sub>41,23</sub>) ou entre +I et −I, signe de contacts non ohmiques.

### 2. Effet Hall

Tension de Hall V<sub>H</sub> :

| Mode | Calcul |
|---|---|
| 1 valeur | V<sub>H</sub> saisie (offset supposé nul) |
| ±B | V<sub>H</sub> = (V(+B) − V(−B)) / 2 |
| 8 valeurs | V<sub>H</sub> = Σ<sub>diagonales</sub> [V(+I,+B) − V(+I,−B) − V(−I,+B) + V(−I,−B)] / 8 |

En mode 8 : diagonale A = courant 1→3, tension V<sub>2</sub> − V<sub>4</sub> ; diagonale B = courant 2→4, tension V<sub>3</sub> − V<sub>1</sub> (même géométrie tournée d'un quart de tour, donc même signe de Hall). Les tensions se saisissent **avec leur signe**. Cette moyenne annule l'offset de désalignement des contacts et les effets thermoélectriques.

Calculs (en SI, puis convertis) :

- R<sub>Hs</sub> = V<sub>H</sub> / (I·B) (coefficient de Hall carré, m²/C ; affiché en cm²/C)
- n<sub>s</sub> = r<sub>H</sub> / (q·|R<sub>Hs</sub>|) (cm⁻²) et n = n<sub>s</sub> / t (cm⁻³)
- R<sub>H</sub> = R<sub>Hs</sub> · t (cm³/C)
- μ<sub>H</sub> = |R<sub>Hs</sub>| / R<sub>s</sub> (cm²/V·s) ; R<sub>s</sub> vient de l'onglet Van der Pauw (partagé automatiquement) ou est saisie à la main
- ρ = R<sub>s</sub> · t
- r<sub>H</sub> : facteur de Hall, 1 par défaut. Il n'intervient que dans n<sub>s</sub> et n (la mobilité affichée est la mobilité **de Hall**).

**Comparaison au modèle** : la mobilité théorique μ(n) du matériau choisi est calculée au dopage n mesuré (Si n → modèle du phosphore, Si p → bore). Écart > 20 % en dessous : compensation (donneurs + accepteurs) ou défauts probables. Écart > 20 % au-dessus : vérifier r<sub>H</sub>, t, R<sub>s</sub> ou une conduction parallèle.

### Convention de signe (important)

Par défaut : **R<sub>H</sub> = V<sub>H</sub>/(I·B)**, et

- **R<sub>H</sub> < 0 ⇒ type n** (électrons),
- **R<sub>H</sub> > 0 ⇒ type p** (trous).

C'est la convention habituelle R<sub>H</sub> = E<sub>y</sub> / (J<sub>x</sub>·B<sub>z</sub>) : avec le courant I selon +x et le champ B selon +z, il faut prendre V<sub>H</sub> = V(−y) − V(+y). Exemple : pour des électrons, la force de Lorentz les pousse vers −y, ce côté devient négatif, donc V<sub>H</sub> < 0 et R<sub>H</sub> < 0. Mais le signe réel de V<sub>H</sub> dépend de ton câblage : sens du champ de l'aimant, ordre des pointes sur le voltmètre. Si un échantillon de type connu sort à l'envers, active **« Inverser la convention de signe »** dans l'onglet Effet Hall. On calcule alors R<sub>H</sub> = −V<sub>H</sub>/(I·B) : le R<sub>H</sub> affiché est déjà corrigé et la règle « R<sub>H</sub> < 0 ⇒ type n » reste vraie. Le réglage est mémorisé et enregistré avec chaque mesure.

### 3. Résistivité ↔ dopage (300 K, ionisation complète)

ρ = 1 / (q · N · μ(N)). Sens inverse (ρ → N) : bissection sur log<sub>10</sub>(N) entre 1e12 et 1e21 cm⁻³.

**Si — Masetti (1983)** :
μ = μ<sub>min1</sub>·exp(−P<sub>c</sub>/N) + (μ<sub>max</sub> − μ<sub>min2</sub>)/(1 + (N/C<sub>r</sub>)<sup>α</sup>) − μ<sub>1</sub>/(1 + (C<sub>s</sub>/N)<sup>β</sup>)

| Dopant | μ<sub>min1</sub> | μ<sub>min2</sub> | μ<sub>max</sub> | μ<sub>1</sub> | P<sub>c</sub> | C<sub>r</sub> | C<sub>s</sub> | α | β |
|---|---|---|---|---|---|---|---|---|---|
| P | 68,5 | 68,5 | 1414 | 56,1 | 0 | 9,20e16 | 3,41e20 | 0,711 | 1,98 |
| As, Sb | 52,2 | 52,2 | 1417 | 43,4 | 0 | 9,68e16 | 3,43e20 | 0,680 | 2,0 |
| B | 44,9 | 0 | 470,5 | 29,0 | 9,23e16 | 2,23e17 | 6,10e20 | 0,719 | 2,0 |

**GaAs et Ge — Caughey-Thomas** : μ = μ<sub>min</sub> + (μ<sub>max</sub> − μ<sub>min</sub>)/(1 + (N/N<sub>ref</sub>)<sup>α</sup>)

| Matériau | μ<sub>min</sub> | μ<sub>max</sub> | N<sub>ref</sub> | α |
|---|---|---|---|---|
| GaAs n | 500 | 9400 | 6e16 | 0,394 |
| GaAs p | 20 | 491,5 | 1,48e17 | 0,38 |
| Ge n (approximatif) | 150 | 3900 | 1e17 | 0,55 |
| Ge p (approximatif) | 50 | 1900 | 2,7e17 | 0,55 |

Avertissements : n-GaAs > 1e19 cm⁻³ (le dopage actif sature) ; Ge toujours signalé comme approximatif.

## Historique et données

- « Enregistrer la mesure » (bas de chaque onglet) : nom d'échantillon, date automatique, notes, toutes les entrées et tous les résultats. Pour une mesure Hall, la R<sub>s</sub> utilisée est figée dans l'enregistrement.
- Stockage **local** dans le navigateur (IndexedDB) : rien n'est envoyé sur Internet.
- Export **CSV** (point-virgule, virgule décimale : s'ouvre directement dans Excel / LibreOffice en français) et **JSON** (sauvegarde complète, réimportable). Sur téléphone, l'export ouvre le menu de partage quand c'est possible, sinon il télécharge le fichier.
- Réglages mémorisés : dernier matériau, unité choisie pour chaque champ, épaisseur par défaut, convention de signe.

> Les données vivent dans le navigateur de chaque appareil. Fais un **export JSON** de temps en temps : désinstaller l'app ou effacer les données du site les supprime.

## Mettre en ligne gratuitement sur GitHub Pages (HTTPS)

L'installation sur téléphone exige une adresse **HTTPS**. GitHub Pages en fournit une gratuitement.

1. Crée un compte sur https://github.com (gratuit).
2. En haut à droite : **+** → **New repository**. Nom : `HallLab`. Choisis **Public** (obligatoire pour Pages avec un compte gratuit). Clique **Create repository**.
3. Envoie les fichiers. Le plus simple sans ligne de commande : sur la page du dépôt, clique **uploading an existing file**, puis glisse **tout le contenu** du dossier `HallLab` (y compris les dossiers `icons` et `tests`). Clique **Commit changes**.
   Variante en ligne de commande, depuis le dossier `HallLab` (remplace `TON-PSEUDO`) :
   ```bash
   git init && git add . && git commit -m "HallLab" && git branch -M main && git remote add origin https://github.com/TON-PSEUDO/HallLab.git && git push -u origin main
   ```
4. Dans le dépôt : **Settings** → **Pages** (menu de gauche). Sous **Build and deployment**, Source : **Deploy from a branch**, Branch : **main**, dossier **/ (root)**. Clique **Save**.
5. Attends 1 à 2 minutes. L'adresse s'affiche en haut de la page Pages : `https://TON-PSEUDO.github.io/HallLab/`. Elle est déjà en HTTPS.

**Mettre à jour l'app plus tard** : modifie les fichiers, **augmente le numéro de version** dans `sw.js` (`halllab-v1` → `halllab-v2`), puis renvoie les fichiers sur GitHub. Les téléphones récupèrent la nouvelle version au lancement suivant (parfois il faut fermer puis rouvrir l'app deux fois).

## Installer sur le téléphone

Ouvre d'abord l'adresse `https://TON-PSEUDO.github.io/HallLab/` une fois avec Internet.

**Android (Chrome)**
1. Ouvre l'adresse dans **Chrome**.
2. Touche le menu **⋮** en haut à droite → **Installer l'application** (ou « Ajouter à l'écran d'accueil »). Un bouton **Installer** apparaît aussi en haut de HallLab.
3. Confirme. L'icône HallLab arrive sur l'écran d'accueil et l'app s'ouvre en plein écran, même sans réseau.

**iPhone / iPad (Safari)**
1. Ouvre l'adresse dans **Safari** (pas Chrome : sur iPhone, seul Safari sait installer de façon fiable).
2. Touche le bouton **Partager** (carré avec une flèche vers le haut).
3. Fais défiler et choisis **Sur l'écran d'accueil**, puis **Ajouter**.
4. Lance HallLab depuis son icône : elle fonctionne hors ligne. Sur iPhone, l'app installée garde ses données ; dans un simple onglet Safari, elles peuvent être effacées après quelques semaines sans visite.

## Vérifier le mode hors ligne

Après l'installation, active le mode avion et ouvre HallLab : tout doit fonctionner (calculs, historique, export). Sur ordinateur, dans Chrome : outils de développement (F12) → onglet **Application** → **Service workers** → case **Offline**, puis recharge la page.

## Version Android (APK)

Le dossier `android-app/` emballe la PWA dans une vraie application Android avec [Capacitor](https://capacitorjs.com) : tous les fichiers sont dans l'APK, qui marche sans Internet. Dans l'APK, l'export CSV/JSON ouvre le menu de partage d'Android au lieu de télécharger.

Outils nécessaires (déjà installés sur l'ordinateur de développement) : Java 21 dans `~/.local/opt`, SDK Android dans `~/Android/Sdk`, variables dans `~/Android/env.sh`.

Refaire l'APK après une modification de l'app :

```bash
source ~/Android/env.sh && cd ~/HallLab/android-app && npm run apk && cp android/app/build/outputs/apk/debug/app-debug.apk ../apk-dist/HallLab.apk
```

L'APK obtenu est signé avec une clé de débogage : il suffit pour un usage personnel ou au labo, mais pas pour le Play Store. Pour l'installer, copie `apk-dist/HallLab.apk` sur le téléphone, ouvre-le, et autorise une fois l'installation depuis cette source. Pour mettre à jour, installe le nouvel APK par-dessus : l'historique est conservé.

Icônes du lanceur Android : `python3 tools/make_android_icons.py`.
