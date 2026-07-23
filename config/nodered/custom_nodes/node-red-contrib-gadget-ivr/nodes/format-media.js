module.exports = function(RED) {
    function FormatMediaNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.sampleRate = config.sampleRate || "8000";
        node.codec = config.codec || "pcm_s16le";

        node.on('input', function(msg) {
            node.status({fill: "blue", shape: "dot", text: "Formatlanıyor..."});

            // Medya format parametreleri mesaj nesnesine eklenir
            msg.format_options = {
                sample_rate: node.sampleRate,
                codec: node.codec,
                input_file: msg.payload
            };

            node.status({fill: "green", shape: "dot", text: `Format: ${node.sampleRate}Hz`});
            node.send(msg);
        });
    }

    RED.nodes.registerType("format-media", FormatMediaNode);
};
