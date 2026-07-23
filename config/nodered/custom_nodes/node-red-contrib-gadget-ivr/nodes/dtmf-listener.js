const net = require('net');

module.exports = function(RED) {
    function DtmfListenerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.host = config.host || "baresip";
        node.port = parseInt(config.port) || 5555;
        let client = null;

        function connectSocket() {
            client = new net.Socket();
            node.status({fill: "yellow", shape: "ring", text: "Bağlanıyor..."});

            client.connect(node.port, node.host, () => {
                node.status({fill: "green", shape: "dot", text: "DTMF Dinleniyor"});
            });

            let buffer = '';
            client.on('data', (data) => {
                buffer += data.toString();
                let lines = buffer.split('\n');
                buffer = lines.pop(); // Tamamlanmamış son satırı tutar

                for (let line of lines) {
                    if (!line.trim()) continue;
                    try {
                        let json = JSON.parse(line);
                        // Baresip DTMF event kontrolü
                        if (json.event && json.type === 'CALL_DTMF_START') {
                            node.send({
                                payload: json.param, // Basılan tuş (örn: "1")
                                raw_event: json
                            });
                        }
                    } catch (e) {
                        // Plain text event kontrolü (Örn: "dtmf: 1")
                        if (line.includes('dtmf:')) {
                            let digit = line.split('dtmf:')[1].trim();
                            node.send({ payload: digit });
                        }
                    }
                }
            });

            client.on('error', (err) => {
                node.status({fill: "red", shape: "ring", text: "Hata: " + err.message});
                setTimeout(connectSocket, 5000); // 5 saniye sonra yeniden bağlan
            });

            client.on('close', () => {
                node.status({fill: "grey", shape: "ring", text: "Bağlantı Kapandı"});
                setTimeout(connectSocket, 5000);
            });
        }

        connectSocket();

        node.on('close', function(done) {
            if (client) client.destroy();
            done();
        });
    }

    RED.nodes.registerType("dtmf-listener", DtmfListenerNode);
};
