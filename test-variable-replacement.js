// 测试变量替换功能
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 模拟Node-RED环境
const RED = {
    nodes: {
        createNode: function(node, config) {
            node.id = config.id || 'test-node';
            node.name = config.name || 'test';
            node.log = console.log;
            node.error = console.error;
            node.status = function(status) {
                console.log(`状态: ${JSON.stringify(status)}`);
            };
            node.send = function(msg) {
                console.log(`发送消息: ${JSON.stringify(msg, null, 2)}`);
            };
            node.on = function(event, callback) {
                console.log(`注册事件: ${event}`);
            };
        },
        registerType: function(type, constructor) {
            console.log(`注册节点类型: ${type}`);
        },
        getNode: function(id) {
            return null; // 模拟没有找到配置节点
        }
    }
};

// 加载节点文件
console.log('加载MQTT-TDengine节点...');
const nodeCode = fs.readFileSync(path.join(__dirname, 'mqtt-tdengine.js'), 'utf8');

// 创建一个函数来执行节点代码
const nodeFunction = new Function('module', 'RED', nodeCode);

// 执行节点代码
const module = { exports: {} };
nodeFunction(module, RED);

// 测试配置
const testConfig = {
    id: 'test-node-1',
    name: '测试节点',
    mqttServer: 'test-mqtt-server',
    topic: 'test/topic',
    qos: 1,
    tdengineServer: 'test-td-server',
    enableBatch: false, // 使用单条插入模式测试变量替换
    sqlTemplate: 'INSERT INTO air_sensor_001 (createtime, co2, pm25) VALUES (NOW, ${co2}, ${pm25})'
};

// 创建节点实例
console.log('创建节点实例...');
const testNode = {};
module.exports(testNode, testConfig);

console.log('测试变量替换功能...');

// 模拟MQTT消息
const testMessages = [
    '{"co2": 400, "pm25": 35}',
    '{"co2": 450, "pm25": 28}',
    '{"co2": 380, "pm25": 42}'
];

// 等待一下让节点初始化
setTimeout(() => {
    testMessages.forEach((message, index) => {
        console.log(`\n=== 测试消息 ${index + 1} ===`);
        console.log(`原始消息: ${message}`);
        
        // 模拟MQTT消息处理
        try {
            // 这里我们需要直接测试replaceSqlVariables函数
            // 由于函数在闭包中，我们创建一个简化版本来测试
            
            const template = testConfig.sqlTemplate;
            const data = {
                payload: message,
                topic: 'test/topic'
            };
            
            // 简化的变量替换逻辑（复制自修复后的代码）
            let result = template
                .replace(/\$\{payload\}/g, data.payload || '')
                .replace(/\$\{topic\}/g, data.topic || '');
            
            // 尝试解析payload为JSON，并替换JSON字段变量
            try {
                const payloadObj = JSON.parse(data.payload);
                
                // 替换所有 ${字段名} 格式的变量
                result = result.replace(/\$\{([^}]+)\}/g, (match, fieldName) => {
                    // 如果是已知的基本变量，跳过
                    if (['payload', 'topic', 'table', 'database'].includes(fieldName)) {
                        return match;
                    }
                    
                    // 从payload对象中获取字段值
                    if (payloadObj.hasOwnProperty(fieldName)) {
                        return payloadObj[fieldName];
                    }
                    
                    // 如果字段不存在，保持原样
                    return match;
                });
                
            } catch (e) {
                console.log(`Payload不是有效的JSON格式: ${e.message}`);
            }
            
            console.log(`替换后的SQL: ${result}`);
            
        } catch (error) {
            console.error(`处理消息时出错: ${error.message}`);
        }
    });
}, 1000);