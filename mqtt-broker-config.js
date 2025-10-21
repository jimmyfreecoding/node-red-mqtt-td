module.exports = function(RED) {
    "use strict";
    
    function MqttBrokerConfigNode(config) {
        RED.nodes.createNode(this, config);
        
        this.name = config.name;
        this.broker = config.broker;
        this.port = parseInt(config.port) || 1883;
        this.clientid = config.clientid;
        this.keepalive = parseInt(config.keepalive) || 60;
        this.cleansession = config.cleansession;
        this.willTopic = config.willTopic;
        this.willQos = parseInt(config.willQos) || 0;
        this.willRetain = config.willRetain;
        this.willPayload = config.willPayload;
        this.birthTopic = config.birthTopic;
        this.birthQos = parseInt(config.birthQos) || 0;
        this.birthRetain = config.birthRetain;
        this.birthPayload = config.birthPayload;
        this.closeTopic = config.closeTopic;
        this.closeQos = parseInt(config.closeQos) || 0;
        this.closeRetain = config.closeRetain;
        this.closePayload = config.closePayload;
        
        // SSL/TLS配置
        this.usetls = config.usetls;
        this.verifyservercert = config.verifyservercert;
        this.compatmode = config.compatmode;
        
        // 构建连接URL
        this.brokerurl = "";
        if (this.broker) {
            this.brokerurl = (this.usetls ? "mqtts://" : "mqtt://") + this.broker + ":" + this.port;
        }
        
        this.log(`MQTT配置节点已创建: ${this.name || 'unnamed'} -> ${this.brokerurl}`);
    }
    
    RED.nodes.registerType("mqtt-broker-config", MqttBrokerConfigNode, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" }
        }
    });
};