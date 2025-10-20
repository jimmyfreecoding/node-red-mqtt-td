-- TDengine数据库设置脚本
-- 用于Node-RED MQTT to TDengine节点的示例配置

-- 创建数据库
CREATE DATABASE IF NOT EXISTS iot_data KEEP 365 DAYS 10 BLOCKS 6 UPDATE 1;

-- 使用数据库
USE iot_data;

-- 创建温度数据表
CREATE TABLE IF NOT EXISTS temperature_data (
    ts TIMESTAMP,
    temperature FLOAT
);

-- 创建传感器数据超级表
CREATE STABLE IF NOT EXISTS sensor_data (
    ts TIMESTAMP,
    topic NCHAR(100),
    payload NCHAR(500)
) TAGS (
    device_id NCHAR(50),
    sensor_type NCHAR(50)
);

-- 创建具体的传感器子表
CREATE TABLE IF NOT EXISTS sensor_001 USING sensor_data TAGS ('sensor_001', 'temperature');
CREATE TABLE IF NOT EXISTS sensor_002 USING sensor_data TAGS ('sensor_002', 'humidity');
CREATE TABLE IF NOT EXISTS sensor_003 USING sensor_data TAGS ('sensor_003', 'pressure');

-- 创建设备状态表
CREATE TABLE IF NOT EXISTS device_status (
    ts TIMESTAMP,
    device_id NCHAR(50),
    status NCHAR(20),
    message NCHAR(200)
);

-- 创建JSON格式数据表 (适用于复杂数据结构)
CREATE STABLE IF NOT EXISTS json_sensor_data (
    ts TIMESTAMP,
    data JSON
) TAGS (
    device_id NCHAR(50),
    location NCHAR(100)
);

-- 创建JSON数据子表示例
CREATE TABLE IF NOT EXISTS json_sensor_001 USING json_sensor_data TAGS ('device_001', 'building_a_floor_1');

-- 插入一些示例数据
INSERT INTO temperature_data VALUES (NOW, 25.6);
INSERT INTO temperature_data VALUES (NOW-1s, 25.4);
INSERT INTO temperature_data VALUES (NOW-2s, 25.8);

INSERT INTO sensor_001 VALUES (NOW, 'sensor/temperature', '{"temp": 25.6, "unit": "C"}');
INSERT INTO sensor_002 VALUES (NOW, 'sensor/humidity', '{"humidity": 65.2, "unit": "%"}');

INSERT INTO device_status VALUES (NOW, 'device_001', 'online', 'Device connected successfully');

-- 查询示例
-- 查看最近的温度数据
SELECT * FROM temperature_data ORDER BY ts DESC LIMIT 10;

-- 查看所有传感器数据
SELECT * FROM sensor_data ORDER BY ts DESC LIMIT 10;

-- 查看设备状态
SELECT * FROM device_status ORDER BY ts DESC LIMIT 10;

-- 按设备ID查询
SELECT * FROM sensor_data WHERE tbname = 'sensor_001' ORDER BY ts DESC LIMIT 5;

-- 时间范围查询
SELECT * FROM temperature_data WHERE ts >= NOW - 1h ORDER BY ts DESC;

-- 聚合查询示例
SELECT AVG(temperature) as avg_temp, MAX(temperature) as max_temp, MIN(temperature) as min_temp 
FROM temperature_data 
WHERE ts >= NOW - 1h;

-- 按时间窗口聚合
SELECT _wstart, AVG(temperature) as avg_temp 
FROM temperature_data 
WHERE ts >= NOW - 1d 
INTERVAL(10m) 
ORDER BY _wstart;