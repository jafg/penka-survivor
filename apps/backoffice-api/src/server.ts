import { buildApp } from './app';
import { loadConfig, type AppConfig } from './config';

function bootConfig(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    // The logger is not up yet — write the validation report directly.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const config = bootConfig();
const app = buildApp({ config, logger: true });

app.listen({ port: config.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
