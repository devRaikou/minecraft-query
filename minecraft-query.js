const net = require('net');
const dns = require('dns');
const { promisify } = require('util');
const crypto = require('crypto');
const dgram = require('dgram'); // For UDP (Bedrock) connections

// Promisify DNS lookup
const lookup = promisify(dns.lookup);

// Protocol versions to try (newer to older)
const PROTOCOL_VERSIONS = [
  { version: 761, name: "1.20" },
  { version: 760, name: "1.19.4" },
  { version: 759, name: "1.19.3" },
  { version: 758, name: "1.19.1-2" },
  { version: 757, name: "1.19" },
  { version: 756, name: "1.18.2" },
  { version: 755, name: "1.18-1.18.1" },
  { version: 754, name: "1.17.1" },
  { version: 753, name: "1.17" },
  { version: 751, name: "1.16.5" },
  { version: 736, name: "1.16.3" },
  { version: 735, name: "1.16.2" },
  { version: 578, name: "1.15.2" },
  { version: 404, name: "1.13.2" },
  { version: 340, name: "1.12.2" },
  { version: 110, name: "1.9.4" },
  { version: 47, name: "1.8.9" },
  { version: 5, name: "1.7.10" }
];

/**
 * Query a Minecraft server for status information
 * @param {string} host - The server hostname or IP address
 * @param {number} port - The server port (default: 25565 for Java, 19132 for Bedrock)
 * @param {string} edition - The server edition: 'java', 'bedrock', or undefined for auto-detect
 * @returns {Promise<Object>} - Server status information
 */
async function queryMinecraftServer(host, port = 25565, edition = undefined) {
  try {
    // If edition is specified as bedrock, use bedrock ping
    if (edition === 'bedrock') {
      console.log(`Using Bedrock edition ping for ${host}:${port}...`);
      return await queryBedrockServer(host, port || 19132);
    }
    
    // Check SRV records for Java edition servers
    let srvResult = null;
    if (edition !== 'bedrock') {
      srvResult = await checkSrvRecord(host);
      if (srvResult) {
        host = srvResult.host;
        port = srvResult.port;
        console.log(`SRV record found, redirecting to ${host}:${port}`);
      }
    }
    
    // If edition is explicitly set to java or not specified (auto-detect)
    if (edition === 'java' || edition === undefined) {
      try {
        // Try modern ping first (1.7+)
        console.log(`Trying Java edition modern ping for ${host}:${port}...`);
        const status = await modernPing(host, port);
        return status;
      } catch (error) {
        console.log(`Modern Java ping failed: ${error.message}`);
        
        // Try legacy ping as fallback (pre-1.7)
        if (edition !== 'bedrock') {
          try {
            console.log(`Trying Java edition legacy ping for ${host}:${port}...`);
            const status = await legacyPing(host, port);
            return status;
          } catch (legacyError) {
            console.log(`Legacy Java ping failed: ${legacyError.message}`);
            
            // If auto-detecting and both Java methods failed, try Bedrock as last resort
            if (edition === undefined) {
              try {
                console.log(`Trying Bedrock edition ping for ${host}:${port === 25565 ? 19132 : port}...`);
                return await queryBedrockServer(host, port === 25565 ? 19132 : port);
              } catch (bedrockError) {
                console.log(`Bedrock ping failed: ${bedrockError.message}`);
                throw new Error(`All ping methods failed: ${error.message}`);
              }
            } else {
              throw new Error(`All Java ping methods failed: ${error.message}`);
            }
          }
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error(`Error querying Minecraft server: ${error.message}`);
    throw error;
  }
}

/**
 * Query a Minecraft Bedrock edition server
 * @param {string} host - Server hostname or IP
 * @param {number} port - Server port (default: 19132)
 * @returns {Promise<Object>} - Server status
 */
async function queryBedrockServer(host, port = 19132) {
  const timeout = 5000; // 5 seconds
  
  return new Promise(async (resolve, reject) => {
    try {
      // Resolve hostname to IP
      const { address } = await lookup(host).catch(() => {
        throw new Error('Could not resolve hostname');
      });
      
      // Create UDP socket for Bedrock query
      const socket = dgram.createSocket('udp4');
      let responded = false;
      
      // Prepare Bedrock ping packet (unconnected ping)
      // Magic: 0x01 + 8 byte timestamp + Magic bytes: 0x00,0xFF,0xFF,0x00,0xFE,0xFE,0xFE,0xFE,0xFD,0xFD,0xFD,0xFD,0x12,0x34,0x56,0x78
      const packet = Buffer.alloc(1 + 8 + 16);
      packet.writeUInt8(0x01, 0); // Unconnected ping
      
      // Write timestamp (just use 8 bytes of current timestamp)
      const timestamp = BigInt(Date.now());
      packet.writeBigUInt64BE(timestamp, 1);
      
      // Magic bytes for Bedrock edition
      const magic = Buffer.from([
        0x00, 0xFF, 0xFF, 0x00, 0xFE, 0xFE, 0xFE, 0xFE,
        0xFD, 0xFD, 0xFD, 0xFD, 0x12, 0x34, 0x56, 0x78
      ]);
      magic.copy(packet, 9);
      
      const startTime = Date.now();
      
      // Set up error and timeout handlers
      socket.on('error', (error) => {
        if (!responded) {
          responded = true;
          socket.close();
          reject(new Error(`Bedrock query error: ${error.message}`));
        }
      });
      
      // Handle incoming messages
      socket.on('message', (message) => {
        if (responded) return;
        responded = true;
        
        const pingTime = Date.now() - startTime;
        
        try {
          // Check if this is an unconnected pong packet (0x1C)
          if (message.length > 35 && message.readUInt8(0) === 0x1C) {
            // Skip packet ID (1 byte), server GUID (8 bytes), timestamp (8 bytes), and server ID (16 bytes)
            let offset = 1 + 8 + 8 + 16;
            
            // The remaining data should be a null-terminated string with server info
            const serverInfo = message.slice(offset).toString('utf8');
            
            // Parse the server info string - typical format is:
            // MCPE;Bedrock Server;527;1.19.50;0;10;13253860892328930865;Example Server;Survival;1;19132;19133;
            const parts = serverInfo.split(';');
            
            if (parts.length >= 6) {
              // Enhanced MOTD handling for Bedrock
              let motd = parts[1] || 'A Minecraft Bedrock Server';
              
              // Some servers include a second line in the server name/MOTD field
              if (parts.length >= 8 && parts[7]) {
                motd = `${motd}\n${parts[7]}`;
              }
              
              const status = {
                online: true,
                edition: 'bedrock',
                version: parts[3] || 'Unknown',
                protocol: parseInt(parts[2]) || -1,
                motd: motd,
                players: {
                  online: parseInt(parts[4]) || 0,
                  max: parseInt(parts[5]) || 0
                },
                ping: pingTime,
                ping_protocol: 'bedrock',
                gamemode: parts.length >= 9 ? parts[8] : 'Unknown'
              };
              
              socket.close();
              resolve(status);
            } else {
              socket.close();
              reject(new Error('Invalid Bedrock server response format'));
            }
          } else {
            socket.close();
            reject(new Error('Unexpected Bedrock server response'));
          }
        } catch (error) {
          socket.close();
          reject(new Error(`Bedrock response parsing error: ${error.message}`));
        }
      });
      
      // Send ping packet
      socket.send(packet, 0, packet.length, port, address);
      
      // Set timeout
      setTimeout(() => {
        if (!responded) {
          responded = true;
          socket.close();
          reject(new Error('Bedrock ping timeout'));
        }
      }, timeout);
      
    } catch (error) {
      reject(new Error(`Bedrock query error: ${error.message}`));
    }
  });
}

/**
 * Check for SRV DNS record for Minecraft server
 * @param {string} domain - Domain to check
 * @returns {Promise<Object|null>} - SRV record info or null
 */
async function checkSrvRecord(domain) {
  try {
    const resolveSrv = promisify(dns.resolveSrv);
    const records = await resolveSrv(`_minecraft._tcp.${domain}`);
    
    if (records && records.length > 0) {
      return {
        host: records[0].name,
        port: records[0].port
      };
    }
    return null;
  } catch (error) {
    console.log(`No SRV record found for ${domain}`);
    return null;
  }
}

/**
 * Modern ping implementation (Minecraft 1.7+)
 * @param {string} host - Server hostname or IP
 * @param {number} port - Server port
 * @returns {Promise<Object>} - Server status
 */
async function modernPing(host, port) {
  const timeout = 10000; // 10 seconds
  
  return new Promise(async (resolve, reject) => {
    try {
      // Resolve hostname to IP if needed
      const { address } = await lookup(host).catch(() => {
        throw new Error('Could not resolve hostname');
      });
      
      const socket = new net.Socket();
      let serverInfo = { online: false };
      
      // Set connection timeout
      socket.setTimeout(timeout);
      
      // Handle timeout
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
      
      // Handle connection errors
      socket.on('error', (error) => {
        socket.destroy();
        reject(new Error(`Connection failed: ${error.message}`));
      });
      
      // Handle successful connection
      socket.on('connect', () => {
        serverInfo.online = true;
        
        // Protocol version - trying 47 first (1.8.9, most widely compatible)
        const protocolVersion = 47;
        
        // Handshake packet
        const handshakeData = Buffer.alloc(256);
        let offset = 0;
        
        // Packet ID
        writeByte(handshakeData, 0x00, offset++);
        
        // Protocol version
        offset += writeVarInt(handshakeData, protocolVersion, offset);
        
        // Host length and string
        offset += writeVarInt(handshakeData, host.length, offset);
        offset += handshakeData.write(host, offset);
        
        // Port
        offset += writeUnsignedShort(handshakeData, port, offset);
        
        // Next state (1 for status)
        offset += writeVarInt(handshakeData, 1, offset);
        
        // Prepare final handshake packet with length prefix
        const handshakeLength = writeVarIntSize(offset);
        const handshakePacket = Buffer.alloc(handshakeLength + offset);
        let packetOffset = writeVarInt(handshakePacket, offset, 0);
        handshakeData.copy(handshakePacket, packetOffset, 0, offset);
        
        // Send handshake
        socket.write(handshakePacket);
        
        // Status request packet
        const statusPacket = Buffer.from([0x01, 0x00]);
        socket.write(statusPacket);
        
        // Now prepare for response
        let responseBuffer = Buffer.alloc(0);
        
        socket.on('data', (chunk) => {
          // Add chunk to response buffer
          responseBuffer = Buffer.concat([responseBuffer, chunk]);
          
          try {
            // Try to parse the response
            const { value: packetLength, size: packetLengthSize } = readVarIntWithSize(responseBuffer, 0);
            
            // Check if we have complete packet
            if (responseBuffer.length >= packetLengthSize + packetLength) {
              const packetId = responseBuffer[packetLengthSize];
              
              // This is a status response packet (0x00)
              if (packetId === 0x00) {
                // Position after packet ID
                let pos = packetLengthSize + 1;
                
                // Read JSON string length
                const { value: jsonLength, size: jsonLengthSize } = readVarIntWithSize(responseBuffer, pos);
                pos += jsonLengthSize;
                
                // Read the JSON payload
                const jsonString = responseBuffer.slice(pos, pos + jsonLength).toString('utf8');
                
                try {
                  const data = JSON.parse(jsonString);
                  console.log('Raw server response:', JSON.stringify(data, null, 2));
                  
                  // Extract data into serverInfo
                  serverInfo = {
                    online: true,
                    version: data.version?.name || 'Unknown',
                    protocol: data.version?.protocol || -1,
                    motd: extractMotd(data.description),
                    raw_motd: data.description || null,
                    players: {
                      online: data.players?.online !== undefined ? data.players.online : 0,
                      max: data.players?.max !== undefined ? data.players.max : 0
                    },
                    raw_player_sample: data.players?.sample || [],
                    player_list: extractPlayerList(data.players?.sample || []),
                    favicon: data.favicon || null,
                    mods: extractMods(data),
                    ping_protocol: 'modern',
                    ping_version: protocolVersion
                  };
                  
                  // Send ping packet to measure latency
                  const pingPacket = Buffer.from([0x09, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]);
                  const pingTime = Date.now();
                  socket.write(pingPacket);
                  
                  // Set ping value in serverInfo for use even if ping response doesn't arrive
                  serverInfo.ping = 0; // Initialize ping
                  
                  // Set a short timeout for ping response
                  setTimeout(() => {
                    socket.end();
                    resolve(serverInfo);
                  }, 1000);
                } catch (error) {
                  socket.end();
                  reject(new Error(`Invalid JSON response: ${error.message}`));
                }
              }
              // This is a ping response packet (0x01)
              else if (packetId === 0x01) {
                const pongTime = Date.now();
                serverInfo.ping = pongTime - pingTime;
                socket.end();
                resolve(serverInfo);
              }
            }
          } catch (error) {
            // Likely incomplete data, wait for more chunks
          }
        });
      });
      
      // Connect to server
      socket.connect(port, address);
      
      // If nothing happens for 10 seconds, abort
      setTimeout(() => {
        if (!serverInfo.online) {
          socket.destroy();
          reject(new Error('Connection timeout - no data received'));
        }
      }, timeout);
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Legacy ping implementation (Minecraft pre-1.7)
 * @param {string} host - Server hostname or IP
 * @param {number} port - Server port
 * @returns {Promise<Object>} - Server status
 */
async function legacyPing(host, port) {
  return new Promise(async (resolve, reject) => {
    try {
      // Resolve hostname to IP if needed
      const { address } = await lookup(host).catch(() => {
        throw new Error('Could not resolve hostname');
      });
      
      const socket = new net.Socket();
      let responseData = Buffer.alloc(0);
      
      // Set connection timeout
      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        // Send legacy ping packet (FE 01)
        socket.write(Buffer.from([0xFE, 0x01]));
      });
      
      socket.on('data', (chunk) => {
        responseData = Buffer.concat([responseData, chunk]);
        
        // Legacy ping response starts with 0xFF
        if (responseData.length > 0 && responseData[0] === 0xFF) {
          try {
            // Skip the packet ID and read the length
            const length = responseData.readUInt16BE(1);
            
            // Read the UTF-16BE encoded data
            let response = '';
            for (let i = 0; i < length; i++) {
              response += String.fromCharCode(responseData.readUInt16BE(3 + i * 2));
            }
            
            // Parse the response (format: §1\0127\0MC 1.7.10\0A Minecraft Server\00\020)
            const parts = response.split('\0');
            
            if (parts.length >= 6) {
              const protocolVersion = parseInt(parts[1]);
              const version = parts[2];
              const motd = parts[3];
              const playersOnline = parseInt(parts[4]);
              const playersMax = parseInt(parts[5]);
              
              const status = {
                online: true,
                version: version || 'Unknown',
                protocol: protocolVersion || -1,
                motd: motd || 'A Minecraft Server',
                players: {
                  online: playersOnline || 0,
                  max: playersMax || 0
                },
                ping_protocol: 'legacy',
                favicon: null
              };
              
              socket.end();
              resolve(status);
            } else {
              socket.end();
              reject(new Error('Invalid legacy ping response format'));
            }
          } catch (error) {
            socket.end();
            reject(new Error(`Legacy ping error: ${error.message}`));
          }
        }
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
      
      socket.on('error', (error) => {
        socket.destroy();
        reject(new Error(`Connection failed: ${error.message}`));
      });
      
      socket.on('end', () => {
        if (responseData.length === 0) {
          reject(new Error('Server closed connection without sending data'));
        }
      });
      
      // Connect to server
      socket.connect(port, address);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Extract MOTD text from Minecraft JSON format
 * @param {Object|string} description - Server description object or string
 * @returns {string} - Plain MOTD text
 */
function extractMotd(description) {
  if (!description) return 'A Minecraft Server';
  
  if (typeof description === 'string') {
    return stripColorCodes(description);
  }
  
  if (description.text !== undefined) {
    let motd = description.text || '';
    
    // Check for 'extra' components and append them
    if (description.extra && Array.isArray(description.extra)) {
      motd += description.extra.map(part => part.text || '').join('');
    }
    
    return stripColorCodes(motd);
  }
  
  if (description.extra) {
    return stripColorCodes(description.extra.map(part => part.text || '').join(''));
  }
  
  return 'A Minecraft Server';
}

/**
 * Extract player list from player sample array
 * @param {Array} sample - Player sample array
 * @returns {Array} - Formatted player list
 */
function extractPlayerList(sample) {
  if (!sample || !Array.isArray(sample) || sample.length === 0) {
    return [];
  }

  // Filter out obvious server advertisements
  const filteredSample = sample.filter(player => {
    if (!player || !player.name || !player.id) return false;
    
    // Check for valid UUID format
    const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(player.id);
    
    // Skip entries that are clearly not players
    const name = player.name.toLowerCase();
    const isServerAd = name.includes('discord') || 
                        name.includes('shop') || 
                        name.includes('store') ||
                        name.includes('vote') ||
                        name.includes('www') ||
                        name.includes('.net') ||
                        name.includes('.com') ||
                        name.includes('.org') ||
                        name.includes('=====');
    
    return validUuid && !isServerAd;
  });

  return filteredSample.map(player => {
    return {
      name: player.name,
      id: player.id
    };
  });
}

/**
 * Extract mod information if available
 * @param {Object} response - Server response
 * @returns {Array|null} - Mod information
 */
function extractMods(response) {
  // Check for FML/Forge format
  if (response.modinfo && response.modinfo.type === 'FML' && response.modinfo.modList) {
    return response.modinfo.modList.map(mod => ({
      name: mod.modid,
      version: mod.version
    }));
  }
  
  // Check for newer Forge format
  if (response.forgeData && Array.isArray(response.forgeData.mods)) {
    return response.forgeData.mods;
  }
  
  return null;
}

/**
 * Strip Minecraft color codes from text
 * @param {string} text - Text with color codes
 * @returns {string} - Clean text
 */
function stripColorCodes(text) {
  if (!text) return '';
  // Replace all Minecraft color codes (§ followed by a character)
  return text.replace(/§[0-9a-fk-or]/gi, '');
}

/**
 * Write a byte to a buffer
 * @param {Buffer} buffer - Target buffer
 * @param {number} value - Value to write
 * @param {number} offset - Buffer offset
 * @returns {number} - Bytes written (always 1)
 */
function writeByte(buffer, value, offset) {
  buffer.writeUInt8(value, offset);
  return 1;
}

/**
 * Write an unsigned short to a buffer
 * @param {Buffer} buffer - Target buffer
 * @param {number} value - Value to write
 * @param {number} offset - Buffer offset
 * @returns {number} - Bytes written (always 2)
 */
function writeUnsignedShort(buffer, value, offset) {
  buffer.writeUInt16BE(value, offset);
  return 2;
}

/**
 * Write a VarInt to a buffer
 * @param {Buffer} buffer - Target buffer
 * @param {number} value - Value to write
 * @param {number} offset - Buffer offset
 * @returns {number} - Bytes written
 */
function writeVarInt(buffer, value, offset) {
  let currentOffset = offset;
  do {
    let temp = value & 0b01111111;
    value >>>= 7;
    if (value !== 0) {
      temp |= 0b10000000;
    }
    buffer.writeUInt8(temp, currentOffset++);
  } while (value !== 0);
  return currentOffset - offset;
}

/**
 * Calculate the size needed to write a VarInt
 * @param {number} value - Value to check
 * @returns {number} - Bytes needed
 */
function writeVarIntSize(value) {
  if ((value & 0xFFFFFF80) === 0) return 1;
  if ((value & 0xFFFFC000) === 0) return 2;
  if ((value & 0xFFE00000) === 0) return 3;
  if ((value & 0xF0000000) === 0) return 4;
  return 5;
}

/**
 * Read a VarInt from a buffer and return both the value and bytes read
 * @param {Buffer} buffer - Source buffer
 * @param {number} offset - Buffer offset
 * @returns {Object} - Object with value and size properties
 */
function readVarIntWithSize(buffer, offset) {
  let result = 0;
  let size = 0;
  let currentByte;
  
  do {
    if (offset + size >= buffer.length) {
      throw new Error('VarInt extends beyond buffer');
    }
    
    currentByte = buffer[offset + size];
    result |= (currentByte & 0x7F) << (7 * size);
    size++;
    
    if (size > 5) {
      throw new Error('VarInt too big');
    }
  } while ((currentByte & 0x80) !== 0);
  
  return { value: result, size };
}

module.exports = {
  queryMinecraftServer
}; 