#!/bin/sh

set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: ./build.sh VERSION" >&2
  echo "Example: ./build.sh 1.1.1" >&2
  exit 1
fi

build_version="$1"

case "$build_version" in
  *[!0-9A-Za-z._-]*|"")
    echo "Invalid version: $build_version" >&2
    exit 1
    ;;
esac

if [ -f VERSION ]; then
  current_version=$(sed -n '1p' VERSION)

  if [ "$build_version" = "$current_version" ]; then
    echo "Version $build_version has already been built; choose a new version." >&2
    exit 1
  fi
fi

mkdir -p dist
cp index.html dist/index.html
mkdir -p dist/api
cp server/api/bootstrap.php server/api/index.php server/api/tap.php server/api/.htaccess dist/api/
mkdir -p dist/assembler
cp assembler/index.html dist/assembler/index.html

find dist -maxdepth 1 -type f \( \
  -name 'app.js' -o \
  -name 'styles.css' -o \
  -name 'app-*.js' -o \
  -name 'styles-*.css' \
\) -delete

BUILD_VERSION="$build_version" perl -0pi -e '
  s/styles\.css\?v=dev/styles-$ENV{BUILD_VERSION}.css/g;
  s/app\.js\?v=dev/app-$ENV{BUILD_VERSION}.js/g;
  s/Version dev/Version $ENV{BUILD_VERSION}/g;
' dist/index.html

BUILD_VERSION="$build_version" perl -0pi -e '
  s/Version dev/Version $ENV{BUILD_VERSION}/g;
' dist/assembler/index.html

npx --yes clean-css-cli -o "dist/styles-$build_version.css" styles.css
npx --yes terser app.js \
  --compress passes=3,unsafe_arrows=true \
  --mangle \
  --ecma 2017 \
  --output "dist/app-$build_version.js"

printf '%s\n' "$build_version" > VERSION

printf '%s\n' \
  'Options -Indexes' \
  '<IfModule mod_rewrite.c>' \
  '  RewriteEngine On' \
  '  RewriteRule ^t/([A-Za-z0-9_-]{12})\.tap$ api/tap.php?slug=$1 [L,QSA]' \
  '</IfModule>' \
  '<IfModule mod_headers.c>' \
  '  <Files "index.html">' \
  '    Header set Cache-Control "no-cache, no-store, must-revalidate"' \
  '    Header set Pragma "no-cache"' \
  '    Header set Expires "0"' \
  '  </Files>' \
  '  Header set X-Content-Type-Options "nosniff"' \
  '  Header set Referrer-Policy "same-origin"' \
  '</IfModule>' > dist/.htaccess

printf '%s\n' \
  '/index.html' \
  '  Cache-Control: no-cache, no-store, must-revalidate' > dist/_headers

printf '%s\n' \
  '<IfModule mod_headers.c>' \
  '  <Files "index.html">' \
  '    Header set Cache-Control "no-cache, no-store, must-revalidate"' \
  '    Header set Pragma "no-cache"' \
  '    Header set Expires "0"' \
  '  </Files>' \
  '  Header set X-Content-Type-Options "nosniff"' \
  '  Header set Referrer-Policy "same-origin"' \
  '</IfModule>' > dist/assembler/.htaccess

echo "Built dist version $build_version"
