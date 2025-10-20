const mqtt = require('mqtt');
const taos = require('@tdengine/websocket');

// 测试配置
const testConfig = {
    mqtt: {
        broker: 'mqtt://localhost:1883',
        topic: 'test/sensor',
        qos: 0
    },
    tdengine: {
        url: process.env.TDENGINE_CLOUD_URL || 'ws://localhost:6041',
        database: 'test_db',
        table: 'test_table'
    }
};

// 测试MQTT连接
async function testMqttConnection() {
    return new Promise((resolve, reject) => {
        console.log('测试MQTT连接...');
        
        const client = mqtt.connect(testConfig.mqtt.broker, {
            connectTimeout: 5000
        });
        
        const timeout = setTimeout(() => {
            client.end();
            reject(new Error('MQTT连接超时'));
        }, 10000);
        
        client.on('connect', () => {
            clearTimeout(timeout);
            console.log('✓ MQTT连接成功');
            client.end();
            resolve(true);
        });
        
        client.on('error', (err) => {
            clearTimeout(timeout);
            client.end();
            reject(new Error(`MQTT连接失败: ${err.message}`));
        });
    });
}

// 测试TDengine WebSocket连接
async function testTdengineConnection() {
    let conn = null;
    try {
        console.log('测试TDengine WebSocket连接...');
        
        const conf = new taos.WSConfig(testConfig.tdengine.url);
        conn = await taos.sqlConnect(conf);
        
        // 测试简单查询
        const result = await conn.query('SHOW DATABASES');
        console.log('✓ TDengine WebSocket连接成功');
        
        // 显示数据库列表
        const databases = [];
        while (await result.next()) {
            const row = result.getData();
            databases.push(row[0]);
        }
        console.log(`  发现数据库: ${databases.join(', ')}`);
        
        return true;
    } catch (error) {
        throw new Error(`TDengine连接失败: ${error.message}`);
    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

// 测试SQL模板替换
function testSqlTemplateReplacement() {
    console.log('测试SQL模板替换...');
    
    const template = "INSERT INTO ${table} VALUES (NOW(), '${payload}', '${topic}')";
    const testData = {
        payload: '{"temperature": 25.5}',
        topic: 'sensor/temperature',
        table: 'sensor_data',
        database: 'test_db'
    };
    
    const sql = template
        .replace(/\$\{payload\}/g, testData.payload)
        .replace(/\$\{topic\}/g, testData.topic)
        .replace(/\$\{table\}/g, testData.table)
        .replace(/\$\{database\}/g, testData.database);
    
    const expected = "INSERT INTO sensor_data VALUES (NOW(), '{\"temperature\": 25.5}', 'sensor/temperature')";
    
    if (sql === expected) {
        console.log('✓ SQL模板替换成功');
        console.log(`  生成的SQL: ${sql}`);
        return true;
    } else {
        throw new Error(`SQL模板替换失败\n期望: ${expected}\n实际: ${sql}`);
    }
}

// 测试MQTT消息发送
async function testMqttMessageSend() {
    return new Promise((resolve, reject) => {
        console.log('测试MQTT消息发送...');
        
        const client = mqtt.connect(testConfig.mqtt.broker);
        
        const timeout = setTimeout(() => {
            client.end();
            reject(new Error('MQTT消息发送超时'));
        }, 10000);
        
        client.on('connect', () => {
            const testMessage = JSON.stringify({
                temperature: 25.5,
                humidity: 60.2,
                timestamp: new Date().toISOString()
            });
            
            client.publish(testConfig.mqtt.topic, testMessage, {qos: testConfig.mqtt.qos}, (err) => {
                clearTimeout(timeout);
                if (err) {
                    client.end();
                    reject(new Error(`MQTT消息发送失败: ${err.message}`));
                } else {
                    console.log('✓ MQTT消息发送成功');
                    console.log(`  主题: ${testConfig.mqtt.topic}`);
                    console.log(`  消息: ${testMessage}`);
                    client.end();
                    resolve(true);
                }
            });
        });
        
        client.on('error', (err) => {
            clearTimeout(timeout);
            client.end();
            reject(new Error(`MQTT连接失败: ${err.message}`));
        });
    });
}

// 测试TDengine数据库和表创建
async function testTdengineSetup() {
    let conn = null;
    try {
        console.log('测试TDengine数据库设置...');
        
        const conf = new taos.WSConfig(testConfig.tdengine.url);
        conn = await taos.sqlConnect(conf);
        
        // 创建测试数据库
        await conn.exec(`CREATE DATABASE IF NOT EXISTS ${testConfig.tdengine.database}`);
        console.log(`✓ 数据库 ${testConfig.tdengine.database} 创建成功`);
        
        // 使用数据库
        await conn.exec(`USE ${testConfig.tdengine.database}`);
        
        // 创建测试表
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS ${testConfig.tdengine.table} (
                ts TIMESTAMP,
                payload NCHAR(1024),
                topic NCHAR(256)
            )
        `;
        await conn.exec(createTableSql);
        console.log(`✓ 表 ${testConfig.tdengine.table} 创建成功`);
        
        // 测试插入数据
        const insertSql = `INSERT INTO ${testConfig.tdengine.table} VALUES (NOW(), '{"test": true}', 'test/topic')`;
        await conn.exec(insertSql);
        console.log('✓ 测试数据插入成功');
        
        return true;
    } catch (error) {
        throw new Error(`TDengine设置失败: ${error.message}`);
    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

// 运行所有测试
async function runAllTests() {
    console.log('开始运行Node-RED MQTT-TDengine节点测试...\n');
    
    const tests = [
        { name: 'MQTT连接测试', func: testMqttConnection },
        { name: 'SQL模板替换测试', func: testSqlTemplateReplacement },
        { name: 'MQTT消息发送测试', func: testMqttMessageSend },
        { name: 'TDengine WebSocket连接测试', func: testTdengineConnection },
        { name: 'TDengine数据库设置测试', func: testTdengineSetup }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            await test.func();
            passed++;
        } catch (error) {
            console.log(`✗ ${test.name}失败: ${error.message}`);
            failed++;
        }
        console.log('');
    }
    
    console.log('='.repeat(50));
    console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
    
    if (failed > 0) {
        console.log('\n注意事项:');
        console.log('- 确保MQTT服务器正在运行 (例如: mosquitto)');
        console.log('- 确保TDengine服务正在运行');
        console.log('- 检查TDengine WebSocket端口是否可访问');
        console.log('- 如果使用TDengine Cloud，请设置TDENGINE_CLOUD_URL环境变量');
    }
}

// 运行测试
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    testMqttConnection,
    testTdengineConnection,
    testSqlTemplateReplacement,
    testMqttMessageSend,
    testTdengineSetup
};