# Minecraft Server Status Checker

A comprehensive Minecraft server status checker application that supports both Java and Bedrock editions. Built from scratch without external API dependencies, powered by [sghq.network](https://sghq.network).

## Features

- Query Minecraft server status for both Java and Bedrock editions
- Modern dark-themed UI with a purple/cyan color scheme
- Get player count (online/max) and player list
- Get server version and protocol version
- Get server MOTD (Message of the Day) with formatting
- Color-coded latency display
- Get mod information (if server uses Forge/FML)
- Get server icon (favicon)

## Installation

```bash
# Clone the repository
git clone https://github.com/devRaikou/minecraft-query.git
cd minecraft-query

# Install dependencies
npm install

# Start the server
npm start

# For development with auto-restart
npm run dev
```

The server will start on port 3000 by default. You can change this by setting the `PORT` environment variable.

## API Usage

### Get Java Server Status

```
GET /api/java/:server
```

#### Parameters

- `server`: The Minecraft Java server address (domain or IP)
- `port` (optional): The server port (default: 25565)

#### Example

```
GET /api/java/mc.hypixel.net
```

### Get Bedrock Server Status

```
GET /api/bedrock/:server
```

#### Parameters

- `server`: The Minecraft Bedrock server address (domain or IP)
- `port` (optional): The server port (default: 19132)

#### Example

```
GET /api/bedrock/play.nethergames.org
```

### Response Format

```json
{
  "status": "success",
  "ip": "mc.hypixel.net",
  "port": 25565,
  "edition": "java",
  "online": true,
  "version": "Requires MC 1.8-1.20",
  "protocol": 47,
  "ping_method": "modern",
  "latency": 42,
  "motd": "Hypixel Network [1.8-1.20]",
  "players": {
    "online": 78452,
    "max": 200000,
    "list": [
      {"name": "Player1", "id": "uuid-here"},
      {"name": "Player2", "id": "uuid-here"}
    ]
  },
  "mods": {
    "count": 3,
    "list": [
      {"name": "forge", "version": "14.23.5.2860"},
      {"name": "custommod", "version": "1.0.0"}
    ]
  },
  "favicon": "data:image/png;base64,..."
}
```

### Offline Server Response

```json
{
  "status": "error",
  "ip": "nonexistent-server.com",
  "port": 25565,
  "edition": "java",
  "error": "Connection failed: getaddrinfo ENOTFOUND nonexistent-server.com",
  "online": false
}
```

## How It Works

This application uses direct TCP/UDP connections to query Minecraft servers:

- **Java Edition**: Uses the Server List Ping protocol over TCP
- **Bedrock Edition**: Uses the Raknet protocol over UDP

No third-party Minecraft status libraries or external APIs are used.

### Supported Minecraft Versions

- **Java Edition**: Best support for versions 1.8 and above
- **Bedrock Edition**: Support for all modern Bedrock server versions

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
