const net = require('net');

module.exports = function(RED) {
    function BaresipDialNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.host = config.host || "baresip";
        node.port = parseInt(config.port) || 5555;

        node.on('input', function(msg) {
            const targetUri = msg.target_uri || msg.payload || config.targetUri;

            if (!targetUri) {
                node.error("SIP Hedef adresi (target_uri veya payload) eksik!", msg);
                return;
            }

            node.status({fill: "yellow", shape: "dot", text: "Aranıyor..."});

            const client = new net.Socket();
            client.connect(node.port, node.host, () => {
                client.write(`/dial ${targetUri}\n`);
            });

            client.on('data', (data) => {
                const responseStr = data.toString();
                msg.baresip_response = responseStr;
                node.status({fill: "green", shape: "dot", text: "Arama Komutu İletildi"});
                node.send(msg);
                client.destroy();
            });

            client.on('error', (err) => {
                node.error("Baresip ctrl_tcp bağlantı hatası: " + err.message, msg);
                node.status({fill: "red", shape: "ring", text: "Bağlantı Hatası"});
            });
        });
    }

    RED.nodes.registerType("baresip-dial", BaresipDialNode);
};
