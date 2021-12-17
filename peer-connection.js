import wrtc from "wrtc";
import EventEmitter from "events";

const initiate = () => {
  const emitter = new EventEmitter();

  const pc = new wrtc.RTCPeerConnection({
    // iceServers: [
    //     {
    //         urls: 'stun:stun.l.google.com:19302'
    //     }
    // ]
  });

  const channel = pc.createDataChannel("vpn", {
    ordered: false,
    maxRetransmits: 0
  });
  channel.addEventListener("open", () => {
    emitter.emit("open");
  });
  channel.addEventListener("close", () => {

  });
  channel.addEventListener("message", (event) => {
    const data = Buffer.from(event.data);
    emitter.emit("packet", data);
  });
  channel.onclose = () => {
    console.log("channel close!");
  };

  pc.addEventListener("icecandidate", (event) => {
    // console.log("event =", event);
    if (event.candidate === null) {
      console.log("all candidates");
      let sdp = pc.localDescription.sdp;
      console.log("localDescription =", pc.localDescription);

      emitter.emit("offer", { sdp });
    }
  });

  pc.createOffer()
    .then((d) => {
      pc.setLocalDescription(d);
    })
    .catch((ex) => {
      console.error(ex);
    });

  const processAnswer = ({ sdp }) => {
    pc.setRemoteDescription({ type: "answer", sdp });
  };

  const MAX_BUFFERED_AMOUNT = 1 * 1024 * 1024;

  const send = ({ packet }) => {
    if (channel.readyState === "open" && (channel.bufferedAmount + packet.length) < MAX_BUFFERED_AMOUNT) {
      channel.send(packet);
    }
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    processAnswer,

    send
  };
};

const createFromOffer = ({ sdp }) => {
  const emitter = new EventEmitter();

  const pc = new wrtc.RTCPeerConnection({});
  let channel = undefined;

  pc.addEventListener("icecandidate", (event) => {
    if (event.candidate === null) {
      console.log("remote ice candidate");

      const sdp = pc.localDescription.sdp;

      emitter.emit("answer", ({ sdp }));
    }
  });

  pc.addEventListener("datachannel", (event) => {
    console.log("ondatachannel", event);
    console.log("datachannel name =", event.channel.label);

    event.channel.addEventListener("open", () => {
      channel = event.channel;
      emitter.emit("open");
    });
    event.channel.addEventListener("message", (event) => {
      const data = Buffer.from(event.data);
      emitter.emit("packet", data);
    });
  });

  pc.setRemoteDescription({ type: "offer", sdp })
    .then(() => {
      return pc.createAnswer();
    })
    .then((answer) => {
      return pc.setLocalDescription(answer);
    });
  
  const send = ({ packet }) => {
    if (channel) {
      channel.send(packet);
    }
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    send
  };
};

const create = ({ clientId, peerId, sendToTownhall }) => {
  const emitter = new EventEmitter();

  let connection = undefined;

  const handlers = {
    hello() {
      console.log("got hello");

      if (!connection) {
        connection = initiate();
        connection.on("offer", ({ sdp }) => {
          const packet = {
            type: "offer",
            from: clientId,
            to: peerId,
            sdp,
          };

          sendToTownhall({ packet });
        });
        connection.on("open", () => {
          console.log("peer connection open!");
          emitter.emit("connected");
        });
        connection.on("packet", (msg) => {
          emitter.emit("packet", msg);
        });
      }
    },

    offer({ packet }) {
      console.log("got offer");

      connection = createFromOffer({ sdp: packet.sdp });
      connection.on("answer", ({ sdp }) => {
        const packet = {
          type: "answer",
          from: clientId,
          to: peerId,
          sdp,
        };

        sendToTownhall({ packet });
      });
      connection.on("open", () => {
        console.log("peer connection open!");
        emitter.emit("connected");
      });
      connection.on("packet", (msg) => {
        emitter.emit("packet", msg);
      });
    },

    answer({ packet }) {
      console.log("got answer");
      connection.processAnswer({ sdp: packet.sdp });
    },
  };

  const processPacket = ({ packet }) => {
    console.log("peer packet =", packet);

    const handler = handlers[packet.type];
    if (!handler) {
      throw Error(`unsupported packet type "${packet.type}`);
    }

    handler({ packet });
  };

  const send = ({ packet }) => {
    if (connection) {
      connection.send({ packet });
    }
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    processPacket,

    send
  };
};

export default {
  create
};
