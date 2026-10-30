const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.join(repoRoot, "shared")];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
// Dependências de pacotes do Expo podem ficar aninhadas em seus próprios
// node_modules. Permitir essa busca evita falhas de resolução no bundle.
config.resolver.disableHierarchicalLookup = false;

// Código compartilhado deve continuar usando apenas os pacotes do mobile.
// A raiz também tem React e Supabase instalados para o frontend Vite.
const sharedRoot = path.join(repoRoot, "shared") + path.sep;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromShared = context.originModulePath.startsWith(sharedRoot);
  return context.resolveRequest(
    fromShared ? { ...context, disableHierarchicalLookup: true } : context,
    moduleName,
    platform,
  );
};

module.exports = config;
