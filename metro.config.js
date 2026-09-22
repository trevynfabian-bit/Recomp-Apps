// Metro perlu diberi tahu soal struktur monorepo: paket logika bersama ada di
// `packages/`, di luar folder app, jadi Metro harus ikut mengawasinya dan tahu
// ke mana mencari node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const akarProyek = __dirname;
const config = getDefaultConfig(akarProyek);

// Ikut awasi paket bersama agar perubahannya langsung terpakai saat dev.
config.watchFolders = [path.resolve(akarProyek, 'packages')];

// Cari modul di node_modules akar (npm workspaces meng-hoist ke sana).
config.resolver.nodeModulesPaths = [path.resolve(akarProyek, 'node_modules')];

module.exports = config;
