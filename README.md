# Node-RED MQTT to TDengine 节点

一个用于将MQTT消息数据写入TDengine时序数据库的Node-RED自定义节点。使用TDengine官方WebSocket连接器实现高效的数据传输。

## 功能特性

- 🔄 **MQTT订阅**: 支持订阅MQTT主题，接收实时数据
- 🚀 **TDengine集成**: 使用官方`@tdengine/websocket`连接器，支持本地和云端TDengine
- ⚙️ **灵活配置**: 支持自定义SQL模板和变量替换
- 📊 **实时状态**: 显示连接状态和数据处理结果
- 🛡️ **错误处理**: 完善的错误处理和重连机制

## 安装

### 方法1: 通过Node-RED管理界面安装

1. 打开Node-RED管理界面
2. 点击右上角菜单 → 管理调色板
3. 选择"安装"选项卡
4. 搜索 `node-red-contrib-mqtt-tdengine`
5. 点击安装

### 方法2: 通过npm安装

```bash
cd ~/.node-red
npm install node-red-contrib-mqtt-tdengine
```

### 方法3: 本地开发安装

```bash
# 克隆或下载项目到本地
cd /path/to/node-red-mqtt-td

# 安装依赖
npm install

# 链接到Node-RED
cd ~/.node-red
npm link /path/to/node-red-mqtt-td
```

## 配置说明

### MQTT配置

- **MQTT服务器**: MQTT代理服务器地址，例如 `mqtt://localhost:1883`
- **主题**: 要订阅的MQTT主题，例如 `sensor/temperature`
- **QoS**: 消息质量等级 (0, 1, 2)

### TDengine配置

- **WebSocket URL**: TDengine WebSocket连接地址
  - 本地部署: `ws://localhost:6041`
  - TDengine Cloud: `wss://your-instance.cloud.tdengine.com`
- **数据库**: TDengine数据库名称
- **表名**: 目标数据表名称

### SQL模板配置

SQL模板支持以下变量替换：

- `${payload}`: MQTT消息内容
- `${topic}`: MQTT主题
- `${table}`: 配置的表名
- `${database}`: 配置的数据库名

**示例模板**:
```sql
INSERT INTO ${table} VALUES (NOW(), '${payload}', '${topic}')
```

## 使用示例

### 1. 基本配置

1. 将`mqtt-tdengine`节点拖拽到工作区
2. 双击节点进行配置：
   - MQTT服务器: `mqtt://localhost:1883`
   - 主题: `sensor/data`
   - TDengine WebSocket URL: `ws://localhost:6041`
   - 数据库: `iot_data`
   - 表名: `sensor_readings`
   - SQL模板: `INSERT INTO ${table} VALUES (NOW(), '${payload}', '${topic}')`

### 2. 环境变量配置

对于TDengine Cloud，可以设置环境变量：

```bash
export TDENGINE_CLOUD_URL="wss://your-instance.cloud.tdengine.com"
```

然后在WebSocket URL配置中留空，节点会自动使用环境变量。

## TDengine表结构示例

```sql
-- 创建数据库
CREATE DATABASE IF NOT EXISTS iot_data;

-- 使用数据库
USE iot_data;

-- 创建普通表
CREATE TABLE IF NOT EXISTS sensor_readings (
    ts TIMESTAMP,
    payload NCHAR(1024),
    topic NCHAR(256)
);

-- 创建超级表（推荐用于大规模数据）
CREATE STABLE IF NOT EXISTS sensors (
    ts TIMESTAMP,
    temperature FLOAT,
    humidity FLOAT,
    location NCHAR(64)
) TAGS (
    device_id NCHAR(32),
    device_type NCHAR(16)
);

-- 创建子表
CREATE TABLE IF NOT EXISTS sensor_001 USING sensors TAGS ('device_001', 'temperature');
```

## 输出消息格式

节点会输出包含执行结果的消息：

### 成功时
```json
{
  "payload": {
    "success": true,
    "message": "数据插入成功",
    "sql": "INSERT INTO sensor_data VALUES (NOW, '25.6')",
    "result": {...},
    "originalTopic": "sensor/temperature",
    "originalPayload": "25.6"
  }
}
```

### 失败时
```json
{
  "payload": {
    "success": false,
    "error": "TDengine执行失败: Invalid SQL",
    "sql": "INSERT INTO sensor_data VALUES (NOW, '25.6')",
    "originalTopic": "sensor/temperature",
    "originalPayload": "25.6"
  }
}
```

## 故障排除

### 常见问题

1. **MQTT连接失败**
   - 检查MQTT服务器地址和端口
   - 确认网络连接正常
   - 检查防火墙设置

2. **TDengine连接失败**
   - 确认TDengine服务正在运行
   - 检查REST API端口 (默认6041)
   - 验证用户名和密码

3. **SQL执行失败**
   - 检查数据库和表是否存在
   - 验证SQL语法正确性
   - 确认数据类型匹配

### 调试方法

1. 查看Node-RED调试面板的日志输出
2. 检查节点状态指示器
3. 使用TDengine客户端直接测试SQL语句

## 依赖项

- **Node.js**: >= 14.0.0
- **Node-RED**: >= 2.0.0
- **@tdengine/websocket**: ^1.0.0
- **mqtt**: ^4.3.7

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。

## 更新日志

### v2.0.0
- 🚀 使用TDengine官方WebSocket连接器替代REST API
- ⚡ 提升连接性能和稳定性
- 🌐 支持TDengine Cloud连接
- 🔧 简化配置选项
- 📝 更新文档和示例

### v1.0.0
- 🎉 初始版本发布
- 📡 支持MQTT订阅和TDengine写入
- 🛠️ 基于REST API的TDengine集成
- 📋 灵活的SQL模板配置