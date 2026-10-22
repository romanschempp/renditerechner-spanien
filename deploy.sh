#!/bin/zsh
# Baut die App und veröffentlicht dist/ auf dem Branch gh-pages (GitHub Pages).
set -e
DIR="${0:A:h}"
cd "$DIR"
REPO=renditerechner-spanien
npm test
BASE_PATH=/$REPO/ npm run build
touch dist/.nojekyll
TMP=$(mktemp -d)
cp -R dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git commit -qm "Deploy $(date '+%Y-%m-%d %H:%M')"
git push -f "$(git -C "$DIR" remote get-url origin)" gh-pages
rm -rf "$TMP"
echo "Veröffentlicht: https://romanschempp.github.io/$REPO/"
