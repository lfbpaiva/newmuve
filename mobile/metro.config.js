// O app importa código de ../shared (regras e serviços compartilhados com a web).
// Metro precisa observar a raiz do repositório, mas resolver pacotes (react,
// supabase-js...) SOMENTE em mobile/node_modules, para não carregar duas cópias.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.join(repoRoot, "shared")];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
