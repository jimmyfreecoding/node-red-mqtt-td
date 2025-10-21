module.exports = function(RED) {
    "use strict";
    
    function TDengineConfigNode(config) {
        RED.nodes.createNode(this, config);
        
        this.name = config.name;
        this.url = config.url;
        this.username = config.username;
        this.password = config.password;
        this.database = config.database;
        this.timeout = parseInt(config.timeout) || 5000;
        
        // 不在日志中显示敏感信息
        this.log(`TDengine配置节点已创建: ${this.name || 'unnamed'}`);
    }
    
    RED.nodes.registerType("tdengine-config", TDengineConfigNode, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" }
        }
    });
};