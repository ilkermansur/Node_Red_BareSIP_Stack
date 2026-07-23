const http = require('http');

module.exports = function(RED) {
    function GenerateMediaNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.model = config.model || "tr_TR-eren-medium";
        node.filename = config.filename || "output.wav";

        node.on('input', function(msg) {
            const textToSynthesize = msg.payload || config.text;

            if (!textToSynthesize) {
                node.error("Metin (payload) bulunamadı!", msg);
                return;
            }

            node.status({fill: "yellow", shape: "dot", text: "Sentezleniyor..."});

            const postData = JSON.stringify({
                text: textToSynthesize,
                model: node.model,
                filename: node.filename
            });

            const options = {
                hostname: 'piper-tts',
                port: 5000,
                path: '/api/tts',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const response = JSON.parse(data);
                            msg.payload = response.file_path;
                            msg.media_filename = response.filename;
                            node.status({fill: "green", shape: "dot", text: "Ses Hazır"});
                            node.send(msg);
                        } catch (e) {
                            node.error("JSON parse hatası: " + e.message, msg);
                        }
                    } else {
                        node.error(`Piper API Hatası: ${data}`, msg);
                    }
                });
            });

            req.on('error', (e) => {
                node.error("Piper TTS Servisine bağlanılamadı: " + e.message, msg);
            });

            req.write(postData);
            req.end();
        });
    }

    RED.nodes.registerType("generate-media", GenerateMediaNode);
};
