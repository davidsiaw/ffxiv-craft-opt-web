#!/bin/bash
set -e
git config --global user.email "asdn@azys.la"
git config --global user.name "Allagan Software Deployment Node"

git clone git@github.com:davidsiaw/ffxiv-craft-opt-web.git build
pushd build
  git checkout gh-pages
popd
cp -r build/.git ./gittemp
rm -rf build
cp -r app build
cp -r ./gittemp build/.git
pushd build
  echo crafttool.outsider.azys.la > CNAME
  echo "Updated at `date` by the Software Deployment Node. Glory to Allag." > updatetime.html
  git add .
  git add -u
  git commit -m "update `date`"
  ssh-agent bash -c 'ssh-add ~/.ssh/id_github.com; git push'
popd
