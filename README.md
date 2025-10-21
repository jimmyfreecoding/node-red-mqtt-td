# Node-RED MQTT to TDengine

A Node-RED custom node for writing MQTT message data to TDengine time-series database. Uses the official TDengine WebSocket connector for efficient data transmission with batch insert support.

## Features

- 🔄 **MQTT Subscription**: Subscribe to MQTT topics and receive real-time data
- 🚀 **TDengine Integration**: Uses official `@tdengine/websocket` connector, supports local and cloud TDengine
- ⚡ **Batch Insert**: High-performance batch insert mode with configurable batch size and timeout
- 🎯 **Smart Variable Replacement**: Supports JSON field extraction from MQTT payloads
- ⚙️ **Flexible Configuration**: Custom SQL templates with variable substitution
- 📊 **Real-time Status**: Connection status and data processing results display
- 🛡️ **Enhanced Error Handling**: Comprehensive error handling with retry mechanisms and fallback strategies

## Installation

### Method 1: Install via Node-RED Palette Manager

1. Open Node-RED management interface
2. Click the menu in the top right corner → Manage palette
3. Select the "Install" tab
4. Search for `node-red-contrib-mqtt-tdengine`
5. Click Install

### Method 2: Install via npm

```bash
cd ~/.node-red
npm install node-red-contrib-mqtt-tdengine
```

## Configuration

### MQTT Configuration

- **MQTT Server**: MQTT broker server address, e.g., `mqtt://localhost:1883`
- **Topic**: MQTT topic to subscribe to, e.g., `sensor/temperature`
- **QoS**: Message quality level (0, 1, 2)

### TDengine Configuration

- **WebSocket URL**: TDengine WebSocket connection address
  - Local deployment: `ws://localhost:6041`
  - TDengine Cloud: `wss://your-instance.cloud.tdengine.com`
- **Database**: TDengine database name
- **Table**: Target data table name

### Batch Insert Configuration

- **Enable Batch**: Toggle batch insert mode for better performance
- **Batch Size**: Number of records to batch together (1-1000, default: 10)
- **Batch Timeout**: Maximum time to wait before executing batch (1-60 seconds, default: 1)

### SQL Template Configuration

SQL templates support the following variable substitutions:

- `${payload}`: Complete MQTT message content
- `${topic}`: MQTT topic
- `${table}`: Configured table name
- `${database}`: Configured database name
- `${fieldname}`: JSON field values from payload (e.g., `${co2}`, `${pm25}`)

**Example Templates**:

Single insert mode:
```sql
INSERT INTO ${table} (createtime, co2, pm25) VALUES (NOW, ${co2}, ${pm25})
```

For JSON payload like: `{"co2": 400, "pm25": 35}`

## Usage Examples

### 1. Basic Configuration

1. Drag the `mqtt-tdengine` node to the workspace
2. Double-click the node to configure:
   - MQTT Server: `mqtt://localhost:1883`
   - Topic: `sensor/data`
   - TDengine WebSocket URL: `ws://localhost:6041`
   - Database: `iot_data`
   - Table: `air_sensor_001`
   - SQL Template: `INSERT INTO ${table} (createtime, co2, pm25) VALUES (NOW, ${co2}, ${pm25})`

### 2. Batch Insert Mode

Enable batch insert for high-throughput scenarios:
- Enable Batch: ✓
- Batch Size: 100
- Batch Timeout: 5 seconds

This will collect up to 100 records or wait 5 seconds before executing a batch insert.

### 3. Performance Comparison

Based on testing:
- **Single Insert**: ~100 records/second
- **Batch Insert**: ~14,700 records/second (147x improvement)
- **Batch Processing**: 1000 records in 68ms

## TDengine Table Structure Example

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS iot_data;

-- Use database
USE iot_data;

-- Create table for air sensor data
CREATE TABLE IF NOT EXISTS air_sensor_001 (
    createtime TIMESTAMP,
    co2 INT,
    pm25 INT
);

-- Create super table for multiple sensors
CREATE STABLE IF NOT EXISTS air_sensors (
    createtime TIMESTAMP,
    co2 INT,
    pm25 INT,
    temperature FLOAT,
    humidity FLOAT
) TAGS (
    device_id NCHAR(32),
    location NCHAR(64)
);
```

## Output Message Format

The node outputs messages containing execution results:

### Success (Single Insert)
```json
{
  "payload": {
    "success": true,
    "message": "数据插入成功",
    "sql": "INSERT INTO air_sensor_001 (createtime, co2, pm25) VALUES (NOW, 400, 35)",
    "result": {...},
    "originalTopic": "sensor/air",
    "originalPayload": "{\"co2\": 400, \"pm25\": 35}"
  }
}
```

### Success (Batch Insert)
```json
{
  "payload": {
    "success": true,
    "message": "批量插入成功: 100 条数据",
    "table": "air_sensor_001",
    "count": 100,
    "result": {...}
  }
}
```

### Error
```json
{
  "payload": {
    "success": false,
    "error": "TDengine执行失败: Invalid SQL",
    "sql": "INSERT INTO air_sensor_001 VALUES (NOW, 400, 35)",
    "originalTopic": "sensor/air",
    "originalPayload": "{\"co2\": 400, \"pm25\": 35}"
  }
}
```

## Troubleshooting

### Common Issues

1. **MQTT Connection Failed**
   - Check MQTT server address and port
   - Verify network connectivity
   - Check firewall settings

2. **TDengine Connection Failed**
   - Ensure TDengine service is running
   - Check WebSocket port (default 6041)
   - Verify username and password

3. **SQL Execution Failed**
   - Check if database and table exist
   - Verify SQL syntax correctness
   - Ensure data type matching

4. **Variable Replacement Issues**
   - Ensure MQTT payload is valid JSON for field extraction
   - Check variable names match JSON field names exactly
   - Use debug node to inspect actual payload content

### Debugging Methods

1. Check Node-RED debug panel log output
2. Monitor node status indicators
3. Test SQL statements directly with TDengine client
4. Use the included test scripts to verify functionality

## Dependencies

- **Node.js**: >= 14.0.0
- **Node-RED**: >= 2.0.0
- **@tdengine/websocket**: ^3.1.0
- **mqtt**: ^4.3.7
- **axios**: ^1.12.2

## License

MIT License

## Contributing

Issues and Pull Requests are welcome to improve this project.

## Changelog

### v1.0.0
- 🎉 Initial release
- 📡 MQTT subscription and TDengine integration
- ⚡ Batch insert support with configurable parameters
- 🎯 Smart JSON field variable replacement
- 🛡️ Enhanced error handling and retry mechanisms
- 🔄 Automatic connection management and recovery
- 📊 Real-time status monitoring
- 🧪 Comprehensive test coverage