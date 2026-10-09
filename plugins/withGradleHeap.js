const { withGradleProperties } = require('@expo/config-plugins');

// Compiling and dexing the app with MediaPipe, LiteRT-LM, ML Kit and PdfBox needs more room than the 2 GB
// Gradle heap that Expo's template starts with. This raises it so a first build does not stop with an
// out-of-memory error.
const JVM_ARGS = '-Xmx4g -XX:MaxMetaspaceSize=1g';

module.exports = function withGradleHeap(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const existing = props.find((p) => p.type === 'property' && p.key === 'org.gradle.jvmargs');
    if (existing) existing.value = JVM_ARGS;
    else props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    return cfg;
  });
};
