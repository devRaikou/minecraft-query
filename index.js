const express = require('express');
const path = require('path');
const { queryMinecraftServer } = require('./minecraft-query');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.send({
    status: 'online',
    message: 'Minecraft Server Status API',
    usage: {
      endpoints: [
        '/api/java/:server',
        '/api/bedrock/:server'
      ],
      example: '/api/java/mc.hypixel.net',
    }
  });
});

// Helper function to format API response
function formatApiResponse(status, server, port, edition) {
  // Format response for better readability
  const response = {
    status: 'success',
    ip: server,
    port: parseInt(port),
    edition: edition,
    online: status.online || false,
    version: status.version || 'Unknown',
    protocol: status.protocol || -1,
    ping_method: status.ping_protocol || 'modern',
    latency: status.ping || null,
    motd: status.motd || 'A Minecraft Server',
    players: {
      online: status.players?.online || 0,
      max: status.players?.max || 0,
      list: status.player_list || []
    }
  };
  
  // Add debug info
  if (process.env.DEBUG === 'true') {
    response.debug = {
      raw_motd: status.raw_motd,
      raw_player_sample: status.raw_player_sample,
      protocol_used: status.ping_version
    };
  }
  
  // Add mod information if available
  if (status.mods) {
    response.mods = {
      count: status.mods.length,
      list: status.mods
    };
  }
  
  // Add icon if available
  if (status.favicon) {
    response.favicon = status.favicon;
  }
  
  return response;
}

// Java Edition API endpoint
app.get('/api/java/:server', async (req, res) => {
  const server = req.params.server;
  const port = req.query.port || 25565; // Default Java Edition port
  
  try {
    const status = await queryMinecraftServer(server, port, 'java');
    return res.json(formatApiResponse(status, server, port, 'java'));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return res.status(500).json({
      status: 'error',
      ip: server,
      port: parseInt(port),
      edition: 'java',
      error: error.message,
      online: false
    });
  }
});

// Bedrock Edition API endpoint
app.get('/api/bedrock/:server', async (req, res) => {
  const server = req.params.server;
  const port = req.query.port || 19132; // Default Bedrock Edition port
  
  try {
    const status = await queryMinecraftServer(server, port, 'bedrock');
    return res.json(formatApiResponse(status, server, port, 'bedrock'));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return res.status(500).json({
      status: 'error',
      ip: server,
      port: parseInt(port),
      edition: 'bedrock',
      error: error.message,
      online: false
    });
  }
});

// For backward compatibility, redirect old API format to Java edition
app.get('/api/:server', (req, res) => {
  res.redirect(`/api/java/${req.params.server}${req.query.port ? `?port=${req.query.port}` : ''}`);
});

// Fallback route for all other routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch all other routes
app.use((req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Route not found' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the API at http://localhost:${PORT}/api/java/mc.hypixel.net`);
  console.log(`Access the web interface at http://localhost:${PORT}`);
}); 