// import wrtc from "wrtc";
import EventEmitter from "events";
// import RTCPeerConnection from "../node-webrtc-stack/lib/rtc-peer-connection.js";
import RTCPeerConnection from "./datachannel-peerconnection.js";
import debugFactory from "debug";

const iceServers = [
  // {
  //   urls: ["stun:5.44.99.99:3478"],
  // },
  // {
  //   urls: ["turn:5.44.99.99:3478"],
  //   username: "test",
  //   credential: "abc"
  // }

  // {
  //   hostname: "5.44.99.99",
  //   port: 3478,
  // },
  {
    hostname: "5.44.99.99",
    port: 3478,
    relayType: "TurnUdp",
    username: "test",
    password: "abc",
  },

  // {
  //   hostname: "turn.bistri.com",
  //   port: 80,
  //   relayType: "TurnUdp",
  //   password: "homeo",
  //   username: "homeo",
  // },
];

const debug = debugFactory("peer-connection");

const createSublogger = ({ logger, prefix }) => {
  let result = {};
  Object.keys(logger).forEach((key) => {
    result = {
      ...result,
      [key]: (...args) => {
        logger[key](prefix, ...args);
      },
    };
  });
  return result;
};

let connectionCounter = 0;

const create = ({ logger: peerLogger, clientId, peerId, sendToTownhall }) => {
  const connectionId = connectionCounter;
  connectionCounter += 1;

  const logger = createSublogger({
    logger: peerLogger,
    prefix: `[ conn #${connectionId} ]`,
  });

  const initiate = () => {
    const emitter = new EventEmitter();

    // const pc = new wrtc.RTCPeerConnection({
    const pc = new RTCPeerConnection({
      iceServers,
    });

    const channel = pc.createDataChannel("vpn", {
      ordered: false,
      maxRetransmits: 0,
    });
    channel.addEventListener("open", () => {
      debug("channel opened");
      emitter.emit("open");
    });
    channel.addEventListener("message", (event) => {
      debug(`received packet with ${event.data.length} bytes`);
      const data = Buffer.from(event.data);
      emitter.emit("packet", data);
    });
    channel.addEventListener("close", () => {
      emitter.emit("close");
    });
    channel.addEventListener("error", (err) => {
      emitter.emit("error", err);
    });

    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate === null) {
        // console.log("all candidates");
        let sdp = pc.localDescription.sdp;
        // console.log("localDescription =", pc.localDescription);

        emitter.emit("offer", { sdp });
      } else {
        logger.log("icecandidate", event.candidate);
      }
    });

    pc.createOffer()
      .then((d) => {
        return pc.setLocalDescription(d);
      })
      .catch((ex) => {
        emitter.emit("error", ex);
      });

    const processAnswer = ({ sdp }) => {
      pc.setRemoteDescription({ type: "answer", sdp }).catch((err) => {
        emitter.emit("error", err);
      });
    };

    const MAX_BUFFERED_AMOUNT = 128 * 1024;

    const send = ({ packet }) => {
      if (
        channel.readyState === "open" &&
        channel.bufferedAmount + packet.length < MAX_BUFFERED_AMOUNT
      ) {
        channel.send(packet);
      } else {
        logger.log("dropping packet");
      }
    };

    const close = () => {
      logger.log("calling close()");
      return pc.close();
    };

    return {
      on: emitter.on.bind(emitter),
      once: emitter.once.bind(emitter),

      processAnswer,

      send,

      close,
    };
  };

  const createFromOffer = ({ sdp }) => {
    const emitter = new EventEmitter();

    // const pc = new wrtc.RTCPeerConnection({
    const pc = new RTCPeerConnection({
      iceServers,
    });
    let channel = undefined;

    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate === null) {
        // console.log("remote ice candidate");

        const sdp = pc.localDescription.sdp;

        emitter.emit("answer", { sdp });
      } else {
        logger.log("icecandidate", event.candidate);
      }
    });

    pc.addEventListener("datachannel", (event) => {
      event.channel.addEventListener("open", () => {
        channel = event.channel;
        emitter.emit("open");
      });
      event.channel.addEventListener("message", (event) => {
        const data = Buffer.from(event.data);
        emitter.emit("packet", data);
      });
      event.channel.addEventListener("close", () => {
        logger.log("datachannel closed");
        emitter.emit("close");
      });
      event.channel.addEventListener("error", (event) => {
        emitter.emit("error", event);
      });
    });

    pc.setRemoteDescription({ type: "offer", sdp })
      .then(() => {
        return pc.createAnswer();
      })
      .then((answer) => {
        return pc.setLocalDescription(answer);
      })
      .catch((err) => {
        emitter.emit("error", err);
      });

    const send = ({ packet }) => {
      if (channel) {
        channel.send(packet);
      }
    };

    const close = () => {
      logger.log("calling close()");
      return pc.close();
    };

    return {
      on: emitter.on.bind(emitter),
      once: emitter.once.bind(emitter),

      send,

      close,
    };
  };

  const emitter = new EventEmitter();

  let connection = undefined;

  const handlers = {
    hello() {
      logger.log(`received hello from peer ${peerId}`);

      if (!connection) {
        connection = initiate();
        connection.on("offer", ({ sdp }) => {
          const packet = {
            type: "offer",
            from: clientId,
            to: peerId,
            sdp,
          };

          logger.log("sending SDP offer");
          sendToTownhall({ packet });
        });
        connection.on("open", () => {
          // console.log("peer connection open!");
          emitter.emit("connected");
        });
        connection.on("close", () => {
          emitter.emit("disconnected");
        });
        connection.on("packet", (msg) => {
          emitter.emit("packet", msg);
        });
      }
    },

    offer({ packet }) {
      logger.log(`received SDP offer from peer ${peerId}`);
      // console.log(`offer from peer ${peerId}`);
      // console.log("got offer");

      connection = createFromOffer({ sdp: packet.sdp });
      connection.on("answer", ({ sdp }) => {
        const packet = {
          type: "answer",
          from: clientId,
          to: peerId,
          sdp,
        };

        logger.log("sending SDP answer");
        sendToTownhall({ packet });
      });
      connection.on("open", () => {
        // console.log("peer connection open!");
        emitter.emit("connected");
      });
      connection.on("close", () => {
        emitter.emit("disconnected");
      });
      connection.on("packet", (msg) => {
        emitter.emit("packet", msg);
      });
    },

    answer({ packet }) {
      logger.log(`received SDP answer`);
      connection.processAnswer({ sdp: packet.sdp });
    },
  };

  const processPacket = ({ packet }) => {
    // console.log("peer packet =", packet);

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

  const close = () => {
    if (connection) {
      connection.close();
    }
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    processPacket,

    send,
    close,
  };
};

export default {
  create,
};
