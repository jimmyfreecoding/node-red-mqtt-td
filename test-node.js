// 测试Node-RED MQTT-TDengine节点
const mqtt = require('mqtt');

// 模拟Node-RED环境
const RED = {
    nodes: {
        createNode: function(node, config) {
            console.log('创建基础节点...');
            // 模拟Node-RED基础节点功能
            return node;
        },
        getNode: function(id) {
            if (id === "test-config") {
                return {
                    url: "ws://localhost:6041",
                    username: "root",
                    password: "taosdata",
                    database: "test",
                    table: "air_sensor_001"
                };
            }
            return null;
        },
        registerType: function(type, constructor) {
            console.log(`注册节点类型: ${type}`);
            
            // 创建测试节点实例
            const testConfig = {
                name: "测试节点",
                mqttBroker: "localhost",
                topic: "sensor/test",
                qos: "0",
                tdengineConfig: "test-config",
                tdTable: "air_sensor_001",
                sqlTemplate: "INSERT INTO ${table} VALUES (NOW, ${co2}, ${pm25})",
                enableBatch: true,
                batchSize: 10,
                batchTimeout: 2000
            };
            
            // 模拟节点对象
            const mockNode = {
                log: console.log,
                error: console.error,
                status: function(status) {
                    console.log(`节点状态: ${JSON.stringify(status)}`);
                },
                send: function(msg) {
                    console.log(`节点输出: ${JSON.stringify(msg, null, 2)}`);
                },
                on: function(event, callback) {
                    console.log(`注册事件监听器: ${event}`);
                    if (event === 'close') {
                        // 模拟节点关闭
                        setTimeout(() => {
                            console.log('模拟节点关闭...');
                            callback(() => {
                                console.log('节点关闭完成');
                                process.exit(0);
                            });
                        }, 10000); // 10秒后关闭
                    }
                }
            };
            
            console.log('创建节点实例...');
            try {
                constructor.call(mockNode, testConfig);
                console.log('节点创建成功');
                
                // 模拟发送测试数据
                setTimeout(() => {
                    console.log('开始发送测试数据...');
                    sendTestData();
                }, 3000);
                
            } catch (error) {
                console.error('节点创建失败:', error.message);
                console.error('错误堆栈:', error.stack);
                process.exit(1);
            }
        }
    }
};

// 发送测试数据
function sendTestData() {
    const client = mqtt.connect('mqtt://localhost:1883');
    
    client.on('connect', () => {
        console.log('MQTT客户端连接成功');
        
        let count = 0;
        const interval = setInterval(() => {
            const testData = {
                timestamp: Date.now(),
                co2: Math.floor(Math.random() * 200) + 300,
                pm25: Math.floor(Math.random() * 90) + 10
            };
            
            client.publish('sensor/test', JSON.stringify(testData));
            console.log(`发送测试数据 ${++count}: ${JSON.stringify(testData)}`);
            
            if (count >= 15) {
                clearInterval(interval);
                setTimeout(() => {
                    client.end();
                    console.log('测试数据发送完成');
                }, 1000);
            }
        }, 500); // 每500ms发送一条数据
    });
    
    client.on('error', (error) => {
        console.error('MQTT客户端错误:', error.message);
    });
}

// 加载并测试节点
try {
    console.log('加载MQTT-TDengine节点...');
    require('./mqtt-tdengine.js')(RED);
} catch (error) {
    console.error('加载节点失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
}