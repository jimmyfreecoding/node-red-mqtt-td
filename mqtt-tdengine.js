module.exports = function(RED) {
    "use strict";
    
    const mqtt = require('mqtt');
    const taos = require('@tdengine/websocket');
    
    function MqttTdengineNode(config) {
        RED.nodes.createNode(this, config);
        
        const node = this;
        let mqttClient = null;
        let tdConnection = null;
        
        // 配置参数
        const mqttConfig = {
            broker: config.broker,
            topic: config.topic,
            qos: parseInt(config.qos) || 0
        };
        
        const tdConfig = {
            url: config.tdUrl || process.env.TDENGINE_CLOUD_URL,
            database: config.tdDatabase,
            table: config.tdTable
        };
        
        const sqlTemplate = config.sqlTemplate;
        
        // 替换SQL模板中的变量
        function replaceSqlVariables(template, data) {
            return template
                .replace(/\$\{payload\}/g, data.payload || '')
                .replace(/\$\{topic\}/g, data.topic || '')
                .replace(/\$\{table\}/g, tdConfig.table || '')
                .replace(/\$\{database\}/g, tdConfig.database || '');
        }
        
        // 创建TDengine连接
        async function createTdConnection() {
            try {
                if (tdConnection) {
                    await tdConnection.close();
                }
                
                const conf = new taos.WSConfig(tdConfig.url);
                tdConnection = await taos.sqlConnect(conf);
                node.log("TDengine WebSocket连接成功");
                return tdConnection;
            } catch (error) {
                throw new Error(`TDengine连接失败: ${error.message}`);
            }
        }
        
        // 执行TDengine SQL
        async function executeTdSql(sql) {
            try {
                if (!tdConnection) {
                    await createTdConnection();
                }
                
                // 如果指定了数据库，先切换到该数据库
                if (tdConfig.database) {
                    await tdConnection.exec(`USE ${tdConfig.database}`);
                }
                
                const result = await tdConnection.exec(sql);
                return { success: true, data: result };
            } catch (error) {
                // 连接可能已断开，尝试重新连接
                try {
                    await createTdConnection();
                    if (tdConfig.database) {
                        await tdConnection.exec(`USE ${tdConfig.database}`);
                    }
                    const result = await tdConnection.exec(sql);
                    return { success: true, data: result };
                } catch (retryError) {
                    throw new Error(`TDengine执行失败: ${retryError.message}`);
                }
            }
        }
        
        // 处理MQTT消息
        function handleMqttMessage(topic, message) {
            try {
                const payload = message.toString();
                node.log(`收到MQTT消息 - 主题: ${topic}, 内容: ${payload}`);
                
                // 替换SQL模板变量
                const sql = replaceSqlVariables(sqlTemplate, {
                    payload: payload,
                    topic: topic
                });
                
                node.log(`执行SQL: ${sql}`);
                
                // 执行TDengine插入
                executeTdSql(sql)
                    .then(result => {
                        node.status({fill: "green", shape: "dot", text: "成功"});
                        node.send({
                            payload: {
                                success: true,
                                message: "数据插入成功",
                                sql: sql,
                                result: result.data,
                                originalTopic: topic,
                                originalPayload: payload
                            }
                        });
                        node.log("数据插入TDengine成功");
                    })
                    .catch(error => {
                        node.status({fill: "red", shape: "ring", text: "失败"});
                        node.error(`TDengine插入失败: ${error.message}`);
                        node.send({
                            payload: {
                                success: false,
                                error: error.message,
                                sql: sql,
                                originalTopic: topic,
                                originalPayload: payload
                            }
                        });
                    });
                    
            } catch (error) {
                node.status({fill: "red", shape: "ring", text: "错误"});
                node.error(`处理MQTT消息失败: ${error.message}`);
            }
        }
        
        // 连接MQTT
        function connectMqtt() {
            try {
                node.log(`连接MQTT服务器: ${mqttConfig.broker}`);
                mqttClient = mqtt.connect(mqttConfig.broker);
                
                mqttClient.on('connect', () => {
                    node.log(`MQTT连接成功，订阅主题: ${mqttConfig.topic}`);
                    node.status({fill: "green", shape: "dot", text: "已连接"});
                    
                    mqttClient.subscribe(mqttConfig.topic, {qos: mqttConfig.qos}, (err) => {
                        if (err) {
                            node.error(`MQTT订阅失败: ${err.message}`);
                            node.status({fill: "red", shape: "ring", text: "订阅失败"});
                        } else {
                            node.log(`MQTT主题订阅成功: ${mqttConfig.topic}`);
                        }
                    });
                });
                
                mqttClient.on('message', handleMqttMessage);
                
                mqttClient.on('error', (err) => {
                    node.error(`MQTT连接错误: ${err.message}`);
                    node.status({fill: "red", shape: "ring", text: "连接错误"});
                });
                
                mqttClient.on('close', () => {
                    node.log("MQTT连接已关闭");
                    node.status({fill: "yellow", shape: "ring", text: "已断开"});
                });
                
                mqttClient.on('reconnect', () => {
                    node.log("MQTT重新连接中...");
                    node.status({fill: "yellow", shape: "dot", text: "重连中"});
                });
                
            } catch (error) {
                node.error(`MQTT连接失败: ${error.message}`);
                node.status({fill: "red", shape: "ring", text: "连接失败"});
            }
        }
        
        // 验证配置
        function validateConfig() {
            if (!mqttConfig.broker) {
                throw new Error("MQTT服务器地址不能为空");
            }
            if (!mqttConfig.topic) {
                throw new Error("MQTT主题不能为空");
            }
            if (!tdConfig.url) {
                throw new Error("TDengine WebSocket URL不能为空");
            }
            if (!tdConfig.database) {
                throw new Error("TDengine数据库名不能为空");
            }
            if (!tdConfig.table) {
                throw new Error("TDengine表名不能为空");
            }
            if (!sqlTemplate) {
                throw new Error("SQL模板不能为空");
            }
        }
        
        // 初始化节点
        try {
            validateConfig();
            node.status({fill: "yellow", shape: "dot", text: "连接中"});
            
            // 初始化TDengine连接
            createTdConnection()
                .then(() => {
                    node.log("TDengine连接初始化成功");
                    // 连接MQTT
                    connectMqtt();
                })
                .catch(error => {
                    node.error(`TDengine连接初始化失败: ${error.message}`);
                    node.status({fill: "red", shape: "ring", text: "TD连接失败"});
                });
                
        } catch (error) {
            node.error(`节点初始化失败: ${error.message}`);
            node.status({fill: "red", shape: "ring", text: "配置错误"});
        }
        
        // 节点关闭时清理资源
        node.on('close', async (done) => {
            try {
                if (mqttClient) {
                    mqttClient.end(true);
                    node.log("MQTT客户端已关闭");
                }
                
                if (tdConnection) {
                    await tdConnection.close();
                    node.log("TDengine连接已关闭");
                }
            } catch (error) {
                node.error(`关闭连接时出错: ${error.message}`);
            } finally {
                done();
            }
        });
    }
    
    RED.nodes.registerType("mqtt-tdengine", MqttTdengineNode);
};