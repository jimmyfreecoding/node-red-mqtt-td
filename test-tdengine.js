const { WSConfig } = require('@tdengine/websocket');

// TDengine配置
const tdConfig = {
    host: 'localhost',
    port: 6041,
    user: 'root',
    password: 'taosdata',
    database: 'buildingos'
};

async function testTDengineConnection() {
    let connection = null;
    
    try {
        // 构建WebSocket DSN
        const dsn = `ws://${tdConfig.host}:${tdConfig.port}`;
        
        // 创建WebSocket配置
        const config = new WSConfig(dsn);
        config.setUser(tdConfig.user);
        config.setPwd(tdConfig.password);
        config.setDb(tdConfig.database);
        config.setTimeOut(30000);
        
        // 建立WebSocket连接
        const taos = require('@tdengine/websocket');
        connection = await taos.sqlConnect(config);
        
        console.log(`TDengine WebSocket连接成功: ${dsn}, 数据库: ${tdConfig.database}`);
        
        // 测试简单查询
        const testSql = `SELECT SERVER_VERSION()`;
        const result = await connection.exec(testSql);
        
        console.log('TDengine服务器版本:', result);
        console.log('TDengine WebSocket连接测试成功！');
        
        // 测试插入数据到air超级表
        console.log('\n开始测试数据插入...');
        
        // 创建子表并插入数据
        const createTableSql = `CREATE TABLE IF NOT EXISTS air_sensor_001 USING air TAGS(1)`;
        await connection.exec(createTableSql);
        console.log('子表创建成功');
        
        // 插入测试数据
        const insertSql = `INSERT INTO air_sensor_001 (createtime, co2, pm25) VALUES (NOW, 400, 35)`;
        const insertResult = await connection.exec(insertSql);
        console.log('数据插入结果:', insertResult);
        
        // 查询插入的数据
        const querySql = `SELECT * FROM air_sensor_001 ORDER BY createtime DESC LIMIT 1`;
        const queryResult = await connection.exec(querySql);
        console.log('查询结果:', queryResult);
        
        console.log('数据插入测试完成！');
        
        // 压力测试：插入1000条数据
        console.log('\n开始压力测试：插入1000条数据...');
        const startTime = Date.now();
        
        // 批量插入数据
        const batchSize = 100; // 每批插入100条
        const totalRecords = 1000;
        let insertedCount = 0;
        
        for (let batch = 0; batch < totalRecords / batchSize; batch++) {
            const values = [];
            for (let i = 0; i < batchSize; i++) {
                const recordIndex = batch * batchSize + i;
                const timestamp = Date.now() + recordIndex * 1000; // 每条记录间隔1秒
                const co2Value = 300 + Math.floor(Math.random() * 200); // 300-500之间的随机值
                const pm25Value = 10 + Math.floor(Math.random() * 90); // 10-100之间的随机值
                values.push(`(${timestamp}, ${co2Value}, ${pm25Value})`);
            }
            
            const batchInsertSql = `INSERT INTO air_sensor_001 (createtime, co2, pm25) VALUES ${values.join(', ')}`;
            const batchResult = await connection.exec(batchInsertSql);
            insertedCount += batchResult._affectRows;
            
            // 显示进度
            if ((batch + 1) % 2 === 0) {
                console.log(`已插入 ${insertedCount} 条记录...`);
            }
        }
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        console.log(`\n压力测试完成！`);
        console.log(`总插入记录数: ${insertedCount} 条`);
        console.log(`总执行时间: ${executionTime} 毫秒 (${(executionTime / 1000).toFixed(2)} 秒)`);
        console.log(`平均插入速度: ${(insertedCount / (executionTime / 1000)).toFixed(2)} 条/秒`);
        
        // 验证插入的数据
        const countSql = `SELECT COUNT(*) as total FROM air_sensor_001`;
        const countResult = await connection.exec(countSql);
        console.log(`数据库中总记录数: ${countResult._data[0][0]} 条`);
        
    } catch (error) {
        console.error('TDengine连接测试失败:', error.message);
        throw error;
    } finally {
        // 关闭连接
        if (connection) {
            try {
                await connection.close();
                console.log('TDengine连接已关闭');
            } catch (closeError) {
                console.warn('关闭连接时出错:', closeError.message);
            }
        }
    }
}

// 运行测试
testTDengineConnection()
    .then(() => {
        console.log('连接测试完成');
        process.exit(0);
    })
    .catch((error) => {
        console.error('连接测试失败:', error);
        process.exit(1);
    });