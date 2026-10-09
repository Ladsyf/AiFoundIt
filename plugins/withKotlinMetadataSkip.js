const { withProjectBuildGradle } = require('@expo/config-plugins');

// MediaPipe tasks-retrieval and LiteRT-LM ship Kotlin 2.4 metadata while the
// app compiles with an older KGP. This relaxes the compile-time metadata
// version check for every Kotlin task; the resolved 2.4 stdlib stays on the
// classpath at runtime, which is what those libraries actually need.
const SNIPPET = `
allprojects { project ->
  project.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    compilerOptions.freeCompilerArgs.add('-Xskip-metadata-version-check')
  }
}
`;

module.exports = function withKotlinMetadataSkip(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('skip-metadata-version-check')) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};
