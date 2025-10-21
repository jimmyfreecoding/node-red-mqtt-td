// 简化的变量替换测试
console.log('测试变量替换功能...');

// 测试配置
const sqlTemplate = 'INSERT INTO air_sensor_001 (createtime, co2, pm25) VALUES (NOW, ${co2}, ${pm25})';

// 简化的变量替换函数（复制自修复后的代码）
function replaceSqlVariables(template, data) {
    let result = template
        .replace(/\$\{payload\}/g, data.payload || '')
        .replace(/\$\{topic\}/g, data.topic || '')
        .replace(/\$\{table\}/g, data.table || '')
        .replace(/\$\{database\}/g, data.database || '');
    
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
    
    return result;
}

// 测试数据
const testCases = [
    {
        name: '正常JSON数据',
        data: {
            payload: '{"co2": 400, "pm25": 35}',
            topic: 'test/topic'
        }
    },
    {
        name: '包含时间戳的JSON数据',
        data: {
            payload: '{"timestamp": 1640995200000, "co2": 450, "pm25": 28}',
            topic: 'sensor/data'
        }
    },
    {
        name: '非JSON数据',
        data: {
            payload: 'simple text data',
            topic: 'test/topic'
        }
    }
];

// 执行测试
testCases.forEach((testCase, index) => {
    console.log(`\n=== 测试案例 ${index + 1}: ${testCase.name} ===`);
    console.log(`原始模板: ${sqlTemplate}`);
    console.log(`输入数据: ${JSON.stringify(testCase.data)}`);
    
    const result = replaceSqlVariables(sqlTemplate, testCase.data);
    console.log(`替换结果: ${result}`);
    
    // 检查是否还有未替换的变量
    const unreplacedVars = result.match(/\$\{[^}]+\}/g);
    if (unreplacedVars) {
        console.log(`⚠️  未替换的变量: ${unreplacedVars.join(', ')}`);
    } else {
        console.log('✅ 所有变量都已正确替换');
    }
});

console.log('\n测试完成！');