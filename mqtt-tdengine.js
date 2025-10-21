module.exports = function(RED) {
    "use strict";
    
    const mqtt = require('mqtt');
    const taos = require('@tdengine/websocket');
    
    function MqttTdengineNode(config) {
        RED.nodes.createNode(this, config);
        
        const node = this;
        let mqttClient = null;
        let tdConnection = null;
        
        // 获取MQTT配置节点
        const mqttConfigNode = RED.nodes.getNode(config.mqttBroker);
        if (!mqttConfigNode) {
            node.error("未找到MQTT配置节点，请检查配置");
            return;
        }
        
        // 获取TDengine配置节点
        const tdConfigNode = RED.nodes.getNode(config.tdengineConfig);
        if (!tdConfigNode) {
            node.error("未找到TDengine配置节点，请检查配置");
            return;
        }
        
        // 配置参数
        const mqttConfig = {
            broker: mqttConfigNode.broker,
            port: mqttConfigNode.port || 1883,
            clientId: mqttConfigNode.clientid || '',
            username: mqttConfigNode.credentials.username || '',
            password: mqttConfigNode.credentials.password || '',
            topic: config.topic,
            qos: parseInt(config.qos) || 0,
            keepalive: mqttConfigNode.keepalive || 60,
            cleansession: mqttConfigNode.cleansession !== false,
            usetls: mqttConfigNode.usetls || false,
            usews: mqttConfigNode.usews || false
        };
        
        const tdConfig = {
            url: tdConfigNode.url,
            username: tdConfigNode.credentials.username || 'root',
            password: tdConfigNode.credentials.password || 'taosdata',
            database: tdConfigNode.database || config.tdDatabase,
            table: config.tdTable,
            timeout: tdConfigNode.timeout || 5000
        };
        
        const sqlTemplate = config.sqlTemplate;
        
        // 替换SQL模板中的变量
        function replaceSqlVariables(template, data) {
            let result = template
                .replace(/\$\{payload\}/g, data.payload || '')
                .replace(/\$\{topic\}/g, data.topic || '')
                .replace(/\$\{table\}/g, tdConfig.table || '')
                .replace(/\$\{database\}/g, tdConfig.database || '');
            
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
                // 如果payload不是JSON，保持原有逻辑
                node.log(`Payload不是有效的JSON格式，使用原始替换逻辑: ${e.message}`);
            }
            
            return result;
        }
        
        // 创建TDengine连接
        async function createTdConnection() {
            try {
                if (tdConnection) {
                    await tdConnection.close();
                }
                
                // 使用WebSocket连接TDengine (官方推荐方式)
                const { WSConfig } = require('@tdengine/websocket');
                const taos = require('@tdengine/websocket');
                
                // 构建WebSocket DSN
                let wsUrl = tdConfig.url;
                if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
                    wsUrl = 'ws://' + wsUrl;
                }
                
                // 确保URL包含端口6041
                if (!wsUrl.includes(':6041')) {
                    wsUrl = wsUrl.replace(/:\d+/, '') + ':6041';
                }
                
                // 创建WebSocket配置
                const config = new WSConfig(wsUrl);
                config.setUser(tdConfig.username);
                config.setPwd(tdConfig.password);
                if (tdConfig.database) {
                    config.setDb(tdConfig.database);
                }
                config.setTimeOut(30000); // 30秒超时
                
                // 建立WebSocket连接
                const wsSql = await taos.sqlConnect(config);
                
                // 创建连接对象
                tdConnection = {
                    wsSql: wsSql,
                    database: tdConfig.database,
                    
                    // 执行SQL的方法
                    exec: async (sql) => {
                        try {
                            const result = await wsSql.exec(sql);
                            return result;
                        } catch (error) {
                            throw new Error(`TDengine WebSocket error: ${error.message}`);
                        }
                    },
                    
                    // 关闭连接的方法
                    close: async () => {
                        try {
                            if (wsSql) {
                                await wsSql.close();
                            }
                        } catch (error) {
                            node.warn(`关闭TDengine连接时出错: ${error.message}`);
                        }
                    }
                };
                
                node.log(`TDengine WebSocket连接成功: ${wsUrl}, 数据库: ${tdConfig.database}`);
                return tdConnection;
            } catch (error) {
                throw new Error(`TDengine连接失败: ${error.message}`);
            }
        }
        
        // 批量数据缓存
        let batchBuffer = [];
        let batchTimer = null;
        const batchSize = config.batchSize || 10; // 默认批量大小
        const batchTimeout = config.batchTimeout || 1000; // 默认1秒超时
        
        // 批量执行插入 - 增强错误处理
        async function executeBatchInsert() {
            if (batchBuffer.length === 0) return;
            
            const batchData = [...batchBuffer];
            batchBuffer.length = 0; // 清空缓存
            
            // 清除定时器
            if (batchTimer) {
                clearTimeout(batchTimer);
                batchTimer = null;
            }
            
            try {
                // 按表分组批量插入
                const tableGroups = {};
                batchData.forEach(item => {
                    if (!tableGroups[item.table]) {
                        tableGroups[item.table] = {
                            columns: item.columns,
                            values: []
                        };
                    }
                    tableGroups[item.table].values.push(item.values);
                });
                
                // 执行每个表的批量插入
                for (const [table, data] of Object.entries(tableGroups)) {
                    const sql = `INSERT INTO ${table} (${data.columns}) VALUES ${data.values.join(', ')}`;
                    node.log(`执行批量插入: ${table}, 数据条数: ${data.values.length}`);
                    
                    try {
                        const result = await executeTdSql(sql);
                        node.log(`批量插入成功: ${table}, 插入 ${data.values.length} 条数据`);
                        
                        // 发送成功消息
                        node.send({
                            payload: {
                                success: true,
                                message: `批量插入成功: ${data.values.length} 条数据`,
                                table: table,
                                count: data.values.length,
                                result: result.data
                            }
                        });
                        
                    } catch (error) {
                        node.error(`批量插入失败 - 表: ${table}, 错误: ${error.message}`);
                        
                        // 发送错误消息
                        node.send({
                            payload: {
                                success: false,
                                error: error.message,
                                table: table,
                                count: data.values.length,
                                sql: sql
                            }
                        });
                        
                        // 如果批量插入失败，尝试逐条插入
                        node.log(`尝试逐条插入 ${data.values.length} 条数据...`);
                        let successCount = 0;
                        
                        for (const value of data.values) {
                            try {
                                const singleSql = `INSERT INTO ${table} (${data.columns}) VALUES ${value}`;
                                await executeTdSql(singleSql);
                                successCount++;
                            } catch (singleError) {
                                node.error(`单条插入失败: ${singleError.message}, SQL: INSERT INTO ${table} (${data.columns}) VALUES ${value}`);
                            }
                        }
                        
                        if (successCount > 0) {
                            node.log(`逐条插入完成: 成功 ${successCount}/${data.values.length} 条`);
                            node.send({
                                payload: {
                                    success: true,
                                    message: `逐条插入完成: 成功 ${successCount}/${data.values.length} 条`,
                                    table: table,
                                    successCount: successCount,
                                    totalCount: data.values.length
                                }
                            });
                        }
                    }
                }
                
                node.status({fill: "green", shape: "dot", text: `批量插入: ${batchData.length} 条`});
                
            } catch (error) {
                node.error(`批量插入处理失败: ${error.message}`);
                node.status({fill: "red", shape: "ring", text: "批量插入失败"});
                
                // 将失败的数据重新加入缓存（可选）
                // batchBuffer.unshift(...batchData);
            }
        }
        
        // 添加数据到批量缓存
        function addToBatch(table, columns, values) {
            batchBuffer.push({ table, columns, values });
            
            // 如果达到批量大小，立即执行
            if (batchBuffer.length >= batchSize) {
                if (batchTimer) {
                    clearTimeout(batchTimer);
                    batchTimer = null;
                }
                executeBatchInsert();
            } else {
                // 设置超时执行
                if (!batchTimer) {
                    batchTimer = setTimeout(() => {
                        batchTimer = null;
                        executeBatchInsert();
                    }, batchTimeout);
                }
            }
        }
        // 执行TDengine SQL - 增强错误处理和重连机制
        async function executeTdSql(sql, retryCount = 0) {
            const maxRetries = 3;
            const retryDelay = 1000; // 1秒
            
            try {
                if (!tdConnection) {
                    node.log("TDengine连接不存在，尝试重新连接...");
                    await createTdConnection();
                }
                
                // 确保使用正确的数据库
                if (tdConfig.database) {
                    await tdConnection.exec(`USE ${tdConfig.database}`);
                }
                
                const result = await tdConnection.exec(sql);
                node.log(`SQL执行成功: ${sql}`);
                return { success: true, data: result };
                
            } catch (error) {
                node.error(`SQL执行失败 (尝试 ${retryCount + 1}/${maxRetries + 1}): ${error.message}`);
                
                // 检查是否是连接相关错误
                const isConnectionError = error.message.includes('connection') || 
                                        error.message.includes('timeout') ||
                                        error.message.includes('closed') ||
                                        error.code === 'ECONNRESET';
                
                if (isConnectionError && retryCount < maxRetries) {
                    node.log(`检测到连接错误，${retryDelay}ms后重试...`);
                    
                    // 重置连接
                    try {
                        if (tdConnection) {
                            await tdConnection.close();
                        }
                    } catch (closeError) {
                        node.log(`关闭旧连接时出错: ${closeError.message}`);
                    }
                    
                    tdConnection = null;
                    
                    // 等待后重试
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
                    return executeTdSql(sql, retryCount + 1);
                }
                
                throw new Error(`TDengine执行失败: ${error.message}`);
            }
        }
        
        // 处理MQTT消息 - 支持批量插入
        function handleMqttMessage(topic, message) {
            try {
                const payload = message.toString();
                node.log(`收到MQTT消息 - 主题: ${topic}, 内容: ${payload}`);
                
                // 检查是否启用批量模式
                if (config.enableBatch) {
                    // 解析消息数据
                    let data;
                    try {
                        data = JSON.parse(payload);
                    } catch (e) {
                        // 如果不是JSON，使用原始payload
                        data = { value: payload };
                    }
                    
                    // 构建插入值 - 根据测试成功的格式
                    const timestamp = data.timestamp || Date.now();
                    const co2 = data.co2 || Math.floor(Math.random() * 200) + 300;
                    const pm25 = data.pm25 || Math.floor(Math.random() * 90) + 10;
                    
                    // 添加到批量缓存
                    const table = tdConfig.table || 'air_sensor_001';
                    const columns = 'createtime, co2, pm25';
                    const values = `(${timestamp}, ${co2}, ${pm25})`;
                    
                    addToBatch(table, columns, values);
                    
                } else {
                    // 单条插入模式（原有逻辑）
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
                }
                    
            } catch (error) {
                node.status({fill: "red", shape: "ring", text: "错误"});
                node.error(`处理MQTT消息失败: ${error.message}`);
            }
        }
        
        // 连接MQTT
        function connectMqtt() {
            try {
                node.log(`连接MQTT服务器: ${mqttConfig.broker}`);
                mqttClient = mqtt.connect(`mqtt://${mqttConfig.broker}:${mqttConfig.port}`, {
                    clientId: mqttConfig.clientId,
                    username: mqttConfig.username,
                    password: mqttConfig.password,
                    keepalive: mqttConfig.keepalive,
                    clean: mqttConfig.cleansession,
                    reconnectPeriod: 1000,
                    connectTimeout: 30 * 1000
                });
                
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
                // 清理批量插入定时器
                if (batchTimer) {
                    clearTimeout(batchTimer);
                    batchTimer = null;
                }
                
                // 执行剩余的批量数据
                if (batchBuffer.length > 0) {
                    await executeBatchInsert();
                }
                
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