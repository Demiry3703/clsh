// @clsh/agent -- entry point
// Starts the local server, PTY sessions, tunnel, and prints QR code

import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';
import { initDatabase } from './db.js';
import { generateBootstrapToken, hashToken } from './auth.js';
import { createAppServer, startServer } from './server.js';
import { setupWebSocketHandler } from './ws-handler.js';
import { PTYManager } from './pty-manager.js';
import { createTunnel, printAccessInfo, registerShutdownHandlers } from './tunnel.js';
// tmux imports preserved for future re-enable with control mode (-CC)
// import { isTmuxAvailable, ensureTmuxConfig } from './tmux.js';

async function main(): Promise<void> {
  // 1. Load configuration
  const config = loadConfig();

  // 2. Initialize database
  const { db, statements } = initDatabase(config.dbPath);

  // 3. Generate bootstrap token and store its hash
  const bootstrapToken = generateBootstrapToken();
  const tokenId = randomUUID();
  const tokenHash = hashToken(bootstrapToken);
  statements.insertBootstrapToken.run(tokenId, tokenHash);

  // 4. tmux wrapping disabled — it breaks xterm.js scrollback because tmux
  //    is a terminal emulator that sends screen redraws instead of raw output.
  //    TODO: Re-enable with tmux control mode (-CC) for persistence + scroll.
  console.log('  Sessions are ephemeral (tmux wrapping disabled for scroll support)');

  // 5. Create HTTP + WebSocket server
  const { httpServer, wss } = createAppServer(config, statements);

  // 6. Set up PTY manager and WebSocket handler
  const ptyManager = new PTYManager({
    tmuxEnabled: false,
    tmuxConfPath: null,
    dbStatements: statements,
  });

  setupWebSocketHandler(wss, ptyManager, config.jwtSecret);

  // 8. Start HTTP server (auto-finds open port if configured port is busy)
  const actualPort = await startServer(httpServer, config.port);
  if (actualPort !== config.port) {
    console.log(`  Agent running on port ${String(actualPort)} (${String(config.port)} was busy)`);
  }

  // 9. Create tunnel — tries ngrok → SSH (localhost.run) → local network IP
  // If WEB_PORT was explicitly set (dev mode), tunnel to that; otherwise tunnel to the actual agent port
  const tunnelPort = config.webPort !== config.port ? config.webPort : actualPort;
  const tunnel = await createTunnel(tunnelPort, config.ngrokAuthtoken, config.ngrokStaticDomain, config.tunnelMethod);

  // 10. Print clean startup info
  printAccessInfo(tunnel.url, bootstrapToken, tunnel.method);

  // 11. Register graceful shutdown handlers
  registerShutdownHandlers(() => {
    ptyManager.destroyAll();
    db.close();
    httpServer.close();
  });
}

main().catch((err: unknown) => {
  console.error('Fatal error starting clsh agent:', err);
  process.exit(1);
});
