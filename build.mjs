import yargs from "yargs";
import chalk from "chalk";
import { build } from "esbuild";

function getOptimizedPrecomputedConstants(
  options = {
    defineExtendedMathematicalConstants: false,
  },
) {
  const mathematicalConstantMap = {};

  for (const key in Math) {
    if (typeof Math[key] === "number") {
      mathematicalConstantMap[`Math.${key}`] = JSON.stringify(Math[key]);
    }
  }

  if (options.defineExtendedMathematicalConstants) {
    mathematicalConstantMap[`Math.PHI`] = JSON.stringify(
      (1 + Math.sqrt(5)) / 2,
    ); // 1.618
  }

  return {
    ...mathematicalConstantMap,
  };
}

async function main() {
  const args = await yargs()
    .option("build-mode", {
      alias: "m",
      default: "production",
      choices: ["development", "production"],
      description:
        "Either development or production, minified and optimized in production.",
    })
    .option("out-dir", {
      alias: "o",
      default: "dist",
      description: "The directory where the output should be placed at.",
    })
    .option("extended-mathematical-constants", {
      alias: "xmc",
      boolean: true,
      default: true,
      description:
        "Whether the build script should define extended mathematical constants.",
    })
    .parseAsync();

  const { buildMode, outDir, extendedMathematicalConstants } = args;

  const isDev = buildMode === "development";
  const isProd = !isDev;

  const buildResult = await build({
    entryPoints: ["src/index.ts", "src/hashTester.ts"],
    bundle: true,
    outdir: outDir,
    platform: "node",
    format: "esm",
    target: "es2020",
    sourcemap: true,
    minify: isProd,
    minifyWhitespace: isProd,
    minifyIdentifiers: isProd,
    minifySyntax: isProd,
    define: {
      NODE_ENV: JSON.stringify(buildMode),
      ...getOptimizedPrecomputedConstants({
        defineExtendedMathematicalConstants: extendedMathematicalConstants,
      }),
    },
  });

  console.log(chalk.bgGreen(`Finished building output to ${outDir}!`));

  // handle errors
  if (buildResult.errors.length) {
    for (const message of buildResult.errors) {
      console.log(`(${chalk.blue(message.pluginName)}) ${message.text}`);
    }
  }

  // handle warnings
  if (buildResult.warnings.length) {
    for (const message of buildResult.warnings) {
      console.log(`(${chalk.yellow(message.pluginName)}) ${message.text}`);
    }
  }
}

main().catch(console.error);
